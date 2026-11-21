import type { CatalogRecording } from '../player/PlaybackCatalogMapping';
import type {
  RecommendationPage,
  RecommendationRequest,
} from './RecommendationContracts';

export const RecommendationPlaybackPolicy = Object.freeze({
  remainingThreshold: 5,
  firstIndex: 0,
  initialGeneration: 0,
  generationIncrement: 1,
  maximumExclusions: 1500,
  retryDelayMilliseconds: 30000,
  failure: 'Recommendations could not be continued. Tap Retry to try again.',
});
export interface RecommendationQueueSnapshot {
  readonly account: string | null;
  readonly queueIdentifier: string | null;
  readonly entryIdentifiers: readonly string[];
  readonly recordingIdentifiers: readonly string[];
  readonly currentIndex: number;
}
export interface PersistedRecommendationSession {
  readonly account: string;
  readonly queueIdentifier: string;
  readonly request: RecommendationRequest;
  readonly cursor: string | null;
  readonly seen: readonly string[];
}
export interface RecommendationPlaybackStorage {
  load(): Promise<PersistedRecommendationSession | null>;
  save(session: PersistedRecommendationSession | null): Promise<void>;
}
export interface RecommendationPlaybackDependencies {
  readonly storage?: RecommendationPlaybackStorage;
  snapshot(): RecommendationQueueSnapshot;
  replace(
    tracks: readonly CatalogRecording[],
    index: number,
    isCurrent: () => boolean,
    request: RecommendationRequest,
  ): Promise<boolean>;
  append(
    tracks: readonly CatalogRecording[],
    isCurrent: () => boolean,
  ): Promise<void>;
  generate(
    request: RecommendationRequest,
    signal: AbortSignal,
  ): Promise<RecommendationPage>;
  subscribe(listener: () => void): () => void;
  now(): number;
}
export interface RecommendationPlaybackState {
  readonly active: boolean;
  readonly loading: boolean;
  readonly failure: string | null;
}
export class RecommendationPlaybackController {
  private generation = RecommendationPlaybackPolicy.initialGeneration;
  private request: RecommendationRequest | null = null;
  private cursor: string | null = null;
  private account: string | null = null;
  private queueIdentifier: string | null = null;
  private pending: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private retryAt = 0;
  private starting = false;
  private storageWrites: Promise<void> = Promise.resolve();
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private state: RecommendationPlaybackState = {
    active: false,
    loading: false,
    failure: null,
  };
  constructor(
    private readonly dependencies: RecommendationPlaybackDependencies,
  ) {}
  getSnapshot = (): RecommendationPlaybackState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start(
    request: RecommendationRequest,
    page: RecommendationPage,
    index: number = RecommendationPlaybackPolicy.firstIndex,
  ): Promise<void> {
    this.stop();
    if (page.tracks.length === 0 || index < 0 || index >= page.tracks.length)
      return;
    const generation = this.generation;
    const initial = this.dependencies.snapshot();
    if (initial.account === null) return;
    this.starting = true;
    this.account = initial.account;
    this.queueIdentifier = initial.queueIdentifier;
    this.request = request;
    this.setState({ active: false, loading: true, failure: null });
    try {
      const applied = await this.dependencies.replace(
        page.tracks,
        index,
        () =>
          generation === this.generation &&
          initial.account === this.dependencies.snapshot().account,
        request,
      );
      if (!applied) {
        if (generation === this.generation) this.stop();
        return;
      }
      if (
        generation !== this.generation ||
        initial.account !== this.dependencies.snapshot().account
      )
        return;
      this.account = initial.account;
      this.queueIdentifier = this.dependencies.snapshot().queueIdentifier;
      this.request = request;
      this.cursor = page.continuationToken;
      for (const track of page.tracks) this.seen.add(track.id);
      this.unsubscribe = this.dependencies.subscribe(() => {
        void this.receive();
      });
      this.persist();
      this.setState({
        active: this.cursor !== null,
        loading: false,
        failure: null,
      });
    } catch (failure) {
      if (generation !== this.generation) return;
      this.stop();
      throw failure;
    } finally {
      if (generation === this.generation) this.starting = false;
    }
    await this.receive();
  }

  stop = (): void => {
    this.generation += RecommendationPlaybackPolicy.generationIncrement;
    this.pending?.abort();
    this.pending = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.request = null;
    this.cursor = null;
    this.queueIdentifier = null;
    this.account = null;
    this.starting = false;
    this.seen.clear();
    this.retryAt = 0;
    this.persist();
    this.setState({ active: false, loading: false, failure: null });
  };

  async restore(): Promise<void> {
    if (!this.dependencies.storage || this.request !== null) return;
    const generation = this.generation;
    const initial = this.dependencies.snapshot();
    const stored = await this.dependencies.storage.load().catch(() => null);
    if (generation !== this.generation || this.request !== null) return;
    if (
      !stored ||
      stored.account !== initial.account ||
      stored.queueIdentifier !== initial.queueIdentifier ||
      initial.account !== this.dependencies.snapshot().account ||
      initial.queueIdentifier !== this.dependencies.snapshot().queueIdentifier
    ) {
      this.persist();
      return;
    }
    this.account = stored.account;
    this.queueIdentifier = stored.queueIdentifier;
    this.request = stored.request;
    this.cursor = stored.cursor;
    for (const identifier of stored.seen) this.seen.add(identifier);
    this.unsubscribe = this.dependencies.subscribe(() => {
      void this.receive();
    });
    this.setState({
      active: this.cursor !== null,
      loading: false,
      failure: null,
    });
    await this.receive();
  }

  retry = async (): Promise<void> => {
    this.retryAt = 0;
    await this.receive();
  };

  ownsCurrentQueue = (): boolean => {
    const snapshot = this.dependencies.snapshot();
    return (
      this.request !== null &&
      snapshot.account === this.account &&
      snapshot.queueIdentifier === this.queueIdentifier
    );
  };

  private async receive(): Promise<void> {
    if (this.starting || this.request === null) return;
    const snapshot = this.dependencies.snapshot();
    if (
      snapshot.account !== this.account ||
      snapshot.queueIdentifier !== this.queueIdentifier
    ) {
      this.stop();
      return;
    }
    if (
      this.cursor === null ||
      this.pending !== null ||
      this.dependencies.now() < this.retryAt
    )
      return;
    if (
      snapshot.entryIdentifiers.length - snapshot.currentIndex - 1 >
      RecommendationPlaybackPolicy.remainingThreshold
    )
      return;
    const generation = this.generation;
    const pending = new AbortController();
    this.pending = pending;
    this.setState({ active: true, loading: true, failure: null });
    const current = () =>
      generation === this.generation &&
      this.pending === pending &&
      snapshot.account === this.dependencies.snapshot().account;
    try {
      const excluded = Array.from(
        new Set([...this.seen, ...snapshot.recordingIdentifiers]),
      );
      if (excluded.length > RecommendationPlaybackPolicy.maximumExclusions) {
        this.stop();
        return;
      }
      const page = await this.dependencies.generate(
        { ...this.request, continuationToken: this.cursor, exclude: excluded },
        pending.signal,
      );
      if (!current()) return;
      const latest = this.dependencies.snapshot();
      if (latest.queueIdentifier !== snapshot.queueIdentifier) {
        this.stop();
        return;
      }
      if (latest.entryIdentifiers.join() !== snapshot.entryIdentifiers.join())
        return;
      const accepted = new Set(excluded);
      const tracks = page.tracks.filter(track => {
        if (accepted.has(track.id)) return false;
        accepted.add(track.id);
        return true;
      });
      if (tracks.length > 0)
        await this.dependencies.append(
          tracks,
          () =>
            current() &&
            this.dependencies.snapshot().queueIdentifier ===
              snapshot.queueIdentifier &&
            this.dependencies.snapshot().entryIdentifiers.join() ===
              snapshot.entryIdentifiers.join(),
        );
      if (!current()) return;
      for (const track of page.tracks) this.seen.add(track.id);
      this.cursor =
        page.continuationToken === this.cursor ? null : page.continuationToken;
      this.persist();
      this.setState({
        active: this.cursor !== null,
        loading: false,
        failure: null,
      });
    } catch {
      if (
        current() &&
        this.dependencies.snapshot().entryIdentifiers.join() !==
          snapshot.entryIdentifiers.join()
      )
        return;
      if (current()) {
        this.retryAt =
          this.dependencies.now() +
          RecommendationPlaybackPolicy.retryDelayMilliseconds;
        this.setState({
          active: true,
          loading: false,
          failure: RecommendationPlaybackPolicy.failure,
        });
      }
    } finally {
      if (current()) {
        this.pending = null;
        if (this.state.loading)
          this.setState({ ...this.state, loading: false });
      }
    }
  }
  private persist(): void {
    const storage = this.dependencies.storage;
    if (!storage) return;
    const session: PersistedRecommendationSession | null =
      this.request !== null &&
      this.account !== null &&
      this.queueIdentifier !== null
        ? {
            account: this.account,
            queueIdentifier: this.queueIdentifier,
            request: this.request,
            cursor: this.cursor,
            seen: [...this.seen],
          }
        : null;
    this.storageWrites = this.storageWrites
      .then(() => storage.save(session))
      .catch(() => undefined);
  }
  private setState(state: RecommendationPlaybackState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

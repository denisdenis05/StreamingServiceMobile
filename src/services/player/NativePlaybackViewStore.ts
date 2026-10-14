import { PlaybackIntent, PlaybackState, PlayerStateStore, RepeatMode } from 'streaming-service-player';
import type { PlayerCursor, PlayerSnapshot } from 'streaming-service-player';
import { NativePlaybackReporting } from './NativePlaybackReporting';
import { NativeQueueProjection } from './NativeQueueProjection';
import { PlaybackMetadataRegistry } from './PlaybackMetadataRegistry';
import type { PlaybackTrackView } from './PlaybackTrack';
import { SharedNativePlayerObservation } from './SharedNativePlayerObservation';

export const PlaybackViewPolicy = Object.freeze({
  noCurrentEntryIndex: -1,
  emptyQueueLength: 0,
  firstGeneration: 0,
  generationIncrement: 1,
  staleProjectionMessage: 'The native queue changed while its view was being read.',
});

export interface PlaybackQueueView {
  readonly queue: readonly PlaybackTrackView[];
  readonly currentTrack: PlaybackTrackView | null;
  readonly currentIndex: number;
  readonly isPlaying: boolean;
  readonly isLoading: boolean;
  readonly isQueueLoading: boolean;
  readonly isShuffled: boolean;
  readonly repeatMode: RepeatMode;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly canSeek: boolean;
  readonly queueLength: number;
}

const EmptyQueue: readonly PlaybackTrackView[] = Object.freeze([]);
const EmptyPlaybackView: PlaybackQueueView = Object.freeze({
  queue: EmptyQueue, currentTrack: null, currentIndex: PlaybackViewPolicy.noCurrentEntryIndex,
  isPlaying: false, isLoading: false, isQueueLoading: false, isShuffled: false,
  repeatMode: RepeatMode.Off, hasNext: false, hasPrevious: false, canSeek: false,
  queueLength: PlaybackViewPolicy.emptyQueueLength,
});

export class NativePlaybackViewStore {
  private view: PlaybackQueueView = EmptyPlaybackView;
  private readonly listeners = new Set<() => void>();
  private disconnect: (() => void) | null = null;
  private queueCursor: PlayerCursor | null = null;
  private readGeneration = PlaybackViewPolicy.firstGeneration;
  private enabled = true;

  constructor(
    readonly state: PlayerStateStore,
    private readonly observation: Pick<SharedNativePlayerObservation, 'subscribe'>,
    private readonly projection: Pick<NativeQueueProjection, 'read' | 'clear'>,
    private readonly metadata: Pick<PlaybackMetadataRegistry, 'viewFor' | 'observe' | 'observeCurrentEntry' | 'clear'>,
    private readonly reporting: Pick<NativePlaybackReporting, 'receive' | 'clear' | 'synchronize'>,
    private readonly reportFailure: (failure: unknown) => void,
  ) {}

  getSnapshot = (): PlaybackQueueView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    const subscription = () => listener();
    this.listeners.add(subscription);
    return () => { this.listeners.delete(subscription); };
  };

  connect(): void {
    if (this.disconnect !== null) return;
    const stopEvents = this.observation.subscribe(event => {
      if (this.enabled) this.reporting.receive(event);
    });
    let stopState: () => void;
    try { stopState = this.state.subscribe(() => this.receiveSnapshot()); }
    catch (failure) { stopEvents(); throw failure; }
    this.disconnect = () => { stopState(); stopEvents(); };
    this.receiveSnapshot();
  }

  dispose(): void {
    this.disconnect?.();
    this.disconnect = null;
    this.clear();
  }

  clear(): void {
    this.readGeneration += PlaybackViewPolicy.generationIncrement;
    this.queueCursor = null;
    this.projection.clear();
    this.reporting.clear();
    this.metadata.clear();
    this.setView(EmptyPlaybackView);
  }

  suspend(): void {
    this.enabled = false;
    this.clear();
  }

  resume(): void {
    this.enabled = true;
    this.receiveSnapshot();
  }

  async refresh(): Promise<void> {
    this.queueCursor = null;
    await this.state.refresh();
    this.receiveSnapshot();
  }

  private receiveSnapshot(): void {
    const snapshot = this.state.getSnapshot();
    if (!this.enabled || snapshot === null) return;
    const previousCursor = this.queueCursor;
    if (previousCursor !== null && !this.sameSession(previousCursor, snapshot.cursor)) {
      this.clear();
    }
    this.metadata.observeCurrentEntry(snapshot.currentEntry);
    this.reporting.synchronize(snapshot);
    const needsQueue = this.queueCursor === null || !this.sameQueue(this.queueCursor, snapshot.cursor);
    this.updateView(snapshot, needsQueue || this.view.isQueueLoading);
    if (needsQueue) {
      this.queueCursor = { ...snapshot.cursor };
      const generation = ++this.readGeneration;
      void this.readQueue(snapshot, generation).catch(failure => {
        if (generation === this.readGeneration) this.reportFailure(failure);
      });
    }
  }

  private async readQueue(snapshot: PlayerSnapshot, generation: number): Promise<void> {
    const queue = await this.projection.read(snapshot);
    if (generation !== this.readGeneration) return;
    const latest = this.state.getSnapshot();
    if (latest === null || !this.sameQueue(snapshot.cursor, latest.cursor)) return;
    if (queue === null) {
      this.queueCursor = null;
      this.reportFailure(new Error(PlaybackViewPolicy.staleProjectionMessage));
      return;
    }
    this.metadata.observe(queue, latest.currentEntry);
    this.updateView(latest, false, queue);
  }

  private updateView(snapshot: PlayerSnapshot, isQueueLoading: boolean, queue = this.view.queue): void {
    const currentTrack = snapshot.currentEntry === null ? null : this.metadata.viewFor(snapshot.currentEntry);
    const stableTrack = JSON.stringify(currentTrack) === JSON.stringify(this.view.currentTrack)
      ? this.view.currentTrack : currentTrack;
    this.setView({ queue, currentTrack: stableTrack,
      currentIndex: currentTrack === null ? PlaybackViewPolicy.noCurrentEntryIndex
        : queue.findIndex(entry => entry.entryIdentifier === currentTrack.entryIdentifier),
      isPlaying: snapshot.state === PlaybackState.Playing && snapshot.playbackIntent === PlaybackIntent.Play,
      isLoading: snapshot.state === PlaybackState.Resolving || snapshot.state === PlaybackState.Buffering,
      isQueueLoading, isShuffled: snapshot.shuffled, repeatMode: snapshot.repeatMode,
      hasNext: snapshot.canNext, hasPrevious: snapshot.canPrevious, canSeek: snapshot.canSeek,
      queueLength: snapshot.queueLength,
    });
  }

  private setView(view: PlaybackQueueView): void {
    const unchanged = (Object.keys(view) as (keyof PlaybackQueueView)[])
      .every(property => Object.is(view[property], this.view[property]));
    if (unchanged) return;
    this.view = Object.freeze(view);
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) listener();
    }
  }

  private sameSession(previous: PlayerCursor, current: PlayerCursor): boolean {
    return previous.engineEpoch === current.engineEpoch && previous.authenticationEpoch === current.authenticationEpoch;
  }

  private sameQueue(previous: PlayerCursor, current: PlayerCursor): boolean {
    return this.sameSession(previous, current) && previous.queueRevision === current.queueRevision;
  }
}

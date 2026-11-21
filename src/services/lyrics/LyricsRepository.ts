import {
  equivalentLyrics,
  LyricsDocument,
  LyricsPolicy,
  LyricsResponse,
  parseLyrics,
} from './LyricsDocument';

export const LyricsRepositoryPolicy = Object.freeze({
  cachePrefix: 'lyrics:v1:',
  keySeparator: ':',
  loading: 'Loading lyrics…',
  unavailable: 'Lyrics unavailable. Tap to retry.',
  pending: 'Lyrics are being prepared.',
  missing: 'No lyrics available for this song.',
  instrumental: 'Instrumental',
  routePrefix: 'api/lyrics/',
  initialGeneration: 0,
  generationIncrement: 1,
  retryIntervalMilliseconds: 30000,
});
export interface LyricsState {
  readonly accountIdentifier: string | null;
  readonly recordingIdentifier: string | null;
  readonly document: LyricsDocument | null;
  readonly message: string | null;
  readonly pending: boolean;
  readonly retryable: boolean;
}
export interface LyricsDependencies {
  readonly fetch: (
    accountIdentifier: string,
    recordingIdentifier: string,
    signal: AbortSignal,
  ) => Promise<LyricsResponse>;
  readonly read: (key: string) => Promise<string | null>;
  readonly write: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}
export class LyricsRepository {
  private state: LyricsState = emptyLyricsState(null, null);
  private readonly listeners = new Set<() => void>();
  private generation: number = LyricsRepositoryPolicy.initialGeneration;
  private cancellation: AbortController | null = null;
  private readonly cacheOperations = new Map<string, Promise<void>>();
  constructor(private readonly dependencies: LyricsDependencies) {}
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getSnapshot = () => this.state;
  setScope(
    accountIdentifier: string | null,
    recordingIdentifier: string | null,
  ): void {
    if (
      this.state.accountIdentifier === accountIdentifier &&
      this.state.recordingIdentifier === recordingIdentifier
    )
      return;
    this.cancel();
    this.publish(emptyLyricsState(accountIdentifier, recordingIdentifier));
    if (accountIdentifier !== null && recordingIdentifier !== null)
      void this.load();
  }
  readonly refresh = async (): Promise<void> => {
    await this.load();
  };
  private cancel(): void {
    this.generation += LyricsRepositoryPolicy.generationIncrement;
    this.cancellation?.abort();
    this.cancellation = null;
  }
  private async load(): Promise<void> {
    const { accountIdentifier, recordingIdentifier } = this.state;
    if (accountIdentifier === null || recordingIdentifier === null) return;
    this.cancel();
    const generation = this.generation;
    const cancellation = new AbortController();
    this.cancellation = cancellation;
    const current = () =>
      generation === this.generation && !cancellation.signal.aborted;
    const key =
      LyricsRepositoryPolicy.cachePrefix +
      encodeURIComponent(accountIdentifier) +
      LyricsRepositoryPolicy.keySeparator +
      encodeURIComponent(recordingIdentifier);
    this.publish({
      ...this.state,
      pending: true,
      message:
        this.state.document === null ? LyricsRepositoryPolicy.loading : null,
    });
    try {
      await this.cacheOperations.get(key);
      const cached = await this.dependencies.read(key).catch(() => null);
      if (!current()) return;
      if (
        cached !== null &&
        cached.length <= LyricsPolicy.maximumTextCharacters
      ) {
        try {
          const response = JSON.parse(cached) as LyricsResponse;
          if (
            validResponse(response, recordingIdentifier) &&
            response.state === LyricsPolicy.downloadedState
          ) {
            const document = parseLyrics(
              response.plainLyrics,
              response.syncedLyrics,
            );
            if (document !== null)
              this.publish({
                ...this.state,
                document: this.retainDocument(document),
                message: null,
              });
          }
        } catch {}
      }
      const response = await this.dependencies.fetch(
        accountIdentifier,
        recordingIdentifier,
        cancellation.signal,
      );
      if (!current()) return;
      if (!validResponse(response, recordingIdentifier))
        throw new Error(LyricsRepositoryPolicy.unavailable);
      const document =
        response.state === LyricsPolicy.downloadedState
          ? parseLyrics(response.plainLyrics, response.syncedLyrics)
          : null;
      const retryable =
        response.state === LyricsPolicy.pendingState ||
        response.state === LyricsPolicy.failedState;
      this.publish({
        accountIdentifier,
        recordingIdentifier,
        document: this.retainDocument(document),
        pending: false,
        retryable,
        message:
          document !== null
            ? null
            : response.state === LyricsPolicy.instrumentalState
            ? LyricsRepositoryPolicy.instrumental
            : retryable
            ? LyricsRepositoryPolicy.pending
            : LyricsRepositoryPolicy.missing,
      });
      await this.persist(
        key,
        document !== null ? JSON.stringify(response) : null,
      );
    } catch {
      if (current())
        this.publish({
          ...this.state,
          pending: false,
          retryable: true,
          message:
            this.state.document === null
              ? LyricsRepositoryPolicy.unavailable
              : null,
        });
    }
  }
  private retainDocument(
    document: LyricsDocument | null,
  ): LyricsDocument | null {
    return equivalentLyrics(this.state.document, document)
      ? this.state.document
      : document;
  }
  private async persist(key: string, value: string | null): Promise<void> {
    const previous = this.cacheOperations.get(key) ?? Promise.resolve();
    const operation = previous
      .then(() =>
        value === null
          ? this.dependencies.remove(key)
          : this.dependencies.write(key, value),
      )
      .catch(() => undefined);
    this.cacheOperations.set(key, operation);
    await operation;
    if (this.cacheOperations.get(key) === operation)
      this.cacheOperations.delete(key);
  }
  private publish(state: LyricsState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
export function emptyLyricsState(
  accountIdentifier: string | null,
  recordingIdentifier: string | null,
): LyricsState {
  return {
    accountIdentifier,
    recordingIdentifier,
    document: null,
    message: LyricsRepositoryPolicy.loading,
    pending: true,
    retryable: false,
  };
}
function validResponse(response: LyricsResponse, identifier: string): boolean {
  return (
    response !== null &&
    typeof response === 'object' &&
    response.recordingIdentifier === identifier &&
    typeof response.state === 'string' &&
    (response.plainLyrics === null ||
      typeof response.plainLyrics === 'string') &&
    (response.syncedLyrics === null ||
      typeof response.syncedLyrics === 'string')
  );
}

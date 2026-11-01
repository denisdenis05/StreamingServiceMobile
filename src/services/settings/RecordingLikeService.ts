export const RecordingLikePolicy = Object.freeze({
  routePrefix: 'Library/likes/',
  loadFailure: 'Could not check this song. Retry to check its heart.',
  saveFailure: 'Could not confirm this change. Retry to check its heart.',
  invalidResponse: 'The song preference response is invalid.',
  objectType: 'object',
  booleanType: 'boolean',
});

export interface RecordingLikeDetails {
  readonly title: string | undefined;
  readonly artist: string | undefined;
  readonly album: string | undefined;
  readonly cover: string | undefined;
}
export interface RecordingLikeGateway {
  read(
    accountIdentifier: string,
    recordingIdentifier: string,
    signal: AbortSignal,
  ): Promise<unknown>;
  toggle(
    accountIdentifier: string,
    recordingIdentifier: string,
    details: RecordingLikeDetails,
    signal: AbortSignal,
  ): Promise<unknown>;
  changed(): void;
}
export interface RecordingLikeSnapshot {
  readonly accountIdentifier: string | null;
  readonly recordingIdentifier: string | null;
  readonly isLiked: boolean | null;
  readonly pending: boolean;
  readonly failure: string | null;
}
function decode(value: unknown): boolean {
  if (
    value === null ||
    typeof value !== RecordingLikePolicy.objectType ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).isLiked !==
      RecordingLikePolicy.booleanType
  )
    throw new Error(RecordingLikePolicy.invalidResponse);
  return (value as { isLiked: boolean }).isLiked;
}
export class RecordingLikeService {
  private snapshot: RecordingLikeSnapshot = Object.freeze({
    accountIdentifier: null,
    recordingIdentifier: null,
    isLiked: null,
    pending: false,
    failure: null,
  });
  private generation = {};
  private request: AbortController | null = null;
  private toggling = false;
  private refreshRequested = false;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly gateway: RecordingLikeGateway) {}
  getSnapshot = (): RecordingLikeSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setScope(
    accountIdentifier: string | null,
    recordingIdentifier: string | null,
  ): void {
    if (
      this.snapshot.accountIdentifier === accountIdentifier &&
      this.snapshot.recordingIdentifier === recordingIdentifier
    )
      return;
    this.cancel();
    this.publish({
      accountIdentifier,
      recordingIdentifier,
      isLiked: null,
      pending: false,
      failure: null,
    });
    void this.refresh();
  }
  refresh = async (): Promise<void> => {
    if (this.toggling) {
      this.refreshRequested = true;
      return;
    }
    const { accountIdentifier, recordingIdentifier } = this.snapshot;
    if (accountIdentifier === null || recordingIdentifier === null) return;
    this.cancel();
    const generation = this.generation;
    const request = new AbortController();
    this.request = request;
    this.publish({
      ...this.snapshot,
      isLiked: null,
      pending: true,
      failure: null,
    });
    try {
      const value = decode(
        await this.gateway.read(
          accountIdentifier,
          recordingIdentifier,
          request.signal,
        ),
      );
      if (generation === this.generation)
        this.publish({
          ...this.snapshot,
          isLiked: value,
          pending: false,
          failure: null,
        });
    } catch {
      if (generation === this.generation)
        this.publish({
          ...this.snapshot,
          isLiked: null,
          pending: false,
          failure: RecordingLikePolicy.loadFailure,
        });
    }
  };
  toggle = async (details: RecordingLikeDetails): Promise<void> => {
    const { accountIdentifier, recordingIdentifier, pending, isLiked } =
      this.snapshot;
    if (
      accountIdentifier === null ||
      recordingIdentifier === null ||
      pending ||
      isLiked === null ||
      this.toggling
    )
      return;
    this.cancel();
    const generation = this.generation;
    const request = new AbortController();
    this.request = request;
    this.toggling = true;
    this.publish({ ...this.snapshot, pending: true, failure: null });
    try {
      const value = decode(
        await this.gateway.toggle(
          accountIdentifier,
          recordingIdentifier,
          details,
          request.signal,
        ),
      );
      if (generation !== this.generation) return;
      this.publish({
        ...this.snapshot,
        isLiked: value,
        pending: false,
        failure: null,
      });
      this.gateway.changed();
    } catch {
      if (generation === this.generation)
        this.publish({
          ...this.snapshot,
          isLiked: null,
          pending: false,
          failure: RecordingLikePolicy.saveFailure,
        });
    } finally {
      if (generation === this.generation) {
        this.toggling = false;
        if (this.refreshRequested) {
          this.refreshRequested = false;
          await this.refresh();
        }
      }
    }
  };
  dispose(): void {
    this.cancel();
    this.listeners.clear();
  }
  private cancel(): void {
    this.generation = {};
    this.request?.abort();
    this.request = null;
    this.toggling = false;
    this.refreshRequested = false;
  }
  private publish(snapshot: RecordingLikeSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) listener();
    }
  }
}

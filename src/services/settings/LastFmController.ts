export const LastFmPolicy = Object.freeze({
  status: 'lastfm/status',
  authorization: 'lastfm/auth-url',
  connect: 'lastfm/connect',
  disconnect: 'lastfm/disconnect',
  failure: 'Last.fm could not complete this request. Please try again.',
  unavailable: 'Last.fm authorization could not be opened.',
  maximumUsernameCharacters: 256,
  maximumDateCharacters: 128,
  booleanType: 'boolean',
  stringType: 'string',
  objectType: 'object',
});
export function decodeLastFmStatus(value: unknown): LastFmStatus {
  if (
    value === null ||
    typeof value !== LastFmPolicy.objectType ||
    Array.isArray(value)
  )
    throw new Error(LastFmPolicy.failure);
  const status = value as Record<string, unknown>;
  if (
    typeof status.connected !== LastFmPolicy.booleanType ||
    (status.username !== null &&
      (typeof status.username !== LastFmPolicy.stringType ||
        (status.username as string).length >
          LastFmPolicy.maximumUsernameCharacters)) ||
    (status.connectedAt !== null &&
      (typeof status.connectedAt !== LastFmPolicy.stringType ||
        (status.connectedAt as string).length >
          LastFmPolicy.maximumDateCharacters))
  ) {
    throw new Error(LastFmPolicy.failure);
  }
  return Object.freeze({
    connected: status.connected as boolean,
    username: status.connected ? (status.username as string | null) : null,
    connectedAt: status.connected
      ? (status.connectedAt as string | null)
      : null,
  });
}
export enum LastFmOperation {
  Idle = 'idle',
  Loading = 'loading',
  Authorizing = 'authorizing',
  Connecting = 'connecting',
}
export interface LastFmStatus {
  readonly connected: boolean;
  readonly username: string | null;
  readonly connectedAt: string | null;
}
export interface LastFmSnapshot extends LastFmStatus {
  readonly operation: LastFmOperation;
  readonly failure: string | null;
}
export interface LastFmGateway {
  status(signal: AbortSignal): Promise<LastFmStatus>;
  authorization(signal: AbortSignal): Promise<string>;
  connect(token: string, signal: AbortSignal): Promise<void>;
  disconnect(signal: AbortSignal): Promise<void>;
}
export interface AuthorizationBrowser {
  open(address: string): Promise<boolean>;
}
const disconnected: LastFmStatus = Object.freeze({
  connected: false,
  username: null,
  connectedAt: null,
});
export class LastFmController {
  private snapshot: LastFmSnapshot = {
    ...disconnected,
    operation: LastFmOperation.Idle,
    failure: null,
  };
  private readonly listeners = new Set<() => void>();
  private accountIdentifier: string | null = null;
  private generation = {};
  private request: AbortController | null = null;
  private authorizationGeneration: object | null = null;
  constructor(
    private readonly gateway: LastFmGateway,
    private readonly browser: AuthorizationBrowser,
  ) {}
  getSnapshot = (): LastFmSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setAccount(accountIdentifier: string | null): void {
    if (this.accountIdentifier === accountIdentifier) return;
    this.cancel();
    this.accountIdentifier = accountIdentifier;
    this.publish({
      ...disconnected,
      operation: LastFmOperation.Idle,
      failure: null,
    });
    if (accountIdentifier !== null) void this.refresh();
  }
  cancel = (): void => {
    this.generation = {};
    this.request?.abort();
    this.request = null;
    this.authorizationGeneration = null;
    this.publish({
      ...this.snapshot,
      operation: LastFmOperation.Idle,
      failure: null,
    });
  };
  authorizationFailed = (): void => {
    if (this.authorizationGeneration !== this.generation) return;
    this.cancel();
    this.publish({ ...this.snapshot, failure: LastFmPolicy.failure });
  };
  refresh = async (): Promise<void> => {
    if (
      this.accountIdentifier === null ||
      this.snapshot.operation === LastFmOperation.Connecting
    )
      return;
    await this.perform(LastFmOperation.Loading, async signal => {
      const status = decodeLastFmStatus(await this.gateway.status(signal));
      return {
        ...status,
        operation:
          this.authorizationGeneration === this.generation && !status.connected
            ? LastFmOperation.Authorizing
            : LastFmOperation.Idle,
        failure: null,
      };
    });
  };
  authorize = async (): Promise<void> => {
    if (
      this.accountIdentifier === null ||
      this.snapshot.operation !== LastFmOperation.Idle
    )
      return;
    this.authorizationGeneration = this.generation;
    await this.perform(LastFmOperation.Loading, async signal => {
      const address = await this.gateway.authorization(signal);
      if (signal.aborted) return this.snapshot;
      const opened = await this.browser.open(address);
      if (!opened) throw new Error(LastFmPolicy.unavailable);
      return {
        ...this.snapshot,
        operation: LastFmOperation.Authorizing,
        failure: null,
      };
    });
  };
  complete = async (token: string): Promise<void> => {
    if (
      !token ||
      this.authorizationGeneration !== this.generation ||
      this.snapshot.operation === LastFmOperation.Connecting
    )
      return;
    this.authorizationGeneration = null;
    await this.perform(LastFmOperation.Connecting, async signal => {
      await this.gateway.connect(token, signal);
      if (signal.aborted) return this.snapshot;
      const status = decodeLastFmStatus(await this.gateway.status(signal));
      return { ...status, operation: LastFmOperation.Idle, failure: null };
    });
  };
  disconnect = async (): Promise<void> => {
    if (
      this.accountIdentifier === null ||
      this.snapshot.operation !== LastFmOperation.Idle
    )
      return;
    this.authorizationGeneration = null;
    await this.perform(LastFmOperation.Loading, async signal => {
      await this.gateway.disconnect(signal);
      return {
        ...disconnected,
        operation: LastFmOperation.Idle,
        failure: null,
      };
    });
  };
  private async perform(
    operation: LastFmOperation,
    work: (signal: AbortSignal) => Promise<LastFmSnapshot>,
  ): Promise<void> {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const generation = this.generation;
    this.publish({ ...this.snapshot, operation, failure: null });
    try {
      const snapshot = await work(request.signal);
      if (generation === this.generation && !request.signal.aborted)
        this.publish(snapshot);
    } catch {
      if (generation === this.generation && !request.signal.aborted) {
        this.authorizationGeneration = null;
        this.publish({
          ...this.snapshot,
          operation: LastFmOperation.Idle,
          failure: LastFmPolicy.failure,
        });
      }
    }
  }
  private publish(snapshot: LastFmSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {}
    });
  }
}

import { IntegrationFailureCode } from 'streaming-service-spotify-jam';
import { SpotifyAuthenticationAction, SpotifyMobileOperation } from './SpotifyMobileController';
import { URL } from 'react-native-url-polyfill';

export interface SpotifyAuthorizationStartupDependencies {
  readonly account: {
    getSnapshot(): { readonly restored: boolean; readonly isLoggedIn: boolean; readonly accountIdentifier: string | null };
    subscribe(listener: () => void): () => void;
  };
  readonly controller: {
    getSnapshot(): { readonly connected: boolean; readonly operation: SpotifyMobileOperation;
      readonly authenticationAction?: SpotifyAuthenticationAction };
    subscribe(listener: () => void): () => void;
    resumeAuthorization(address: string): Promise<void>;
    authorizationInterrupted(failure: IntegrationFailureCode): void;
  };
  readonly redirects: {
    readInitialAddress(): Promise<string | null>;
    observe(listener: (address: string) => void): () => void;
  };
  readonly isAuthorizing: () => boolean;
  readonly redirectAddress: string;
}

const StartupPolicy = Object.freeze({ stateParameter: 'state', singleParameterCount: 1,
  maximumCallbackCharacters: 16384, maximumStateCharacters: 128 });

export class SpotifyAuthorizationStartup {
  private started = false;
  private disposed = false;
  private pending: { readonly address: string; readonly state: string } | null = null;
  private lastState: string | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly dependencies: SpotifyAuthorizationStartupDependencies) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.cleanup.push(this.dependencies.account.subscribe(() => this.process()));
    this.cleanup.push(this.dependencies.controller.subscribe(() => this.process()));
    this.cleanup.push(this.dependencies.redirects.observe(address => this.receive(address)));
    void this.dependencies.redirects.readInitialAddress().then(address => {
      if (address !== null) this.receive(address);
    }, () => this.interrupted(IntegrationFailureCode.Network));
  }

  dispose(): void {
    this.disposed = true; this.pending = null; this.lastState = null;
    for (const stop of this.cleanup) { try { stop(); } catch {} }
  }

  private receive(address: string): void {
    if (this.disposed || this.dependencies.isAuthorizing()) return;
    const snapshot = this.dependencies.controller.getSnapshot();
    if (snapshot.connected || snapshot.operation === SpotifyMobileOperation.Connecting
      && snapshot.authenticationAction !== SpotifyAuthenticationAction.Restore) return;
    let callback: URL;
    try { callback = new URL(address); } catch { return; }
    const expected = new URL(this.dependencies.redirectAddress);
    if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname) return;
    const states = callback.searchParams.getAll(StartupPolicy.stateParameter);
    const state = states[InitialPosition];
    if (address.length > StartupPolicy.maximumCallbackCharacters || callback.username || callback.password || callback.hash
      || states.length !== StartupPolicy.singleParameterCount || !state || state.length > StartupPolicy.maximumStateCharacters) {
      this.interrupted(IntegrationFailureCode.InvalidResponse); return;
    }
    if (state === this.lastState) return;
    this.pending = { address, state };
    this.process();
  }

  private process(): void {
    if (this.disposed || !this.pending || this.dependencies.isAuthorizing()) return;
    const account = this.dependencies.account.getSnapshot();
    if (!account.restored || !account.isLoggedIn || account.accountIdentifier === null) return;
    const snapshot = this.dependencies.controller.getSnapshot();
    if (snapshot.connected) { this.pending = null; return; }
    if (snapshot.operation !== SpotifyMobileOperation.Idle) return;
    const pending = this.pending; this.pending = null; this.lastState = pending.state;
    void this.dependencies.controller.resumeAuthorization(pending.address).catch(() => this.interrupted(IntegrationFailureCode.Network));
  }

  private interrupted(failure: IntegrationFailureCode): void {
    if (!this.disposed && !this.dependencies.isAuthorizing()) this.dependencies.controller.authorizationInterrupted(failure);
  }
}

const InitialPosition = 0;

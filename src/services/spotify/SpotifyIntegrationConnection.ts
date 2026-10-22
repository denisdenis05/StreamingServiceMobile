import { IntegrationFailure, IntegrationFailureCode, SpotifyJamRuntime } from 'streaming-service-spotify-jam';
import type { SpotifyJamDependencies } from 'streaming-service-spotify-jam';

export interface SpotifyApplicationAccount {
  getSnapshot(): { readonly accountIdentifier: string | null; readonly isLoggedIn: boolean };
  subscribe(listener: () => void): () => void;
}

export interface SpotifyDeviceSelection {
  getDeviceIdentifier(): string | null;
  nextRequestIdentifier(): string;
}

export class SpotifyIntegrationConnection {
  private activeRuntime: SpotifyJamRuntime | null = null;
  private applicationAccountIdentifier: string | null = null;
  private readonly stopObservation: () => void;
  private disposed = false;
  private deviceSelection: SpotifyDeviceSelection | null = null;
  private active = true;

  constructor(private readonly applicationAccount: SpotifyApplicationAccount,
    private readonly onForegroundFailure: () => void = () => undefined) {
    this.stopObservation = applicationAccount.subscribe(() => {
      const account = applicationAccount.getSnapshot();
      if (!account.isLoggedIn || account.accountIdentifier !== this.applicationAccountIdentifier) this.disconnect();
    });
  }

  get runtime(): SpotifyJamRuntime | null { return this.activeRuntime; }

  connect(dependencies: SpotifyJamDependencies, deviceSelection: SpotifyDeviceSelection | null = null): SpotifyJamRuntime {
    const account = this.applicationAccount.getSnapshot();
    if (this.disposed || !account.isLoggedIn || account.accountIdentifier === null) {
      throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    }
    const nextRuntime = new SpotifyJamRuntime(dependencies);
    this.disconnect();
    this.applicationAccountIdentifier = account.accountIdentifier;
    this.activeRuntime = nextRuntime;
    this.deviceSelection = deviceSelection;
    return nextRuntime;
  }

  setActive(active: boolean): void {
    const resumed = !this.active && active;
    this.active = active;
    const runtime = this.activeRuntime;
    const deviceSelection = this.deviceSelection;
    if (!resumed || !runtime || !deviceSelection) return;
    try {
      const deviceIdentifier = deviceSelection.getDeviceIdentifier();
      if (deviceIdentifier === null) return;
      void runtime.sessions.refreshSession(deviceIdentifier, deviceSelection.nextRequestIdentifier())
        .catch(() => this.reportForegroundFailure());
    } catch { this.reportForegroundFailure(); }
  }

  disconnect(): void {
    const previous = this.activeRuntime;
    this.activeRuntime = null;
    this.applicationAccountIdentifier = null;
    this.deviceSelection = null;
    previous?.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopObservation();
    this.disconnect();
  }

  private reportForegroundFailure(): void {
    try { this.onForegroundFailure(); } catch {}
  }
}

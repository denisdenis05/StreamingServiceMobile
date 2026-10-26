import { IntegrationFailure, IntegrationFailureCode, JamConnectionStatus, MembershipObservationStatus, SpotifyJamRuntime } from 'streaming-service-spotify-jam';
import type { SpotifyJamDependencies } from 'streaming-service-spotify-jam';

export interface SpotifyApplicationAccount {
  getSnapshot(): { readonly accountIdentifier: string | null; readonly isLoggedIn: boolean };
  subscribe(listener: () => void): () => void;
}

export interface SpotifyDeviceSelection {
  getDeviceIdentifier(): string | null;
  nextRequestIdentifier(): string;
  readonly refreshAccountWhenDeviceUnavailable?: boolean;
  readonly preferAccountRefresh?: boolean;
  readonly useNativeConnect?: boolean;
}

export class SpotifyIntegrationConnection {
  private activeRuntime: SpotifyJamRuntime | null = null;
  private applicationAccountIdentifier: string | null = null;
  private readonly stopObservation: () => void;
  private disposed = false;
  private deviceSelection: SpotifyDeviceSelection | null = null;
  private active = true;
  private foregroundLifetime: object = Object.freeze({});
  private stopMembershipObservation: (() => void) | null = null;

  constructor(private readonly applicationAccount: SpotifyApplicationAccount,
    private readonly onForegroundFailure: () => void = () => undefined) {
    this.stopObservation = applicationAccount.subscribe(() => {
      const account = applicationAccount.getSnapshot();
      if (!account.isLoggedIn || account.accountIdentifier !== this.applicationAccountIdentifier) this.disconnect();
    });
  }

  get runtime(): SpotifyJamRuntime | null { return this.activeRuntime; }

  resumeObserversAfterMembership(): void {
    const runtime = this.activeRuntime;
    if (this.active && runtime?.sessions.getSnapshot().status === JamConnectionStatus.Ready) {
      runtime.membership.setActive(true);
      runtime.hostedQueue.setActive(true);
    }
  }

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
    nextRuntime.hostedQueue.setActive(this.active);
    nextRuntime.membership.setActive(this.active);
    this.stopMembershipObservation = nextRuntime.membership.subscribe(() => {
      const membership = nextRuntime.membership.getSnapshot();
      if (nextRuntime === this.activeRuntime && membership.status === MembershipObservationStatus.Ready && membership.failure === null) {
        this.resumeObserversAfterMembership();
      }
    });
    return nextRuntime;
  }

  setActive(active: boolean): void {
    const resumed = !this.active && active;
    if (this.active !== active) this.foregroundLifetime = Object.freeze({});
    this.active = active;
    const runtime = this.activeRuntime;
    const deviceSelection = this.deviceSelection;
    if (!active) { runtime?.membership.setActive(false); runtime?.hostedQueue.setActive(false); }
    if (!resumed || !runtime || !deviceSelection) return;
    const foregroundLifetime = this.foregroundLifetime;
    const reportFailure = () => {
      if (runtime === this.activeRuntime && this.active && foregroundLifetime === this.foregroundLifetime) this.reportForegroundFailure();
    };
    try {
      const preferAccount = deviceSelection.preferAccountRefresh === true;
      if (preferAccount && runtime.membership.getSnapshot().enabled) {
        runtime.membership.setActive(true);
        void runtime.membership.refresh().then(() => {
          if (runtime !== this.activeRuntime || !this.active || foregroundLifetime !== this.foregroundLifetime) return;
          const membership = runtime.membership.getSnapshot();
          if (membership.status === MembershipObservationStatus.Ready && membership.failure === null) this.resumeObserversAfterMembership();
          else reportFailure();
        }).catch(reportFailure);
        return;
      }
      const deviceIdentifier = preferAccount ? null : deviceSelection.getDeviceIdentifier();
      if (deviceIdentifier === null && !preferAccount && !deviceSelection.refreshAccountWhenDeviceUnavailable) return;
      const refresh = deviceIdentifier === null ? runtime.sessions.refreshCurrentSession(deviceSelection.nextRequestIdentifier())
        : runtime.sessions.refreshSession(deviceIdentifier, deviceSelection.nextRequestIdentifier());
      void refresh.then(result => {
        if (runtime !== this.activeRuntime || !this.active || foregroundLifetime !== this.foregroundLifetime) return;
        if (result.applied) this.resumeObserversAfterMembership();
        else reportFailure();
      })
        .catch(reportFailure);
    } catch { reportFailure(); }
  }

  disconnect(): void {
    const previous = this.activeRuntime;
    this.activeRuntime = null;
    this.stopMembershipObservation?.();
    this.stopMembershipObservation = null;
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

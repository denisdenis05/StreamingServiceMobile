import { IntegrationFailure, IntegrationFailureCode, JamJoinMode, JamConnectionStatus } from 'streaming-service-spotify-jam';
import type { Clock, JamCommandResult, JamSessionClient, JamSnapshot, SpotifyCredentialProvider, SpotifyCredentials } from 'streaming-service-spotify-jam';
import type { SpotifyApplicationAccount, SpotifyDeviceSelection } from './SpotifyIntegrationConnection';
import type { SpotifyAccountGateway, SpotifyMobileDevice, SpotifyMobileIdentity } from './SpotifyMobileGateway';
import { SpotifyMobilePolicy } from './SpotifyMobilePolicy';
import { spotifyInvitationToken } from './SpotifyInvitation';

export enum SpotifyMobileOperation {
  Idle = 'idle', Connecting = 'connecting', Devices = 'devices', Creating = 'creating',
  Joining = 'joining', Refreshing = 'refreshing', Ending = 'ending', Leaving = 'leaving',
}

export interface SpotifyMobileSnapshot {
  readonly connected: boolean;
  readonly displayName: string | null;
  readonly devices: readonly SpotifyMobileDevice[];
  readonly selectedDeviceIdentifier: string | null;
  readonly operation: SpotifyMobileOperation;
  readonly session: JamSnapshot | null;
  readonly failure: IntegrationFailureCode | null;
  readonly deviceFailure: IntegrationFailureCode | null;
}

export interface SpotifyMobileDependencies {
  readonly account: SpotifyApplicationAccount;
  readonly gateway: SpotifyAccountGateway;
  readonly clock: Clock;
  readonly nextIdentifier: () => string;
  readonly connect: (identity: SpotifyMobileIdentity, credentials: SpotifyCredentialProvider, selection: SpotifyDeviceSelection) => JamSessionClient;
  readonly disconnect: () => void;
  readonly resolveInvitation?: (invitation: string, cancellation: AbortSignal) => Promise<string>;
}

const EmptySnapshot: SpotifyMobileSnapshot = Object.freeze({ connected: false, displayName: null, devices: Object.freeze([]),
  selectedDeviceIdentifier: null, operation: SpotifyMobileOperation.Idle, session: null, failure: null, deviceFailure: null });

export class SpotifyMobileController {
  private snapshot = EmptySnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly stopAccountObservation: () => void;
  private stopSessionObservation: (() => void) | null = null;
  private cancellation = new AbortController();
  private credentials: SpotifyCredentials | null = null;
  private sessions: JamSessionClient | null = null;
  private applicationAccountIdentifier: string | null = null;
  private disposed = false;

  constructor(private readonly dependencies: SpotifyMobileDependencies) {
    this.stopAccountObservation = dependencies.account.subscribe(() => {
      const account = dependencies.account.getSnapshot();
      if (!account.isLoggedIn || account.accountIdentifier !== this.applicationAccountIdentifier) this.disconnect();
    });
  }

  getSnapshot = (): SpotifyMobileSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async connect(accessToken: string): Promise<void> {
    const account = this.dependencies.account.getSnapshot();
    if (this.disposed || !account.isLoggedIn || account.accountIdentifier === null) return this.fail(IntegrationFailureCode.Unauthorized);
    const token = accessToken.trim().replace(SpotifyMobilePolicy.bearerPattern, SpotifyMobilePolicy.emptyText);
    if (!token || token.length > SpotifyMobilePolicy.maximumTokenCharacters || SpotifyMobilePolicy.whitespacePattern.test(token)) {
      return this.fail(IntegrationFailureCode.InvalidInput);
    }
    this.disconnect();
    this.applicationAccountIdentifier = account.accountIdentifier;
    const lifetime = this.cancellation;
    this.publish({ ...EmptySnapshot, operation: SpotifyMobileOperation.Connecting });
    try {
      const identity = await this.dependencies.gateway.inspect(token, lifetime.signal);
      if (!this.current(lifetime)) return;
      this.credentials = Object.freeze({ accountIdentifier: identity.accountIdentifier, accessToken: token,
        expiresAtMilliseconds: this.dependencies.clock.nowMilliseconds() + SpotifyMobilePolicy.temporaryConnectionLifetimeMilliseconds });
      const credentialProvider: SpotifyCredentialProvider = {
        getCredentials: async cancellation => {
          if (!this.current(lifetime)) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
          return this.currentCredentials(cancellation);
        },
        renewCredentials: async () => { throw new IntegrationFailure(IntegrationFailureCode.Unauthorized); },
      };
      this.sessions = this.dependencies.connect(identity, credentialProvider, {
        getDeviceIdentifier: () => this.snapshot.selectedDeviceIdentifier,
        nextRequestIdentifier: this.dependencies.nextIdentifier,
        refreshAccountWhenDeviceUnavailable: true,
      });
      this.stopSessionObservation = this.sessions.subscribe(() => this.observeSession(lifetime));
      this.publish({ ...this.snapshot, connected: true, displayName: identity.displayName, session: this.sessions.getSnapshot(),
        operation: SpotifyMobileOperation.Connecting });
      const refresh = await this.sessions.refreshCurrentSession(this.dependencies.nextIdentifier());
      if (!this.current(lifetime)) return;
      this.publish({ ...this.snapshot, operation: SpotifyMobileOperation.Idle, failure: refresh.failure });
      if (!refresh.applied) return;
      await this.reloadDevices();
    } catch (failure) {
      if (!this.current(lifetime)) return;
      this.credentials = null;
      this.dependencies.disconnect();
      this.publish({ ...EmptySnapshot, failure: this.failureCode(failure) });
    }
  }

  async reloadDevices(): Promise<void> {
    if (!this.start(SpotifyMobileOperation.Devices)) return;
    const lifetime = this.cancellation;
    try {
      const credentials = this.currentCredentials(lifetime.signal);
      const devices = await this.dependencies.gateway.devices(credentials.accessToken, lifetime.signal);
      if (!this.current(lifetime)) return;
      const selected = devices.find(device => device.identifier === this.snapshot.selectedDeviceIdentifier)
        ?? devices.find(device => device.active) ?? devices[SpotifyMobilePolicy.firstPosition];
      this.publish({ ...this.snapshot, devices: Object.freeze(devices.map(device => Object.freeze({ ...device }))),
        selectedDeviceIdentifier: selected?.identifier ?? null, deviceFailure: null });
    } catch (failure) { if (this.current(lifetime)) this.publish({ ...this.snapshot, deviceFailure: this.failureCode(failure) }); }
    finally { this.finish(lifetime); }
  }

  selectDevice(identifier: string): void {
    if (this.snapshot.operation !== SpotifyMobileOperation.Idle) return;
    const deviceIdentifier = identifier.trim();
    if (!deviceIdentifier || deviceIdentifier.length > SpotifyMobilePolicy.maximumIdentifierCharacters
      || SpotifyMobilePolicy.whitespacePattern.test(deviceIdentifier)) return this.fail(IntegrationFailureCode.InvalidInput);
    this.publish({ ...this.snapshot, selectedDeviceIdentifier: deviceIdentifier, failure: null });
  }

  createSession(): Promise<void> {
    if (this.snapshot.session?.session && !this.snapshot.session.session.ownedByCurrentAccount) {
      this.fail(IntegrationFailureCode.Forbidden);
      return Promise.resolve();
    }
    return this.run(SpotifyMobileOperation.Creating, sessions => sessions.createOrActivateSession(this.dependencies.nextIdentifier()));
  }

  joinSession(invitation: string, mode: JamJoinMode): Promise<void> {
    return this.run(SpotifyMobileOperation.Joining, async sessions => {
      const lifetime = this.cancellation;
      const resolved = this.dependencies.resolveInvitation ? await this.dependencies.resolveInvitation(invitation, lifetime.signal) : invitation;
      if (!this.current(lifetime)) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      const token = spotifyInvitationToken(resolved);
      return sessions.joinSession(token, mode, this.snapshot.selectedDeviceIdentifier, this.dependencies.nextIdentifier());
    });
  }

  refreshSession(): Promise<void> {
    return this.run(SpotifyMobileOperation.Refreshing, sessions => sessions.refreshCurrentSession(this.dependencies.nextIdentifier()));
  }

  endSession(): Promise<void> {
    return this.run(SpotifyMobileOperation.Ending, sessions => sessions.endSession(this.dependencies.nextIdentifier()));
  }

  leaveSession(): Promise<void> {
    return this.run(SpotifyMobileOperation.Leaving, sessions => sessions.leaveSession(this.dependencies.nextIdentifier()));
  }

  invitationAddress(): string | null {
    return this.sessions?.getInvitation()?.address ?? null;
  }

  disconnect(): void {
    this.cancellation.abort();
    this.cancellation = new AbortController();
    this.stopSessionObservation?.();
    this.stopSessionObservation = null;
    this.sessions = null;
    this.credentials = null;
    this.applicationAccountIdentifier = null;
    this.dependencies.disconnect();
    this.publish(EmptySnapshot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAccountObservation();
    this.disconnect();
    this.listeners.clear();
  }

  private async run(operation: SpotifyMobileOperation, action: (sessions: JamSessionClient) => Promise<JamCommandResult>): Promise<void> {
    if (!this.start(operation)) return;
    const lifetime = this.cancellation;
    try {
      const sessions = this.sessions;
      if (sessions === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      const result = await action(sessions);
      if (this.current(lifetime) && !result.applied) this.fail(result.failure ?? IntegrationFailureCode.Network);
    } catch (failure) { if (this.current(lifetime)) this.fail(this.failureCode(failure)); }
    finally { this.finish(lifetime); }
  }

  private currentCredentials(cancellation: AbortSignal): SpotifyCredentials {
    if (cancellation.aborted || this.cancellation.signal.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    if (this.credentials === null || this.credentials.expiresAtMilliseconds <= this.dependencies.clock.nowMilliseconds()) {
      throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    }
    return this.credentials;
  }

  private start(operation: SpotifyMobileOperation): boolean {
    if (this.disposed || !this.snapshot.connected) { this.fail(IntegrationFailureCode.Unauthorized); return false; }
    if (this.snapshot.operation !== SpotifyMobileOperation.Idle) { this.fail(IntegrationFailureCode.Backpressure); return false; }
    if (operation !== SpotifyMobileOperation.Refreshing && operation !== SpotifyMobileOperation.Devices
      && this.snapshot.session?.status !== JamConnectionStatus.Ready) {
      this.fail(this.snapshot.session?.status === JamConnectionStatus.Uncertain
        ? IntegrationFailureCode.UnknownOutcome : IntegrationFailureCode.InvalidResponse);
      return false;
    }
    this.publish({ ...this.snapshot, operation, failure: null });
    return true;
  }

  private observeSession(lifetime: AbortController): void {
    if (!this.current(lifetime) || this.sessions === null) return;
    const session = this.sessions.getSnapshot();
    if (session.status === JamConnectionStatus.Detached) { this.disconnect(); return; }
    this.publish({ ...this.snapshot, session, failure: session.failure });
  }

  private finish(lifetime: AbortController): void {
    if (this.current(lifetime)) this.publish({ ...this.snapshot, operation: SpotifyMobileOperation.Idle });
  }

  private current(lifetime: AbortController): boolean { return !this.disposed && lifetime === this.cancellation && !lifetime.signal.aborted; }
  private fail(failure: IntegrationFailureCode): void { this.publish({ ...this.snapshot, failure }); }
  private failureCode(failure: unknown): IntegrationFailureCode {
    return failure instanceof IntegrationFailure ? failure.code : IntegrationFailureCode.Network;
  }
  private publish(snapshot: SpotifyMobileSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) { try { listener(); } catch {} }
    }
  }
}

import { IntegrationFailure, IntegrationFailureCode, SharedPlaybackStatus } from 'streaming-service-spotify-jam';
import type { SharedPlaybackSnapshot } from 'streaming-service-spotify-jam';
import { decodeSpotifyJamPlayback, EmptySpotifyPlaybackSnapshot, sameSpotifyPlaybackContext,
  SpotifyJamPlaybackPolicy, validateSpotifyPlaybackContext, validateSpotifyPlaybackIdentifier } from './SpotifyJamPlaybackProtocol';
import type { SpotifyJamPlaybackConfiguration, SpotifyJamPlaybackContext, SpotifyJamPlaybackNative,
  SpotifyJamPlaybackObservation, SpotifyJamPlaybackPlayerIdentity } from './SpotifyJamPlaybackProtocol';

export interface SpotifyPlaybackApplicationAccount {
  readonly restored: boolean;
  readonly isLoggedIn: boolean;
  readonly accountIdentifier: string | null;
  readonly token: string | null;
}

export interface SpotifyNativeFollowerDependencies {
  readonly native: SpotifyJamPlaybackNative | null;
  readonly observe: (listener: (event: unknown) => void) => () => void;
  readonly getContext: () => SpotifyJamPlaybackContext | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
  readonly getApplicationAccount: () => SpotifyPlaybackApplicationAccount;
  readonly subscribeApplicationAccount: (listener: () => void) => () => void;
  readonly whenPlayerReady: () => Promise<void>;
  readonly acknowledgeOwnership: (context: SpotifyJamPlaybackContext, identity: SpotifyJamPlaybackPlayerIdentity, isCurrent: () => boolean) => Promise<void>;
  readonly nextIdentifier: () => string;
}

interface NativeFollowerLifetime {
  readonly identifier: string;
  readonly context: SpotifyJamPlaybackContext;
  readonly market: string;
  acknowledged: boolean;
  terminal: boolean;
  ownership: Promise<void> | null;
  latestObservation: SpotifyJamPlaybackObservation | null;
  playerReadiness: Promise<void> | null;
}

const FailureCodes = new Set<string>(Object.values(IntegrationFailureCode));

function safeFailure(failure: unknown): IntegrationFailureCode {
  const code = failure instanceof IntegrationFailure ? failure.code : (failure as { readonly code?: unknown } | null)?.code;
  return typeof code === SpotifyJamPlaybackPolicy.stringType && FailureCodes.has(code as string)
    ? code as IntegrationFailureCode : IntegrationFailureCode.Network;
}

export class SpotifyNativeFollowerStore {
  private snapshot = EmptySpotifyPlaybackSnapshot;
  private lifetime: NativeFollowerLifetime | null = null;
  private intent: object = Object.freeze({});
  private accountRevision: object = Object.freeze({});
  private accountSynchronization: Promise<void> = Promise.resolve();
  private cleanup: Promise<void> = Promise.resolve();
  private inspection: object | null = null;
  private disposed = false;
  private active = true;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: readonly (() => void)[];

  constructor(private readonly dependencies: SpotifyNativeFollowerDependencies) {
    this.subscriptions = [dependencies.observe(event => this.observe(event)),
      dependencies.subscribeConnection(() => this.connectionChanged()),
      dependencies.subscribeApplicationAccount(() => this.accountChanged())];
    this.accountChanged();
  }

  readonly getSnapshot = (): SharedPlaybackSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };

  async start(market: string): Promise<void> {
    if (this.disposed) return;
    const intent = Object.freeze({});
    this.intent = intent;
    const retired = this.retire();
    this.inspection = null;
    this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Waiting });
    try {
      if (!this.active) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      if (!SpotifyJamPlaybackPolicy.marketPattern.test(market)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
      const native = this.requireNative();
      await retired;
      await this.accountSynchronization;
      if (!this.currentIntent(intent)) return;
      await this.dependencies.whenPlayerReady();
      if (!this.currentIntent(intent)) return;
      const configuration = this.configuration(market);
      const identifier = validateSpotifyPlaybackIdentifier(this.dependencies.nextIdentifier(), SpotifyJamPlaybackPolicy.maximumRequestIdentifierCharacters);
      const { accessToken: _accessToken, ...context } = configuration;
      const current: NativeFollowerLifetime = { identifier, context: Object.freeze(context), market, acknowledged: false,
        terminal: false, ownership: null, latestObservation: null, playerReadiness: Promise.resolve() };
      this.lifetime = current;
      const serialized = await native.startFollowing(identifier, JSON.stringify(configuration));
      if (!this.currentIntent(intent) || this.lifetime !== current) return;
      if (current.terminal) return;
      if (current.latestObservation?.nativeHandoff === true) { await current.ownership; return; }
      const observation = decodeSpotifyJamPlayback(serialized);
      if (observation === null || !observation.nativeHandoff || !this.matches(current, observation)) {
        throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      }
      await this.accept(current, observation);
    } catch (failure) {
      if (!this.currentIntent(intent)) return;
      if (this.lifetime?.terminal) return;
      const code = safeFailure(failure);
      try { await this.retire(); } catch {}
      if (this.currentIntent(intent)) this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed, failure: code });
    }
  }

  stop(): Promise<void> {
    this.intent = Object.freeze({});
    return this.retire();
  }

  private retire(): Promise<void> {
    this.inspection = null;
    this.lifetime = null;
    const native = this.dependencies.native;
    if (native === null || this.disposed) return this.cleanup;
    const stopping = Object.freeze({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Stopping });
    const previous = this.cleanup;
    try { this.cleanup = Promise.all([previous, native.stopFollowing()]).then(() => undefined); }
    catch (failure) { this.cleanup = Promise.reject(failure); }
    const cleanup = this.cleanup;
    this.publish(stopping);
    void cleanup.then(() => {
      if (!this.disposed && this.snapshot === stopping) this.publish(EmptySpotifyPlaybackSnapshot);
    }, failure => {
      if (!this.disposed && this.snapshot === stopping) this.publish({ ...EmptySpotifyPlaybackSnapshot,
        status: SharedPlaybackStatus.Failed, failure: safeFailure(failure) });
    });
    return cleanup;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active && this.lifetime?.acknowledged !== true && (this.lifetime !== null || this.snapshot.status !== SharedPlaybackStatus.Detached)) {
      void this.stop().catch(() => undefined);
    }
    if (active) this.connectionChanged();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.intent = Object.freeze({});
    this.inspection = null;
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }

  private configuration(market: string): SpotifyJamPlaybackConfiguration {
    const context = this.dependencies.getContext();
    const account = this.dependencies.getApplicationAccount();
    if (!context) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    validateSpotifyPlaybackContext(context);
    if (!account.restored || !account.isLoggedIn || account.accountIdentifier !== context.streamingServiceAccountIdentifier || account.token === null) {
      throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    }
    validateSpotifyPlaybackIdentifier(account.token, SpotifyJamPlaybackPolicy.maximumTokenCharacters);
    return Object.freeze({ ...context, market, accessToken: account.token });
  }

  private accountChanged(): void {
    if (this.disposed || !this.dependencies.native) return;
    const account = this.dependencies.getApplicationAccount();
    if (!account.restored) return;
    const revision = Object.freeze({}); this.accountRevision = revision;
    const accountIdentifier = account.isLoggedIn ? account.accountIdentifier : null;
    const token = account.isLoggedIn ? account.token : null;
    if (this.lifetime && this.lifetime.context.streamingServiceAccountIdentifier !== accountIdentifier) void this.stop().catch(() => undefined);
    try { this.accountSynchronization = this.dependencies.native.updateApplicationAccount(accountIdentifier, token); }
    catch (failure) { this.accountSynchronization = Promise.reject(failure); }
    void this.accountSynchronization.then(() => {
      if (!this.disposed && this.accountRevision === revision) this.connectionChanged();
    }, failure => {
      if (this.disposed || this.accountRevision !== revision) return;
      const code = safeFailure(failure);
      void this.stop().catch(() => undefined);
      this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed, failure: code });
    });
  }

  private connectionChanged(): void {
    if (this.disposed) return;
    const context = this.dependencies.getContext();
    if (this.lifetime) {
      if (!context || !sameSpotifyPlaybackContext(context, this.lifetime.context)) void this.stop().catch(() => undefined);
      return;
    }
    if (context && this.snapshot.status === SharedPlaybackStatus.Detached) void this.restore(context);
  }

  private async restore(context: SpotifyJamPlaybackContext): Promise<void> {
    if (!this.dependencies.native || this.inspection !== null || !this.dependencies.getApplicationAccount().restored) return;
    const inspection = Object.freeze({}); this.inspection = inspection;
    const intent = this.intent;
    try {
      await this.cleanup;
      await this.accountSynchronization;
      if (!this.currentIntent(intent) || this.inspection !== inspection) return;
      const observation = decodeSpotifyJamPlayback(await this.dependencies.native.getSnapshot());
      if (!this.currentIntent(intent) || this.inspection !== inspection) return;
      const currentContext = this.dependencies.getContext();
      if (!currentContext || !sameSpotifyPlaybackContext(context, currentContext) || observation === null) return;
      this.configuration(observation.market);
      if (!sameSpotifyPlaybackContext(context, observation)) { await this.stop(); return; }
      const current: NativeFollowerLifetime = { identifier: observation.identifier, context: Object.freeze({ ...context }),
        market: observation.market, acknowledged: false, terminal: false, ownership: null, latestObservation: null,
        playerReadiness: null };
      this.lifetime = current;
      await this.accept(current, observation);
    } catch (failure) {
      if (this.currentIntent(intent) && this.inspection === inspection) {
        const code = safeFailure(failure);
        try { await this.retire(); } catch {}
        if (this.currentIntent(intent)) this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed, failure: code });
      }
    } finally { if (this.inspection === inspection) this.inspection = null; }
  }

  private observe(event: unknown): void {
    const current = this.lifetime;
    if (this.disposed || !current) return;
    try {
      const observation = decodeSpotifyJamPlayback(event);
      if (observation === null) {
        if (current.acknowledged) { this.lifetime = null; this.publish(EmptySpotifyPlaybackSnapshot); }
      } else if (this.matches(current, observation)) void this.accept(current, observation).catch(failure => {
        if (this.disposed || this.lifetime !== current || current.terminal) return;
        const intent = this.intent;
        const code = safeFailure(failure);
        void this.retire().catch(() => undefined).then(() => {
          if (this.currentIntent(intent)) this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed, failure: code });
        });
      });
    } catch {
      void this.stop().catch(() => undefined);
      this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed, failure: IntegrationFailureCode.InvalidResponse });
    }
  }

  private matches(current: NativeFollowerLifetime, observation: SpotifyJamPlaybackObservation): boolean {
    return current.identifier === observation.identifier && current.market === observation.market && sameSpotifyPlaybackContext(current.context, observation);
  }
  private async accept(current: NativeFollowerLifetime, observation: SpotifyJamPlaybackObservation): Promise<void> {
    if (current.terminal) return;
    const context = this.dependencies.getContext();
    if (!context || !sameSpotifyPlaybackContext(current.context, context)) { void this.stop().catch(() => undefined); return; }
    const previousIdentity = current.latestObservation?.playerIdentity;
    if (current.ownership !== null && previousIdentity && observation.playerIdentity
      && (previousIdentity.engineEpoch !== observation.playerIdentity.engineEpoch || previousIdentity.authenticationEpoch !== observation.playerIdentity.authenticationEpoch)) {
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    }
    current.latestObservation = observation;
    current.terminal = observation.terminal;
    const status = observation.snapshot.status;
    if (observation.nativeHandoff) {
      await (current.playerReadiness ??= this.dependencies.whenPlayerReady());
      if (this.disposed || this.lifetime !== current || current.terminal || current.latestObservation?.nativeHandoff !== true) return;
      const playerIdentity = current.latestObservation.playerIdentity;
      if (playerIdentity === null) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      current.ownership ??= this.dependencies.acknowledgeOwnership(current.context, playerIdentity,
        () => !this.disposed && this.lifetime === current && !current.terminal && current.latestObservation?.nativeHandoff === true
          && this.dependencies.getApplicationAccount().accountIdentifier === current.context.streamingServiceAccountIdentifier);
      await current.ownership;
      if (this.disposed || this.lifetime !== current || current.terminal || current.latestObservation?.nativeHandoff !== true) return;
      const latestContext = this.dependencies.getContext();
      if (!latestContext || !sameSpotifyPlaybackContext(current.context, latestContext)) { void this.stop().catch(() => undefined); return; }
      current.acknowledged = true;
      this.publish(current.latestObservation.snapshot);
    } else {
      current.acknowledged = false;
      this.publish(status === SharedPlaybackStatus.Failed || status === SharedPlaybackStatus.Detached
        ? observation.snapshot : { ...observation.snapshot, status: SharedPlaybackStatus.Waiting });
    }
    if (!this.active && !current.acknowledged) void this.stop().catch(() => undefined);
  }
  private currentIntent(intent: object): boolean { return !this.disposed && this.intent === intent; }
  private requireNative(): SpotifyJamPlaybackNative {
    if (!this.dependencies.native) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    return this.dependencies.native;
  }
  private publish(snapshot: SharedPlaybackSnapshot): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => { try { listener(); } catch {} });
  }
}

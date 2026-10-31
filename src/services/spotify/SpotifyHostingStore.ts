import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyHostingQueue } from './SpotifyHostingQueue';

export enum SpotifyHostingStatus { Stopped = 'Stopped', Resolving = 'Resolving', Preparing = 'Preparing', Starting = 'Starting', Hosting = 'Hosting', Stopping = 'Stopping', Failed = 'Failed' }
export interface SpotifyHostingContext {
  readonly streamingServiceAccountIdentifier: string;
  readonly baseAddress: string;
  readonly spotifyAccountIdentifier: string;
  readonly jamSessionIdentifier: string;
  readonly deviceIdentifier: string;
  readonly previousHostDeviceIdentifier: string;
  readonly handle: number;
  readonly generation: number;
}
export interface SpotifyHostingNative {
  prepareHostingRecordings?(serialized: string): Promise<void>;
  publishHostingChanges?(): Promise<void>;
  startHosting(serialized: string): Promise<string>;
  stopHosting(): Promise<void>;
  getHostingSnapshot(): Promise<string>;
}
export interface SpotifyHostingSnapshot { readonly status: SpotifyHostingStatus; readonly failure: IntegrationFailureCode | null }
export interface SpotifyHostingDependencies {
  readonly native: SpotifyHostingNative | null;
  readonly observe: (listener: (event: unknown) => void) => () => void;
  readonly getContext: () => SpotifyHostingContext | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
  readonly getAccessToken: () => string | null;
  readonly whenPlayerReady: () => Promise<void>;
  readonly captureQueue: () => Promise<SpotifyHostingQueue>;
  readonly translate: (recordingIdentifier: string, market: string, cancellation: AbortSignal) => Promise<string>;
  readonly stopFollowing: () => Promise<void>;
}
const Policy = Object.freeze({ market: /^[A-Z]{2}$/, track: /^[A-Za-z0-9]{22}$/, maximumSnapshotCharacters: 131072,
  stringType: 'string', initialObservation: 0, observationIncrement: 1 } as const);
const FailureCodes = new Set<unknown>(Object.values(IntegrationFailureCode));
function hostingFailureCode(failure: unknown): IntegrationFailureCode {
  try {
    const code = (failure as { readonly code?: unknown } | null)?.code;
    return FailureCodes.has(code) ? code as IntegrationFailureCode : IntegrationFailureCode.Network;
  } catch { return IntegrationFailureCode.Network; }
}
const Empty: SpotifyHostingSnapshot = Object.freeze({ status: SpotifyHostingStatus.Stopped, failure: null });

export class SpotifyHostingStore {
  private snapshot = Empty;
  private context: SpotifyHostingContext | null = null;
  private intent: AbortController | null = null;
  private disposed = false;
  private observation = Policy.initialObservation;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: readonly (() => void)[];
  constructor(private readonly dependencies: SpotifyHostingDependencies) {
    this.subscriptions = [dependencies.observe(event => this.observe(event)), dependencies.subscribeConnection(() => this.changed())];
    this.changed();
  }
  readonly getSnapshot = (): SpotifyHostingSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  async start(market: string): Promise<void> {
    if (this.disposed) return;
    this.observation += Policy.observationIncrement;
    this.intent?.abort(); const intent = new AbortController(); this.intent = intent;
    this.publish(SpotifyHostingStatus.Preparing);
    try {
      if (!Policy.market.test(market)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
      const native = this.dependencies.native;
      const context = this.dependencies.getContext();
      if (!native || !context) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
      this.context = context;
      await Promise.all([native.stopHosting(), this.dependencies.stopFollowing()]); this.requireCurrent(intent, context);
      await this.dependencies.whenPlayerReady(); this.requireCurrent(intent, context);
      const queue = await this.dependencies.captureQueue(); this.requireCurrent(intent, context);
      const matches = new Map<string, string>();
      const mappings: { occurrenceIdentifier: string; recordingIdentifier: string; spotifyTrackIdentifier: string }[] = [];
      for (const entry of queue.entries) {
        let track = matches.get(entry.recordingIdentifier);
        if (track === undefined) {
          track = await this.dependencies.translate(entry.recordingIdentifier, market, intent.signal); this.requireCurrent(intent, context);
          if (!Policy.track.test(track)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
          matches.set(entry.recordingIdentifier, track);
        }
        mappings.push({ ...entry, spotifyTrackIdentifier: track });
      }
      const currentQueue = await this.dependencies.captureQueue(); this.requireCurrent(intent, context);
      if (JSON.stringify(queue) !== JSON.stringify(currentQueue)) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      const accessToken = this.dependencies.getAccessToken();
      if (!accessToken) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      this.publish(SpotifyHostingStatus.Starting);
      const response = await native.startHosting(JSON.stringify({ streamingServiceAccountIdentifier: context.streamingServiceAccountIdentifier,
        baseAddress: context.baseAddress, spotifyAccountIdentifier: context.spotifyAccountIdentifier, jamSessionIdentifier: context.jamSessionIdentifier,
        hostDeviceIdentifier: context.deviceIdentifier, handle: context.handle, generation: context.generation, market, accessToken,
        playerEngineEpoch: queue.playerEngineEpoch, playerAuthenticationEpoch: queue.playerAuthenticationEpoch,
        previousHostDeviceIdentifier: context.previousHostDeviceIdentifier, expectedCursor: queue.expectedCursor, mappings }));
      if (intent.signal.aborted || this.disposed) return;
      if (!sameScope(context, this.dependencies.getContext())) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      this.requireAcknowledgement(response, context, queue);
      this.observe(response);
    } catch (failure) {
      if (this.intent !== intent || intent.signal.aborted || this.disposed) return;
      this.publish(SpotifyHostingStatus.Failed, hostingFailureCode(failure));
    }
  }
  async prepareRecordings(recordingIdentifiers: readonly string[]): Promise<void> {
    if (this.snapshot.status === SpotifyHostingStatus.Stopped || this.snapshot.status === SpotifyHostingStatus.Failed) return;
    if (this.snapshot.status !== SpotifyHostingStatus.Hosting) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    const context = this.context;
    const intent = this.intent;
    const operation = this.dependencies.native?.prepareHostingRecordings;
    if (!context || !operation) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    this.requireHostingOperation(context, intent);
    await operation(JSON.stringify(recordingIdentifiers));
    this.requireHostingOperation(context, intent);
  }
  async publishLocalChanges(): Promise<void> {
    if (this.snapshot.status === SpotifyHostingStatus.Stopped || this.snapshot.status === SpotifyHostingStatus.Failed) return;
    if (this.snapshot.status !== SpotifyHostingStatus.Hosting) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    const context = this.context;
    const intent = this.intent;
    const operation = this.dependencies.native?.publishHostingChanges;
    if (!context || !operation) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    this.requireHostingOperation(context, intent);
    await operation();
    this.requireHostingOperation(context, intent);
  }
  private requireHostingOperation(context: SpotifyHostingContext, intent: AbortController | null): void {
    if (this.disposed || this.intent !== intent || intent?.signal.aborted || this.snapshot.status !== SpotifyHostingStatus.Hosting
      || !sameScope(context, this.dependencies.getContext())) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
  async stop(): Promise<void> {
    this.observation += Policy.observationIncrement;
    this.intent?.abort(); const intent = new AbortController(); this.intent = intent;
    this.publish(SpotifyHostingStatus.Stopping);
    try {
      await this.dependencies.native?.stopHosting();
      if (this.intent === intent) { this.context = null; this.publish(SpotifyHostingStatus.Stopped); }
    } catch (failure) {
      if (this.intent === intent) this.publish(SpotifyHostingStatus.Failed, hostingFailureCode(failure));
      throw failure;
    }
  }
  dispose(): void { this.disposed = true; this.intent?.abort(); this.subscriptions.forEach(unsubscribe => unsubscribe()); this.listeners.clear(); }
  private requireAcknowledgement(response: string, context: SpotifyHostingContext, queue: SpotifyHostingQueue): void {
    try {
      if (typeof response !== Policy.stringType || response.length > Policy.maximumSnapshotCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      const snapshot = JSON.parse(response) as { status?: unknown; failure?: unknown; identity?: Record<string, unknown> | null };
      const identity = snapshot.identity;
      if (snapshot.status !== SpotifyHostingStatus.Hosting || snapshot.failure !== null || !identity
        || identity.streamingServiceAccountIdentifier !== context.streamingServiceAccountIdentifier
        || identity.spotifyAccountIdentifier !== context.spotifyAccountIdentifier || identity.jamSessionIdentifier !== context.jamSessionIdentifier
        || identity.deviceIdentifier !== context.deviceIdentifier || identity.handle !== context.handle || identity.generation !== context.generation
        || identity.playerEngineEpoch !== queue.playerEngineEpoch || identity.playerAuthenticationEpoch !== queue.playerAuthenticationEpoch) {
        throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      }
    } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse); }
  }
  private requireCurrent(intent: AbortController, context: SpotifyHostingContext): void {
    if (this.disposed || this.intent !== intent || intent.signal.aborted || JSON.stringify(this.dependencies.getContext()) !== JSON.stringify(context)) {
      throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    }
  }
  private changed(): void {
    if (this.disposed) return;
    const current = this.dependencies.getContext();
    if (this.context && !sameScope(this.context, current)) {
      this.intent?.abort(); void this.stop().catch(() => undefined); return;
    }
    if (current && this.dependencies.native) {
      this.context = current;
      const observation = this.observation;
      void this.dependencies.native.getHostingSnapshot().then(event => {
        if (observation === this.observation && sameScope(current, this.dependencies.getContext())) this.observe(event);
      }).catch(() => undefined);
    }
  }
  private observe(event: unknown): void {
    if (this.disposed) return;
    try {
      if (typeof event !== Policy.stringType || (event as string).length > Policy.maximumSnapshotCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      const value = JSON.parse(event as string) as { status: SpotifyHostingStatus; identity: null | Record<string, unknown>; failure: string | null };
      if (!Object.values(SpotifyHostingStatus).includes(value.status) || value.status === SpotifyHostingStatus.Preparing) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      if (value.identity !== null) {
        const context = this.dependencies.getContext();
        if (!context || value.identity.streamingServiceAccountIdentifier !== context.streamingServiceAccountIdentifier || value.identity.spotifyAccountIdentifier !== context.spotifyAccountIdentifier
          || value.identity.jamSessionIdentifier !== context.jamSessionIdentifier || value.identity.deviceIdentifier !== context.deviceIdentifier
          || value.identity.handle !== context.handle || value.identity.generation !== context.generation) return;
        this.context = context;
      } else if (value.status !== SpotifyHostingStatus.Stopped) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      if (this.snapshot.status === SpotifyHostingStatus.Preparing && value.status === SpotifyHostingStatus.Stopped) return;
      this.publish(value.status, value.failure === null ? null : hostingFailureCode({ code: value.failure }));
    } catch { this.publish(SpotifyHostingStatus.Failed, IntegrationFailureCode.InvalidResponse); }
  }
  private publish(status: SpotifyHostingStatus, failure: IntegrationFailureCode | null = null): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze({ status, failure }); this.listeners.forEach(listener => { try { listener(); } catch {} });
  }
}
function sameScope(first: SpotifyHostingContext, second: SpotifyHostingContext | null): boolean {
  return second !== null && first.streamingServiceAccountIdentifier === second.streamingServiceAccountIdentifier && first.baseAddress === second.baseAddress
    && first.spotifyAccountIdentifier === second.spotifyAccountIdentifier && first.jamSessionIdentifier === second.jamSessionIdentifier
    && first.deviceIdentifier === second.deviceIdentifier && first.handle === second.handle && first.generation === second.generation;
}

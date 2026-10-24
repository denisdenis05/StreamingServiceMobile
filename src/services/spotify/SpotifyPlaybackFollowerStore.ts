import { HostedPlaybackPolicy, IntegrationFailure, IntegrationFailureCode, MatchStatus, SharedPlaybackStatus,
  SharedPlaybackSynchronizer, samePlaybackIdentity } from 'streaming-service-spotify-jam';
import type { HostedPlaybackSample, MatchResult, Scheduler, SharedPlaybackClock, SharedPlaybackIdentity,
  SharedPlaybackOutput, SharedPlaybackSnapshot, SpotifyJamRuntime } from 'streaming-service-spotify-jam';

export interface SpotifyPlaybackFollowerDependencies {
  readonly getRuntime: () => SpotifyJamRuntime | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
  readonly output: SharedPlaybackOutput;
  readonly clock: SharedPlaybackClock;
  readonly scheduler: Scheduler;
  readonly nextIdentifier: () => string;
}

interface PlaybackFollowLifetime {
  readonly intent: object;
  readonly runtime: SpotifyJamRuntime;
  readonly cancellation: AbortController;
  readonly follower: SharedPlaybackSynchronizer;
  readonly market: string;
  identity: SharedPlaybackIdentity | null;
  sequence: number;
  occurrenceIdentifier: string;
  trackIdentifier: string | null;
  match: MatchResult | null;
  cancelPoll: (() => void) | null;
  stopFollower: (() => void) | null;
  stopSession: (() => void) | null;
}

const EmptySnapshot: SharedPlaybackSnapshot = Object.freeze({ status: SharedPlaybackStatus.Detached, identity: null,
  occurrenceIdentifier: null, recordingIdentifier: null, sequence: null, driftMilliseconds: null, failure: null });
const MarketPattern = /^[A-Z]{2}$/;

export class SpotifyPlaybackFollowerStore {
  private lifetime: PlaybackFollowLifetime | null = null;
  private snapshot = EmptySnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly stopConnection: () => void;
  private retryAtMonotonicMilliseconds: number | null = null;
  private disposed = false;
  private cleanupPending: Promise<void> = Promise.resolve();
  private intent: object = Object.freeze({});

  constructor(private readonly dependencies: SpotifyPlaybackFollowerDependencies) {
    this.stopConnection = dependencies.subscribeConnection(() => {
      if (this.lifetime && this.dependencies.getRuntime() !== this.lifetime.runtime) void this.stop().catch(() => undefined);
    });
  }

  getSnapshot = (): SharedPlaybackSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };

  async start(market: string): Promise<void> {
    if (this.disposed) return;
    const intent = Object.freeze({}); this.intent = intent;
    if (!MarketPattern.test(market)) { await this.rejectStart(IntegrationFailureCode.InvalidInput, intent); return; }
    const runtime = this.dependencies.getRuntime();
    if (!runtime) { await this.rejectStart(IntegrationFailureCode.Unauthorized, intent); return; }
    if (this.retryAtMonotonicMilliseconds !== null && this.dependencies.clock.nowMonotonicMilliseconds() < this.retryAtMonotonicMilliseconds) {
      await this.rejectStart(IntegrationFailureCode.RateLimited, intent); return;
    }
    const retired = this.retire();
    if (this.disposed || this.intent !== intent) { try { await retired; } catch {} return; }
    const follower = new SharedPlaybackSynchronizer(this.dependencies.output, {
      resolve: async (identifier, cancellation) => {
        if (lifetime.trackIdentifier === identifier && lifetime.match) return lifetime.match;
        const result = await runtime.translateToRecording(identifier, market, cancellation);
        if (this.current(lifetime) && lifetime.trackIdentifier === identifier && result.status !== MatchStatus.Failed) lifetime.match = result;
        return result;
      },
    }, this.dependencies.clock, this.dependencies.scheduler);
    const lifetime: PlaybackFollowLifetime = { intent, runtime, cancellation: new AbortController(), follower, market,
      identity: null, sequence: HostedPlaybackPolicy.initialSequence, occurrenceIdentifier: this.dependencies.nextIdentifier(),
      trackIdentifier: null, match: null, cancelPoll: null, stopFollower: null, stopSession: null };
    this.lifetime = lifetime;
    lifetime.stopFollower = follower.subscribe(() => {
      if (this.current(lifetime)) {
        const snapshot = follower.getSnapshot(); this.publish(snapshot);
        if (snapshot.status === SharedPlaybackStatus.Failed) void this.fail(lifetime, new IntegrationFailure(snapshot.failure ?? IntegrationFailureCode.Network));
      }
    });
    lifetime.stopSession = runtime.sessions.subscribe(() => {
      if (!lifetime.identity || !this.current(lifetime)) return;
      const snapshot = runtime.sessions.getSnapshot();
      if (snapshot.accountIdentifier !== lifetime.identity.accountIdentifier || snapshot.session?.identifier !== lifetime.identity.sessionIdentifier
        || !snapshot.session.active || snapshot.session.hostDeviceIdentifier !== lifetime.identity.authorityIdentifier) void this.stop().catch(() => undefined);
    });
    this.publish({ ...EmptySnapshot, status: SharedPlaybackStatus.Waiting });
    try {
      await retired;
      if (this.current(lifetime)) await this.poll(lifetime);
    } catch (failure) { await this.fail(lifetime, failure); }
  }

  stop(): Promise<void> {
    this.intent = Object.freeze({});
    return this.retire();
  }

  private retire(): Promise<void> {
    const lifetime = this.lifetime; this.lifetime = null;
    if (!lifetime) return this.cleanupPending;
    if (lifetime) {
      lifetime.cancellation.abort(); lifetime.cancelPoll?.(); lifetime.stopFollower?.(); lifetime.stopSession?.();
    }
    const retiring = lifetime?.follower.detach() ?? Promise.resolve();
    const cleanup = Promise.all([this.cleanupPending, retiring]).then(() => undefined);
    this.cleanupPending = cleanup.catch(() => undefined);
    const stoppingSnapshot = Object.freeze({ ...EmptySnapshot, status: SharedPlaybackStatus.Stopping });
    this.publish(stoppingSnapshot);
    return cleanup.then(() => {
      if (this.lifetime === null && this.snapshot === stoppingSnapshot) this.publish(EmptySnapshot);
    }).catch(failure => {
      if (this.lifetime === null && this.snapshot === stoppingSnapshot && !this.disposed) this.publish({ ...EmptySnapshot, status: SharedPlaybackStatus.Failed,
        failure: IntegrationFailureCode.UnknownOutcome });
      throw failure;
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true; this.stopConnection();
    try { await this.stop(); } finally { this.listeners.clear(); }
  }

  private async poll(lifetime: PlaybackFollowLifetime): Promise<void> {
    try {
      const sample = await lifetime.runtime.readHostedPlayback(lifetime.cancellation.signal);
      if (!this.current(lifetime)) return;
      if (lifetime.identity === null) {
        lifetime.identity = Object.freeze({ accountIdentifier: sample.accountIdentifier, sessionIdentifier: sample.sessionIdentifier,
          authorityIdentifier: sample.authorityIdentifier });
        await lifetime.follower.attach(lifetime.identity);
        if (!this.current(lifetime)) return;
      }
      if (!samePlaybackIdentity(sample, lifetime.identity)) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      this.acceptSample(lifetime, sample);
      const following = lifetime.follower.accept({ ...sample, sequence: lifetime.sequence, occurrenceIdentifier: lifetime.occurrenceIdentifier, buffering: false });
      if (this.current(lifetime)) {
        this.retryAtMonotonicMilliseconds = null;
        lifetime.cancelPoll = this.dependencies.scheduler.schedule(HostedPlaybackPolicy.pollIntervalMilliseconds,
          () => { lifetime.cancelPoll = null; void this.poll(lifetime); });
      }
      await following;
    } catch (failure) { await this.fail(lifetime, failure); }
  }

  private acceptSample(lifetime: PlaybackFollowLifetime, sample: HostedPlaybackSample): void {
    if (lifetime.trackIdentifier !== sample.spotifyTrackIdentifier) {
      lifetime.trackIdentifier = sample.spotifyTrackIdentifier;
      lifetime.occurrenceIdentifier = this.dependencies.nextIdentifier();
      lifetime.match = null;
    }
    if (!Number.isSafeInteger(lifetime.sequence + HostedPlaybackPolicy.sequenceIncrement)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    lifetime.sequence += HostedPlaybackPolicy.sequenceIncrement;
  }

  private async fail(lifetime: PlaybackFollowLifetime, failure: unknown): Promise<void> {
    if (!this.current(lifetime)) return;
    const code = failure instanceof IntegrationFailure ? failure.code : IntegrationFailureCode.Network;
    if (code === IntegrationFailureCode.Canceled) { try { await this.stop(); } catch {} return; }
    if (failure instanceof IntegrationFailure && code === IntegrationFailureCode.RateLimited && failure.retryAfterSeconds !== undefined) {
      this.retryAtMonotonicMilliseconds = this.dependencies.clock.nowMonotonicMilliseconds()
        + failure.retryAfterSeconds * HostedPlaybackPolicy.millisecondsPerSecond;
    }
    const failedSnapshot = { ...this.snapshot, status: SharedPlaybackStatus.Failed, failure: code };
    this.lifetime = null;
    lifetime.cancellation.abort(); lifetime.cancelPoll?.(); lifetime.stopFollower?.(); lifetime.stopSession?.();
    const retiring = lifetime.follower.detach();
    const cleanup = Promise.all([this.cleanupPending, retiring]).then(() => undefined);
    this.cleanupPending = cleanup.catch(() => undefined);
    this.publish(failedSnapshot);
    try { await cleanup; } catch {}
  }

  private async rejectStart(failure: IntegrationFailureCode, intent: object): Promise<void> {
    try { await this.retire(); } catch {}
    if (!this.disposed && this.intent === intent && !this.lifetime) this.publish({ ...EmptySnapshot, status: SharedPlaybackStatus.Failed, failure });
  }

  private current(lifetime: PlaybackFollowLifetime): boolean {
    return !this.disposed && this.intent === lifetime.intent && this.lifetime === lifetime && !lifetime.cancellation.signal.aborted;
  }
  private publish(snapshot: SharedPlaybackSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) { try { listener(); } catch {} }
  }
}

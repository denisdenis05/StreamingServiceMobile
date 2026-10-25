import { HostedPlaybackCommandKind, IntegrationFailure, IntegrationFailureCode, JamConnectionStatus } from 'streaming-service-spotify-jam';
import type { HostedPlaybackCommand, SpotifyJamRuntime } from 'streaming-service-spotify-jam';

export interface SpotifyPlaybackCommandSnapshot {
  readonly available: boolean;
  readonly pending: boolean;
  readonly uncertain: boolean;
  readonly failure: IntegrationFailureCode | null;
}

export interface SpotifyPlaybackCommandDependencies {
  readonly getRuntime: () => SpotifyJamRuntime | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
  readonly nextIdentifier: () => string;
}

interface PlaybackCommandLifetime {
  readonly runtime: SpotifyJamRuntime;
  readonly cancellation: AbortController;
  readonly targetIdentifier: string;
}

const EmptySnapshot: SpotifyPlaybackCommandSnapshot = Object.freeze({ available: false, pending: false, uncertain: false, failure: null });
const SeekPolicy = Object.freeze({ secondsPattern: /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/, millisecondsPerSecond: 1000 });

export class SpotifyPlaybackCommandStore {
  private runtime: SpotifyJamRuntime | null = null;
  private lifetime: PlaybackCommandLifetime | null = null;
  private uncertainRuntime: SpotifyJamRuntime | null = null;
  private snapshot = EmptySnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly stopConnection: () => void;
  private stopSession: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly dependencies: SpotifyPlaybackCommandDependencies) {
    this.stopConnection = dependencies.subscribeConnection(() => this.bind());
    this.bind();
  }

  getSnapshot = (): SpotifyPlaybackCommandSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  execute(kind: Exclude<HostedPlaybackCommandKind, HostedPlaybackCommandKind.Seek>): Promise<void> {
    return this.dispatch(async () => ({ kind }));
  }

  seek(seconds: string): Promise<void> {
    if (this.disposed || this.lifetime) return Promise.resolve();
    const positionMilliseconds = Math.round(Number(seconds) * SeekPolicy.millisecondsPerSecond);
    if (!SeekPolicy.secondsPattern.test(seconds) || !Number.isSafeInteger(positionMilliseconds)) {
      this.publish({ ...this.snapshot, failure: IntegrationFailureCode.InvalidInput }); return Promise.resolve();
    }
    return this.dispatch(async lifetime => {
      const sample = await lifetime.runtime.readHostedPlayback(lifetime.cancellation.signal);
      return { kind: HostedPlaybackCommandKind.Seek, positionMilliseconds,
        expectedSpotifyTrackIdentifier: sample.spotifyTrackIdentifier };
    });
  }

  dispose(): void {
    this.disposed = true; this.stopConnection(); this.stopSession?.(); this.lifetime?.cancellation.abort();
    this.lifetime = null; this.runtime = null; this.listeners.clear();
  }

  private bind(): void {
    if (this.disposed) return;
    const runtime = this.dependencies.getRuntime();
    if (runtime !== this.runtime) {
      this.stopSession?.(); this.lifetime?.cancellation.abort(); this.lifetime = null;
      this.runtime = runtime; this.uncertainRuntime = null;
      this.snapshot = EmptySnapshot;
      this.stopSession = runtime?.sessions.subscribe(() => this.refresh()) ?? null;
    }
    this.refresh();
  }

  private refresh(): void {
    if (this.disposed) return;
    if (this.lifetime && this.lifetime.targetIdentifier !== this.targetIdentifier()) {
      this.lifetime.cancellation.abort(); this.lifetime = null; this.snapshot = EmptySnapshot;
    }
    const membership = this.runtime?.sessions.getSnapshot();
    const session = membership?.session;
    const available = Boolean(this.runtime?.sessions.capabilities.playbackControl && session?.ownedByCurrentAccount
      && session.active && session.hostDeviceIdentifier
      && (membership?.status === JamConnectionStatus.Ready || membership?.status === JamConnectionStatus.Operating));
    this.publish({ ...this.snapshot, available, pending: this.lifetime !== null,
      uncertain: this.uncertainRuntime !== null && this.uncertainRuntime === this.runtime });
  }

  private async dispatch(prepare: (lifetime: PlaybackCommandLifetime) => Promise<HostedPlaybackCommand>): Promise<void> {
    if (this.disposed || this.lifetime) return;
    if (!this.runtime || !this.snapshot.available || this.snapshot.uncertain) {
      this.publish({ ...this.snapshot, failure: this.snapshot.uncertain ? IntegrationFailureCode.UnknownOutcome : IntegrationFailureCode.Unsupported });
      return;
    }
    const lifetime: PlaybackCommandLifetime = { runtime: this.runtime, cancellation: new AbortController(), targetIdentifier: this.targetIdentifier() };
    this.lifetime = lifetime; this.publish({ ...this.snapshot, pending: true, failure: null });
    try {
      const command = await prepare(lifetime);
      if (!this.current(lifetime)) return;
      const receipt = await lifetime.runtime.sessions.executeHostedPlayback(command, this.dependencies.nextIdentifier());
      if (!this.current(lifetime)) return;
      if (receipt.failure === IntegrationFailureCode.UnknownOutcome) this.uncertainRuntime = lifetime.runtime;
      this.publish({ ...this.snapshot, failure: receipt.failure });
    } catch (failure) {
      if (this.current(lifetime)) this.publish({ ...this.snapshot,
        failure: failure instanceof IntegrationFailure ? failure.code : IntegrationFailureCode.Network });
    } finally {
      if (this.current(lifetime)) { this.lifetime = null; this.refresh(); }
    }
  }

  private current(lifetime: PlaybackCommandLifetime): boolean {
    return !this.disposed && this.lifetime === lifetime && this.dependencies.getRuntime() === lifetime.runtime
      && lifetime.targetIdentifier === this.targetIdentifier()
      && !lifetime.cancellation.signal.aborted;
  }
  private targetIdentifier(): string {
    const snapshot = this.runtime?.sessions.getSnapshot();
    return JSON.stringify([snapshot?.accountIdentifier, snapshot?.session?.identifier, snapshot?.session?.hostDeviceIdentifier,
      snapshot?.session?.active, snapshot?.session?.ownedByCurrentAccount]);
  }
  private publish(snapshot: SpotifyPlaybackCommandSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try { listener(); } catch {}
    }
  }
}

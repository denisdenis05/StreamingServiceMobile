import { IntegrationFailure, IntegrationFailureCode, SharedPlaybackStatus } from 'streaming-service-spotify-jam';
import type { SharedPlaybackSnapshot } from 'streaming-service-spotify-jam';
import { EmptySpotifyPlaybackSnapshot } from './SpotifyJamPlaybackProtocol';

export interface SpotifyPlaybackControl {
  getSnapshot(): SharedPlaybackSnapshot;
  subscribe(listener: () => void): () => void;
  start(market: string): Promise<void>;
  stop(): Promise<void>;
}

interface NativePlaybackControl extends SpotifyPlaybackControl {
  setActive(active: boolean): void;
  dispose(): void;
}

interface ForegroundPlaybackControl extends SpotifyPlaybackControl {
  dispose(): Promise<void>;
}

export interface SpotifyPlaybackControllerDependencies {
  readonly native: NativePlaybackControl;
  readonly foreground: ForegroundPlaybackControl;
  readonly useNative: () => boolean;
  readonly stopHosting?: () => Promise<void>;
}

export class SpotifyPlaybackController {
  private selected: SpotifyPlaybackControl | null = null;
  private snapshot = EmptySpotifyPlaybackSnapshot;
  private intent: object = Object.freeze({});
  private disposed = false;
  private active = true;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: readonly (() => void)[];

  constructor(private readonly dependencies: SpotifyPlaybackControllerDependencies) {
    this.subscriptions = [dependencies.native.subscribe(() => this.changed(dependencies.native)),
      dependencies.foreground.subscribe(() => this.changed(dependencies.foreground))];
    this.changed(dependencies.native);
  }

  readonly getSnapshot = (): SharedPlaybackSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };

  async start(market: string): Promise<void> {
    if (this.disposed) return;
    const intent = Object.freeze({}); this.intent = intent;
    const selected = this.dependencies.useNative() ? this.dependencies.native : this.dependencies.foreground;
    this.selected = null;
    const stopped = this.stopBoth();
    this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Waiting });
    try {
      await stopped;
      await this.dependencies.stopHosting?.();
      if (!this.current(intent)) return;
      if (!this.active) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      this.selected = selected;
      await selected.start(market);
      if (this.current(intent)) this.changed(selected);
    } catch (failure) {
      if (!this.current(intent)) return;
      this.selected = null;
      this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed,
        failure: failure instanceof IntegrationFailure ? failure.code : IntegrationFailureCode.Network });
    }
  }

  async stop(): Promise<void> {
    this.intent = Object.freeze({}); this.selected = null;
    const intent = this.intent;
    const stopped = this.stopBoth();
    this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Stopping });
    try {
      await stopped;
      if (this.current(intent)) this.publish(EmptySpotifyPlaybackSnapshot);
    } catch (failure) {
      if (this.current(intent)) this.publish({ ...EmptySpotifyPlaybackSnapshot, status: SharedPlaybackStatus.Failed,
        failure: failure instanceof IntegrationFailure ? failure.code : IntegrationFailureCode.Network });
      throw failure;
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    this.dependencies.native.setActive(active);
    if (!active) {
      if (this.selected === this.dependencies.foreground || this.selected === null && this.snapshot.status === SharedPlaybackStatus.Waiting) {
        this.intent = Object.freeze({}); this.selected = null; this.publish(EmptySpotifyPlaybackSnapshot);
      }
      void this.dependencies.foreground.stop().catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true; this.intent = Object.freeze({});
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
    this.dependencies.native.dispose();
    await this.dependencies.foreground.dispose();
  }

  private stopBoth(): Promise<void> {
    try { return Promise.all([this.dependencies.native.stop(), this.dependencies.foreground.stop()]).then(() => undefined); }
    catch (failure) { return Promise.reject(failure); }
  }
  private changed(source: SpotifyPlaybackControl): void {
    if (this.disposed) return;
    if (this.selected === null && source === this.dependencies.native && source.getSnapshot().status !== SharedPlaybackStatus.Detached
      && source.getSnapshot().status !== SharedPlaybackStatus.Stopping && this.snapshot.status === SharedPlaybackStatus.Detached) this.selected = source;
    if (this.selected === source) this.publish(source.getSnapshot());
  }
  private current(intent: object): boolean { return !this.disposed && this.intent === intent; }
  private publish(snapshot: SharedPlaybackSnapshot): void {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => { try { listener(); } catch {} });
  }
}

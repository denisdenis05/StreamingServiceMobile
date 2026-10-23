import { HostedQueueStatus } from 'streaming-service-spotify-jam';
import type { HostedQueueSnapshot } from 'streaming-service-spotify-jam';

interface HostedQueueConnection {
  getSnapshot(): HostedQueueSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  setObserving(observing: boolean): void;
}

interface HostedQueueStoreDependencies {
  readonly getObserver: () => HostedQueueConnection | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
}

const EmptySnapshot: HostedQueueSnapshot = Object.freeze({ enabled: false, status: HostedQueueStatus.Detached,
  sessionIdentifier: null, hostDeviceIdentifier: null, currentlyPlaying: null, entries: Object.freeze([]),
  observedAtMilliseconds: null, failure: null });

export class SpotifyHostedQueueStore {
  private snapshot = EmptySnapshot;
  private observer: HostedQueueConnection | null = null;
  private stopObserver: (() => void) | null = null;
  private readonly stopConnection: () => void;
  private readonly listeners = new Set<() => void>();
  private readonly views = new Set<object>();
  private disposed = false;

  constructor(private readonly dependencies: HostedQueueStoreDependencies) {
    this.stopConnection = dependencies.subscribeConnection(() => this.synchronize());
    this.synchronize();
  }

  getSnapshot = (): HostedQueueSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  observe(): () => void {
    if (this.disposed) return () => undefined;
    const view = Object.freeze({});
    this.views.add(view);
    this.synchronize();
    this.observer?.setObserving(true);
    return () => {
      if (!this.views.delete(view) || this.disposed) return;
      if (this.views.size === EmptyViewCount) this.observer?.setObserving(false);
    };
  }

  async refresh(): Promise<void> {
    this.synchronize();
    if (!this.disposed) await this.observer?.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopConnection();
    this.stopObserver?.();
    this.observer?.setObserving(false);
    this.observer = null;
    this.views.clear();
    this.publish(EmptySnapshot);
    this.listeners.clear();
  }

  private synchronize(): void {
    if (this.disposed) return;
    const observer = this.dependencies.getObserver();
    if (observer === this.observer) return;
    this.stopObserver?.();
    this.observer?.setObserving(false);
    this.observer = observer;
    this.stopObserver = observer?.subscribe(() => {
      if (this.observer === observer) this.publish(observer.getSnapshot());
    }) ?? null;
    this.publish(observer?.getSnapshot() ?? EmptySnapshot);
    if (!this.disposed && this.observer === observer) observer?.setObserving(this.views.size > EmptyViewCount);
  }

  private publish(snapshot: HostedQueueSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) { if (this.listeners.has(listener)) { try { listener(); } catch {} } }
  }
}

const EmptyViewCount = 0;

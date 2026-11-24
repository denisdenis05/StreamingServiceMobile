export interface SpotifyConnectionObservation<Snapshot> {
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  setObserving(observing: boolean): void;
}

export interface SpotifyObservationStoreDependencies<Snapshot> {
  readonly getObserver: () => SpotifyConnectionObservation<Snapshot> | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
  readonly initialSnapshot: Snapshot;
}

export class SpotifyObservationStore<Snapshot> {
  private snapshot: Snapshot;
  private observer: SpotifyConnectionObservation<Snapshot> | null = null;
  private stopObserver: (() => void) | null = null;
  private readonly stopConnection: () => void;
  private readonly listeners = new Set<() => void>();
  private readonly views = new Set<object>();
  private disposed = false;

  constructor(private readonly dependencies: SpotifyObservationStoreDependencies<Snapshot>) {
    this.snapshot = dependencies.initialSnapshot;
    this.stopConnection = dependencies.subscribeConnection(() => this.synchronize());
    this.synchronize();
  }

  getSnapshot = (): Snapshot => this.snapshot;
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
      if (this.views.size === EmptyObservationCount) this.observer?.setObserving(false);
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
    this.publish(this.dependencies.initialSnapshot);
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
    this.publish(observer?.getSnapshot() ?? this.dependencies.initialSnapshot);
    if (!this.disposed && this.observer === observer) observer?.setObserving(this.views.size > EmptyObservationCount);
  }

  private publish(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) { if (this.listeners.has(listener)) { try { listener(); } catch {} } }
  }
}

const EmptyObservationCount = 0;

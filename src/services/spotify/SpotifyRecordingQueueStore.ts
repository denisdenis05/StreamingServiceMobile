import { IntegrationFailureCode, RecordingQueueStatus } from 'streaming-service-spotify-jam';
import type { RecordingQueueWorkflow, RecordingQueueSnapshot } from 'streaming-service-spotify-jam';

interface RecordingQueueStoreDependencies {
  readonly getCoordinator: () => RecordingQueueWorkflow | null;
  readonly subscribeConnection: (listener: () => void) => () => void;
  readonly nextIdentifier: () => string;
}

const EmptySnapshot: RecordingQueueSnapshot = Object.freeze({ status: RecordingQueueStatus.Idle,
  recordingIdentifier: null, market: null, match: null, acceptedSpotifyIdentifier: null, failure: null });

export class SpotifyRecordingQueueStore {
  private snapshot = EmptySnapshot;
  private coordinator: RecordingQueueWorkflow | null = null;
  private stopCoordinator: (() => void) | null = null;
  private readonly stopConnection: () => void;
  private readonly listeners = new Set<() => void>();
  private cancellation = new AbortController();
  private disposed = false;

  constructor(private readonly dependencies: RecordingQueueStoreDependencies) {
    this.stopConnection = dependencies.subscribeConnection(() => this.synchronize());
    this.synchronize();
  }

  getSnapshot = (): RecordingQueueSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async prepare(recordingIdentifier: string, market: string): Promise<void> {
    this.synchronize();
    if (this.disposed) return;
    if (!this.coordinator) return this.publish({ ...EmptySnapshot, status: RecordingQueueStatus.Failed, failure: IntegrationFailureCode.Unauthorized });
    await this.coordinator.prepare(recordingIdentifier, market, this.cancellation.signal);
  }

  async enqueue(spotifyIdentifier: string): Promise<boolean> {
    this.synchronize();
    if (this.disposed || !this.coordinator) return false;
    return this.coordinator.enqueue(spotifyIdentifier, this.dependencies.nextIdentifier(), this.cancellation.signal);
  }

  clear(): void { this.coordinator?.clear(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopConnection();
    this.stopCoordinator?.();
    this.stopCoordinator = null;
    this.cancellation.abort();
    this.coordinator = null;
    this.publish(EmptySnapshot);
    this.listeners.clear();
  }

  private synchronize(): void {
    if (this.disposed) return;
    const coordinator = this.dependencies.getCoordinator();
    if (coordinator === this.coordinator) return;
    this.cancellation.abort();
    this.cancellation = new AbortController();
    this.stopCoordinator?.();
    this.coordinator = coordinator;
    this.stopCoordinator = coordinator?.subscribe(() => {
      if (this.coordinator === coordinator) this.publish(coordinator.getSnapshot());
    }) ?? null;
    this.publish(coordinator?.getSnapshot() ?? EmptySnapshot);
  }

  private publish(snapshot: RecordingQueueSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) { if (this.listeners.has(listener)) { try { listener(); } catch {} } }
  }
}

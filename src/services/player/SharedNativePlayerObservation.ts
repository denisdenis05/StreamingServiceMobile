import type { PlayerEvent, PlayerObservation, PlayerSnapshot } from 'streaming-service-player';

const NoNativeObservers = 0;

export class SharedNativePlayerObservation {
  private readonly listeners = new Set<(event: PlayerEvent) => void>();
  private unsubscribeNative: (() => void) | null = null;

  constructor(
    private readonly source: Pick<PlayerObservation, 'subscribe'>,
    private readonly readSnapshot: () => Promise<PlayerSnapshot>,
    private readonly reportFailure: (failure: unknown) => void,
  ) {}

  getSnapshot(): Promise<PlayerSnapshot> { return this.readSnapshot(); }

  subscribe(listener: (event: PlayerEvent) => void): () => void {
    const subscription = (event: PlayerEvent) => listener(event);
    this.listeners.add(subscription);
    if (this.unsubscribeNative === null) {
      try {
        this.unsubscribeNative = this.source.subscribe(event => {
          for (const observer of [...this.listeners]) {
            if (!this.listeners.has(observer)) continue;
            try { observer(event); }
            catch (failure) { this.reportFailure(failure); }
          }
        });
      } catch (failure) {
        this.listeners.delete(subscription);
        throw failure;
      }
    }
    return () => {
      this.listeners.delete(subscription);
      if (this.listeners.size !== NoNativeObservers) return;
      const unsubscribe = this.unsubscribeNative;
      this.unsubscribeNative = null;
      unsubscribe?.();
    };
  }
}

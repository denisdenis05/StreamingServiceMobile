export const StorageSettingsPolicy = Object.freeze({
  minimumBytes: 0,
  failureMessage: 'Storage information could not be loaded. Try again.',
  clearFailureMessage: 'The artwork cache could not be cleared. Try again.',
  unavailableMessage: 'Sign in to manage storage.',
});
export interface StorageSettingsReading {
  readonly imageCacheBytes: number;
  readonly audioCacheBytes: number;
  readonly availableBytes: number;
}
export interface StorageSettingsSnapshot {
  readonly loading: boolean;
  readonly clearing: boolean;
  readonly imageCacheBytes: number | null;
  readonly audioCacheBytes: number | null;
  readonly availableBytes: number | null;
  readonly error: string | null;
}
export interface StorageSettingsDependencies {
  readonly accountIdentifier: () => string | null;
  readonly subscribeAccount: (listener: () => void) => () => void;
  readonly read: (accountIdentifier: string) => Promise<StorageSettingsReading>;
  readonly clearImages: () => Promise<void>;
}
const EmptyStorage: StorageSettingsSnapshot = Object.freeze({
  loading: false,
  clearing: false,
  imageCacheBytes: null,
  audioCacheBytes: null,
  availableBytes: null,
  error: null,
});
export class StorageSettingsService {
  private snapshot = EmptyStorage;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private accountIdentifier: string | null;
  private lifetime = {};
  private observation = {};
  private disposed = false;
  constructor(private readonly dependencies: StorageSettingsDependencies) {
    this.accountIdentifier = dependencies.accountIdentifier();
    this.unsubscribe = dependencies.subscribeAccount(() => {
      const accountIdentifier = dependencies.accountIdentifier();
      if (this.disposed || accountIdentifier === this.accountIdentifier) return;
      this.accountIdentifier = accountIdentifier;
      this.lifetime = {};
      this.observation = {};
      this.publish(EmptyStorage);
    });
  }
  readonly getSnapshot = (): StorageSettingsSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async refresh(): Promise<void> {
    if (this.disposed || this.snapshot.clearing) return;
    await this.read(false);
  }
  async clearImageCache(): Promise<void> {
    if (this.disposed || this.snapshot.clearing) return;
    await this.read(true);
  }
  dispose(): void {
    this.disposed = true;
    this.lifetime = {};
    this.unsubscribe();
    this.listeners.clear();
  }
  private async read(clearImages: boolean): Promise<void> {
    const accountIdentifier = this.dependencies.accountIdentifier();
    const lifetime = this.lifetime;
    const observation = {};
    this.observation = observation;
    if (accountIdentifier === null) {
      this.publish({
        ...EmptyStorage,
        error: StorageSettingsPolicy.unavailableMessage,
      });
      return;
    }
    this.publish({
      ...this.snapshot,
      loading: !clearImages,
      clearing: clearImages,
      error: null,
    });
    try {
      if (clearImages) await this.dependencies.clearImages();
      if (!this.current(accountIdentifier, lifetime, observation)) return;
      const reading = await this.dependencies.read(accountIdentifier);
      if (!this.current(accountIdentifier, lifetime, observation)) return;
      if (
        !Object.values(reading).every(
          value =>
            Number.isSafeInteger(value) &&
            value >= StorageSettingsPolicy.minimumBytes,
        )
      ) {
        throw new Error(StorageSettingsPolicy.failureMessage);
      }
      this.publish({
        ...reading,
        loading: false,
        clearing: false,
        error: null,
      });
    } catch {
      if (this.current(accountIdentifier, lifetime, observation)) {
        this.publish({
          ...this.snapshot,
          loading: false,
          clearing: false,
          error: clearImages
            ? StorageSettingsPolicy.clearFailureMessage
            : StorageSettingsPolicy.failureMessage,
        });
      }
    }
  }
  private current(
    accountIdentifier: string,
    lifetime: object,
    observation: object,
  ): boolean {
    return (
      !this.disposed &&
      this.lifetime === lifetime &&
      this.observation === observation &&
      this.dependencies.accountIdentifier() === accountIdentifier
    );
  }
  private publish(snapshot: StorageSettingsSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {}
    });
  }
}

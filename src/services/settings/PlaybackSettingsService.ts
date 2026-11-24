import { RepeatMode } from 'streaming-service-player';
export const PlaybackSettingsPolicy = Object.freeze({
  unavailableMessage:
    'The audio player is not ready. Try again after opening your library.',
  controlledMessage:
    'Stop Spotify sharing or following before changing local playback preferences.',
  changedMessage: 'The playback account changed. Open these settings again.',
  failureMessage: 'The playback setting could not be changed.',
  invalidModeMessage: 'Choose a supported repeat mode.',
});
export interface PlaybackSettingsReading {
  readonly ready: boolean;
  readonly shuffled: boolean;
  readonly repeatMode: RepeatMode;
  readonly externallyControlled: boolean;
}
export interface PlaybackSettingsSnapshot extends PlaybackSettingsReading {
  readonly busy: boolean;
  readonly error: string | null;
}
export interface PlaybackSettingsDependencies {
  readonly accountIdentifier: () => string | null;
  readonly read: () => PlaybackSettingsReading;
  readonly subscribe: (listener: () => void) => () => void;
  readonly whenReady: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly setShuffle: (enabled: boolean) => Promise<void>;
  readonly setRepeat: (mode: RepeatMode) => Promise<void>;
}
export class PlaybackSettingsService {
  private snapshot: PlaybackSettingsSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private accountIdentifier: string | null;
  private lifetime = {};
  private disposed = false;
  constructor(private readonly dependencies: PlaybackSettingsDependencies) {
    this.accountIdentifier = dependencies.accountIdentifier();
    this.snapshot = Object.freeze({
      ...dependencies.read(),
      busy: false,
      error: null,
    });
    this.unsubscribe = dependencies.subscribe(() => this.changed());
  }
  readonly getSnapshot = (): PlaybackSettingsSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async refresh(): Promise<void> {
    await this.execute(async () => this.dependencies.refresh(), false);
  }
  async setShuffle(enabled: boolean): Promise<void> {
    await this.execute(() => this.dependencies.setShuffle(enabled), true);
  }
  async setRepeat(mode: RepeatMode): Promise<void> {
    if (!Object.values(RepeatMode).includes(mode)) {
      this.publish({
        ...this.snapshot,
        error: PlaybackSettingsPolicy.invalidModeMessage,
      });
      return;
    }
    await this.execute(() => this.dependencies.setRepeat(mode), true);
  }
  dispose(): void {
    this.disposed = true;
    this.lifetime = {};
    this.unsubscribe();
    this.listeners.clear();
  }
  private async execute(
    operation: () => Promise<void>,
    mutation: boolean,
  ): Promise<void> {
    if (this.disposed || this.snapshot.busy) return;
    const accountIdentifier = this.dependencies.accountIdentifier();
    const lifetime = this.lifetime;
    this.publish({ ...this.snapshot, busy: true, error: null });
    try {
      if (accountIdentifier === null)
        throw new Error(PlaybackSettingsPolicy.unavailableMessage);
      await this.dependencies.whenReady();
      if (!this.current(accountIdentifier, lifetime)) return;
      const reading = this.dependencies.read();
      if (!reading.ready)
        throw new Error(PlaybackSettingsPolicy.unavailableMessage);
      if (mutation && reading.externallyControlled) {
        this.publish({
          ...reading,
          busy: false,
          error: PlaybackSettingsPolicy.controlledMessage,
        });
        return;
      }
      await operation();
      if (!this.current(accountIdentifier, lifetime)) return;
      this.publish({ ...this.dependencies.read(), busy: false, error: null });
    } catch {
      if (this.current(accountIdentifier, lifetime)) {
        this.publish({
          ...this.dependencies.read(),
          busy: false,
          error: PlaybackSettingsPolicy.failureMessage,
        });
      }
    }
  }
  private current(accountIdentifier: string | null, lifetime: object): boolean {
    return (
      !this.disposed &&
      this.lifetime === lifetime &&
      this.dependencies.accountIdentifier() === accountIdentifier
    );
  }
  private changed(): void {
    if (this.disposed) return;
    const accountIdentifier = this.dependencies.accountIdentifier();
    if (accountIdentifier !== this.accountIdentifier) {
      this.accountIdentifier = accountIdentifier;
      this.lifetime = {};
      this.publish({ ...this.dependencies.read(), busy: false, error: null });
      return;
    }
    this.publish({
      ...this.dependencies.read(),
      busy: this.snapshot.busy,
      error: this.snapshot.error,
    });
  }
  private publish(snapshot: PlaybackSettingsSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {}
    });
  }
}

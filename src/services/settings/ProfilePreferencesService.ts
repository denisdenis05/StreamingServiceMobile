export const ProfilePreferencesPolicy = Object.freeze({
  emptyName: '',
  maximumNameCharacters: 64,
  minimumNameCharacters: 1,
  invalidNameMessage:
    'Use a name between 1 and 64 characters without line breaks.',
  loadFailureMessage: 'Your saved profile name could not be loaded.',
  saveFailureMessage: 'Your profile name could not be saved.',
  accountRequiredMessage: 'Sign in to update your profile.',
  controlCharacters: /[\u0000-\u001f\u007f]/,
});
export interface ProfilePreferencesSnapshot {
  readonly accountIdentifier: string | null;
  readonly displayName: string;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}
export interface ProfilePreferencesDependencies {
  readonly accountIdentifier: () => string | null;
  readonly subscribeAccount: (listener: () => void) => () => void;
  readonly readName: (accountIdentifier: string) => Promise<string | null>;
  readonly writeName: (
    accountIdentifier: string,
    displayName: string,
  ) => Promise<void>;
}
export class ProfilePreferencesService {
  private snapshot: ProfilePreferencesSnapshot = Object.freeze({
    accountIdentifier: null,
    displayName: ProfilePreferencesPolicy.emptyName,
    loading: false,
    saving: false,
    error: null,
  });
  private readonly listeners = new Set<() => void>();
  private lifetime = {};
  private observation = {};
  private persistence: Promise<void> = Promise.resolve();
  private readonly unsubscribeAccount: () => void;
  private disposed = false;
  constructor(private readonly dependencies: ProfilePreferencesDependencies) {
    this.unsubscribeAccount = dependencies.subscribeAccount(() =>
      this.accountChanged(),
    );
    this.accountChanged();
  }
  readonly getSnapshot = (): ProfilePreferencesSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async restore(): Promise<void> {
    const accountIdentifier = this.dependencies.accountIdentifier();
    if (this.disposed || accountIdentifier === null || this.snapshot.saving)
      return;
    const lifetime = this.lifetime;
    const observation = {};
    this.observation = observation;
    this.publish({ ...this.snapshot, loading: true, error: null });
    try {
      const storedName = await this.dependencies.readName(accountIdentifier);
      if (
        !this.current(accountIdentifier, lifetime) ||
        this.observation !== observation
      )
        return;
      const displayName =
        storedName !== null && this.validName(storedName)
          ? storedName.trim()
          : ProfilePreferencesPolicy.emptyName;
      this.publish({ ...this.snapshot, displayName, loading: false });
    } catch {
      if (
        this.current(accountIdentifier, lifetime) &&
        this.observation === observation
      ) {
        this.publish({
          ...this.snapshot,
          loading: false,
          error: ProfilePreferencesPolicy.loadFailureMessage,
        });
      }
    }
  }
  async saveDisplayName(value: string): Promise<void> {
    if (this.disposed) return;
    const accountIdentifier = this.dependencies.accountIdentifier();
    if (accountIdentifier === null) {
      this.publish({
        ...this.snapshot,
        error: ProfilePreferencesPolicy.accountRequiredMessage,
      });
      return;
    }
    if (!this.validName(value)) {
      this.publish({
        ...this.snapshot,
        error: ProfilePreferencesPolicy.invalidNameMessage,
      });
      return;
    }
    const displayName = value.trim();
    const lifetime = this.lifetime;
    const observation = {};
    this.observation = observation;
    this.publish({
      ...this.snapshot,
      loading: false,
      saving: true,
      error: null,
    });
    const operation = this.persistence
      .catch(() => undefined)
      .then(async () => {
        if (
          !this.current(accountIdentifier, lifetime) ||
          this.observation !== observation
        )
          return;
        await this.dependencies.writeName(accountIdentifier, displayName);
      });
    this.persistence = operation;
    try {
      await operation;
      if (
        this.current(accountIdentifier, lifetime) &&
        this.observation === observation
      ) {
        this.publish({ ...this.snapshot, displayName, saving: false });
      }
    } catch {
      if (
        this.current(accountIdentifier, lifetime) &&
        this.observation === observation
      ) {
        this.publish({
          ...this.snapshot,
          saving: false,
          error: ProfilePreferencesPolicy.saveFailureMessage,
        });
      }
    }
  }
  dispose(): void {
    this.disposed = true;
    this.lifetime = {};
    this.unsubscribeAccount();
    this.listeners.clear();
  }
  private accountChanged(): void {
    if (
      this.disposed ||
      this.snapshot.accountIdentifier === this.dependencies.accountIdentifier()
    )
      return;
    this.lifetime = {};
    this.observation = {};
    this.publish({
      accountIdentifier: this.dependencies.accountIdentifier(),
      displayName: ProfilePreferencesPolicy.emptyName,
      loading: false,
      saving: false,
      error: null,
    });
    void this.restore();
  }
  private validName(value: string): boolean {
    return (
      value.trim().length >= ProfilePreferencesPolicy.minimumNameCharacters &&
      value.trim().length <= ProfilePreferencesPolicy.maximumNameCharacters &&
      !ProfilePreferencesPolicy.controlCharacters.test(value)
    );
  }
  private current(accountIdentifier: string, lifetime: object): boolean {
    return (
      !this.disposed &&
      this.lifetime === lifetime &&
      this.dependencies.accountIdentifier() === accountIdentifier
    );
  }
  private publish(snapshot: ProfilePreferencesSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {}
    });
  }
}

import { PlaybackAccountIdentity } from './PlaybackAccountIdentity';

export interface ApplicationAuthenticationState {
  readonly restored: boolean;
  readonly isLoggedIn: boolean;
  readonly token: string | null;
  readonly accountIdentifier: string | null;
}

export interface AuthenticationPersistence {
  read(): Promise<{ readonly token: string | null; readonly isLoggedIn: boolean }>;
  write(state: ApplicationAuthenticationState): Promise<void>;
}

export class ApplicationAuthenticationSession {
  private state: ApplicationAuthenticationState = Object.freeze({ restored: false, isLoggedIn: false, token: null, accountIdentifier: null });
  private readonly listeners = new Set<() => void>();
  private readonly identity = new PlaybackAccountIdentity();
  private generation = {};
  private restoration: Promise<void> | null = null;
  private persistenceOperation: Promise<unknown> = Promise.resolve();
  private refreshOperation: { readonly generation: object; readonly promise: Promise<string | null> } | null = null;

  constructor(private readonly persistence: AuthenticationPersistence,
    private readonly requestTokenRefresh: (token: string) => Promise<string | null>,
    private readonly reportFailure: (failure: unknown) => void) {}

  getSnapshot = (): ApplicationAuthenticationState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  restore(): Promise<void> {
    if (this.state.restored) return Promise.resolve();
    if (this.restoration !== null) return this.restoration;
    const generation = this.generation;
    this.restoration = this.persistence.read().then(stored => {
      if (generation !== this.generation) return;
      if (stored.isLoggedIn && stored.token !== null) {
        this.publish({ restored: true, isLoggedIn: true, token: stored.token, accountIdentifier: this.identity.identify(stored.token) });
      } else this.publish({ restored: true, isLoggedIn: false, token: null, accountIdentifier: null });
    }).catch(failure => {
      this.reportFailure(failure);
      if (generation === this.generation) this.publish({ restored: true, isLoggedIn: false, token: null, accountIdentifier: null });
    });
    return this.restoration;
  }

  login = async (token: string): Promise<void> => {
    const accountIdentifier = this.identity.identify(token);
    this.generation = {};
    this.publish({ restored: true, isLoggedIn: true, token, accountIdentifier });
    await this.persist(this.state);
  };

  logout = async (): Promise<void> => {
    this.generation = {};
    this.publish({ restored: true, isLoggedIn: false, token: null, accountIdentifier: null });
    await this.persist(this.state);
  };

  getToken = async (): Promise<string | null> => { await this.restore(); return this.state.token; };
  getIsLoggedIn = async (): Promise<boolean> => { await this.restore(); return this.state.isLoggedIn; };

  refresh = (): Promise<string | null> => {
    const captured = this.state;
    const generation = this.generation;
    if (!captured.isLoggedIn || captured.token === null) return Promise.resolve(null);
    if (this.refreshOperation?.generation === generation) return this.refreshOperation.promise;
    const operation = this.requestTokenRefresh(captured.token).then(async token => {
      if (generation !== this.generation) return null;
      if (token === null || this.identity.identify(token) !== captured.accountIdentifier) throw new Error(AuthenticationSessionPolicy.accountMismatchMessage);
      await this.login(token);
      return token;
    }).catch(async failure => {
      if (generation === this.generation) await this.logout();
      throw failure;
    });
    this.refreshOperation = { generation, promise: operation };
    void operation.finally(() => {
      if (this.refreshOperation?.promise === operation) this.refreshOperation = null;
    }).catch(() => undefined);
    return operation;
  };

  private async persist(state: ApplicationAuthenticationState): Promise<void> {
    const operation = this.persistenceOperation.then(() => this.persistence.write(state));
    this.persistenceOperation = operation.catch(this.reportFailure);
    await this.persistenceOperation;
  }

  private publish(state: ApplicationAuthenticationState): void {
    this.state = Object.freeze(state);
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) listener();
    }
  }
}

export const AuthenticationSessionPolicy = Object.freeze({ accountMismatchMessage: 'The refreshed token belongs to another account.' });

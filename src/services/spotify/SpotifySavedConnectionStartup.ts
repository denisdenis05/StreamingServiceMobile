import { SpotifyMobileOperation } from './SpotifyMobileController';
import type { IntegrationFailureCode } from 'streaming-service-spotify-jam';
export interface SpotifySavedConnectionStartupDependencies {
  readonly account: {
    getSnapshot(): { readonly restored: boolean; readonly isLoggedIn: boolean; readonly accountIdentifier: string | null };
    subscribe(listener: () => void): () => void;
  };
  readonly controller: {
    getSnapshot(): { readonly connected: boolean; readonly operation: SpotifyMobileOperation; readonly failure?: IntegrationFailureCode | null };
    subscribe(listener: () => void): () => void;
    restore(): Promise<void>;
  };
  readonly authorizationReady?: {
    getSnapshot(): boolean;
    subscribe(listener: () => void): () => void;
  };
}
export class SpotifySavedConnectionStartup {
  private started = false;
  private disposed = false;
  private readonly attemptedAccounts = new Set<string>();
  private readonly cleanup: (() => void)[] = [];
  private restoringAccountIdentifier: string | null = null;
  private observedAccountIdentifier: string | null = null;
  private transitioningAccountIdentifier: string | null = null;
  constructor(private readonly dependencies: SpotifySavedConnectionStartupDependencies) {}
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.cleanup.push(this.dependencies.account.subscribe(() => this.process()));
    this.cleanup.push(this.dependencies.controller.subscribe(() => this.process()));
    if (this.dependencies.authorizationReady)
      this.cleanup.push(this.dependencies.authorizationReady.subscribe(() => this.process()));
    this.process();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.cleanup) { try { unsubscribe(); } catch {} }
    this.cleanup.length = EmptyCleanupCount;
  }
  private process(): void {
    if (this.disposed) return;
    const account = this.dependencies.account.getSnapshot();
    const accountIdentifier = account.accountIdentifier;
    if (!account.restored || !account.isLoggedIn || accountIdentifier === null || this.attemptedAccounts.has(accountIdentifier)) return;
    if (this.observedAccountIdentifier !== accountIdentifier) {
      if (this.observedAccountIdentifier !== null) this.transitioningAccountIdentifier = accountIdentifier;
      this.observedAccountIdentifier = accountIdentifier;
    }
    const snapshot = this.dependencies.controller.getSnapshot();
    if (this.transitioningAccountIdentifier === accountIdentifier) {
      if (snapshot.operation !== SpotifyMobileOperation.Idle) return;
      this.transitioningAccountIdentifier = null;
    }
    if (snapshot.operation === SpotifyMobileOperation.Idle && this.restoringAccountIdentifier !== accountIdentifier) this.restoringAccountIdentifier = null;
    if (snapshot.operation !== SpotifyMobileOperation.Idle && this.restoringAccountIdentifier !== null
      && this.restoringAccountIdentifier !== accountIdentifier) return;
    if (snapshot.connected || snapshot.operation !== SpotifyMobileOperation.Idle || snapshot.failure != null) {
      this.attemptedAccounts.add(accountIdentifier);
      return;
    }
    if (this.dependencies.authorizationReady && !this.dependencies.authorizationReady.getSnapshot()) return;
    this.attemptedAccounts.add(accountIdentifier);
    this.restoringAccountIdentifier = accountIdentifier;
    void this.restore(accountIdentifier);
  }
  private async restore(accountIdentifier: string): Promise<void> {
    try { await this.dependencies.controller.restore(); } catch {}
    finally {
      if (this.restoringAccountIdentifier === accountIdentifier
        && (this.dependencies.account.getSnapshot().accountIdentifier === accountIdentifier
          || this.dependencies.controller.getSnapshot().operation === SpotifyMobileOperation.Idle)) this.restoringAccountIdentifier = null;
      this.process();
    }
  }
}
const EmptyCleanupCount = 0;

import { QueueIntentSupersededError } from './QueueIntentScheduler';
import type { ApplicationAuthenticationState } from './ApplicationAuthenticationSession';
import type { PlaybackAuthenticationState } from './PlaybackAuthenticationCoordinator';
export const PlaybackApplicationPolicy = Object.freeze({ signedOutMessage: 'Sign in before using audio playback.',
  startupFailureMessage: 'Audio could not start. Tap Play to try again.' });
export interface PlaybackApplicationState { readonly initializing: boolean; readonly ready: boolean; readonly error: string | null }
interface AuthenticationSource {
  restore(): Promise<void>;
  getSnapshot(): ApplicationAuthenticationState;
  subscribe(listener: () => void): () => void;
}
interface PlaybackApplicationRuntime { updateAuthentication(state: PlaybackAuthenticationState): Promise<void>; dispose(): void }
export class PlaybackApplicationLifecycle {
  private state: PlaybackApplicationState = Object.freeze({ initializing: false, ready: false, error: null });
  private readonly listeners = new Set<() => void>();
  private stopAuthentication: (() => void) | null = null;
  private restoration: Promise<void> | null = null;
  private transition: Promise<void> = Promise.resolve();
  private desired: ApplicationAuthenticationState | null = null;
  private generation = {};
  private disposed = false;
  constructor(private readonly authentication: AuthenticationSource, private readonly runtime: PlaybackApplicationRuntime,
    private readonly reportStartupFailure: (failure: unknown) => void) {}
  getSnapshot = (): PlaybackApplicationState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new QueueIntentSupersededError());
    if (this.stopAuthentication === null) this.stopAuthentication = this.authentication.subscribe(() => {
      void this.synchronize().catch(() => undefined);
    });
    if (this.restoration === null) {
      this.publish({ initializing: true, ready: false, error: null });
      this.restoration = this.authentication.restore().then(() => this.synchronize()).catch(failure => {
        if (!this.authentication.getSnapshot().restored) {
          this.restoration = null;
          if (!this.disposed) this.failed(failure);
        }
        throw failure;
      });
      void this.restoration.catch(() => undefined);
      return this.restoration;
    }
    return this.authentication.getSnapshot().restored ? this.synchronize() : this.restoration;
  }
  async whenReady(): Promise<void> {
    let transition = this.start();
    while (true) {
      try { await transition; }
      catch (failure) {
        if (transition === this.transition || !this.authentication.getSnapshot().restored) throw failure;
      }
      if (this.disposed) throw new QueueIntentSupersededError();
      if (transition === this.transition) break;
      transition = this.transition;
    }
    if (!this.state.ready) throw new Error(this.state.error ?? PlaybackApplicationPolicy.signedOutMessage);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation = {}; this.stopAuthentication?.(); this.stopAuthentication = null;
    this.runtime.dispose(); this.listeners.clear();
  }
  private synchronize(): Promise<void> {
    const state = this.authentication.getSnapshot();
    if (this.disposed || !state.restored) return Promise.resolve();
    if (this.desired?.accountIdentifier === state.accountIdentifier && this.desired?.token === state.token
      && this.state.error === null) return this.transition;
    this.desired = state; const generation = {}; this.generation = generation;
    this.publish({ initializing: true, ready: false, error: null });
    const transition = this.runtime.updateAuthentication({ restored: true, accountIdentifier: state.accountIdentifier, accessToken: state.token }).then(() => {
      if (this.disposed || generation !== this.generation) return;
      this.publish({ initializing: false, ready: state.isLoggedIn && state.accountIdentifier !== null && state.token !== null, error: null });
    }).catch(failure => { if (!this.disposed && generation === this.generation) this.failed(failure); throw failure; });
    this.transition = transition; void transition.catch(() => undefined); return transition;
  }
  private failed(failure: unknown): void {
    this.publish({ initializing: false, ready: false, error: PlaybackApplicationPolicy.startupFailureMessage });
    this.reportStartupFailure(failure);
  }
  private publish(state: PlaybackApplicationState): void {
    this.state = Object.freeze(state);
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener();
  }
}

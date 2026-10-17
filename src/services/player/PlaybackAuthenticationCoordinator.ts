import type { PlaybackNativeSessionOwnership } from './PlaybackNativeSessionOwnership';
import { NativePlayerCommandDispatcher } from './NativePlayerCommandDispatcher';
import { NativeQueueController } from './NativeQueueController';
import { NativePlaybackViewStore } from './NativePlaybackViewStore';

export interface PlaybackAuthenticationState {
  readonly restored: boolean;
  readonly accountIdentifier: string | null;
  readonly accessToken: string | null;
}

export interface PlaybackCredentialWriter {
  configureMediaServer(baseAddress: string, accessToken: string): Promise<void>;
}

export const PlaybackAuthenticationPolicy = Object.freeze({
  initialGeneration: 0,
  generationIncrement: 1,
  initialSessionAttempt: 0, sessionAttemptIncrement: 1, maximumSessionAttempts: 3,
  unstableSessionMessage: 'The audio session keeps changing. Try again.',
  missingAuthenticationMessage: 'Sign in before using audio playback.',
});

export class PlaybackAuthenticationCoordinator {
  private desired: PlaybackAuthenticationState = { restored: false, accountIdentifier: null, accessToken: null };
  private generation = PlaybackAuthenticationPolicy.initialGeneration;
  private nativeAccountIdentifier: string | null = null;
  private configured = false;
  private disposed = false;
  private transitioning = false;
  private boundEngineEpoch: string | null = null;
  private boundAuthenticationEpoch: string | null = null;
  private failedTransition = false;
  private pendingTransition: Promise<void> = Promise.resolve();

  constructor(
    private readonly mediaServerAddress: string,
    private readonly credentials: PlaybackCredentialWriter,
    private readonly dispatcher: Pick<NativePlayerCommandDispatcher, 'initialize' | 'invalidateSession' | 'clearSession' | 'getSnapshot'>,
    private readonly queue: Pick<NativeQueueController, 'invalidateSession'>,
    private readonly views: Pick<NativePlaybackViewStore, 'suspend' | 'connect' | 'refresh' | 'resume'>,
    private readonly ownership?: PlaybackNativeSessionOwnership,
  ) { this.views.suspend(); }

  update(state: PlaybackAuthenticationState): Promise<void> {
    if (this.disposed) return Promise.reject(new Error(PlaybackAuthenticationPolicy.missingAuthenticationMessage));
    if (!state.restored) return Promise.resolve();
    const captured = { ...state };
    if (!this.failedTransition && this.desired.restored && captured.accountIdentifier === this.desired.accountIdentifier
      && captured.accessToken === this.desired.accessToken) return this.pendingTransition;
    const accountChanged = !this.desired.restored || captured.accountIdentifier !== this.desired.accountIdentifier;
    this.desired = captured;
    this.transitioning = true;
    const generation = ++this.generation;
    this.failedTransition = false;
    if (accountChanged) {
      this.queue.invalidateSession();
      this.dispatcher.invalidateSession();
      this.views.suspend();
    }
    const transition = this.pendingTransition.catch(() => undefined).then(async () => {
      if (generation !== this.generation) return;
      await this.dispatcher.initialize();
      if (generation !== this.generation) return;
      let attached = false;
      if (!this.configured && this.ownership !== undefined && captured.accountIdentifier !== null && captured.accessToken !== null) {
        let receipt = null;
        try { receipt = await this.ownership.read(); } catch {}
        if (generation !== this.generation) return;
        const snapshot = await this.dispatcher.getSnapshot();
        attached = receipt !== null && receipt.serverAddress === this.mediaServerAddress
          && receipt.accountIdentifier === captured.accountIdentifier && receipt.engineEpoch === snapshot.cursor.engineEpoch
          && receipt.authenticationEpoch === snapshot.cursor.authenticationEpoch;
      }
      if (generation !== this.generation) return;
      if ((!this.configured && !attached) || (this.configured && this.nativeAccountIdentifier !== captured.accountIdentifier)
        || captured.accountIdentifier === null || captured.accessToken === null) {
        await this.dispatcher.clearSession();
        this.nativeAccountIdentifier = null;
        this.configured = false;
      }
      if (generation !== this.generation) return;
      if (captured.accountIdentifier === null || captured.accessToken === null) {
        try { await this.ownership?.clear(); } catch {}
        return;
      }
      await this.credentials.configureMediaServer(this.mediaServerAddress, captured.accessToken);
      if (generation !== this.generation) return;
      this.nativeAccountIdentifier = captured.accountIdentifier;
      this.configured = true;
      if (generation !== this.generation) return;
      if (this.ownership !== undefined) {
        const snapshot = await this.dispatcher.getSnapshot();
        if (generation !== this.generation) return;
        this.boundEngineEpoch = snapshot.cursor.engineEpoch;
        this.boundAuthenticationEpoch = snapshot.cursor.authenticationEpoch;
        try { await this.ownership.write({ serverAddress: this.mediaServerAddress, accountIdentifier: captured.accountIdentifier,
          engineEpoch: snapshot.cursor.engineEpoch, authenticationEpoch: snapshot.cursor.authenticationEpoch }); } catch {}
      }
      if (generation !== this.generation) return;
      this.views.connect();
      await this.views.refresh();
      if (generation === this.generation) this.views.resume();
    });
    this.pendingTransition = transition;
    void transition.then(() => {
      if (generation === this.generation) this.transitioning = false;
    }, () => {
      if (generation === this.generation) { this.failedTransition = true; this.transitioning = false; }
    });
    return transition;
  }

  whenReady(): Promise<void> { return this.waitForCurrentSession(PlaybackAuthenticationPolicy.initialSessionAttempt); }

  private async waitForCurrentSession(attempt: number): Promise<void> {
    if (attempt >= PlaybackAuthenticationPolicy.maximumSessionAttempts) throw new Error(PlaybackAuthenticationPolicy.unstableSessionMessage);
    let transition: Promise<void>;
    do {
      transition = this.pendingTransition;
      try { await transition; }
      catch (failure) { if (transition === this.pendingTransition) throw failure; }
    } while (transition !== this.pendingTransition);
    if (this.disposed || !this.desired.restored || this.desired.accountIdentifier === null || this.desired.accessToken === null
      || !this.configured || this.nativeAccountIdentifier !== this.desired.accountIdentifier) {
      throw new Error(PlaybackAuthenticationPolicy.missingAuthenticationMessage);
    }
    if (this.ownership !== undefined) {
      const snapshot = await this.dispatcher.getSnapshot();
      if (snapshot.cursor.engineEpoch !== this.boundEngineEpoch || snapshot.cursor.authenticationEpoch !== this.boundAuthenticationEpoch) {
        await this.reconnect();
        return this.waitForCurrentSession(attempt + PlaybackAuthenticationPolicy.sessionAttemptIncrement);
      }
      if (transition !== this.pendingTransition) return this.waitForCurrentSession(attempt + PlaybackAuthenticationPolicy.sessionAttemptIncrement);
    }
  }

  dispose(): void {
    this.disposed = true; this.generation += PlaybackAuthenticationPolicy.generationIncrement;
    this.configured = false; this.views.suspend();
  }

  isReady(): boolean { return !this.disposed && this.configured && !this.transitioning && !this.failedTransition; }

  getAccountIdentifier(): string | null { return this.desired.accountIdentifier; }

  reconnect(): Promise<void> {
    if (this.transitioning) return this.pendingTransition;
    if (!this.configured && !this.failedTransition) return this.pendingTransition;
    this.queue.invalidateSession();
    this.dispatcher.invalidateSession();
    this.views.suspend();
    this.configured = false;
    this.failedTransition = true;
    return this.update(this.desired);
  }
}

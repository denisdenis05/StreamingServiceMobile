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
  missingAuthenticationMessage: 'Sign in before using audio playback.',
});

export class PlaybackAuthenticationCoordinator {
  private desired: PlaybackAuthenticationState = { restored: false, accountIdentifier: null, accessToken: null };
  private generation = PlaybackAuthenticationPolicy.initialGeneration;
  private nativeAccountIdentifier: string | null = null;
  private configured = false;
  private failedTransition = false;
  private pendingTransition: Promise<void> = Promise.resolve();

  constructor(
    private readonly mediaServerAddress: string,
    private readonly credentials: PlaybackCredentialWriter,
    private readonly dispatcher: Pick<NativePlayerCommandDispatcher, 'initialize' | 'invalidateSession' | 'clearSession'>,
    private readonly queue: Pick<NativeQueueController, 'invalidateSession'>,
    private readonly views: Pick<NativePlaybackViewStore, 'suspend' | 'connect' | 'refresh' | 'resume'>,
  ) { this.views.suspend(); }

  update(state: PlaybackAuthenticationState): Promise<void> {
    if (!state.restored) return Promise.resolve();
    const captured = { ...state };
    if (!this.failedTransition && this.desired.restored && captured.accountIdentifier === this.desired.accountIdentifier
      && captured.accessToken === this.desired.accessToken) return this.pendingTransition;
    const accountChanged = !this.desired.restored || captured.accountIdentifier !== this.desired.accountIdentifier;
    this.desired = captured;
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
      if (!this.configured || this.nativeAccountIdentifier !== captured.accountIdentifier
        || captured.accountIdentifier === null || captured.accessToken === null) {
        await this.dispatcher.clearSession();
        this.nativeAccountIdentifier = null;
        this.configured = false;
      }
      if (generation !== this.generation) return;
      if (captured.accountIdentifier === null || captured.accessToken === null) return;
      await this.credentials.configureMediaServer(this.mediaServerAddress, captured.accessToken);
      this.nativeAccountIdentifier = captured.accountIdentifier;
      this.configured = true;
      if (generation !== this.generation) return;
      this.views.connect();
      await this.views.refresh();
      if (generation === this.generation) this.views.resume();
    });
    this.pendingTransition = transition;
    void transition.catch(() => {
      if (generation === this.generation) this.failedTransition = true;
    });
    return transition;
  }

  async whenReady(): Promise<void> {
    let transition: Promise<void>;
    do {
      transition = this.pendingTransition;
      await transition;
    } while (transition !== this.pendingTransition);
    if (!this.desired.restored || this.desired.accountIdentifier === null || this.desired.accessToken === null
      || !this.configured || this.nativeAccountIdentifier !== this.desired.accountIdentifier) {
      throw new Error(PlaybackAuthenticationPolicy.missingAuthenticationMessage);
    }
  }

  getAccountIdentifier(): string | null { return this.desired.accountIdentifier; }

  reconnect(): Promise<void> {
    this.queue.invalidateSession();
    this.dispatcher.invalidateSession();
    this.views.suspend();
    this.configured = false;
    this.failedTransition = true;
    return this.update(this.desired);
  }
}

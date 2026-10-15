import { PlayerStateStore, PlayerEventType, PlaybackIntent, PlaybackState, RepeatMode, EntryChangeReason, CommandResultStatus } from 'streaming-service-player';
import type { PlayerCursor, PlayerEvent, PlayerSnapshot, StreamingPlayer } from 'streaming-service-player';
import { NativePlayerCommandDispatcher, PlaybackIdentifierSource } from './NativePlayerCommandDispatcher';
import { NativeQueueController } from './NativeQueueController';
import { NativeQueueSourcePreparation } from './NativeQueueSourcePreparation';
import { NativeQueueProjection } from './NativeQueueProjection';
import { NativePlaybackViewStore } from './NativePlaybackViewStore';
import { NativePlaybackReporting, PlaybackListeningSessionFactory } from './NativePlaybackReporting';
import { PlaybackMetadataRegistry } from './PlaybackMetadataRegistry';
import { PlaybackTrackMapper } from './PlaybackTrackMapper';
import { PlaybackTrack, PlaybackCacheReader } from './PlaybackTrack';
import { PlaybackAuthenticationCoordinator, PlaybackAuthenticationState } from './PlaybackAuthenticationCoordinator';
import { SharedNativePlayerObservation } from './SharedNativePlayerObservation';
import { QueueIntentSupersededError } from './QueueIntentScheduler';
import { QueueCommandFailure } from './QueueCommandFailure';
import { copyMediaRequestConfiguration, copyMediaSourceConfiguration } from './PlaybackMediaConfiguration';

export interface PlaybackRuntimeConfiguration {
  readonly native: StreamingPlayer;
  readonly mediaServerAddress: string;
  readonly cache: PlaybackCacheReader;
  readonly identifiers: PlaybackIdentifierSource;
  readonly listening: (metadata: PlaybackMetadataRegistry) => PlaybackListeningSessionFactory;
  readonly fetchSuggestions: () => Promise<readonly PlaybackTrack[]>;
  readonly reportFailure: (failure: unknown) => void;
}

export class PlaybackRuntime {
  readonly dispatcher: NativePlayerCommandDispatcher;
  readonly queue: NativeQueueController;
  readonly views: NativePlaybackViewStore;
  readonly state: PlayerStateStore;
  readonly authentication: PlaybackAuthenticationCoordinator;
  private readonly observation: SharedNativePlayerObservation;
  private readonly native: StreamingPlayer;
  private readonly fetchSuggestions: () => Promise<readonly PlaybackTrack[]>;
  private readonly reportFailure: (failure: unknown) => void;
  private lastSnapshot: PlayerSnapshot | null = null;
  private stopEvents: (() => void) | null = null;
  private stopState: (() => void) | null = null;
  private continuation: Promise<void> | null = null;
  private continuationQueueIdentifier: string | null = null;
  private selectionFence = {};
  private accountIdentifier: string | null = null;

  constructor(configuration: PlaybackRuntimeConfiguration) {
    this.native = configuration.native;
    this.fetchSuggestions = configuration.fetchSuggestions;
    this.reportFailure = configuration.reportFailure;
    this.dispatcher = new NativePlayerCommandDispatcher(this.native, configuration.identifiers);
    const metadata = new PlaybackMetadataRegistry();
    this.queue = new NativeQueueController(this.native, this.dispatcher,
      new PlaybackTrackMapper(configuration.mediaServerAddress, configuration.cache),
      new NativeQueueSourcePreparation(this.native, this.reportFailure), metadata, configuration.identifiers);
    this.observation = new SharedNativePlayerObservation(this.native, () => this.dispatcher.getSnapshot(), this.reportFailure);
    this.state = new PlayerStateStore(this.observation);
    this.views = new NativePlaybackViewStore(this.state, this.observation, new NativeQueueProjection(this.native, metadata),
      metadata, new NativePlaybackReporting(configuration.listening(metadata), this.reportFailure), this.reportFailure);
    this.authentication = new PlaybackAuthenticationCoordinator(configuration.mediaServerAddress, this.native,
      this.dispatcher, this.queue, this.views);
  }

  async initialize(): Promise<void> {
    await this.dispatcher.initialize();
    this.stopEvents ??= this.observation.subscribe(event => this.receive(event));
    this.stopState ??= this.state.subscribe(() => {
      const snapshot = this.state.getSnapshot();
      if (snapshot !== null) this.receiveSnapshot(snapshot);
    });
  }

  async updateAuthentication(state: PlaybackAuthenticationState): Promise<void> {
    if (!state.restored) return;
    if (state.accountIdentifier !== this.accountIdentifier) {
      this.invalidateSelection();
      this.continuationQueueIdentifier = null;
    }
    this.accountIdentifier = state.accountIdentifier;
    await Promise.all([this.initialize(), this.authentication.update(state)]);
  }

  playTracks(tracks: readonly PlaybackTrack[], selectedIndex: number): Promise<void> {
    this.invalidateSelection();
    this.continuationQueueIdentifier = null;
    const captured = this.captureTracks(tracks);
    const fence = this.selectionFence;
    return this.authenticated(() => {
      if (fence !== this.selectionFence) throw new QueueIntentSupersededError();
      return this.queue.playTracks(captured, selectedIndex);
    });
  }

  async playCollection(load: (isCurrent: () => boolean) => Promise<{ readonly tracks: readonly PlaybackTrack[]; readonly selectedIndex: number }>): Promise<void> {
    this.invalidateSelection();
    this.continuationQueueIdentifier = null;
    const fence = this.selectionFence;
    const account = this.authentication.getAccountIdentifier();
    const current = () => fence === this.selectionFence && account === this.authentication.getAccountIdentifier();
    await this.authentication.whenReady();
    if (!current()) throw new QueueIntentSupersededError();
    const candidate = await load(current);
    if (!current()) throw new QueueIntentSupersededError();
    await this.queue.playTracks(candidate.tracks, candidate.selectedIndex);
  }

  append(tracks: readonly PlaybackTrack[]): Promise<void> {
    const captured = this.captureTracks(tracks);
    return this.authenticated(() => this.queue.append(captured));
  }
  removeMany(identifiers: readonly string[]): Promise<void> {
    const captured = [...identifiers];
    return this.authenticated(() => this.queue.removeMany(captured));
  }
  move(identifier: string, beforeIdentifier: string | null): Promise<void> {
    return this.authenticated(() => this.queue.move(identifier, beforeIdentifier));
  }
  select(identifier: string): Promise<void> {
    this.invalidateSelection();
    return this.authenticated(() => this.queue.select(identifier));
  }
  play(): Promise<void> {
    this.invalidateSelection();
    return this.authenticated(async () => {
      const snapshot = await this.dispatcher.getSnapshot();
      if (snapshot.state !== PlaybackState.Failed) return this.queue.play();
      const result = await this.dispatcher.playbackCommand(context => this.native.retry(context));
      if (result.status !== CommandResultStatus.Applied) throw new QueueCommandFailure(result);
    });
  }
  pause(): Promise<void> { this.invalidateSelection(); return this.authenticated(() => this.queue.pause()); }
  stop(): Promise<void> { this.invalidateSelection(); return this.authenticated(() => this.queue.stop()); }
  previous(): Promise<void> { this.invalidateSelection(); return this.authenticated(() => this.queue.previous()); }
  seek(identifier: string, seconds: number): Promise<void> {
    this.invalidateSelection();
    return this.authenticated(() => this.queue.seek(identifier, seconds));
  }
  clear(): Promise<void> {
    this.invalidateSelection();
    this.continuationQueueIdentifier = null;
    return this.authenticated(() => this.queue.clearQueue());
  }
  setRepeat(mode: RepeatMode): Promise<void> { return this.authenticated(() => this.queue.setRepeat(mode)); }
  setShuffle(enabled: boolean): Promise<void> { return this.authenticated(() => this.queue.setShuffle(enabled)); }

  async next(): Promise<void> {
    await this.authentication.whenReady();
    const snapshot = await this.dispatcher.getSnapshot();
    if (snapshot.currentEntry === null && snapshot.queueLength > RuntimePolicy.emptyQueueLength) {
      return this.continueQueue(snapshot);
    }
    await this.queue.next();
  }

  dispose(): void {
    this.invalidateSelection();
    this.queue.invalidateSession();
    this.stopEvents?.();
    this.stopEvents = null;
    this.stopState?.();
    this.stopState = null;
    this.views.dispose();
  }

  private async authenticated(operation: () => Promise<void>): Promise<void> {
    const account = this.authentication.getAccountIdentifier();
    await this.authentication.whenReady();
    if (account !== this.authentication.getAccountIdentifier()) throw new QueueIntentSupersededError();
    await operation();
  }

  private receive(event: PlayerEvent): void {
    if (event.type === PlayerEventType.State) return;
    const previous = this.lastSnapshot;
    if (previous === null || !this.sameSession(previous.cursor, event.cursor)
      || event.cursor.eventSequence <= previous.cursor.eventSequence) return;
    if (event.type === PlayerEventType.EntryChanged && event.entry === null
      && (event.reason === EntryChangeReason.Ended || event.reason === EntryChangeReason.Next)) {
      void this.dispatcher.getSnapshot().then(snapshot => this.continueQueue(snapshot)).catch(this.reportFailure);
    }
  }

  private receiveSnapshot(snapshot: PlayerSnapshot): void {
      const previous = this.lastSnapshot;
      this.lastSnapshot = snapshot;
      if (previous !== null && previous.cursor.engineEpoch !== snapshot.cursor.engineEpoch) {
        this.invalidateSelection();
        void this.authentication.reconnect().catch(this.reportFailure);
      }
      if (previous !== null && previous.cursor.queueIdentifier === snapshot.cursor.queueIdentifier
        && previous.cursor.playbackControlRevision !== snapshot.cursor.playbackControlRevision) {
        this.queue.cancelPendingReplacement();
        if (snapshot.playbackIntent !== PlaybackIntent.Play && snapshot.currentEntry !== null) this.invalidateSelection();
      }
  }

  private continueQueue(snapshot: PlayerSnapshot): Promise<void> {
    if (snapshot.currentEntry !== null || snapshot.repeatMode !== RepeatMode.Off || snapshot.queueLength === RuntimePolicy.emptyQueueLength) return Promise.resolve();
    const queueIdentifier = this.queue.getDesiredQueueIdentifier();
    if (this.continuationQueueIdentifier === queueIdentifier) return this.continuation ?? Promise.resolve();
    this.continuationQueueIdentifier = queueIdentifier;
    const fence = this.selectionFence;
    const origin = { ...snapshot.cursor };
    const current = () => fence === this.selectionFence && this.queue.getDesiredQueueIdentifier() === queueIdentifier
      && this.sameSession(origin, this.state.getSnapshot()?.cursor ?? origin);
    const continuation = this.fetchSuggestions().then(async tracks => {
      if (!current() || tracks.length === RuntimePolicy.emptyQueueLength) return;
      const latest = await this.dispatcher.getSnapshot();
      if (!current() || latest.currentEntry !== null || latest.cursor.queueIdentifier !== origin.queueIdentifier
        || latest.cursor.playbackControlRevision !== origin.playbackControlRevision) return;
      await this.queue.appendAndPlay(tracks, current);
    });
    this.continuation = continuation;
    void continuation.finally(() => { if (this.continuation === continuation) this.continuation = null; }).catch(() => undefined);
    return continuation;
  }

  private captureTracks(tracks: readonly PlaybackTrack[]): readonly PlaybackTrack[] {
    return tracks.map(track => ({ ...track,
      ...(track.mediaSource === undefined ? {} : { mediaSource: copyMediaSourceConfiguration(track.mediaSource) }),
      ...(track.mediaRequest === undefined ? {} : { mediaRequest: copyMediaRequestConfiguration(track.mediaRequest) }),
    }));
  }

  private invalidateSelection(): void {
    this.selectionFence = {};
    this.queue.cancelPendingReplacement();
  }

  private sameSession(previous: PlayerCursor, current: PlayerCursor): boolean {
    return previous.engineEpoch === current.engineEpoch && previous.authenticationEpoch === current.authenticationEpoch;
  }
}

export const RuntimePolicy = Object.freeze({ emptyQueueLength: 0 });

import { CommandResultStatus, DefaultQueuePolicy, MediaSourceValidator, PlaybackIntent, PlayerErrorCode } from 'streaming-service-player';
import type { CommandContext, CommandResult, PlayerCursor, PlayerPlaybackCommands, PlayerQueueCommands, QueueCommandContext, QueueEntry, RepeatMode } from 'streaming-service-player';
import { copyMediaRequestConfiguration, copyMediaSourceConfiguration } from './PlaybackMediaConfiguration';
import { NativePlayerCommandDispatcher, PlaybackIdentifierSource, PlayerDispatchPolicy } from './NativePlayerCommandDispatcher';
import { NativeQueueSourcePreparation } from './NativeQueueSourcePreparation';
import { PlaybackMetadataRegistry } from './PlaybackMetadataRegistry';
import { PlaybackTrackMapper } from './PlaybackTrackMapper';
import { PlaybackTrack, PlaybackTrackPolicy, PreparedPlaybackTrack } from './PlaybackTrack';
import { QueueCommandFailure, QueueCommandFailurePolicy, QueueCommandOutcomeUnknownError } from './QueueCommandFailure';
import { QueueIntentCancellation, QueueIntentKind, QueueIntentScheduler, QueueIntentSupersededError } from './QueueIntentScheduler';

export const QueueControllerPolicy = Object.freeze({
  firstEntryIndex: 0,
  emptyTrackCount: 0,
  invalidSelectionMessage: 'Select an entry in the candidate playback queue.',
});

enum QueueLifetimeState {
  Pending = 'pending',
  Committed = 'committed',
  Failed = 'failed',
}

interface QueueLifetime {
  readonly identifier: string;
  readonly sessionFence: object;
  state: QueueLifetimeState;
  session: Pick<CommandContext, 'engineEpoch' | 'authenticationEpoch'> | null;
  outcomeKnown: boolean;
  nativeIdentifier: string | null;
}

interface CapturedQueueTrack {
  readonly track: PlaybackTrack;
  readonly entryIdentifier: string;
}

type QueueEdit = (context: QueueCommandContext) => Promise<CommandResult>;
type PreparedQueueEdit = (entries: readonly QueueEntry[], context: QueueCommandContext) => Promise<CommandResult>;
type QueueDispatcher = Pick<NativePlayerCommandDispatcher, 'getSnapshot' | 'queueCommandOnce' | 'playbackCommand'>;

export class NativeQueueController {
  private readonly sourceValidator = new MediaSourceValidator();
  private sessionFence = {};
  private committedQueue: QueueLifetime;
  private desiredQueue: QueueLifetime;

  constructor(
    private readonly native: PlayerQueueCommands & PlayerPlaybackCommands,
    private readonly dispatcher: QueueDispatcher,
    private readonly mapper: Pick<PlaybackTrackMapper, 'prepare'>,
    private readonly preparation: Pick<NativeQueueSourcePreparation, 'execute'>,
    private readonly metadata: Pick<PlaybackMetadataRegistry, 'stage' | 'observe' | 'forget' | 'clear'>,
    private readonly identifiers: PlaybackIdentifierSource,
    private readonly intents: Pick<QueueIntentScheduler, 'enqueue' | 'cancelAll' | 'cancelOwner'> = new QueueIntentScheduler(),
  ) {
    this.committedQueue = this.createQueue(QueueLifetimeState.Committed);
    this.desiredQueue = this.committedQueue;
  }

  getDesiredQueueIdentifier(): string { return this.desiredQueue.identifier; }

  getCommittedQueueIdentifier(): string | null {
    return this.committedQueue.outcomeKnown ? this.committedQueue.identifier : null;
  }

  isQueueOutcomeKnown(): boolean { return this.committedQueue.outcomeKnown; }

  async playTracks(tracks: readonly PlaybackTrack[], selectedIndex: number): Promise<void> {
    if (!Number.isSafeInteger(selectedIndex) || selectedIndex < QueueControllerPolicy.firstEntryIndex
      || selectedIndex >= tracks.length || tracks.length > DefaultQueuePolicy.maximumEntries) {
      throw new Error(QueueControllerPolicy.invalidSelectionMessage);
    }
    const captured = this.captureTracks(tracks);
    this.intents.cancelAll();
    const owner = this.createQueue(QueueLifetimeState.Pending);
    this.desiredQueue = owner;
    try {
      await this.intents.enqueue(owner, QueueIntentKind.Replacement, cancellation =>
        this.prepare(owner, captured, cancellation, (entries, context) =>
          this.native.replaceQueueAndSelect(context, entries, captured[selectedIndex]!.entryIdentifier, true), true));
    } catch (failure) {
      this.rejectCandidate(owner);
      throw failure;
    }
  }

  async append(tracks: readonly PlaybackTrack[], isStillWanted: () => boolean = () => true): Promise<void> {
    if (tracks.length === QueueControllerPolicy.emptyTrackCount) return;
    const captured = this.captureTracks(tracks);
    const owner = this.desiredQueue;
    await this.intents.enqueue(owner, QueueIntentKind.PreparedAppend, cancellation =>
      this.prepare(owner, captured, cancellation, (entries, context) => this.native.append(context, entries), false, isStillWanted));
  }

  async appendAndPlay(tracks: readonly PlaybackTrack[], isStillWanted: () => boolean): Promise<void> {
    if (tracks.length === QueueControllerPolicy.emptyTrackCount) return;
    const captured = this.captureTracks(tracks);
    const owner = this.desiredQueue;
    await this.intents.enqueue(owner, QueueIntentKind.PreparedAppend, cancellation =>
      this.prepare(owner, captured, cancellation, (entries, context) =>
        this.native.appendAndSelect(context, entries, captured[QueueControllerPolicy.firstEntryIndex]!.entryIdentifier, true),
      false, isStillWanted, true));
  }

  async select(entryIdentifier: string): Promise<void> {
    this.requireIdentifier(entryIdentifier);
    this.cancelPendingReplacement();
    const owner = this.committedQueue;
    this.requireCommitted(owner);
    this.requireApplied(await this.dispatcher.queueCommandOnce((context, snapshot) => {
      this.requireCommitted(owner);
      this.requireQueueOwnership(owner, snapshot.cursor);
      this.requireSession(owner, context);
      return this.submit(owner, () => this.native.select(context, entryIdentifier, true));
    }));
  }

  remove(entryIdentifier: string): Promise<void> { return this.removeMany([entryIdentifier]); }

  async removeMany(entryIdentifiers: readonly string[]): Promise<void> {
    const identifiers = [...entryIdentifiers];
    for (const identifier of identifiers) this.requireIdentifier(identifier);
    if (new Set(identifiers).size !== identifiers.length) throw new Error(QueueCommandFailurePolicy.duplicateIdentifierMessage);
    if (identifiers.length === QueueControllerPolicy.emptyTrackCount) return;
    await this.edit(context => this.native.remove(context, identifiers));
    this.metadata.forget(identifiers);
  }

  async move(entryIdentifier: string, beforeEntryIdentifier: string | null): Promise<void> {
    this.requireIdentifier(entryIdentifier);
    if (beforeEntryIdentifier !== null) this.requireIdentifier(beforeEntryIdentifier);
    await this.edit(context => this.native.move(context, entryIdentifier, beforeEntryIdentifier));
  }

  setShuffle(enabled: boolean): Promise<void> {
    return this.edit(context => this.native.setShuffle(context, enabled));
  }

  setRepeat(repeatMode: RepeatMode): Promise<void> {
    return this.edit(context => this.native.setRepeat(context, repeatMode));
  }

  async clearQueue(): Promise<void> {
    this.intents.cancelAll();
    const owner = this.createQueue(QueueLifetimeState.Pending);
    this.desiredQueue = owner;
    try {
      await this.intents.enqueue(owner, QueueIntentKind.Replacement, async cancellation => {
        const result = await this.dispatcher.queueCommandOnce(context => {
          this.requireCandidate(owner, cancellation);
          this.requireSession(owner, context);
          return this.submit(owner, () => this.native.clear(context));
        });
        this.requireApplied(result);
        if (result.status === CommandResultStatus.Applied) {
          this.commitCandidate(owner, result.cursor);
          this.metadata.clear();
        }
      });
    } catch (failure) {
      this.rejectCandidate(owner);
      throw failure;
    }
  }

  play(): Promise<void> { return this.control(context => this.native.play(context)); }
  pause(): Promise<void> { return this.control(context => this.native.pause(context)); }
  stop(): Promise<void> { return this.control(context => this.native.stop(context)); }
  next(): Promise<void> { return this.navigateAndPlay(context => this.native.next(context)); }
  previous(): Promise<void> { return this.navigateAndPlay(context => this.native.previous(context)); }

  async seek(entryIdentifier: string, positionSeconds: number): Promise<void> {
    this.requireIdentifier(entryIdentifier);
    const positionMilliseconds = Math.round(positionSeconds * PlaybackTrackPolicy.millisecondsPerSecond);
    if (!Number.isFinite(positionSeconds) || positionSeconds < QueueCommandFailurePolicy.minimumPositionSeconds
      || !Number.isSafeInteger(positionMilliseconds)) throw new Error(QueueCommandFailurePolicy.invalidSeekMessage);
    await this.control(context => this.native.seek(context, entryIdentifier, positionMilliseconds));
  }

  invalidateSession(): void {
    this.intents.cancelAll();
    this.rejectCandidate(this.desiredQueue);
    this.sessionFence = {};
    this.committedQueue = this.createQueue(QueueLifetimeState.Committed);
    this.desiredQueue = this.committedQueue;
  }

  private edit(operation: QueueEdit): Promise<void> {
    const owner = this.desiredQueue;
    return this.intents.enqueue(owner, QueueIntentKind.Edit, async cancellation => {
      this.requireCommitted(owner);
      const result = await this.dispatcher.queueCommandOnce((context, snapshot) => {
        cancellation.requireCurrent();
        this.requireCommitted(owner);
        this.requireSession(owner, context);
        this.requireQueueOwnership(owner, snapshot.cursor);
        const guardedContext = { ...context, ...(snapshot.cursor.queueIdentifier === undefined
          ? {} : { expectedQueueIdentifier: snapshot.cursor.queueIdentifier }) };
        return this.submit(owner, () => operation(guardedContext));
      });
      this.requireApplied(result);
    });
  }

  private navigateAndPlay(operation: (context: CommandContext) => Promise<CommandResult>): Promise<void> {
    return this.control(async context => {
      const navigationResult = await operation(context);
      if (navigationResult.status !== CommandResultStatus.Applied) return navigationResult;
      const snapshot = await this.dispatcher.getSnapshot();
      if (snapshot.cursor.playbackControlRevision !== navigationResult.cursor.playbackControlRevision)
        throw new QueueIntentSupersededError();
      if (snapshot.currentEntry === null || snapshot.playbackIntent === PlaybackIntent.Play) return navigationResult;
      return this.native.play({
        requestIdentifier: this.identifiers.nextIdentifier(),
        engineEpoch: navigationResult.cursor.engineEpoch,
        authenticationEpoch: navigationResult.cursor.authenticationEpoch,
      });
    });
  }

  private async control(operation: (context: CommandContext) => Promise<CommandResult>): Promise<void> {
    this.cancelPendingReplacement();
    const sessionFence = this.sessionFence;
    this.requireApplied(await this.dispatcher.playbackCommand(context => {
      if (sessionFence !== this.sessionFence) throw new QueueIntentSupersededError();
      this.requireSession(this.committedQueue, context);
      return operation(context);
    }));
  }

  private async prepare(owner: QueueLifetime, tracks: readonly CapturedQueueTrack[], cancellation: QueueIntentCancellation,
    operation: PreparedQueueEdit, replacement: boolean, isStillWanted: () => boolean = () => true,
    selectsEntry: boolean = replacement): Promise<void> {
    if (replacement) this.requireCandidate(owner, cancellation);
    else this.requireCommitted(owner);
    const snapshot = await cancellation.waitFor(this.dispatcher.getSnapshot());
    this.requireSession(owner, snapshot.cursor);
    if (!replacement) this.requireQueueOwnership(owner, snapshot.cursor);
    const isCurrent = () => cancellation.isCurrent() && owner.sessionFence === this.sessionFence && isStillWanted();
    const prepared: PreparedPlaybackTrack[] = [];
    for (const candidate of tracks) {
      this.requirePreparation(isCurrent);
      prepared.push(await cancellation.waitFor(this.mapper.prepare(candidate.track, candidate.entryIdentifier)));
    }
    this.requirePreparation(isCurrent);
    const context: CommandContext = { requestIdentifier: this.identifiers.nextIdentifier(),
      engineEpoch: snapshot.cursor.engineEpoch, authenticationEpoch: snapshot.cursor.authenticationEpoch };
    const result = await this.preparation.execute(prepared, context, isCurrent, async (entries, views, stagedContext) => {
      const metadataStage = this.metadata.stage(views);
      let applied = false;
      try {
        const receipt = await this.dispatcher.queueCommandOnce((currentContext, currentSnapshot) => {
          this.requirePreparation(isCurrent);
          if (!replacement) this.requireCommitted(owner);
          this.requireSession(owner, currentContext);
          if (currentContext.engineEpoch !== stagedContext.engineEpoch
            || currentContext.authenticationEpoch !== stagedContext.authenticationEpoch) {
            throw new Error(PlayerDispatchPolicy.supersededMessage);
          }
          const sameContent = snapshot.cursor.queueIdentifier !== undefined
            && currentSnapshot.cursor.queueIdentifier === snapshot.cursor.queueIdentifier
            && snapshot.cursor.queueContentRevision !== undefined
            && currentSnapshot.cursor.queueContentRevision === snapshot.cursor.queueContentRevision;
          if (currentContext.expectedQueueRevision !== snapshot.cursor.queueRevision && !sameContent) {
            throw new Error(QueueCommandFailurePolicy.conflictMessage);
          }
          const guardedContext = { ...currentContext,
            ...(snapshot.cursor.queueIdentifier === undefined ? {} : { expectedQueueIdentifier: snapshot.cursor.queueIdentifier }),
            ...(selectsEntry && snapshot.cursor.playbackControlRevision !== undefined
              ? { expectedPlaybackControlRevision: snapshot.cursor.playbackControlRevision } : {}),
          };
          return this.submit(owner, () => operation(entries, guardedContext));
        });
        applied = receipt.status === CommandResultStatus.Applied;
        if (replacement && receipt.status === CommandResultStatus.Applied) {
          this.commitCandidate(owner, receipt.cursor);
          this.metadata.observe(views, null);
        }
        return receipt;
      } finally { metadataStage.settle(applied); }
    });
    this.requireApplied(result);
  }

  private captureTracks(tracks: readonly PlaybackTrack[]): readonly CapturedQueueTrack[] {
    if (tracks.length > DefaultQueuePolicy.maximumEntries) throw new Error(QueueControllerPolicy.invalidSelectionMessage);
    for (const track of tracks) {
      if (track.mediaSource !== undefined) this.sourceValidator.validateSource(track.mediaSource);
      if (track.mediaRequest !== undefined) this.sourceValidator.validateRequest(track.mediaRequest);
    }
    return tracks.map(track => ({ entryIdentifier: this.identifiers.nextIdentifier(), track: { ...track,
      ...(track.mediaSource === undefined ? {} : { mediaSource: copyMediaSourceConfiguration(track.mediaSource) }),
      ...(track.mediaRequest === undefined ? {} : { mediaRequest: copyMediaRequestConfiguration(track.mediaRequest) }),
    } }));
  }

  private createQueue(state: QueueLifetimeState): QueueLifetime {
    return { identifier: this.identifiers.nextIdentifier(), sessionFence: this.sessionFence, state, session: null,
      outcomeKnown: true, nativeIdentifier: null };
  }

  cancelPendingReplacement(): void {
    const owner = this.desiredQueue;
    if (owner.state !== QueueLifetimeState.Pending) return;
    this.intents.cancelOwner(owner);
    this.rejectCandidate(owner);
  }

  private rejectCandidate(owner: QueueLifetime): void {
    if (owner.state !== QueueLifetimeState.Pending) return;
    owner.state = QueueLifetimeState.Failed;
    if (this.desiredQueue === owner) this.desiredQueue = this.committedQueue;
  }

  private commitCandidate(owner: QueueLifetime, cursor: PlayerCursor): void {
    if (owner.sessionFence !== this.sessionFence) return;
    const previousCommitted = this.committedQueue;
    owner.state = QueueLifetimeState.Committed;
    owner.session = { engineEpoch: cursor.engineEpoch, authenticationEpoch: cursor.authenticationEpoch };
    owner.nativeIdentifier = cursor.queueIdentifier ?? null;
    this.committedQueue = owner;
    if (this.desiredQueue === owner || this.desiredQueue === previousCommitted) this.desiredQueue = owner;
  }

  private requireCandidate(owner: QueueLifetime, cancellation: QueueIntentCancellation): void {
    cancellation.requireCurrent();
    if (owner.sessionFence !== this.sessionFence || owner.state !== QueueLifetimeState.Pending) {
      throw new QueueIntentSupersededError();
    }
  }

  private requireCommitted(owner: QueueLifetime): void {
    if (owner.sessionFence !== this.sessionFence || owner !== this.committedQueue
      || owner.state !== QueueLifetimeState.Committed) throw new Error(QueueCommandFailurePolicy.dependencyMessage);
    if (!owner.outcomeKnown) throw new QueueCommandOutcomeUnknownError();
  }

  private requireQueueOwnership(owner: QueueLifetime, cursor: PlayerCursor): void {
    if (owner.nativeIdentifier !== null && cursor.queueIdentifier !== owner.nativeIdentifier) {
      this.markOutcomeUnknown(owner);
      throw new QueueCommandOutcomeUnknownError();
    }
    owner.nativeIdentifier ??= cursor.queueIdentifier ?? null;
  }

  private async submit(owner: QueueLifetime, operation: () => Promise<CommandResult>): Promise<CommandResult> {
    let result: CommandResult;
    try { result = await operation(); }
    catch {
      this.markOutcomeUnknown(owner);
      throw new QueueCommandOutcomeUnknownError();
    }
    if (result.status === CommandResultStatus.Rejected
      && (result.error.code === PlayerErrorCode.Internal || result.error.code === PlayerErrorCode.ServiceUnavailable)) {
      this.markOutcomeUnknown(owner);
    }
    return result;
  }

  private markOutcomeUnknown(owner: QueueLifetime): void {
    if (owner.sessionFence !== this.sessionFence) return;
    owner.outcomeKnown = false;
    this.committedQueue.outcomeKnown = false;
  }

  private requireSession(owner: QueueLifetime, context: CommandContext | PlayerCursor): void {
    if (owner.session !== null && (owner.session.engineEpoch !== context.engineEpoch
      || owner.session.authenticationEpoch !== context.authenticationEpoch)) {
      throw new Error(PlayerDispatchPolicy.supersededMessage);
    }
    owner.session ??= { engineEpoch: context.engineEpoch, authenticationEpoch: context.authenticationEpoch };
  }

  private requirePreparation(isCurrent: () => boolean): void {
    if (!isCurrent()) throw new QueueIntentSupersededError();
  }

  private requireIdentifier(identifier: string): void {
    if (identifier.trim().length === QueueCommandFailurePolicy.emptyIdentifierLength) {
      throw new Error(QueueCommandFailurePolicy.invalidIdentifierMessage);
    }
  }

  private requireApplied(result: CommandResult): void {
    if (result.status !== CommandResultStatus.Applied) throw new QueueCommandFailure(result);
  }
}

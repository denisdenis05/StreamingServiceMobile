import { CommandResultStatus, DefaultQueuePolicy } from 'streaming-service-player';
import type { CommandContext, CommandResult, PlayerPlaybackCommands, PlayerQueueCommands, QueueEntry, RepeatMode } from 'streaming-service-player';
import { copyMediaRequestConfiguration, copyMediaSourceConfiguration } from './PlaybackMediaConfiguration';
import { NativePlayerCommandDispatcher, PlaybackIdentifierSource, PlayerDispatchPolicy } from './NativePlayerCommandDispatcher';
import { NativeQueueSourcePreparation } from './NativeQueueSourcePreparation';
import { PlaybackMetadataRegistry } from './PlaybackMetadataRegistry';
import { PlaybackTrackMapper } from './PlaybackTrackMapper';
import { PlaybackTrack, PlaybackTrackPolicy, PreparedPlaybackTrack } from './PlaybackTrack';

export const QueueControllerPolicy = Object.freeze({
  initialGeneration: 0,
  generationIncrement: 1,
  firstEntryIndex: 0,
  emptyTrackCount: 0,
  invalidSelectionMessage: 'Select an entry in the candidate playback queue.',
  rejectedCommandMessage: 'The native player could not apply the playback command.',
});

export class NativeQueueController {
  private generation = QueueControllerPolicy.initialGeneration;

  constructor(
    private readonly native: PlayerQueueCommands & PlayerPlaybackCommands,
    private readonly dispatcher: Pick<NativePlayerCommandDispatcher, 'getSnapshot' | 'queueCommand' | 'playbackCommand'>,
    private readonly mapper: Pick<PlaybackTrackMapper, 'prepare'>,
    private readonly preparation: Pick<NativeQueueSourcePreparation, 'execute'>,
    private readonly metadata: Pick<PlaybackMetadataRegistry, 'stage'>,
    private readonly identifiers: PlaybackIdentifierSource,
  ) {}

  playTracks(tracks: readonly PlaybackTrack[], selectedIndex: number): Promise<void> {
    if (!Number.isSafeInteger(selectedIndex) || selectedIndex < QueueControllerPolicy.firstEntryIndex
      || selectedIndex >= tracks.length || tracks.length > DefaultQueuePolicy.maximumEntries) {
      return Promise.reject(new Error(QueueControllerPolicy.invalidSelectionMessage));
    }
    this.cancelPreparation();
    return this.prepare(tracks, async (entries, context) =>
      this.native.replaceQueueAndSelect(context, entries, entries[selectedIndex]!.entryIdentifier, true));
  }

  append(tracks: readonly PlaybackTrack[], isStillWanted: () => boolean = () => true): Promise<void> {
    if (tracks.length === QueueControllerPolicy.emptyTrackCount) return Promise.resolve();
    return this.prepare(tracks, (entries, context) => this.native.append(context, entries), isStillWanted);
  }

  select(entryIdentifier: string): Promise<void> {
    this.cancelPreparation();
    return this.apply(this.dispatcher.queueCommand(context => this.native.select(context, entryIdentifier, true)));
  }

  remove(entryIdentifier: string): Promise<void> {
    return this.apply(this.dispatcher.queueCommand(context => this.native.remove(context, [entryIdentifier])));
  }

  setShuffle(enabled: boolean): Promise<void> {
    return this.apply(this.dispatcher.queueCommand(context => this.native.setShuffle(context, enabled)));
  }

  setRepeat(repeatMode: RepeatMode): Promise<void> {
    return this.apply(this.dispatcher.queueCommand(context => this.native.setRepeat(context, repeatMode)));
  }

  clearQueue(): Promise<void> {
    this.cancelPreparation();
    return this.apply(this.dispatcher.queueCommand(context => this.native.clear(context)));
  }

  play(): Promise<void> {
    return this.apply(this.dispatcher.playbackCommand(context => this.native.play(context)));
  }

  pause(): Promise<void> {
    this.cancelPreparation();
    return this.apply(this.dispatcher.playbackCommand(context => this.native.pause(context)));
  }

  stop(): Promise<void> {
    this.cancelPreparation();
    return this.apply(this.dispatcher.playbackCommand(context => this.native.stop(context)));
  }

  next(): Promise<void> {
    this.cancelPreparation();
    return this.apply(this.dispatcher.playbackCommand(context => this.native.next(context)));
  }

  previous(): Promise<void> {
    this.cancelPreparation();
    return this.apply(this.dispatcher.playbackCommand(context => this.native.previous(context)));
  }

  seek(entryIdentifier: string, positionSeconds: number): Promise<void> {
    return this.apply(this.dispatcher.playbackCommand(context => this.native.seek(context, entryIdentifier,
      Math.round(positionSeconds * PlaybackTrackPolicy.millisecondsPerSecond))));
  }

  cancelPreparation(): void {
    this.generation += QueueControllerPolicy.generationIncrement;
  }

  private async prepare(
    tracks: readonly PlaybackTrack[],
    operation: (entries: readonly QueueEntry[], context: Parameters<PlayerQueueCommands['append']>[0]) => Promise<CommandResult>,
    isStillWanted: () => boolean = () => true,
  ): Promise<void> {
    const generation = this.generation;
    const capturedTracks = tracks.map(track => ({ ...track,
      ...(track.mediaSource === undefined ? {} : { mediaSource: copyMediaSourceConfiguration(track.mediaSource) }),
      ...(track.mediaRequest === undefined ? {} : { mediaRequest: copyMediaRequestConfiguration(track.mediaRequest) }),
    }));
    const isCurrent = () => generation === this.generation && isStillWanted();
    const snapshot = await this.dispatcher.getSnapshot();
    const context: CommandContext = { requestIdentifier: this.identifiers.nextIdentifier(),
      engineEpoch: snapshot.cursor.engineEpoch, authenticationEpoch: snapshot.cursor.authenticationEpoch };
    const prepared: PreparedPlaybackTrack[] = [];
    for (const track of capturedTracks) {
      this.requireCurrent(isCurrent);
      prepared.push(await this.mapper.prepare(track, this.identifiers.nextIdentifier()));
    }
    this.requireCurrent(isCurrent);
    const result = await this.preparation.execute(prepared, context, isCurrent, async (entries, views, stagedContext) => {
      const metadataStage = this.metadata.stage(views);
      let applied = false;
      try {
        const receipt = await this.dispatcher.queueCommand(currentContext => {
          this.requireCurrent(isCurrent);
          if (currentContext.engineEpoch !== stagedContext.engineEpoch
            || currentContext.authenticationEpoch !== stagedContext.authenticationEpoch) {
            throw new Error(PlayerDispatchPolicy.supersededMessage);
          }
          return operation(entries, currentContext);
        });
        applied = receipt.status === CommandResultStatus.Applied;
        return receipt;
      } finally { metadataStage.settle(applied); }
    });
    this.requireApplied(result);
  }

  private async apply(operation: Promise<CommandResult>): Promise<void> {
    this.requireApplied(await operation);
  }

  private requireApplied(result: CommandResult): void {
    if (result.status !== CommandResultStatus.Applied) throw new Error(QueueControllerPolicy.rejectedCommandMessage);
  }

  private requireCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) throw new Error(PlayerDispatchPolicy.supersededMessage);
  }
}

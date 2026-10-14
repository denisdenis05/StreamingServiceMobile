import { CommandResultStatus, MediaSourceOwnership, DefaultQueuePolicy, MediaSourceStorageAccounting, MediaSourcePolicy } from 'streaming-service-player';
import type { CommandContext, CommandResult, PlayerMediaSources, QueueEntry } from 'streaming-service-player';
import { copyMediaSourceConfiguration } from './PlaybackMediaConfiguration';
import type { PlaybackTrackView, PreparedPlaybackTrack } from './PlaybackTrack';

export type QueueSourceRegistry = Pick<PlayerMediaSources, 'registerMediaSource' | 'releaseMediaSource'>;
export type PreparedQueueOperation = (entries: readonly QueueEntry[], views: readonly PlaybackTrackView[], context: CommandContext) => Promise<CommandResult>;

export const QueueSourcePreparationPolicy = Object.freeze({
  missingEntryCount: 0,
  supersededMessage: 'The source preparation belongs to an earlier playback request.',
  duplicateEntryMessage: 'Queue source preparation requires unique occurrence identifiers.',
  capacityMessage: 'Source preparation exceeds the native queue source capacity.',
});

export class NativeQueueSourcePreparation {
  private readonly accounting = new MediaSourceStorageAccounting();
  private pendingPreparation: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sources: QueueSourceRegistry,
    private readonly reportCleanupFailure: (failure: unknown) => void,
  ) {}

  async execute(
    tracks: readonly PreparedPlaybackTrack[],
    context: CommandContext,
    isCurrent: () => boolean,
    operation: PreparedQueueOperation,
  ): Promise<CommandResult> {
    this.requireCurrent(isCurrent);
    const capturedContext = { ...context };
    const capturedTracks = this.captureTracks(tracks);
    const execution = this.pendingPreparation.then(() => this.executeCaptured(capturedTracks, capturedContext, isCurrent, operation));
    this.pendingPreparation = execution.catch(() => undefined);
    return execution;
  }

  private async executeCaptured(
    capturedTracks: readonly PreparedPlaybackTrack[],
    capturedContext: CommandContext,
    isCurrent: () => boolean,
    operation: PreparedQueueOperation,
  ): Promise<CommandResult> {
    const registrations: string[] = [];
    try {
      const entries: QueueEntry[] = [];
      for (const track of capturedTracks) {
        this.requireCurrent(isCurrent);
        if (track.source === null) entries.push(track.entry);
        else {
          const sourceIdentifier = await this.sources.registerMediaSource(capturedContext, track.source, MediaSourceOwnership.Queue);
          registrations.push(sourceIdentifier);
          this.requireCurrent(isCurrent);
          entries.push({ ...track.entry, sourceIdentifier });
        }
      }
      this.requireCurrent(isCurrent);
      const result = await operation(entries, capturedTracks.map(track => track.view), capturedContext);
      if (result.status === CommandResultStatus.Applied) registrations.length = QueueSourcePreparationPolicy.missingEntryCount;
      return result;
    } finally {
      for (const identifier of registrations) {
        try { await this.sources.releaseMediaSource(identifier); }
        catch (failure) { this.reportCleanupFailure(failure); }
      }
    }
  }

  private captureTracks(tracks: readonly PreparedPlaybackTrack[]): readonly PreparedPlaybackTrack[] {
    if (tracks.length > DefaultQueuePolicy.maximumEntries) throw new Error(QueueSourcePreparationPolicy.capacityMessage);
    const identifiers = new Set<string>();
    let configurationBytes = QueueSourcePreparationPolicy.missingEntryCount;
    for (const track of tracks) {
      if (track.entry.entryIdentifier.trim().length === QueueSourcePreparationPolicy.missingEntryCount || identifiers.has(track.entry.entryIdentifier) || track.entry.entryIdentifier !== track.view.entryIdentifier) {
        throw new Error(QueueSourcePreparationPolicy.duplicateEntryMessage);
      }
      identifiers.add(track.entry.entryIdentifier);
      if (track.source !== null) configurationBytes += this.accounting.configurationBytes(track.source);
      if (configurationBytes > MediaSourcePolicy.maximumSourceConfigurationBytes) throw new Error(QueueSourcePreparationPolicy.capacityMessage);
    }
    return tracks.map(track => ({ entry: { ...track.entry }, view: { ...track.view },
        source: track.source === null ? null : copyMediaSourceConfiguration(track.source) }));
  }

  private requireCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) throw new Error(QueueSourcePreparationPolicy.supersededMessage);
  }
}

import { DefaultQueuePolicy } from 'streaming-service-player';
import type { QueueEntry } from 'streaming-service-player';
import { PlaybackTrackPolicy } from './PlaybackTrack';
import type { PlaybackTrackView } from './PlaybackTrack';
import type { PlaybackTrackViewSource } from './NativeQueueProjection';

const DuplicateMetadataMessage = 'Playback metadata requires unique occurrence identifiers.';
export const MetadataRetentionPolicy = Object.freeze({
  concurrentQueueGenerations: 2,
  capacityMessage: 'Playback metadata exceeds the current and staged queue capacity.',
});
const MaximumMetadataOccurrences = DefaultQueuePolicy.maximumEntries * MetadataRetentionPolicy.concurrentQueueGenerations;

export interface PlaybackMetadataStage {
  settle(applied: boolean): void;
}

export class PlaybackMetadataRegistry implements PlaybackTrackViewSource {
  private readonly views = new Map<string, PlaybackTrackView>();
  private readonly stages = new Map<string, object>();
  private observedIdentifiers = new Set<string>();

  stage(views: readonly PlaybackTrackView[]): PlaybackMetadataStage {
    const identifiers = views.map(view => view.entryIdentifier);
    if (new Set(identifiers).size !== identifiers.length
      || identifiers.some(identifier => this.views.has(identifier))) throw new Error(DuplicateMetadataMessage);
    if (this.views.size + views.length > MaximumMetadataOccurrences) throw new Error(MetadataRetentionPolicy.capacityMessage);
    const stage = {};
    for (const view of views) {
      this.views.set(view.entryIdentifier, Object.freeze({ ...view }));
      this.stages.set(view.entryIdentifier, stage);
    }
    return { settle: applied => {
      for (const identifier of identifiers) {
        if (this.stages.get(identifier) !== stage) continue;
        this.stages.delete(identifier);
        if (!applied && !this.observedIdentifiers.has(identifier)) this.views.delete(identifier);
      }
    } };
  }

  observe(views: readonly PlaybackTrackView[], currentEntry: QueueEntry | null): void {
    this.observedIdentifiers = new Set(views.map(view => view.entryIdentifier));
    if (currentEntry !== null) this.observedIdentifiers.add(currentEntry.entryIdentifier);
    for (const identifier of this.views.keys()) {
      if (!this.observedIdentifiers.has(identifier) && !this.stages.has(identifier)) this.views.delete(identifier);
    }
  }

  observeCurrentEntry(entry: QueueEntry | null): void {
    if (entry !== null) this.observedIdentifiers.add(entry.entryIdentifier);
  }

  forget(identifiers: readonly string[]): void {
    for (const identifier of identifiers) {
      this.views.delete(identifier);
      this.observedIdentifiers.delete(identifier);
    }
  }

  viewFor(entry: QueueEntry): PlaybackTrackView {
    const known = this.views.get(entry.entryIdentifier);
    const artworkMatches = entry.artworkAddress === undefined || entry.artworkAddress === known?.artworkAddress;
    return {
      entryIdentifier: entry.entryIdentifier,
      title: entry.title ?? known?.title ?? PlaybackTrackPolicy.untitledTrack,
      artist: entry.artist ?? known?.artist ?? PlaybackTrackPolicy.unknownArtist,
      isLocalCached: known?.isLocalCached ?? false,
      ...(known?.recordingIdentifier === undefined && entry.recordingIdentifier === undefined ? {} : {
        recordingIdentifier: known?.recordingIdentifier ?? entry.recordingIdentifier!,
      }),
      ...(known?.albumIdentifier === undefined ? {} : { albumIdentifier: known.albumIdentifier }),
      ...(known?.sourceAlbumIdentifier === undefined || entry.playlistIdentifier !== undefined || known.playlistIdentifier !== undefined
        ? {} : { sourceAlbumIdentifier: known.sourceAlbumIdentifier }),
      ...(!artworkMatches || known?.smallArtworkAddress === undefined ? {} : { smallArtworkAddress: known.smallArtworkAddress }),
      ...(!artworkMatches || known?.thumbnailArtworkAddress === undefined ? {} : { thumbnailArtworkAddress: known.thumbnailArtworkAddress }),
      ...(known?.isLiked === undefined ? {} : { isLiked: known.isLiked }),
      ...(entry.album === undefined && known?.album === undefined ? {} : { album: entry.album ?? known?.album! }),
      ...(entry.artworkAddress === undefined && known?.artworkAddress === undefined ? {} : {
        artworkAddress: entry.artworkAddress ?? known?.artworkAddress!,
      }),
      ...(entry.playlistIdentifier === undefined && known?.playlistIdentifier === undefined ? {} : {
        playlistIdentifier: entry.playlistIdentifier ?? known?.playlistIdentifier!,
      }),
    };
  }

  clear(): void {
    this.views.clear();
    this.stages.clear();
    this.observedIdentifiers.clear();
  }
}

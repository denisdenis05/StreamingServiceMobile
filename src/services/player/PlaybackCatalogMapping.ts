import type { PlaybackTrack } from './PlaybackTrack';

export interface CatalogRecording {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  readonly releaseTitle: string;
  readonly releaseId?: string;
  readonly cover?: string;
  readonly isLiked?: boolean;
}
export const CatalogPlaybackPolicy = Object.freeze({ streamRoute: 'Stream?id=', pathSeparator: '/', firstEntryIndex: 0 });
export class PlaybackCatalogMapping {
  constructor(private readonly serverAddress: string, private readonly placeholderArtwork: string) {}
  map(recording: CatalogRecording, albumIdentifier?: string, playlistIdentifier?: string): PlaybackTrack {
    const address = this.serverAddress.endsWith(CatalogPlaybackPolicy.pathSeparator)
      ? this.serverAddress : this.serverAddress + CatalogPlaybackPolicy.pathSeparator;
    return { recordingIdentifier: recording.id, mediaAddress: address + CatalogPlaybackPolicy.streamRoute + encodeURIComponent(recording.id),
      title: recording.title, artist: recording.artistName, album: recording.releaseTitle,
      artworkAddress: recording.cover || this.placeholderArtwork,
      ...(recording.releaseId === undefined && albumIdentifier === undefined ? {} : { albumIdentifier: recording.releaseId ?? albumIdentifier! }),
      ...(playlistIdentifier === undefined ? {} : { playlistIdentifier }),
      ...(recording.isLiked === undefined ? {} : { isLiked: recording.isLiked }),
    };
  }
}

import type { PlaybackTrackView } from './PlaybackTrack';

export interface PlaybackListeningPayload {
  readonly trackId: string;
  readonly artist: string;
  readonly track: string;
  readonly album: string;
  readonly durationSeconds: number;
  readonly isLocalCached: boolean;
  readonly sourceAlbumId: string | null;
  readonly playlistId: string | null;
}

export const PlaybackListeningPolicy = Object.freeze({ unknownAlbum: 'Unknown Album' });

export function createPlaybackListeningPayload(
  view: PlaybackTrackView & { readonly recordingIdentifier: string },
  durationSeconds: number,
): PlaybackListeningPayload {
  return {
    trackId: view.recordingIdentifier,
    artist: view.artist,
    track: view.title,
    album: view.album ?? PlaybackListeningPolicy.unknownAlbum,
    durationSeconds,
    isLocalCached: view.isLocalCached,
    sourceAlbumId: view.playlistIdentifier === undefined ? view.sourceAlbumIdentifier ?? null : null,
    playlistId: view.playlistIdentifier ?? null,
  };
}

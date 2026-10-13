import type { MediaSourceConfiguration, MediaRequestConfiguration, QueueEntry } from 'streaming-service-player';

export interface PlaybackTrack {
  readonly recordingIdentifier?: string;
  readonly mediaAddress: string;
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  readonly albumIdentifier?: string;
  readonly artworkAddress?: string;
  readonly playlistIdentifier?: string;
  readonly isLiked?: boolean;
  readonly durationSeconds?: number;
  readonly mediaRequest?: MediaRequestConfiguration;
  readonly mediaSource?: MediaSourceConfiguration;
}

export interface PlaybackTrackView {
  readonly entryIdentifier: string;
  readonly recordingIdentifier?: string;
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
  readonly albumIdentifier?: string;
  readonly artworkAddress?: string;
  readonly playlistIdentifier?: string;
  readonly isLiked?: boolean;
  readonly isLocalCached: boolean;
}

export interface PreparedPlaybackTrack {
  readonly entry: QueueEntry;
  readonly source: MediaSourceConfiguration | null;
  readonly view: PlaybackTrackView;
}

export interface PlaybackCacheReader {
  findReadableCachedAddress(mediaAddress: string): Promise<string | null>;
}

export const PlaybackTrackPolicy = Object.freeze({
  millisecondsPerSecond: 1000,
  minimumDurationSeconds: 0,
  maximumDurationMilliseconds: Number.MAX_SAFE_INTEGER,
  unknownArtist: 'Unknown Artist',
  untitledTrack: 'Untitled',
  pathSeparator: '/',
  catalogStreamRoute: 'Stream?id=',
  localFileAddressPrefix: 'file://',
  missingAddressMessage: 'A media address is required.',
  invalidDurationMessage: 'The playback duration is invalid.',
});

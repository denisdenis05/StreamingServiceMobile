import type { CatalogRecording } from '../player/PlaybackCatalogMapping';

export const RecommendationModes = Object.freeze({
  daily: 'daily',
  songRadio: 'song-radio',
  artistRadio: 'artist-radio',
  smartShuffle: 'smart-shuffle',
  playlistRadio: 'playlist-radio',
  calm: 'calm',
  energy: 'energy',
  instrumental: 'instrumental',
});
export const RecommendationRoutes = Object.freeze({
  screen: 'Recommendations',
  base: 'api/recommendations',
  overview: 'api/recommendations/overview',
  collections: 'api/recommendations/collections',
  preview: 'api/recommendations/preview',
  daily: 'api/recommendations/daily',
  regenerate: 'api/recommendations/daily/regenerate',
  generate: 'api/recommendations/generate',
  playlists: 'api/recommendations/playlists',
  playing: 'Playing',
});
export interface RecommendationRequest {
  readonly mode: string;
  readonly recordingId?: string;
  readonly artistId?: string;
  readonly playlistId?: string;
  readonly continuationToken?: string;
  readonly exclude?: readonly string[];
}
export interface RecommendationPage {
  readonly tracks: readonly CatalogRecording[];
  readonly continuationToken: string | null;
  readonly explanation: string;
  readonly featureGeneration: string;
  readonly mode: string;
}
export interface RecommendationPlaylistPreview {
  readonly request: RecommendationRequest;
  readonly page: RecommendationPage;
  readonly cover: string;
  readonly dailyVersion: string | null;
  readonly savedPlaylistId: string | null;
}
export interface DailyRecommendationMix {
  readonly version: string;
  readonly day: string;
  readonly tracks: readonly CatalogRecording[];
  readonly savedPlaylistId: string | null;
}
export interface RecommendationOverview {
  readonly analyzedTracks: number;
  readonly cards: readonly {
    readonly mode: string;
    readonly title: string;
    readonly description: string;
  }[];
}

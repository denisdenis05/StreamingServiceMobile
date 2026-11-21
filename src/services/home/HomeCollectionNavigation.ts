import type { RecommendationPlaylistPreview } from '../recommendations/RecommendationContracts';

export enum HomeCollectionType { Album = 'Album', Playlist = 'Playlist', Recommendation = 'Recommendation' }
export interface HomeCollectionCard {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  readonly cover: string;
  readonly smallCover?: string;
  readonly verySmallCover?: string;
  readonly type?: string;
  readonly canEdit?: boolean;
  readonly recommendation?: RecommendationPlaylistPreview;
}
export const HomeCollectionRoutes = Object.freeze({ album: 'AlbumViewer', playlist: 'PlaylistViewer' });
export function homeCollectionDestination(card: HomeCollectionCard) {
  if (card.type === HomeCollectionType.Recommendation && card.recommendation) return {
    route: HomeCollectionRoutes.playlist,
    parameters: {
      playlistTitle: card.title, playlistOwner: card.artistName, playlistCover: card.cover,
      recommendation: card.recommendation,
    },
  };
  if (card.type === HomeCollectionType.Playlist) return {
    route: HomeCollectionRoutes.playlist,
    parameters: {
      playlistId: card.id, playlistTitle: card.title, playlistOwner: card.artistName,
      playlistCover: card.cover, isOwner: card.canEdit === true,
    },
  };
  if (card.type !== undefined && card.type !== HomeCollectionType.Album) return null;
  return {
    route: HomeCollectionRoutes.album,
    parameters: {
      albumId: card.id, albumTitle: card.title, albumArtist: card.artistName,
      albumCover: card.cover, albumSmallCover: card.smallCover, albumVerySmallCover: card.verySmallCover,
    },
  };
}

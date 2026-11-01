export enum HomeCollectionType { Album = 'Album', Playlist = 'Playlist' }
export interface HomeCollectionCard {
  readonly id: string;
  readonly title: string;
  readonly artistName: string;
  readonly cover: string;
  readonly smallCover?: string;
  readonly verySmallCover?: string;
  readonly type?: string;
  readonly canEdit?: boolean;
}
export const HomeCollectionRoutes = Object.freeze({ album: 'AlbumViewer', playlist: 'PlaylistViewer' });
export function homeCollectionDestination(card: HomeCollectionCard) {
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

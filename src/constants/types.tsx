export interface Recording {
  id: string;
  title: string;
  artistName: string;
  releaseId?: string;
  releaseTitle: string;
  cover: string;
  smallCover?: string;
  verySmallCover?: string;
  isLiked?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artistName: string;
  cover: string;
  smallCover: string;
  verySmallCover: string;
}

export interface Artist {
  id: string;
  name: string;
  image: string | null;
}

export interface Track {
  id: string;
  title: string;
  artistName: string;
  releaseId?: string;
  releaseTitle: string;
  cover: string;
  smallCover: string;
  verySmallCover: string;
  positionInAlbum: number;
  url?: string;
  isLiked?: boolean;
}

export interface SearchResults {
  bestMatch: {
    type: string;
    data: Artist | Track | Album;
  };
  artists: Artist[];
  tracks: Track[];
  albums: Album[];
  playlists: any[];
}

export enum RepeatingType {
  None = 0,
  Album = 1,
  Song = 2,
}

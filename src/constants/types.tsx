export interface Recording {
  id: string;
  title: string;
  artistName: string;
  releaseTitle: string;
  cover: string;
}

export interface Album {
  id: string;
  title: string;
  artistName: string;
  cover: string;
}

export enum RepeatingType {
  None = 0,
  Album = 1,
  Song = 2,
}

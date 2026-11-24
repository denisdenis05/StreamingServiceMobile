export const ArtistRoutes = Object.freeze({ screen: 'Artist' });
export interface ArtistParameters {
  readonly artistId?: string;
  readonly artistName?: string;
  readonly artistImage?: string;
  readonly recordingId?: string;
  readonly albumId?: string;
}
export function artistMenuDestination(parameters?: {
  readonly artistId?: string;
  readonly albumArtist?: string;
  readonly recordingIds?: readonly string[];
  readonly albumId?: string;
}): ArtistParameters | null {
  const firstRecordingIndex = 0;
  const recordingId = parameters?.recordingIds?.[firstRecordingIndex];
  if (!parameters?.artistId && !recordingId && !parameters?.albumId)
    return null;
  return {
    ...(parameters?.artistId ? { artistId: parameters.artistId } : {}),
    ...(parameters?.albumArtist ? { artistName: parameters.albumArtist } : {}),
    ...(recordingId ? { recordingId } : {}),
    ...(parameters?.albumId ? { albumId: parameters.albumId } : {}),
  };
}

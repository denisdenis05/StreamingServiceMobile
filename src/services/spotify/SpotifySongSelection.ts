export interface SpotifySelectedRecording {
  readonly identifier: string;
  readonly title: string;
  readonly author: string;
}

export interface SpotifySongSelection {
  readonly applicationAccountIdentifier: string | null;
  readonly recordings: readonly SpotifySelectedRecording[];
}

const SelectionPolicy = Object.freeze({ maximumRecordings: 100, firstPosition: 0, stringType: 'string', objectType: 'object' });

export function spotifySongSelection(songs: unknown, applicationAccountIdentifier: string | null): SpotifySongSelection {
  const identifiers = new Set<string>();
  const recordings = Array.isArray(songs) ? songs.slice(SelectionPolicy.firstPosition, SelectionPolicy.maximumRecordings).flatMap(value => {
    if (value === null || typeof value !== SelectionPolicy.objectType) return [];
    const recording = value as Record<string, unknown>;
    if (typeof recording.id !== SelectionPolicy.stringType || !(recording.id as string).trim()
      || typeof recording.title !== SelectionPolicy.stringType || typeof recording.artistName !== SelectionPolicy.stringType
      || identifiers.has(recording.id as string)) return [];
    identifiers.add(recording.id as string);
    return [Object.freeze({ identifier: recording.id as string, title: recording.title as string, author: recording.artistName as string })];
  }) : [];
  return Object.freeze({ applicationAccountIdentifier, recordings: Object.freeze(recordings) });
}

export function spotifyRouteSongSelection(value: unknown): SpotifySongSelection | null {
  if (value === null || typeof value !== SelectionPolicy.objectType) return null;
  const selection = value as Record<string, unknown>;
  if (selection.applicationAccountIdentifier !== null && typeof selection.applicationAccountIdentifier !== SelectionPolicy.stringType) return null;
  if (!Array.isArray(selection.recordings)) return null;
  const songs = selection.recordings.map(recording => {
    if (recording === null || typeof recording !== SelectionPolicy.objectType) return null;
    const source = recording as Record<string, unknown>;
    return { id: source.identifier, title: source.title, artistName: source.author };
  });
  return spotifySongSelection(songs, selection.applicationAccountIdentifier as string | null);
}

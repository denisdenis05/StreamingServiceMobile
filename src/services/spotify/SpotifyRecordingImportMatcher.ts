import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { RecordingImportMatch, RecordingImportMatcher, SpotifySong } from 'streaming-service-spotify-jam';
import { spotifyRecordingRequestFailure } from './SpotifyRecordingRequestFailure';

export interface SpotifyRecordingImportRequest {
  readonly name: string;
  readonly artistName: string;
  readonly releaseName: string;
}
export interface SpotifyRecordingImportDependencies {
  readonly preview: (tracks: readonly SpotifyRecordingImportRequest[], cancellation: AbortSignal) => Promise<unknown>;
  readonly isCurrent: () => boolean;
}
export const SpotifyRecordingImportPolicy = Object.freeze({ maximumCandidates: 20, emptyCount: 0, firstPosition: 0,
  emptyText: '', stringType: 'string', objectType: 'object', booleanType: 'boolean',
  recordingPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  emptyRecording: '00000000-0000-0000-0000-000000000000' } as const);

export class SpotifyRecordingImportMatcher implements RecordingImportMatcher {
  constructor(private readonly dependencies: SpotifyRecordingImportDependencies) {}
  async match(songs: readonly SpotifySong[], cancellation: AbortSignal): Promise<readonly RecordingImportMatch[]> {
    this.requireCurrent(cancellation);
    if (songs.length > SpotifyRecordingImportPolicy.maximumCandidates) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    if (songs.length === SpotifyRecordingImportPolicy.emptyCount) return Object.freeze([]);
    const captured = songs.map(song => Object.freeze({ identifier: song.identifier, name: song.title,
      artistName: song.artistNames?.[SpotifyRecordingImportPolicy.firstPosition] ?? song.author,
      releaseName: song.releaseTitle ?? SpotifyRecordingImportPolicy.emptyText }));
    const requests = captured.map(({ name, artistName, releaseName }) => Object.freeze({ name, artistName, releaseName }));
    try {
      const response = await this.dependencies.preview(Object.freeze(requests), cancellation);
      this.requireCurrent(cancellation);
      if (!Array.isArray(response) || response.length !== captured.length) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      const matches: RecordingImportMatch[] = [];
      response.forEach((supplied: unknown, position: number) => {
        const source = captured[position]!;
        if (typeof supplied !== SpotifyRecordingImportPolicy.objectType || supplied === null || Array.isArray(supplied)) {
          throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
        }
        const item = supplied as Record<string, unknown>;
        if (item.originalName !== source.name || item.originalArtist !== source.artistName || item.originalAlbum !== source.releaseName
          || [item.isAvailable, item.isExactMatch, item.isSuggested].some(value => typeof value !== SpotifyRecordingImportPolicy.booleanType)
          || typeof item.matchedRecordingId !== SpotifyRecordingImportPolicy.stringType || !SpotifyRecordingImportPolicy.recordingPattern.test(item.matchedRecordingId as string)) {
          throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
        }
        if (item.matchedRecordingId === SpotifyRecordingImportPolicy.emptyRecording) return;
        matches.push(Object.freeze({ spotifyIdentifier: source.identifier, recordingIdentifier: item.matchedRecordingId as string,
          exact: item.isAvailable === true && item.isExactMatch === true && item.isSuggested === false }));
      });
      return Object.freeze(matches);
    } catch (failure) {
      this.requireCurrent(cancellation);
      throw spotifyRecordingRequestFailure(failure, cancellation);
    }
  }
  private requireCurrent(cancellation: AbortSignal): void {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    if (!this.dependencies.isCurrent()) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
}

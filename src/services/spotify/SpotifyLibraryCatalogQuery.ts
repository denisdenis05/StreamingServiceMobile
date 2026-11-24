import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import { URL } from 'react-native-url-polyfill';
import type { CatalogSearch, CatalogSong, RecordingQuery } from 'streaming-service-spotify-jam';

export const SpotifyLibraryCatalogPolicy = Object.freeze({ maximumCandidates: 80, maximumCachedRecordings: 256, maximumObservedRecordings: 2001,
  firstPosition: 0, firstPage: 1, minimumLimit: 1, minimumDurationMilliseconds: 0, textType: 'string', objectType: 'object',
  route: 'Metadata/search/db', queryParameter: 'query', pageParameter: 'page', pageSizeParameter: 'pageSize' } as const);
export interface SpotifyLibraryCatalogDependencies {
  readonly primary: RecordingQuery;
  readonly read: (address: string, cancellation: AbortSignal) => Promise<unknown>;
  readonly observedRecordings: () => readonly CatalogSong[];
  readonly isCurrent: () => boolean;
}
export class SpotifyLibraryCatalogQuery implements RecordingQuery {
  private readonly cached = new Map<string, CatalogSong>();
  private unavailable = false;
  private retired = false;
  constructor(private readonly baseAddress: string, private readonly dependencies: SpotifyLibraryCatalogDependencies) {}
  async lookup(identifier: string, cancellation: AbortSignal): Promise<CatalogSong | null> {
    this.requireCurrent(cancellation);
    if (!identifier.trim()) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    if (!this.unavailable) {
      const primary = await this.dependencies.primary.lookup(identifier, cancellation);
      this.requireCurrent(cancellation);
      if (primary !== null) {
        if (primary.identifier !== identifier) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
        return this.remember(this.withKnownDuration(primary));
      }
    }
    this.requireCurrent(cancellation);
    const observed = this.observed(identifier);
    if (observed) return this.remember(observed);
    return this.cached.get(identifier) ?? null;
  }
  async search(search: CatalogSearch, cancellation: AbortSignal): Promise<readonly CatalogSong[]> {
    this.requireCurrent(cancellation);
    if (!search.title.trim() || !search.author.trim() || !Number.isSafeInteger(search.limit) || search.limit < SpotifyLibraryCatalogPolicy.minimumLimit) {
      throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    }
    const captured = Object.freeze({ ...search, limit: Math.min(search.limit, SpotifyLibraryCatalogPolicy.maximumCandidates) });
    if (!this.unavailable) {
      try {
        const primary = await this.dependencies.primary.search(captured, cancellation);
        this.requireCurrent(cancellation);
        return Object.freeze(primary.slice(SpotifyLibraryCatalogPolicy.firstPosition, captured.limit).map(recording => this.remember(this.withKnownDuration(recording))));
      } catch (failure) {
        this.requireCurrent(cancellation);
        if (!(failure instanceof IntegrationFailure) || failure.code !== IntegrationFailureCode.NotFound) throw failure;
        this.unavailable = true;
      }
    }
    const address = new URL(SpotifyLibraryCatalogPolicy.route, this.baseAddress);
    address.searchParams.set(SpotifyLibraryCatalogPolicy.queryParameter, captured.title);
    address.searchParams.set(SpotifyLibraryCatalogPolicy.pageParameter, String(SpotifyLibraryCatalogPolicy.firstPage));
    address.searchParams.set(SpotifyLibraryCatalogPolicy.pageSizeParameter, String(captured.limit));
    const response = await this.dependencies.read(address.toString(), cancellation);
    this.requireCurrent(cancellation);
    if (!response || typeof response !== SpotifyLibraryCatalogPolicy.objectType) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    const result = response as { readonly tracks?: unknown; readonly fuzzyTracks?: unknown };
    if (!Array.isArray(result.tracks) || (result.fuzzyTracks !== undefined && !Array.isArray(result.fuzzyTracks))) {
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    }
    const candidates = [...result.tracks.slice(SpotifyLibraryCatalogPolicy.firstPosition, captured.limit),
      ...(result.fuzzyTracks ?? []).slice(SpotifyLibraryCatalogPolicy.firstPosition, captured.limit)]
      .slice(SpotifyLibraryCatalogPolicy.firstPosition, captured.limit).map(value => this.decode(value));
    return Object.freeze(candidates.map(recording => this.remember(recording)));
  }
  private decode(value: unknown): CatalogSong {
    if (!value || typeof value !== SpotifyLibraryCatalogPolicy.objectType) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    const recording = value as { readonly id: string; readonly title: string; readonly artistName: string };
    return this.withKnownDuration({ identifier: recording.id, title: recording.title, author: recording.artistName });
  }
  private withKnownDuration(recording: CatalogSong): CatalogSong {
    const decoded = this.validated(recording);
    if (decoded.durationMilliseconds !== undefined) return decoded;
    const known = this.observed(decoded.identifier) ?? this.cached.get(decoded.identifier);
    if (!known || known.title !== decoded.title || known.author !== decoded.author || known.durationMilliseconds === undefined) return decoded;
    return this.validated({ ...decoded, durationMilliseconds: known.durationMilliseconds });
  }
  private observed(identifier: string): CatalogSong | undefined {
    return this.dependencies.observedRecordings().slice(SpotifyLibraryCatalogPolicy.firstPosition, SpotifyLibraryCatalogPolicy.maximumObservedRecordings)
      .find(recording => recording.identifier === identifier);
  }
  private validated(recording: CatalogSong): CatalogSong {
    if (![recording.identifier, recording.title, recording.author].every(value => typeof value === SpotifyLibraryCatalogPolicy.textType && value.trim())
      || recording.durationMilliseconds !== undefined && (!Number.isFinite(recording.durationMilliseconds)
        || recording.durationMilliseconds < SpotifyLibraryCatalogPolicy.minimumDurationMilliseconds)) {
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    }
    return Object.freeze({ ...recording,
      ...(recording.artistNames === undefined ? {} : { artistNames: Object.freeze([...recording.artistNames]) }),
      ...(recording.recordingCodes === undefined ? {} : { recordingCodes: Object.freeze([...recording.recordingCodes]) }) });
  }
  private remember(recording: CatalogSong): CatalogSong {
    const song = this.validated(recording);
    this.cached.delete(song.identifier);
    this.cached.set(song.identifier, song);
    while (this.cached.size > SpotifyLibraryCatalogPolicy.maximumCachedRecordings) {
      const oldest = this.cached.keys().next().value;
      if (oldest === undefined) break;
      this.cached.delete(oldest);
    }
    return song;
  }
  private requireCurrent(cancellation: AbortSignal): void {
    if (this.retired || !this.dependencies.isCurrent()) {
      this.retired = true; this.cached.clear();
      throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    }
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
  }
}

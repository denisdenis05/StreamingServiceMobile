import type { CatalogSong } from 'streaming-service-spotify-jam';

export const SpotifyObservedRecordingPolicy = Object.freeze({ maximumRecordings: 2001, maximumIdentifierCharacters: 512,
  maximumMetadataCharacters: 2048, maximumScopeCharacters: 4096, emptyCount: 0, singleCount: 1, initialRevision: 0,
  millisecondsPerSecond: 1000, minimumDurationSeconds: 0, maximumDurationMilliseconds: Number.MAX_SAFE_INTEGER,
  stringType: 'string', numberType: 'number', controlCharacters: /[\u0000-\u001f\u007f]/ });

export interface SpotifyObservedRecordingInput {
  readonly recordingIdentifier?: string;
  readonly title?: string;
  readonly artist?: string;
  readonly durationSeconds?: number;
  readonly durationMilliseconds?: number;
}

export interface SpotifyObservedRecordingScope {
  readonly identifier: string;
  readonly revision: number;
}

export interface SpotifyObservedRecordingDependencies {
  readonly getScope: () => string | null;
  readonly maximumRecordings?: number;
}

export class SpotifyObservedRecordingStore {
  private readonly recordings = new Map<string, CatalogSong>();
  private readonly maximumRecordings: number;
  private scope: SpotifyObservedRecordingScope | null = null;
  private revision: number = SpotifyObservedRecordingPolicy.initialRevision;

  constructor(private readonly dependencies: SpotifyObservedRecordingDependencies) {
    const maximum = dependencies.maximumRecordings ?? SpotifyObservedRecordingPolicy.maximumRecordings;
    if (!Number.isSafeInteger(maximum) || maximum <= SpotifyObservedRecordingPolicy.emptyCount
      || maximum > SpotifyObservedRecordingPolicy.maximumRecordings) throw new RangeError();
    this.maximumRecordings = maximum;
  }

  readonly scopeChanged = (): void => { this.synchronizeScope(); };

  captureScope(): SpotifyObservedRecordingScope | null {
    this.synchronizeScope();
    return this.scope;
  }

  observeScope(subscribe: (listener: () => void) => () => void): () => void {
    const stop = subscribe(this.scopeChanged);
    this.synchronizeScope();
    return stop;
  }

  remember(tracks: readonly SpotifyObservedRecordingInput[], capturedScope: SpotifyObservedRecordingScope | null = this.captureScope()): void {
    this.synchronizeScope();
    if (capturedScope === null || capturedScope !== this.scope) return;
    for (const track of tracks.slice(-this.maximumRecordings)) {
      const recording = this.captureRecording(track);
      this.synchronizeScope();
      if (capturedScope !== this.scope) return;
      if (!recording) continue;
      this.recordings.delete(recording.identifier);
      this.recordings.set(recording.identifier, recording);
      while (this.recordings.size > this.maximumRecordings) {
        const oldest = this.recordings.keys().next().value;
        if (oldest === undefined) break;
        this.recordings.delete(oldest);
      }
    }
  }

  read(): readonly CatalogSong[] {
    this.synchronizeScope();
    return Object.freeze([...this.recordings.values()]);
  }

  private synchronizeScope(): void {
    let identifier: string | null;
    try { identifier = this.dependencies.getScope(); } catch { identifier = null; }
    if (identifier !== null && !this.validText(identifier, SpotifyObservedRecordingPolicy.maximumScopeCharacters)) identifier = null;
    if (identifier === (this.scope?.identifier ?? null)) return;
    this.recordings.clear();
    this.revision += SpotifyObservedRecordingPolicy.singleCount;
    this.scope = identifier !== null && Number.isSafeInteger(this.revision)
      ? Object.freeze({ identifier, revision: this.revision }) : null;
  }

  private captureRecording(track: SpotifyObservedRecordingInput): CatalogSong | null {
    try {
      const identifier = track.recordingIdentifier;
      const title = track.title;
      const author = track.artist;
      const durationSeconds = track.durationSeconds;
      const observedDurationMilliseconds = track.durationMilliseconds;
      if (!this.validText(identifier, SpotifyObservedRecordingPolicy.maximumIdentifierCharacters)
        || !this.validText(title, SpotifyObservedRecordingPolicy.maximumMetadataCharacters)
        || !this.validText(author, SpotifyObservedRecordingPolicy.maximumMetadataCharacters)) return null;
      const durationMilliseconds = Number.isSafeInteger(observedDurationMilliseconds)
        && observedDurationMilliseconds! > SpotifyObservedRecordingPolicy.minimumDurationSeconds
        ? observedDurationMilliseconds
        : typeof durationSeconds === SpotifyObservedRecordingPolicy.numberType
        && Number.isFinite(durationSeconds) && durationSeconds! > SpotifyObservedRecordingPolicy.minimumDurationSeconds
        ? durationSeconds! * SpotifyObservedRecordingPolicy.millisecondsPerSecond : undefined;
      return Object.freeze({ identifier, title, author,
        ...(durationMilliseconds !== undefined && Number.isSafeInteger(durationMilliseconds)
          && durationMilliseconds <= SpotifyObservedRecordingPolicy.maximumDurationMilliseconds ? { durationMilliseconds } : {}) });
    } catch { return null; }
  }

  private validText(value: unknown, maximumCharacters: number): value is string {
    return typeof value === SpotifyObservedRecordingPolicy.stringType && Boolean((value as string).trim())
      && (value as string).length <= maximumCharacters && !SpotifyObservedRecordingPolicy.controlCharacters.test(value as string);
  }
}

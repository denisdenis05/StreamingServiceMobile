export const LikedSongsSettingsPolicy = Object.freeze({
  selectionRoute: 'Library/liked-songs-playlist',
  playlistsRoute: 'Library/playlists',
  loadFailure:
    'Could not load your Liked Songs setting. Check your connection and try again.',
  saveFailure:
    'Could not confirm your Liked Songs playlist. Refresh to check the saved choice, then try again.',
  signInRequired: 'Sign in to choose your Liked Songs playlist.',
  invalidSelection:
    'Choose one of your playlists or use automatic Liked Songs.',
  untitledPlaylist: 'Untitled playlist',
  maximumIdentifierCharacters: 128,
  maximumNameCharacters: 512,
  minimumCharacters: 1,
  minimumRecordingCount: 0,
  stringType: 'string',
  objectType: 'object',
});
export interface LikedSongsPlaylistChoice {
  readonly identifier: string;
  readonly name: string;
  readonly recordingCount: number;
}
export interface LikedSongsSettingsReading {
  readonly selection: unknown;
  readonly playlists: unknown;
}
export interface LikedSongsSettingsSnapshot {
  readonly accountIdentifier: string | null;
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly playlists: readonly LikedSongsPlaylistChoice[];
  readonly selectedPlaylistIdentifier: string | null;
  readonly error: string | null;
}
export interface LikedSongsSettingsDependencies {
  readonly accountIdentifier: () => string | null;
  readonly subscribeAccount: (listener: () => void) => () => void;
  readonly read: (
    accountIdentifier: string,
    signal: AbortSignal,
  ) => Promise<LikedSongsSettingsReading>;
  readonly write: (
    accountIdentifier: string,
    playlistIdentifier: string | null,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly notifyLibraryChanged: () => void;
}
const EmptySettings: LikedSongsSettingsSnapshot = Object.freeze({
  accountIdentifier: null,
  loaded: false,
  loading: false,
  saving: false,
  playlists: Object.freeze([]),
  selectedPlaylistIdentifier: null,
  error: null,
});
function record(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== LikedSongsSettingsPolicy.objectType ||
    Array.isArray(value)
  )
    throw new Error(LikedSongsSettingsPolicy.loadFailure);
  return value as Record<string, unknown>;
}
function identifier(value: unknown): value is string {
  return (
    typeof value === LikedSongsSettingsPolicy.stringType &&
    (value as string).trim().length >=
      LikedSongsSettingsPolicy.minimumCharacters &&
    (value as string).length <=
      LikedSongsSettingsPolicy.maximumIdentifierCharacters
  );
}
export function decodeLikedSongsSelection(value: unknown): string | null {
  const selection = record(value).playlistId;
  if (selection !== null && !identifier(selection))
    throw new Error(LikedSongsSettingsPolicy.loadFailure);
  return selection;
}
export function decodeLikedSongsPlaylists(
  value: unknown,
): readonly LikedSongsPlaylistChoice[] {
  if (!Array.isArray(value))
    throw new Error(LikedSongsSettingsPolicy.loadFailure);
  const identifiers = new Set<string>();
  return Object.freeze(
    value.map(candidate => {
      const playlist = record(candidate);
      if (
        !identifier(playlist.id) ||
        identifiers.has(playlist.id) ||
        (playlist.name !== null &&
          (typeof playlist.name !== LikedSongsSettingsPolicy.stringType ||
            (playlist.name as string).length >
              LikedSongsSettingsPolicy.maximumNameCharacters)) ||
        !Number.isSafeInteger(playlist.recordingCount) ||
        (playlist.recordingCount as number) <
          LikedSongsSettingsPolicy.minimumRecordingCount
      )
        throw new Error(LikedSongsSettingsPolicy.loadFailure);
      identifiers.add(playlist.id);
      return Object.freeze({
        identifier: playlist.id,
        name:
          (playlist.name as string | null)?.trim() ||
          LikedSongsSettingsPolicy.untitledPlaylist,
        recordingCount: playlist.recordingCount as number,
      });
    }),
  );
}
export class LikedSongsSettingsService {
  private snapshot = EmptySettings;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeAccount: () => void;
  private request: AbortController | null = null;
  private disposed = false;
  constructor(private readonly dependencies: LikedSongsSettingsDependencies) {
    this.unsubscribeAccount = dependencies.subscribeAccount(
      this.accountChanged,
    );
    this.accountChanged();
  }
  readonly getSnapshot = (): LikedSongsSettingsSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly refresh = async (): Promise<void> => {
    if (this.disposed || this.snapshot.saving || this.snapshot.loading) return;
    const accountIdentifier = this.dependencies.accountIdentifier();
    if (accountIdentifier === null) {
      this.publish({
        ...EmptySettings,
        error: LikedSongsSettingsPolicy.signInRequired,
      });
      return;
    }
    const request = this.beginRequest();
    this.publish({
      ...this.snapshot,
      accountIdentifier,
      loading: true,
      error: null,
    });
    if (!this.current(accountIdentifier, request)) return;
    try {
      const reading = await this.dependencies.read(
        accountIdentifier,
        request.signal,
      );
      if (!this.current(accountIdentifier, request)) return;
      const selectedPlaylistIdentifier = decodeLikedSongsSelection(
        reading.selection,
      );
      const playlists = decodeLikedSongsPlaylists(reading.playlists);
      this.publish({
        ...this.snapshot,
        selectedPlaylistIdentifier,
        playlists,
        loaded: true,
        loading: false,
      });
    } catch {
      if (this.current(accountIdentifier, request))
        this.publish({
          ...this.snapshot,
          loading: false,
          error: LikedSongsSettingsPolicy.loadFailure,
        });
    }
  };
  readonly saveSelection = async (
    playlistIdentifier: string | null,
  ): Promise<void> => {
    if (this.disposed || this.snapshot.saving || this.snapshot.loading) return;
    const accountIdentifier = this.dependencies.accountIdentifier();
    if (accountIdentifier === null) {
      this.publish({
        ...EmptySettings,
        error: LikedSongsSettingsPolicy.signInRequired,
      });
      return;
    }
    if (
      !this.snapshot.loaded ||
      (playlistIdentifier !== null &&
        !this.snapshot.playlists.some(
          playlist => playlist.identifier === playlistIdentifier,
        ))
    ) {
      this.publish({
        ...this.snapshot,
        error: LikedSongsSettingsPolicy.invalidSelection,
      });
      return;
    }
    if (playlistIdentifier === this.snapshot.selectedPlaylistIdentifier) return;
    const request = this.beginRequest();
    this.publish({ ...this.snapshot, saving: true, error: null });
    if (!this.current(accountIdentifier, request)) return;
    try {
      const response = await this.dependencies.write(
        accountIdentifier,
        playlistIdentifier,
        request.signal,
      );
      if (!this.current(accountIdentifier, request)) return;
      const selectedPlaylistIdentifier = decodeLikedSongsSelection(response);
      if (selectedPlaylistIdentifier !== playlistIdentifier)
        throw new Error(LikedSongsSettingsPolicy.saveFailure);
      this.publish({
        ...this.snapshot,
        saving: false,
        selectedPlaylistIdentifier,
      });
      if (!this.current(accountIdentifier, request)) return;
      try {
        this.dependencies.notifyLibraryChanged();
      } catch {}
    } catch {
      if (this.current(accountIdentifier, request))
        this.publish({
          ...this.snapshot,
          saving: false,
          error: LikedSongsSettingsPolicy.saveFailure,
        });
    }
  };
  dispose(): void {
    this.disposed = true;
    this.request?.abort();
    this.unsubscribeAccount();
    this.listeners.clear();
  }
  private readonly accountChanged = (): void => {
    if (this.disposed) return;
    const accountIdentifier = this.dependencies.accountIdentifier();
    if (accountIdentifier === this.snapshot.accountIdentifier) return;
    this.request?.abort();
    this.request = null;
    this.publish({ ...EmptySettings, accountIdentifier });
    if (accountIdentifier !== null) void this.refresh();
  };
  private beginRequest(): AbortController {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    return request;
  }
  private current(
    accountIdentifier: string,
    request: AbortController,
  ): boolean {
    return (
      !this.disposed &&
      !request.signal.aborted &&
      request === this.request &&
      accountIdentifier === this.dependencies.accountIdentifier()
    );
  }
  private publish(snapshot: LikedSongsSettingsSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch {}
    });
  }
}

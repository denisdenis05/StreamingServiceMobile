import {
  decodeLikedSongsPlaylists,
  decodeLikedSongsSelection,
  LikedSongsSettingsPolicy,
  LikedSongsSettingsReading,
  LikedSongsSettingsService,
} from '../src/services/settings/LikedSongsSettingsService';

const Fixture = Object.freeze({
  account: 'first-account',
  otherAccount: 'second-account',
  playlist: 'playlist-identifier',
  otherPlaylist: 'other-playlist-identifier',
  name: 'Evening listening',
  otherName: 'Morning listening',
  privateFailure: 'private-server-response',
  privateField: 'private-credential',
  count: 12,
  otherCount: 3,
  invalidCount: -1,
  oneCall: 1,
  twoCalls: 2,
  firstPosition: 0,
  signalPosition: 1,
  emptyIdentifier: '',
});
const playlists = [
  { id: Fixture.playlist, name: Fixture.name, recordingCount: Fixture.count },
  {
    id: Fixture.otherPlaylist,
    name: Fixture.otherName,
    recordingCount: Fixture.otherCount,
  },
];
const reading: LikedSongsSettingsReading = {
  selection: { playlistId: Fixture.playlist },
  playlists,
};
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<Value>((completion, rejection) => {
    resolve = completion;
    reject = rejection;
  });
  return { promise, resolve, reject };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
function harness(initialAccount: string | null = Fixture.account) {
  let account = initialAccount;
  const accountListeners = new Set<() => void>();
  const dependencies = {
    accountIdentifier: () => account,
    subscribeAccount(listener: () => void) {
      accountListeners.add(listener);
      return () => {
        accountListeners.delete(listener);
      };
    },
    read: jest
      .fn<Promise<LikedSongsSettingsReading>, [string, AbortSignal]>()
      .mockResolvedValue(reading),
    write: jest
      .fn<Promise<unknown>, [string, string | null, AbortSignal]>()
      .mockImplementation(async (_accountIdentifier, playlistIdentifier) => ({
        playlistId: playlistIdentifier,
      })),
    notifyLibraryChanged: jest.fn(),
  };
  const service = new LikedSongsSettingsService(dependencies);
  return {
    service,
    dependencies,
    accountListeners,
    setAccount(value: string | null) {
      account = value;
      accountListeners.forEach(listener => listener());
    },
  };
}

test('Settings loads account selection and owned playlist choices without retaining extra fields', async () => {
  const { service, dependencies } = harness();
  await settle();
  expect(dependencies.read).toHaveBeenCalledWith(
    Fixture.account,
    expect.any(AbortSignal),
  );
  expect(service.getSnapshot()).toMatchObject({
    loaded: true,
    selectedPlaylistIdentifier: Fixture.playlist,
    loading: false,
    accountIdentifier: Fixture.account,
  });
  expect(service.getSnapshot().playlists).toEqual(
    playlists.map(playlist => ({
      identifier: playlist.id,
      name: playlist.name,
      recordingCount: playlist.recordingCount,
    })),
  );
  const choices = decodeLikedSongsPlaylists([
    { ...playlists[Fixture.firstPosition], credential: Fixture.privateField },
  ]);
  expect(JSON.stringify(choices)).not.toContain(Fixture.privateField);
  expect(Object.isFrozen(choices)).toBe(true);
});

test('Saving another owned playlist updates confirmed selection and publishes library change once', async () => {
  const { service, dependencies } = harness();
  await settle();
  await service.saveSelection(Fixture.otherPlaylist);
  expect(dependencies.write).toHaveBeenCalledWith(
    Fixture.account,
    Fixture.otherPlaylist,
    expect.any(AbortSignal),
  );
  expect(service.getSnapshot().selectedPlaylistIdentifier).toBe(
    Fixture.otherPlaylist,
  );
  expect(dependencies.notifyLibraryChanged).toHaveBeenCalledTimes(
    Fixture.oneCall,
  );
});

test('Automatic selection saves null while preserving owned playlists and duplicate saves do nothing', async () => {
  const { service, dependencies } = harness();
  await settle();
  await service.saveSelection(null);
  await service.saveSelection(null);
  expect(dependencies.write).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(service.getSnapshot().selectedPlaylistIdentifier).toBeNull();
  expect(service.getSnapshot().playlists).toHaveLength(Fixture.twoCalls);
});

test('A failed save preserves the previous setting and only exposes a safe retry message', async () => {
  const { service, dependencies } = harness();
  await settle();
  dependencies.write.mockRejectedValueOnce(new Error(Fixture.privateFailure));
  await service.saveSelection(Fixture.otherPlaylist);
  expect(service.getSnapshot()).toMatchObject({
    selectedPlaylistIdentifier: Fixture.playlist,
    saving: false,
    error: LikedSongsSettingsPolicy.saveFailure,
  });
  expect(dependencies.notifyLibraryChanged).not.toHaveBeenCalled();
});

test('An unconfirmed or malformed save response cannot publish a new selection', async () => {
  const { service, dependencies } = harness();
  await settle();
  dependencies.write.mockResolvedValueOnce({ playlistId: Fixture.playlist });
  await service.saveSelection(Fixture.otherPlaylist);
  expect(service.getSnapshot().selectedPlaylistIdentifier).toBe(
    Fixture.playlist,
  );
  expect(service.getSnapshot().error).toBe(
    LikedSongsSettingsPolicy.saveFailure,
  );
  dependencies.write.mockResolvedValueOnce(undefined);
  await service.saveSelection(null);
  expect(service.getSnapshot().selectedPlaylistIdentifier).toBe(
    Fixture.playlist,
  );
  expect(dependencies.notifyLibraryChanged).not.toHaveBeenCalled();
});

test('Busy saves reject duplicate commands and foreground refresh cannot cancel a write', async () => {
  const { service, dependencies } = harness();
  await settle();
  const saving = deferred<unknown>();
  dependencies.write.mockReturnValueOnce(saving.promise);
  const pending = service.saveSelection(Fixture.otherPlaylist);
  await service.saveSelection(null);
  await service.refresh();
  expect(dependencies.write).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(dependencies.read).toHaveBeenCalledTimes(Fixture.oneCall);
  saving.resolve({ playlistId: Fixture.otherPlaylist });
  await pending;
  expect(service.getSnapshot().selectedPlaylistIdentifier).toBe(
    Fixture.otherPlaylist,
  );
});

test('Only loaded owned choices can be selected and unavailable choices do not call the server', async () => {
  const { service, dependencies } = harness();
  await settle();
  await service.saveSelection(Fixture.privateField);
  expect(dependencies.write).not.toHaveBeenCalled();
  expect(service.getSnapshot().error).toBe(
    LikedSongsSettingsPolicy.invalidSelection,
  );
  const unavailable = harness(null);
  await unavailable.service.saveSelection(Fixture.playlist);
  expect(unavailable.service.getSnapshot().error).toBe(
    LikedSongsSettingsPolicy.signInRequired,
  );
  expect(unavailable.dependencies.write).not.toHaveBeenCalled();
});

test('Account changes abort pending reads and ignore delayed previous-account settings', async () => {
  const { service, dependencies, setAccount } = harness();
  await settle();
  const previousReading = deferred<LikedSongsSettingsReading>();
  dependencies.read
    .mockReturnValueOnce(previousReading.promise)
    .mockResolvedValue({ ...reading, selection: { playlistId: null } });
  const pending = service.refresh();
  const priorSignal =
    dependencies.read.mock.calls[Fixture.oneCall][Fixture.signalPosition];
  setAccount(Fixture.otherAccount);
  await settle();
  expect(priorSignal.aborted).toBe(true);
  previousReading.resolve(reading);
  await pending;
  expect(service.getSnapshot()).toMatchObject({
    accountIdentifier: Fixture.otherAccount,
    selectedPlaylistIdentifier: null,
  });
});

test('Logout aborts an in-flight save, clears private choices and prevents late notifications', async () => {
  const { service, dependencies, setAccount } = harness();
  await settle();
  const saving = deferred<unknown>();
  dependencies.write.mockReturnValueOnce(saving.promise);
  const pending = service.saveSelection(Fixture.otherPlaylist);
  setAccount(null);
  saving.resolve({ playlistId: Fixture.otherPlaylist });
  await pending;
  expect(service.getSnapshot()).toMatchObject({
    accountIdentifier: null,
    loaded: false,
    playlists: [],
    selectedPlaylistIdentifier: null,
    saving: false,
  });
  expect(dependencies.notifyLibraryChanged).not.toHaveBeenCalled();
});

test('Failed refresh preserves confirmed choices and permits a retry', async () => {
  const { service, dependencies } = harness();
  await settle();
  dependencies.read.mockRejectedValueOnce(new Error(Fixture.privateFailure));
  await service.refresh();
  expect(service.getSnapshot()).toMatchObject({
    loaded: true,
    loading: false,
    selectedPlaylistIdentifier: Fixture.playlist,
    error: LikedSongsSettingsPolicy.loadFailure,
  });
  await service.refresh();
  expect(service.getSnapshot().error).toBeNull();
});

test('Disposal aborts pending work and unsubscribes without accepting delayed results', async () => {
  const { service, dependencies, accountListeners } = harness();
  await settle();
  const refreshing = deferred<LikedSongsSettingsReading>();
  dependencies.read.mockReturnValueOnce(refreshing.promise);
  const pending = service.refresh();
  const listener = jest.fn();
  service.subscribe(listener);
  const beforeDisposal = service.getSnapshot();
  service.dispose();
  refreshing.resolve({ ...reading, selection: { playlistId: null } });
  await pending;
  expect(accountListeners.size).toBe(Fixture.firstPosition);
  expect(service.getSnapshot()).toBe(beforeDisposal);
  expect(listener).not.toHaveBeenCalled();
});

test('A failing observer or library notification cannot report a confirmed save as failed', async () => {
  const { service, dependencies } = harness();
  await settle();
  service.subscribe(() => {
    throw new Error(Fixture.privateFailure);
  });
  const listener = jest.fn();
  service.subscribe(listener);
  dependencies.notifyLibraryChanged.mockImplementationOnce(() => {
    throw new Error(Fixture.privateFailure);
  });
  await service.saveSelection(Fixture.otherPlaylist);
  expect(service.getSnapshot()).toMatchObject({
    selectedPlaylistIdentifier: Fixture.otherPlaylist,
    saving: false,
    error: null,
  });
  expect(listener).toHaveBeenCalled();
});

test('Decoders reject missing selections, invalid identifiers, duplicate choices and unsafe counts', () => {
  expect(() => decodeLikedSongsSelection({})).toThrow();
  expect(() =>
    decodeLikedSongsSelection({ playlistId: Fixture.emptyIdentifier }),
  ).toThrow();
  expect(() =>
    decodeLikedSongsPlaylists([
      playlists[Fixture.firstPosition],
      playlists[Fixture.firstPosition],
    ]),
  ).toThrow();
  expect(() =>
    decodeLikedSongsPlaylists([
      {
        ...playlists[Fixture.firstPosition],
        recordingCount: Fixture.invalidCount,
      },
    ]),
  ).toThrow();
  expect(
    decodeLikedSongsPlaylists([
      { ...playlists[Fixture.firstPosition], name: null },
    ])[Fixture.firstPosition].name,
  ).toBe(LikedSongsSettingsPolicy.untitledPlaylist);
});

test('Empty playlists and nullable names remain valid choices, while oversized values are rejected', () => {
  const emptyPlaylist = {
    ...playlists[Fixture.firstPosition],
    name: null,
    recordingCount: LikedSongsSettingsPolicy.minimumRecordingCount,
  };
  expect(
    decodeLikedSongsPlaylists([emptyPlaylist])[Fixture.firstPosition],
  ).toMatchObject({
    name: LikedSongsSettingsPolicy.untitledPlaylist,
    recordingCount: LikedSongsSettingsPolicy.minimumRecordingCount,
  });
  const oversizedName = Fixture.name.repeat(
    LikedSongsSettingsPolicy.maximumNameCharacters,
  );
  const oversizedIdentifier = Fixture.playlist.repeat(
    LikedSongsSettingsPolicy.maximumIdentifierCharacters,
  );
  expect(() =>
    decodeLikedSongsPlaylists([{ ...emptyPlaylist, name: oversizedName }]),
  ).toThrow();
  expect(() =>
    decodeLikedSongsSelection({ playlistId: oversizedIdentifier }),
  ).toThrow();
});

test('An unavailable assigned playlist stays explicit and malformed refresh data preserves prior choices', async () => {
  const { service, dependencies } = harness();
  await settle();
  dependencies.read.mockResolvedValueOnce({
    selection: { playlistId: Fixture.otherPlaylist },
    playlists: [],
  });
  await service.refresh();
  expect(service.getSnapshot()).toMatchObject({
    selectedPlaylistIdentifier: Fixture.otherPlaylist,
    playlists: [],
    loaded: true,
  });
  dependencies.read.mockResolvedValueOnce({
    selection: { playlistId: Fixture.playlist },
    playlists: null,
  });
  await service.refresh();
  expect(service.getSnapshot()).toMatchObject({
    selectedPlaylistIdentifier: Fixture.otherPlaylist,
    playlists: [],
    error: LikedSongsSettingsPolicy.loadFailure,
  });
});

test('An account replacement triggered by a saving observer prevents submission for the retired account', async () => {
  const { service, dependencies, setAccount } = harness();
  await settle();
  service.subscribe(() => {
    if (service.getSnapshot().saving) setAccount(Fixture.otherAccount);
  });
  await service.saveSelection(Fixture.otherPlaylist);
  await settle();
  expect(dependencies.write).not.toHaveBeenCalled();
  expect(dependencies.notifyLibraryChanged).not.toHaveBeenCalled();
  expect(service.getSnapshot().accountIdentifier).toBe(Fixture.otherAccount);
});

test('An account replacement during success publication prevents notifications for the retired account', async () => {
  const { service, dependencies, setAccount } = harness();
  await settle();
  service.subscribe(() => {
    const snapshot = service.getSnapshot();
    if (
      snapshot.accountIdentifier === Fixture.account &&
      !snapshot.saving &&
      snapshot.selectedPlaylistIdentifier === Fixture.otherPlaylist
    )
      setAccount(Fixture.otherAccount);
  });
  await service.saveSelection(Fixture.otherPlaylist);
  await settle();
  expect(dependencies.write).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(dependencies.notifyLibraryChanged).not.toHaveBeenCalled();
  expect(service.getSnapshot().accountIdentifier).toBe(Fixture.otherAccount);
});

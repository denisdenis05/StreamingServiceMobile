import { LikedSongsSettingsPolicy } from '../src/services/settings/LikedSongsSettingsService';
const ModulePaths = Object.freeze({
  authentication: '../src/services/AuthenticationService',
  network: '../src/services/ApplicationNetworkClient',
  libraryChanges: '../src/services/LibraryChanges',
  platform: '../src/services/settings/LikedSongsPlatform',
});
const Fixture = Object.freeze({
  account: 'first-account',
  otherAccount: 'second-account',
  token: 'current-account-token',
  otherToken: 'other-account-token',
  playlist: 'owned-playlist',
  name: 'My playlist',
  count: 2,
  oneCall: 1,
});
let account: {
  isLoggedIn: boolean;
  accountIdentifier: string | null;
  token: string | null;
} = { isLoggedIn: false, accountIdentifier: null, token: null };
const accountListeners = new Set<() => void>();
const libraryListeners = new Set<() => void>();
const authenticationSession = {
  getSnapshot: () => account,
  subscribe(listener: () => void) {
    accountListeners.add(listener);
    return () => {
      accountListeners.delete(listener);
    };
  },
};
const client = {
  get: jest.fn(async (route: string) => ({
    data:
      route === LikedSongsSettingsPolicy.selectionRoute
        ? { playlistId: null }
        : [
            {
              id: Fixture.playlist,
              name: Fixture.name,
              recordingCount: Fixture.count,
            },
          ],
  })),
  put: jest.fn(async (_route: string, body: { playlistId: string | null }) => ({
    data: body,
  })),
};
const createApplicationNetworkClient = jest.fn(() => client);
const notifyLibraryChanged = jest.fn(() =>
  libraryListeners.forEach(listener => listener()),
);
jest.doMock(ModulePaths.authentication, () => ({ authenticationSession }));
jest.doMock(ModulePaths.network, () => ({ createApplicationNetworkClient }));
jest.doMock(ModulePaths.libraryChanges, () => ({
  notifyLibraryChanged,
  subscribeLibraryChanges(listener: () => void) {
    libraryListeners.add(listener);
    return () => {
      libraryListeners.delete(listener);
    };
  },
}));
const { likedSongsSettings } = require(ModulePaths.platform);
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function setAccount(value: typeof account) {
  account = value;
  accountListeners.forEach(listener => listener());
}
beforeEach(() => {
  setAccount({ isLoggedIn: false, accountIdentifier: null, token: null });
  jest.clearAllMocks();
});
afterAll(() => likedSongsSettings.dispose());

test('Platform reads both server contracts using the captured current-account token and cancellation signal', async () => {
  setAccount({
    isLoggedIn: true,
    accountIdentifier: Fixture.account,
    token: Fixture.token,
  });
  await settle();
  expect(createApplicationNetworkClient).toHaveBeenCalledWith({
    accountIdentifier: Fixture.account,
    token: Fixture.token,
  });
  expect(client.get).toHaveBeenCalledWith(
    LikedSongsSettingsPolicy.selectionRoute,
    { signal: expect.any(AbortSignal) },
  );
  expect(client.get).toHaveBeenCalledWith(
    LikedSongsSettingsPolicy.playlistsRoute,
    { signal: expect.any(AbortSignal) },
  );
  expect(likedSongsSettings.getSnapshot().loaded).toBe(true);
});

test('Platform writes canonical playlist choice and notifies library subscribers after success', async () => {
  setAccount({
    isLoggedIn: true,
    accountIdentifier: Fixture.account,
    token: Fixture.token,
  });
  await settle();
  await likedSongsSettings.saveSelection(Fixture.playlist);
  expect(client.put).toHaveBeenCalledWith(
    LikedSongsSettingsPolicy.selectionRoute,
    { playlistId: Fixture.playlist },
    { signal: expect.any(AbortSignal) },
  );
  expect(notifyLibraryChanged).toHaveBeenCalledTimes(Fixture.oneCall);
  await settle();
});

test('A library change reloads choices and account replacement creates a new credential scope', async () => {
  setAccount({
    isLoggedIn: true,
    accountIdentifier: Fixture.account,
    token: Fixture.token,
  });
  await settle();
  client.get.mockClear();
  libraryListeners.forEach(listener => listener());
  await settle();
  expect(client.get).toHaveBeenCalledWith(
    LikedSongsSettingsPolicy.playlistsRoute,
    { signal: expect.any(AbortSignal) },
  );
  setAccount({
    isLoggedIn: true,
    accountIdentifier: Fixture.otherAccount,
    token: Fixture.otherToken,
  });
  await settle();
  expect(createApplicationNetworkClient).toHaveBeenLastCalledWith({
    accountIdentifier: Fixture.otherAccount,
    token: Fixture.otherToken,
  });
});

test('Signed-out library changes cannot issue authenticated network requests', async () => {
  libraryListeners.forEach(listener => listener());
  await settle();
  expect(client.get).not.toHaveBeenCalled();
  expect(createApplicationNetworkClient).not.toHaveBeenCalled();
});

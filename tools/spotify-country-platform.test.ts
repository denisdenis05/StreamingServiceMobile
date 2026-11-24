export {};
const Imports = Object.freeze({
  platform: '../src/services/SpotifyListeningCountryPlatform',
  account: '../src/services/AuthenticationService',
  storage: '@react-native-async-storage/async-storage',
  native: 'react-native',
});
const Fixture = Object.freeze({
  account: 'country-test-account',
  nextAccount: 'next-country-test-account',
  nativeCountry: 'RO',
  savedCountry: 'GB',
  editedCountry: 'DE',
  locale: 'en-US',
  scriptLocale: 'zh-Hant-TW',
  scriptCountry: 'TW',
  empty: '',
  invalid: 'not-a-country',
  languageOnly: 'en',
  fallbackCountry: 'US',
  flushTurns: 8,
  firstTurn: 0,
  turnIncrement: 1,
});
const storage = { getItem: jest.fn(), setItem: jest.fn() };
let account = { isLoggedIn: true, accountIdentifier: Fixture.account as string | null };
let accountChanged: (() => void) | null = null;
const unsubscribe = jest.fn();
jest.doMock(Imports.native, () => ({ NativeModules: { SpotifyProofKey: { deviceRegion: Fixture.nativeCountry } } }));
jest.doMock(Imports.storage, () => ({ __esModule: true, default: storage }));
jest.doMock(Imports.account, () => ({ authenticationSession: {
  getSnapshot: () => account,
  subscribe: (listener: () => void) => { accountChanged = listener; return unsubscribe; },
} }));
async function flush(): Promise<void> {
  for (let turn = Fixture.firstTurn; turn < Fixture.flushTurns; turn += Fixture.turnIncrement) await Promise.resolve();
}
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  account = { isLoggedIn: true, accountIdentifier: Fixture.account };
  accountChanged = null;
  storage.getItem.mockResolvedValue(null);
  storage.setItem.mockResolvedValue(undefined);
});
test('Device country takes precedence over locale and valid saved override restores within its account', async () => {
  storage.getItem.mockResolvedValue(Fixture.savedCountry);
  const { spotifyListeningCountry, SpotifyCountryPlatformPolicy } = require(Imports.platform);
  expect(spotifyListeningCountry.getSnapshot()).toBe(Fixture.nativeCountry);
  await flush();
  expect(spotifyListeningCountry.getSnapshot()).toBe(Fixture.savedCountry);
  expect(storage.getItem).toHaveBeenCalledWith(SpotifyCountryPlatformPolicy.storagePrefix + Fixture.account);
  spotifyListeningCountry.set(Fixture.editedCountry);
  await flush();
  expect(storage.setItem).toHaveBeenCalledWith(SpotifyCountryPlatformPolicy.storagePrefix + Fixture.account, Fixture.editedCountry);
});
test('Country changes clear immediately on logout and another account restores its own preference', async () => {
  const { spotifyListeningCountry } = require(Imports.platform);
  await flush();
  spotifyListeningCountry.set(Fixture.editedCountry);
  await flush();
  account = { isLoggedIn: false, accountIdentifier: null };
  accountChanged?.();
  expect(spotifyListeningCountry.getSnapshot()).toBe(Fixture.nativeCountry);
  storage.getItem.mockResolvedValue(Fixture.savedCountry);
  account = { isLoggedIn: true, accountIdentifier: Fixture.nextAccount };
  accountChanged?.();
  await flush();
  expect(spotifyListeningCountry.getSnapshot()).toBe(Fixture.savedCountry);
});
test('Locale handles script regions and missing region uses the explicit editable fallback', () => {
  const { spotifyDeviceRegion } = require(Imports.platform);
  expect(spotifyDeviceRegion(null, Fixture.scriptLocale)).toBe(Fixture.scriptCountry);
  expect(spotifyDeviceRegion(Fixture.invalid, Fixture.locale)).toBe(Fixture.fallbackCountry);
  expect(spotifyDeviceRegion(Fixture.empty, Fixture.languageOnly)).toBe(Fixture.fallbackCountry);
  expect(spotifyDeviceRegion(Fixture.nativeCountry.toLowerCase(), Fixture.locale)).toBe(Fixture.nativeCountry);
});

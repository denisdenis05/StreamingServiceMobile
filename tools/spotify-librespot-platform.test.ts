export {};

const Imports = Object.freeze({ native: 'react-native', platform: '../src/services/SpotifyLibrespotPlatform',
  library: 'streaming-service-spotify-jam' });
const Fixture = Object.freeze({ android: 'android', ios: 'ios', username: 'test-account', password: 'artificial-password',
  account: 'canonical-account', token: 'artificial-token', storedCredential: 'opaque-native-session', expiryMilliseconds: 1000000,
  firstPosition: 0 });
const Names = Object.freeze({ android: 'Android Librespot authentication uses the packaged native session module',
  ios: 'Librespot authentication reports unsupported on platforms without its native module',
  missing: 'A missing Android native module cannot silently fall back to public OAuth' });
let operatingSystem: string = Fixture.android;
const native = { login: jest.fn(), restore: jest.fn(), cancel: jest.fn() };
let nativeAvailable = true;
jest.doMock(Imports.native, () => ({ Platform: { OS: operatingSystem },
  NativeModules: nativeAvailable ? { SpotifyLibrespotSession: native } : {} }));
const grant = { accountIdentifier: Fixture.account, accessToken: Fixture.token,
  expiresAtMilliseconds: Fixture.expiryMilliseconds, storedCredential: Fixture.storedCredential };
beforeEach(() => { jest.resetModules(); jest.clearAllMocks(); operatingSystem = Fixture.android; nativeAvailable = true;
  native.login.mockResolvedValue(grant); native.restore.mockResolvedValue(grant); });
function authentication() { return require(Imports.platform).spotifyLibrespotAuthentication; }
test(Names.android, async () => { const adapter = authentication();
  expect(await adapter.login({ username: Fixture.username, password: Fixture.password }, new AbortController().signal)).toEqual(grant);
  expect(native.login).toHaveBeenCalledWith(expect.any(String), Fixture.username, Fixture.password);
  expect(await adapter.restore(Fixture.storedCredential, new AbortController().signal)).toEqual(grant);
  expect(native.restore).toHaveBeenCalledWith(expect.any(String), Fixture.storedCredential);
  expect(native.restore.mock.calls[Fixture.firstPosition][Fixture.firstPosition]).not.toBe(native.login.mock.calls[Fixture.firstPosition][Fixture.firstPosition]);
});
test(Names.ios, async () => { operatingSystem = Fixture.ios; const library = require(Imports.library);
  await expect(authentication().login({ username: Fixture.username, password: Fixture.password }, new AbortController().signal))
    .rejects.toMatchObject({ code: library.IntegrationFailureCode.Unsupported }); expect(native.login).not.toHaveBeenCalled(); });
test(Names.missing, async () => { nativeAvailable = false; const library = require(Imports.library);
  await expect(authentication().restore(Fixture.storedCredential, new AbortController().signal))
    .rejects.toMatchObject({ code: library.IntegrationFailureCode.Unsupported }); expect(native.restore).not.toHaveBeenCalled(); });

export {};

const Imports = Object.freeze({ native: 'react-native', authentication: '../src/services/AuthenticationService',
  addresses: '../src/constants/placeholders', task: '../src/services/SpotifyBackgroundAuthenticationHeadless' });
const Fixture = Object.freeze({ request: 'synthetic-authentication-request', account: 'synthetic-app-account', otherAccount: 'synthetic-other-account',
  spotifyAccount: 'synthetic-spotify-account', session: 'synthetic-jam', host: 'synthetic-host',
  baseAddress: 'https://media.example.test/api/', token: 'synthetic-private-token', renewedToken: 'synthetic-renewed-token', handle: 7, generation: 3, unsupported: 'unsupported',
  names: { composition: 'Headless authentication composes restoration renewal and the scoped native completion',
    absent: 'Missing native authentication runtime exposes unsupported',
    account: 'Headless authentication cannot refresh a different restored app account',
    retired: 'Retired headless authentication requests never refresh app credentials' } });
let available = true;
let account: { isLoggedIn: boolean; accountIdentifier: string; token: string } = { isLoggedIn: true, accountIdentifier: Fixture.account, token: Fixture.token };
const authentication = { restore: jest.fn(), refresh: jest.fn(), getSnapshot: () => account };
const native = { claimAuthentication: jest.fn(), isAuthenticationPending: jest.fn(), completeAuthentication: jest.fn(), failAuthentication: jest.fn() };
jest.doMock(Imports.native, () => ({ NativeModules: available ? { SpotifyJamPlayback: native } : {} }));
jest.doMock(Imports.authentication, () => ({ authenticationSession: authentication }));
jest.doMock(Imports.addresses, () => ({ TEMPORARY_API_URL: Fixture.baseAddress }));
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); available = true;
  account = { isLoggedIn: true, accountIdentifier: Fixture.account, token: Fixture.token };
  authentication.restore.mockResolvedValue(undefined);
  authentication.refresh.mockImplementation(async () => { account = { ...account, token: Fixture.renewedToken }; return Fixture.renewedToken; });
  native.claimAuthentication.mockResolvedValue(JSON.stringify({ requestIdentifier: Fixture.request,
    streamingServiceAccountIdentifier: Fixture.account, spotifyAccountIdentifier: Fixture.spotifyAccount,
    jamSessionIdentifier: Fixture.session, hostDeviceIdentifier: Fixture.host, handle: Fixture.handle,
    generation: Fixture.generation, baseAddress: Fixture.baseAddress }));
  native.isAuthenticationPending.mockResolvedValue(true); native.completeAuthentication.mockResolvedValue(undefined);
  native.failAuthentication.mockResolvedValue(undefined);
});
test(Fixture.names.composition, async () => {
  await require(Imports.task).executeSpotifyBackgroundAuthentication(Fixture.request);
  expect(authentication.restore).toHaveBeenCalled(); expect(authentication.refresh).toHaveBeenCalled();
  expect(native.completeAuthentication).toHaveBeenCalledWith(Fixture.request, Fixture.account, Fixture.renewedToken);
  expect(native.failAuthentication).not.toHaveBeenCalled();
});
test(Fixture.names.absent, async () => {
  available = false;
  await expect(require(Imports.task).executeSpotifyBackgroundAuthentication(Fixture.request)).rejects.toMatchObject({ code: Fixture.unsupported });
});
test(Fixture.names.account, async () => {
  account = { ...account, accountIdentifier: Fixture.otherAccount };
  await require(Imports.task).executeSpotifyBackgroundAuthentication(Fixture.request);
  expect(authentication.refresh).not.toHaveBeenCalled(); expect(native.completeAuthentication).not.toHaveBeenCalled();
  expect(native.failAuthentication).toHaveBeenCalledWith(Fixture.request);
});
test(Fixture.names.retired, async () => {
  native.isAuthenticationPending.mockResolvedValue(false);
  await require(Imports.task).executeSpotifyBackgroundAuthentication(Fixture.request);
  expect(authentication.refresh).not.toHaveBeenCalled(); expect(native.completeAuthentication).not.toHaveBeenCalled();
});

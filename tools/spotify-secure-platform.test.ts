const Imports = Object.freeze({ metadata: '@react-native-async-storage/async-storage', keychain: 'react-native-keychain', storage: '../src/services/SpotifySecureLoginStorage' });
const Fixture = Object.freeze({ account: 'application-account', serialized: 'saved-renewable-grant', service: 'StreamingService.SpotifyLogin.application-account',
  accessibility: 'device-only-after-unlock', cipher: 'native-aes-gcm', firstPosition: 0 });
const Names = Object.freeze({ deviceOnly: 'Saved Spotify login uses the device-only OS credential store without cloud synchronization',
  read: 'Saved login reads use the same noncloud account service', erase: 'Explicit saved login removal targets the same noncloud account service' });
const keychain = { ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: Fixture.accessibility }, STORAGE_TYPE: { AES_GCM_NO_AUTH: Fixture.cipher },
  getGenericPassword: jest.fn(), setGenericPassword: jest.fn(), resetGenericPassword: jest.fn() };
const metadata = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
jest.doMock(Imports.metadata, () => ({ __esModule: true, default: metadata }));
jest.doMock(Imports.keychain, () => keychain);
const ownership = require(Imports.storage).spotifyCredentialOwnership;
const authorizationOwnership = require(Imports.storage).spotifyAuthorizationOwnership;
beforeEach(() => { jest.clearAllMocks(); ownership.retire(); keychain.getGenericPassword.mockResolvedValue(false); metadata.getItem.mockResolvedValue(null);
  metadata.setItem.mockResolvedValue(undefined); metadata.removeItem.mockResolvedValue(undefined);
  keychain.setGenericPassword.mockResolvedValue({ service: Fixture.service }); keychain.resetGenericPassword.mockResolvedValue(true); });
test(Names.deviceOnly, async () => { const store = ownership.acquire(Fixture.account); await store.write(Fixture.serialized, new AbortController().signal);
  expect(keychain.setGenericPassword).toHaveBeenCalledWith(Fixture.account, Fixture.serialized,
    { service: Fixture.service, accessible: Fixture.accessibility, storage: Fixture.cipher, cloudSync: false }); });
test(Names.read, async () => { const store = ownership.acquire(Fixture.account); await store.read(new AbortController().signal);
  expect(keychain.getGenericPassword).toHaveBeenCalledWith({ service: Fixture.service, cloudSync: false }); });
test(Names.erase, async () => { await ownership.forget(Fixture.account);
  expect(keychain.resetGenericPassword).toHaveBeenCalledWith({ service: Fixture.service, cloudSync: false });
  expect(metadata.setItem).toHaveBeenCalledWith(Fixture.service + RevocationFixture.suffix, RevocationFixture.marker); });

const RevocationFixture = Object.freeze({ suffix: '.revoked', marker: 'revoked' });
const AuthorizationFixture = Object.freeze({ name: 'Pending proof uses a separate device-only secure service from the saved refresh grant',
  service: 'StreamingService.SpotifyAuthorization.application-account', proof: 'artificial-verifier-state-proof' });
test(AuthorizationFixture.name, async () => { const store = authorizationOwnership.acquire(Fixture.account); await store.write(AuthorizationFixture.proof, new AbortController().signal);
  expect(keychain.setGenericPassword).toHaveBeenCalledWith(Fixture.account, AuthorizationFixture.proof,
    { service: AuthorizationFixture.service, accessible: Fixture.accessibility, storage: Fixture.cipher, cloudSync: false });
  expect(metadata.setItem).not.toHaveBeenCalled(); });

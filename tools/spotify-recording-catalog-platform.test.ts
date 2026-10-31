export {};
import { URL } from 'react-native-url-polyfill';
const Imports = Object.freeze({ platform: '../src/services/SpotifyRecordingCatalogPlatform', account: '../src/services/AuthenticationService',
  network: '../src/services/ApplicationNetworkClient', addresses: '../src/constants/placeholders',
  nativeRuntime: '../src/services/NativeAudioRuntime' });
const { IntegrationFailureCode } = require('streaming-service-spotify-jam');
const Fixture = Object.freeze({ address: 'https://catalog.example.test/', account: 'catalog-test-account', replacement: 'replacement-test-account',
  token: 'synthetic-test-token', recording: 'synthetic-recording', title: 'Synthetic recording', artist: 'Synthetic artist',
  nativeOwnershipFailure: 'Catalog access must not instantiate native player ownership', pageSizeParameter: 'pageSize', missingStatus: 404, unauthorizedStatus: 401, single: 1, legacyRoute: '/Metadata/search/db', primaryRoute: '/spotify/catalog/recordings/',
  query: { title: 'Synthetic recording', author: 'Synthetic artist', limit: 3 } });
let account = { isLoggedIn: true, accountIdentifier: Fixture.account as string | null };
const listeners = new Set<() => void>();
const client = { get: jest.fn() };
jest.doMock(Imports.account, () => ({ authenticationSession: { getSnapshot: () => account,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } } }));
jest.doMock(Imports.network, () => ({ createApplicationNetworkClient: () => client }));
jest.doMock(Imports.addresses, () => ({ TEMPORARY_API_URL: Fixture.address }));
jest.doMock(Imports.nativeRuntime, () => { throw new Error(Fixture.nativeOwnershipFailure); });
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); listeners.clear();
  account = { isLoggedIn: true, accountIdentifier: Fixture.account };
  client.get.mockRejectedValue({ response: { status: Fixture.missingStatus } });
});
function replaceAccount(identifier: string | null): void {
  account = { isLoggedIn: identifier !== null, accountIdentifier: identifier }; listeners.forEach(listener => listener());
}
test('Catalog composition can use actual selected metadata after a missing primary route without creating native ownership', async () => {
  const { spotifyObservedRecordings, createSpotifyRecordingCatalog } = require(Imports.platform);
  spotifyObservedRecordings.remember([{ recordingIdentifier: Fixture.recording, title: Fixture.title, artist: Fixture.artist }]);
  const catalog = createSpotifyRecordingCatalog(Fixture.address, Fixture.account, Fixture.token);
  const result = await catalog.lookup(Fixture.recording, new AbortController().signal);
  expect(result).toEqual({ identifier: Fixture.recording, title: Fixture.title, author: Fixture.artist });
  expect(client.get).toHaveBeenCalledTimes(Fixture.single);
});
test('Catalog composition uses bounded authenticated legacy search only after the actual primary route is missing', async () => {
  client.get.mockImplementation(async (address: string) => {
    if (new URL(address).pathname.startsWith(Fixture.primaryRoute)) throw { response: { status: Fixture.missingStatus } };
    expect(new URL(address).pathname).toBe(Fixture.legacyRoute);
    expect(new URL(address).searchParams.get(Fixture.pageSizeParameter)).toBe(String(Fixture.query.limit));
    return { data: { tracks: [{ id: Fixture.recording, title: Fixture.title, artistName: Fixture.artist }], fuzzyTracks: [] } };
  });
  const { createSpotifyRecordingCatalog } = require(Imports.platform);
  const catalog = createSpotifyRecordingCatalog(Fixture.address, Fixture.account, Fixture.token);
  const matches = await catalog.search(Fixture.query, new AbortController().signal);
  expect(matches).toHaveLength(Fixture.single);
  expect((await catalog.lookup(Fixture.recording, new AbortController().signal)).identifier).toBe(Fixture.recording);
});
test('Unauthorized catalog access never silently falls back to saved metadata or another endpoint', async () => {
  client.get.mockRejectedValue({ response: { status: Fixture.unauthorizedStatus } });
  const { spotifyObservedRecordings, createSpotifyRecordingCatalog } = require(Imports.platform);
  spotifyObservedRecordings.remember([{ recordingIdentifier: Fixture.recording, title: Fixture.title, artist: Fixture.artist }]);
  const catalog = createSpotifyRecordingCatalog(Fixture.address, Fixture.account, Fixture.token);
  await expect(catalog.lookup(Fixture.recording, new AbortController().signal)).rejects.toMatchObject({ code: IntegrationFailureCode.Unauthorized });
  expect(client.get).toHaveBeenCalledTimes(Fixture.single);
});
test('An old catalog cannot reuse observed metadata after logout and same-account restoration', async () => {
  const { spotifyObservedRecordings, createSpotifyRecordingCatalog } = require(Imports.platform);
  spotifyObservedRecordings.remember([{ recordingIdentifier: Fixture.recording, title: Fixture.title, artist: Fixture.artist }]);
  const catalog = createSpotifyRecordingCatalog(Fixture.address, Fixture.account, Fixture.token);
  replaceAccount(null); replaceAccount(Fixture.account);
  await expect(catalog.lookup(Fixture.recording, new AbortController().signal)).rejects.toMatchObject({ code: IntegrationFailureCode.Superseded });
  expect(spotifyObservedRecordings.read()).toEqual([]);
  expect(client.get).not.toHaveBeenCalled();
});

export {};
import { IntegrationFailureCode } from 'streaming-service-spotify-jam';
const Imports = Object.freeze({ platform: '../src/services/SpotifyRecordingImportPlatform', account: '../src/services/AuthenticationService',
  network: '../src/services/ApplicationNetworkClient', addresses: '../src/constants/placeholders' });
const Fixture = Object.freeze({ address: 'https://catalog.example.test/', otherAddress: 'https://other.example.test/',
  account: 'test-account', token: 'synthetic-token', spotify: '4uLU6hMCjMI75M1A2tKUQC', recording: '11111111-2222-3333-4444-555555555555',
  title: 'Synthetic title', artist: 'Synthetic artist', empty: '', route: 'Library/playlists/preview-import', single: 1 });
let account = { isLoggedIn: true, accountIdentifier: Fixture.account as string | null };
const listeners = new Set<() => void>();
const client = { post: jest.fn() };
const createClient = jest.fn(() => client);
jest.doMock(Imports.account, () => ({ authenticationSession: { getSnapshot: () => account,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } } }));
jest.doMock(Imports.network, () => ({ createApplicationNetworkClient: createClient }));
jest.doMock(Imports.addresses, () => ({ TEMPORARY_API_URL: Fixture.address }));
function song() { return { identifier: Fixture.spotify, title: Fixture.title, author: Fixture.artist }; }
function response() { return { data: [{ originalName: Fixture.title, originalArtist: Fixture.artist, originalAlbum: Fixture.empty,
  matchedRecordingId: Fixture.recording, isAvailable: true, isExactMatch: true, isSuggested: false }] }; }
function replaceAccount(identifier: string | null): void {
  account = { isLoggedIn: identifier !== null, accountIdentifier: identifier }; listeners.forEach(listener => listener());
}
beforeEach(() => { jest.resetModules(); jest.clearAllMocks(); listeners.clear(); account = { isLoggedIn: true, accountIdentifier: Fixture.account };
  client.post.mockResolvedValue(response()); });
test('Platform uses scoped application credentials and only the read-only import preview route', async () => {
  const matcher = require(Imports.platform).createSpotifyRecordingImportMatcher(Fixture.address, Fixture.account, Fixture.token);
  const cancellation = new AbortController().signal;
  expect(await matcher.match([song()], cancellation)).toEqual([{ spotifyIdentifier: Fixture.spotify, recordingIdentifier: Fixture.recording, exact: true }]);
  expect(createClient).toHaveBeenCalledWith({ accountIdentifier: Fixture.account, token: Fixture.token });
  expect(client.post).toHaveBeenCalledWith(Fixture.route, [{ name: Fixture.title, artistName: Fixture.artist, releaseName: Fixture.empty }], { signal: cancellation });
  expect(client.post).toHaveBeenCalledTimes(Fixture.single);
});
test('A different server cannot use the current account import client', () => {
  expect(() => require(Imports.platform).createSpotifyRecordingImportMatcher(Fixture.otherAddress, Fixture.account, Fixture.token))
    .toThrow(expect.objectContaining({ code: IntegrationFailureCode.InvalidInput }));
  expect(client.post).not.toHaveBeenCalled();
});
test('Logout and restoration of the same account do not revive an old matcher', async () => {
  const matcher = require(Imports.platform).createSpotifyRecordingImportMatcher(Fixture.address, Fixture.account, Fixture.token);
  replaceAccount(null); replaceAccount(Fixture.account);
  await expect(matcher.match([song()], new AbortController().signal)).rejects.toMatchObject({ code: IntegrationFailureCode.Superseded });
  expect(client.post).not.toHaveBeenCalled();
});
test('Account changes during a network completion cannot expose the old matching result', async () => {
  client.post.mockImplementation(async () => { replaceAccount(null); return response(); });
  const matcher = require(Imports.platform).createSpotifyRecordingImportMatcher(Fixture.address, Fixture.account, Fixture.token);
  await expect(matcher.match([song()], new AbortController().signal)).rejects.toMatchObject({ code: IntegrationFailureCode.Superseded });
});

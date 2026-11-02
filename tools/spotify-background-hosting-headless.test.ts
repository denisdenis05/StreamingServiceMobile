export {};
import { IntegrationFailureCode } from 'streaming-service-spotify-jam';
const Imports = Object.freeze({ native: 'react-native', authentication: '../src/services/AuthenticationService',
  network: '../src/services/ApplicationNetworkClient', addresses: '../src/constants/placeholders', task: '../src/services/SpotifyBackgroundHostingHeadless' });
const Fixture = Object.freeze({ request: 'synthetic-request', account: 'synthetic-account', otherAccount: 'synthetic-other-account', token: 'synthetic-token',
  spotify: 'synthetic-spotify', jam: 'synthetic-jam', host: 'synthetic-host', address: 'https://synthetic.example/', market: 'GB',
  android: 'android', platformVersion: 35, recording: 'synthetic-recording', track: '4uLU6hMCjMI75M1A2tKUQC', title: 'Synthetic title', artist: 'Synthetic artist', durationMilliseconds: 180000,
  handle: 3, generation: 7, otherGeneration: 8, importRecording: '11111111-2222-3333-4444-555555555555', guestArtist: 'Synthetic guest',
  featureOpening: ' (feat. ', featureClosing: ')', emptyText: '' });
let account: string = Fixture.account;
const authentication = { subscribe: () => () => undefined, restore: jest.fn(), getSnapshot: () => ({ isLoggedIn: true, accountIdentifier: account, token: Fixture.token }) };
const client = { get: jest.fn(), post: jest.fn() };
const native = { claimHostingRecording: jest.fn(), isHostingRecordingPending: jest.fn(), searchHostingRecording: jest.fn(),
  completeHostingRecording: jest.fn(), failHostingRecording: jest.fn() };
jest.doMock(Imports.native, () => ({ Platform: { OS: Fixture.android, Version: Fixture.platformVersion }, NativeModules: { SpotifyJamPlayback: native } }));
jest.doMock(Imports.authentication, () => ({ authenticationSession: authentication }));
jest.doMock(Imports.addresses, () => ({ TEMPORARY_API_URL: Fixture.address }));
jest.doMock(Imports.network, () => ({ createApplicationNetworkClient: () => client }));
function response(generation: number = Fixture.generation) { return JSON.stringify({ handle: Fixture.handle, generation, tracks: [{ spotifyTrackIdentifier: Fixture.track,
  title: Fixture.title, artistNames: [Fixture.artist], durationMilliseconds: Fixture.durationMilliseconds, recordingCodes: [], playable: true }] }); }
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); account = Fixture.account;
  native.claimHostingRecording.mockResolvedValue(JSON.stringify({ requestIdentifier: Fixture.request, streamingServiceAccountIdentifier: Fixture.account,
    spotifyAccountIdentifier: Fixture.spotify, jamSessionIdentifier: Fixture.jam, hostDeviceIdentifier: Fixture.host, baseAddress: Fixture.address,
    market: Fixture.market, recordingIdentifier: Fixture.recording, handle: Fixture.handle, generation: Fixture.generation }));
  native.isHostingRecordingPending.mockResolvedValue(true); native.searchHostingRecording.mockResolvedValue(response());
  native.completeHostingRecording.mockResolvedValue(undefined); native.failHostingRecording.mockResolvedValue(undefined);
  client.get.mockResolvedValue({ data: { identifier: Fixture.recording, title: Fixture.title, author: Fixture.artist, durationMilliseconds: Fixture.durationMilliseconds } });
});
test('Headless hosting matches actual app metadata against the job-bound native catalog response', async () => {
  await require(Imports.task).executeSpotifyBackgroundHosting(Fixture.request);
  expect(native.searchHostingRecording).toHaveBeenCalled(); expect(native.completeHostingRecording).toHaveBeenCalledWith(Fixture.request, Fixture.track);
  expect(native.failHostingRecording).not.toHaveBeenCalled();
});
test('A different restored account cannot query or complete the old recording job', async () => {
  account = Fixture.otherAccount; await require(Imports.task).executeSpotifyBackgroundHosting(Fixture.request);
  expect(client.get).not.toHaveBeenCalled(); expect(native.searchHostingRecording).not.toHaveBeenCalled();
  expect(native.completeHostingRecording).not.toHaveBeenCalled();
});
test('A replaced native generation cannot be accepted as a match', async () => {
  native.searchHostingRecording.mockResolvedValue(response(Fixture.otherGeneration));
  await require(Imports.task).executeSpotifyBackgroundHosting(Fixture.request);
  expect(native.completeHostingRecording).not.toHaveBeenCalled(); expect(native.failHostingRecording).toHaveBeenCalledWith(Fixture.request, IntegrationFailureCode.InvalidResponse);
});

test('Native backpressure remains typed when headless matching fails', async () => {
  native.searchHostingRecording.mockRejectedValue({ code: IntegrationFailureCode.Backpressure });
  await require(Imports.task).executeSpotifyBackgroundHosting(Fixture.request);
  expect(native.failHostingRecording).toHaveBeenCalledWith(Fixture.request, IntegrationFailureCode.Backpressure);
  expect(native.completeHostingRecording).not.toHaveBeenCalled();
});

test('Headless hosting uses the existing importer when Spotify has additional artist credits', async () => {
  const recording = Fixture.importRecording;
  const guestArtist = Fixture.guestArtist;
  const featureTitle = Fixture.title + Fixture.featureOpening + guestArtist + Fixture.featureClosing;
  const job = JSON.parse(await native.claimHostingRecording()); job.recordingIdentifier = recording;
  native.claimHostingRecording.mockResolvedValue(JSON.stringify(job));
  client.get.mockResolvedValue({ data: { identifier: recording, title: Fixture.title, author: Fixture.artist } });
  native.searchHostingRecording.mockResolvedValue(JSON.stringify({ handle: Fixture.handle, generation: Fixture.generation,
    tracks: [{ spotifyTrackIdentifier: Fixture.track, title: featureTitle, artistNames: [Fixture.artist, guestArtist],
      durationMilliseconds: Fixture.durationMilliseconds, recordingCodes: [], playable: true }] }));
  client.post.mockResolvedValue({ data: [{ originalName: featureTitle, originalArtist: Fixture.artist, originalAlbum: Fixture.emptyText,
    matchedRecordingId: recording, isAvailable: true, isExactMatch: true, isSuggested: false }] });
  await require(Imports.task).executeSpotifyBackgroundHosting(Fixture.request);
  expect(client.post).toHaveBeenCalled();
  expect(native.completeHostingRecording).toHaveBeenCalledWith(Fixture.request, Fixture.track);
  expect(native.failHostingRecording).not.toHaveBeenCalled();
});

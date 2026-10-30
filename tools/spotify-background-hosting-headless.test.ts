export {};
const Imports = Object.freeze({ native: 'react-native', authentication: '../src/services/AuthenticationService',
  network: '../src/services/ApplicationNetworkClient', task: '../src/services/SpotifyBackgroundHostingHeadless' });
const Fixture = Object.freeze({ request: 'synthetic-request', account: 'synthetic-account', otherAccount: 'synthetic-other-account', token: 'synthetic-token',
  spotify: 'synthetic-spotify', jam: 'synthetic-jam', host: 'synthetic-host', address: 'https://synthetic.example/', market: 'GB',
  recording: 'synthetic-recording', track: '4uLU6hMCjMI75M1A2tKUQC', title: 'Synthetic title', artist: 'Synthetic artist', durationMilliseconds: 180000,
  handle: 3, generation: 7, otherGeneration: 8 });
let account: string = Fixture.account;
const authentication = { restore: jest.fn(), getSnapshot: () => ({ isLoggedIn: true, accountIdentifier: account, token: Fixture.token }) };
const client = { get: jest.fn() };
const native = { claimHostingRecording: jest.fn(), isHostingRecordingPending: jest.fn(), searchHostingRecording: jest.fn(),
  completeHostingRecording: jest.fn(), failHostingRecording: jest.fn() };
jest.doMock(Imports.native, () => ({ NativeModules: { SpotifyJamPlayback: native } }));
jest.doMock(Imports.authentication, () => ({ authenticationSession: authentication }));
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
  expect(native.completeHostingRecording).not.toHaveBeenCalled(); expect(native.failHostingRecording).toHaveBeenCalledWith(Fixture.request);
});

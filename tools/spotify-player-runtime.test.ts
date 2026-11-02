export {};
const Imports = Object.freeze({ runtime: '../src/services/PlayerJamRuntime', account: '../src/services/AuthenticationService',
  integration: '../src/services/SpotifyIntegration', mobile: '../src/services/SpotifyMobileService',
  country: '../src/services/SpotifyListeningCountryPlatform', catalog: '../src/services/SpotifyRecordingCatalogPlatform', hosting: '../src/services/spotify/SpotifyHostingStore', controller: '../src/services/spotify/SpotifyPlayerJamController', lifecycle: '../src/services/player/PlaybackQueueChangeLifecycle' });
const Fixture = Object.freeze({ account: 'application-test-account', replacementAccount: 'replacement-test-account',
  spotifyAccount: 'spotify-test-account', session: 'jam-test-session', host: 'host-test-device',
  country: 'RO', invitation: 'synthetic-test-invitation', recording: 'synthetic-recording', openerRecording: 'synthetic-opener-recording', clear: 'clear', replace: 'replace',
  firstGeneration: 1, handle: 1, zero: 0 });
const { JamConnectionStatus, SharedPlaybackStatus, IntegrationFailureCode, JamJoinMode } = require('streaming-service-spotify-jam');
const { SpotifyHostingStatus } = require(Imports.hosting);
const { SpotifyPlayerJamMode } = require(Imports.controller);
const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
function emit(): void { listeners.forEach(listener => listener()); }
let account = { isLoggedIn: true, accountIdentifier: Fixture.account as string | null };
let session: { active: boolean; identifier: string; ownedByCurrentAccount: boolean; participants: { identifier: string }[]; hostDeviceIdentifier: string | null } | null;
let failure: string | null;
let hosting: { status: string; failure: string | null };
let following: { status: string; failure: string | null };
const createSession = jest.fn();
const joinSession = jest.fn();
const startHosting = jest.fn();
const startFollowing = jest.fn();
const prepareRecordings = jest.fn(async () => undefined);
const stop = jest.fn(async () => undefined);
const stopFollowing = jest.fn(async () => { following = { status: SharedPlaybackStatus.Detached, failure: null }; emit(); });
let prepareQueueChange: (request: {
  kind: string;
  tracks: { recordingIdentifier: string }[];
  selectedRecordingIdentifier?: string;
  isCurrent(): boolean;
  acknowledgeAuthorityRelease(): Promise<void>;
}) => Promise<{ committed(): Promise<void> }>;
const nativeConnection = { handle: Fixture.handle, generation: Fixture.firstGeneration };
const country = { getSnapshot: () => Fixture.country, set: jest.fn(), subscribe };
const mobile = { subscribe, getSnapshot: () => ({ connected: true,
  session: { accountIdentifier: Fixture.spotifyAccount, status: JamConnectionStatus.Ready, session }, failure }), createSession, joinSession };
jest.doMock(Imports.account, () => ({ authenticationSession: { subscribe, getSnapshot: () => account } }));
jest.doMock(Imports.integration, () => ({ spotifyIntegration: { usesNativeConnect: true, runtime: null } }));
jest.doMock(Imports.country, () => ({ spotifyListeningCountry: country }));
jest.doMock(Imports.catalog, () => ({ spotifyObservedRecordings: { captureScope: () => null, remember: jest.fn() } }));
jest.doMock(Imports.lifecycle, () => ({ playbackQueueChanges: { attach: (lifecycle: { prepare: typeof prepareQueueChange }) => {
  prepareQueueChange = lifecycle.prepare; return () => undefined;
} }, PlaybackQueueChangeKind: { Clear: Fixture.clear, Replace: Fixture.replace } }));
jest.doMock(Imports.mobile, () => ({ spotifyMobile: mobile,
  spotifyConnect: { subscribe, getPlaybackConnection: () => nativeConnection, getSnapshot: () => ({ deviceIdentifier: Fixture.host }) },
  spotifyHosting: { subscribe, getSnapshot: () => hosting, start: startHosting, stop, prepareRecordings, publishLocalChanges: stop },
  spotifyPlaybackFollower: { subscribe, getSnapshot: () => following, start: startFollowing, stop: stopFollowing },
  spotifyPlaybackCommands: { subscribe, getSnapshot: () => ({ available: true, uncertain: false, failure: null }), execute: stop, seek: stop },
}));
function membership(owned: boolean): NonNullable<typeof session> {
  return { identifier: Fixture.session, active: true, ownedByCurrentAccount: owned,
    participants: [{ identifier: Fixture.spotifyAccount }], hostDeviceIdentifier: Fixture.host };
}
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); listeners.clear();
  account = { isLoggedIn: true, accountIdentifier: Fixture.account }; session = null; failure = null;
  hosting = { status: SpotifyHostingStatus.Stopped, failure: null };
  following = { status: SharedPlaybackStatus.Detached, failure: null };
  createSession.mockImplementation(async () => { session = membership(true); emit(); return true; });
  joinSession.mockImplementation(async () => { session = membership(false); emit(); return true; });
  startHosting.mockImplementation(async () => { hosting = { status: SpotifyHostingStatus.Hosting, failure: null }; emit(); });
  startFollowing.mockImplementation(async () => { following = { status: SharedPlaybackStatus.Following, failure: null }; emit(); });
});
test('Runtime composition creates real membership then hosts using the shared country without losing its own transition', async () => {
  const { playerJam } = require(Imports.runtime);
  expect(playerJam.getSnapshot().canCreate).toBe(true);
  await playerJam.startSharing();
  expect(createSession).toHaveBeenCalledTimes(Fixture.firstGeneration);
  expect(startHosting).toHaveBeenCalledWith(Fixture.country);
  expect(playerJam.getSnapshot().mode).toBe(SpotifyPlayerJamMode.Hosting);
  playerJam.dispose();
});
test('Runtime composition joins in control mode and starts verified listening only after admitted membership', async () => {
  const { playerJam } = require(Imports.runtime);
  await playerJam.joinAndListen(Fixture.invitation);
  expect(joinSession).toHaveBeenCalledWith(Fixture.invitation, JamJoinMode.Control);
  expect(startFollowing).toHaveBeenCalledWith(Fixture.country);
  expect(startHosting).not.toHaveBeenCalled();
  expect(playerJam.getSnapshot().mode).toBe(SpotifyPlayerJamMode.Following);
  playerJam.dispose();
});
test('Runtime composition preserves real membership failure and never starts audio after a rejected create', async () => {
  createSession.mockImplementation(async () => { failure = IntegrationFailureCode.Forbidden; return false; });
  const { playerJam } = require(Imports.runtime);
  await playerJam.startSharing();
  expect(playerJam.getSnapshot().failure).toBe(IntegrationFailureCode.Forbidden);
  expect(startHosting).not.toHaveBeenCalled();
  playerJam.dispose();
});
test('Runtime composition fences account replacement during membership before hosting', async () => {
  createSession.mockImplementation(async () => { account = { isLoggedIn: true, accountIdentifier: Fixture.replacementAccount }; session = membership(true); emit(); return true; });
  const { playerJam } = require(Imports.runtime);
  await playerJam.startSharing();
  expect(startHosting).not.toHaveBeenCalled();
  expect(startFollowing).not.toHaveBeenCalled();
  playerJam.dispose();
});
test('Actual queue lifecycle releases owner following and starts hosting only after the replacement receipt', async () => {
  session = membership(true); following = { status: SharedPlaybackStatus.Following, failure: null };
  const { playerJam } = require(Imports.runtime);
  const acknowledgeAuthorityRelease = jest.fn(async () => undefined);
  const receipt = await prepareQueueChange({ kind: Fixture.replace,
    tracks: [{ recordingIdentifier: Fixture.recording }], isCurrent: () => true, acknowledgeAuthorityRelease });
  expect(stopFollowing).toHaveBeenCalledTimes(Fixture.firstGeneration);
  expect(acknowledgeAuthorityRelease).toHaveBeenCalledTimes(Fixture.firstGeneration);
  expect(startHosting).not.toHaveBeenCalled();
  await receipt.committed();
  expect(startHosting).toHaveBeenCalledWith(Fixture.country);
  expect(playerJam.getSnapshot().mode).toBe(SpotifyPlayerJamMode.Hosting);
  playerJam.dispose();
});
test('Actual queue lifecycle preserves a guest follower when an app selection requests replacement', async () => {
  session = membership(false); following = { status: SharedPlaybackStatus.Following, failure: null };
  const { playerJam } = require(Imports.runtime);
  const acknowledgeAuthorityRelease = jest.fn(async () => undefined);
  await expect(prepareQueueChange({ kind: Fixture.replace,
    tracks: [{ recordingIdentifier: Fixture.recording }], isCurrent: () => true, acknowledgeAuthorityRelease }))
    .rejects.toMatchObject({ code: IntegrationFailureCode.Unsupported });
  expect(stopFollowing).not.toHaveBeenCalled();
  expect(acknowledgeAuthorityRelease).not.toHaveBeenCalled();
  expect(startHosting).not.toHaveBeenCalled();
  playerJam.dispose();
});
test('Actual owned Jam begins app-led sharing when an app queue replaces local playback from Available', async () => {
  session = membership(true);
  const { playerJam } = require(Imports.runtime);
  expect(playerJam.getSnapshot().mode).toBe(SpotifyPlayerJamMode.Available);
  const receipt = await prepareQueueChange({ kind: Fixture.replace,
    tracks: [{ recordingIdentifier: Fixture.recording }], isCurrent: () => true,
    acknowledgeAuthorityRelease: async () => undefined });
  expect(startHosting).not.toHaveBeenCalled(); await receipt.committed();
  expect(startHosting).toHaveBeenCalledWith(Fixture.country);
  expect(playerJam.getSnapshot().mode).toBe(SpotifyPlayerJamMode.Hosting);
  playerJam.dispose();
});

test('Runtime composition passes the actual selected album recording to active-host preparation', async () => {
  session = membership(true); hosting = { status: SpotifyHostingStatus.Hosting, failure: null };
  const { playerJam } = require(Imports.runtime);
  const receipt = await prepareQueueChange({ kind: Fixture.replace,
    tracks: [{ recordingIdentifier: Fixture.openerRecording }, { recordingIdentifier: Fixture.recording }],
    selectedRecordingIdentifier: Fixture.recording, isCurrent: () => true, acknowledgeAuthorityRelease: async () => undefined });
  expect(prepareRecordings).toHaveBeenCalledWith([Fixture.recording]);
  await receipt.committed(); playerJam.dispose();
});

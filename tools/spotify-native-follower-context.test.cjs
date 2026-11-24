const test = require('node:test');
const assertion = require('node:assert/strict');
const { JamConnectionStatus } = require('streaming-service-spotify-jam');
const { captureSpotifyNativeFollowerContext } = require('../.build/spotify/SpotifyNativeFollowerContext');
const Fixture = Object.freeze({ account: 'synthetic-app-account', spotifyAccount: 'synthetic-spotify-account', other: 'synthetic-other-account',
  session: 'synthetic-jam', host: 'synthetic-host', address: 'https://synthetic.example/', handle: 3, generation: 4,
  participantName: 'Synthetic participant', emptyCount: 0, single: 1 });
function fixture() {
  return { useNativeConnection: true, applicationAccount: { isLoggedIn: true, accountIdentifier: Fixture.account }, baseAddress: Fixture.address,
    session: { status: JamConnectionStatus.Ready, accountIdentifier: Fixture.spotifyAccount,
      session: { identifier: Fixture.session, active: true, ownedByCurrentAccount: false, hostDeviceIdentifier: Fixture.host,
        participants: [{ identifier: Fixture.spotifyAccount, displayName: Fixture.participantName }] } },
    getConnection: () => ({ handle: Fixture.handle, generation: Fixture.generation }) };
}
test('An admitted native guest captures the exact app, Spotify, Jam, host and native scope', () => {
  const input = fixture(); const context = captureSpotifyNativeFollowerContext(input);
  assertion.deepEqual(context, { streamingServiceAccountIdentifier: Fixture.account, spotifyAccountIdentifier: Fixture.spotifyAccount,
    jamSessionIdentifier: Fixture.session, hostDeviceIdentifier: Fixture.host, baseAddress: Fixture.address, handle: Fixture.handle, generation: Fixture.generation });
});
test('An owned native session remains eligible without participant projection', () => {
  const input = fixture(); input.session.session.ownedByCurrentAccount = true; input.session.session.participants = [];
  assertion.notEqual(captureSpotifyNativeFollowerContext(input), null);
});
test('Unadmitted and replacement-account guests cannot capture a follower context', () => {
  const input = fixture(); input.session.session.participants = []; assertion.equal(captureSpotifyNativeFollowerContext(input), null);
  input.session.session.participants = [{ identifier: Fixture.other, displayName: Fixture.participantName }];
  assertion.equal(captureSpotifyNativeFollowerContext(input), null);
});
test('Browser sign-in cannot use native guest playback or consult a native connection', () => {
  const input = fixture(); input.useNativeConnection = false; let reads = Fixture.emptyCount;
  input.getConnection = () => { reads += Fixture.single; return null; };
  assertion.equal(captureSpotifyNativeFollowerContext(input), null); assertion.equal(reads, Fixture.emptyCount);
});
test('Inactive, missing-host and uncertain membership prevent guest following', () => {
  const input = fixture(); input.session.session.active = false; assertion.equal(captureSpotifyNativeFollowerContext(input), null);
  input.session.session.active = true; input.session.session.hostDeviceIdentifier = null; assertion.equal(captureSpotifyNativeFollowerContext(input), null);
  input.session.session.hostDeviceIdentifier = Fixture.host; input.session.status = JamConnectionStatus.Uncertain;
  assertion.equal(captureSpotifyNativeFollowerContext(input), null);
});
test('Missing application authentication and missing native descriptors reject guest following', () => {
  const input = fixture(); input.applicationAccount.isLoggedIn = false; assertion.equal(captureSpotifyNativeFollowerContext(input), null);
  input.applicationAccount.isLoggedIn = true; input.applicationAccount.accountIdentifier = null; assertion.equal(captureSpotifyNativeFollowerContext(input), null);
  input.applicationAccount.accountIdentifier = Fixture.account; input.getConnection = () => null; assertion.equal(captureSpotifyNativeFollowerContext(input), null);
});
test('The connection lookup uses the actual Spotify account and permits a verified recovery generation', () => {
  const input = fixture(); input.getConnection = accountIdentifier => { assertion.equal(accountIdentifier, Fixture.spotifyAccount);
    return { handle: Fixture.handle, generation: Fixture.generation + Fixture.single }; };
  assertion.equal(captureSpotifyNativeFollowerContext(input).generation, Fixture.generation + Fixture.single);
});
test('An in-flight permitted Jam command retains the same verified native follower context', () => {
  const input = fixture(); const before = captureSpotifyNativeFollowerContext(input); input.session.status = JamConnectionStatus.Operating;
  assertion.deepEqual(captureSpotifyNativeFollowerContext(input), before);
});

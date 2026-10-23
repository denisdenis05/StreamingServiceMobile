const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict',
  browser: '../.build/spotify/SpotifyLoginBrowser', queue: '../.build/spotify/SpotifyQueueTrack', library: 'streaming-service-spotify-jam' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
const { SpotifyLoginBrowserAdapter } = require(Imports.browser);
const library = require(Imports.library);
const Fixture = Object.freeze({ authorizationAddress: 'https://accounts.spotify.com/authorize', callback: 'streamingservicespotify://callback?code=test&state=test',
  redirectAddress: 'streamingservicespotify://callback', success: 'success', cancel: 'cancel', initialCalls: 0, singleCall: 1, callIncrement: 1,
  identifier: '0123456789abcdefghijkl', uri: 'spotify:track:0123456789abcdefghijkl', address: 'https://open.spotify.com/track/0123456789abcdefghijkl?si=test',
  foreign: 'https://example.com/track/0123456789abcdefghijkl', userinfo: 'https://user@open.spotify.com/track/0123456789abcdefghijkl',
  insecure: 'http://open.spotify.com/track/0123456789abcdefghijkl', album: 'https://open.spotify.com/album/0123456789abcdefghijkl',
  port: 'https://open.spotify.com:444/track/0123456789abcdefghijkl', malformed: 'spotify:track:invalid', rawError: 'private browser error' });
const Names = Object.freeze({ open: 'Login browser returns callback only from successful authorization',
  unavailable: 'Unavailable authorization browser reports unsupported', canceled: 'Canceled browser result reports cancellation',
  before: 'Canceled login does not open a browser', during: 'Canceling an open login closes authorization and discards the callback',
  failure: 'Browser failures are sanitized', malformed: 'Successful browser response must contain a callback',
  validTrack: 'Queue inputs accept Spotify track IDs, URIs and share links', invalidTrack: 'Queue inputs reject foreign, nontrack and unsafe references' });
function fixture() {
  const calls = { opened: Fixture.initialCalls, closed: Fixture.initialCalls };
  const platform = { isAvailable: async () => true, openAuthorization: async () => { calls.opened += Fixture.callIncrement; return { type: Fixture.success, url: Fixture.callback }; },
    closeAuthorization: () => { calls.closed += Fixture.callIncrement; } };
  return { platform, calls, browser: new SpotifyLoginBrowserAdapter(platform), cancellation: new AbortController() };
}
function authorize(current) { return current.browser.authorize(Fixture.authorizationAddress, Fixture.redirectAddress, current.cancellation.signal); }
test(Names.open, async () => { const current = fixture(); assertion.equal(await authorize(current), Fixture.callback); assertion.equal(current.calls.opened, Fixture.singleCall); });
test(Names.unavailable, async () => { const current = fixture(); current.platform.isAvailable = async () => false;
  await assertion.rejects(authorize(current), { code: library.IntegrationFailureCode.Unsupported }); assertion.equal(current.calls.opened, Fixture.initialCalls); });
test(Names.canceled, async () => { const current = fixture(); current.platform.openAuthorization = async () => ({ type: Fixture.cancel });
  await assertion.rejects(authorize(current), { code: library.IntegrationFailureCode.Canceled }); });
test(Names.before, async () => { const current = fixture(); current.cancellation.abort();
  await assertion.rejects(authorize(current), { code: library.IntegrationFailureCode.Canceled }); assertion.equal(current.calls.opened, Fixture.initialCalls); });
test(Names.during, async () => { const current = fixture(); let finish; let started;
  const opening = new Promise(resolve => { started = resolve; }); current.platform.openAuthorization = () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const pending = authorize(current); await opening; current.cancellation.abort(); finish({ type: Fixture.success, url: Fixture.callback });
  await assertion.rejects(pending, { code: library.IntegrationFailureCode.Canceled }); assertion.equal(current.calls.closed, Fixture.singleCall); });
test(Names.failure, async () => { const current = fixture(); current.platform.openAuthorization = async () => { throw new Error(Fixture.rawError); };
  await assertion.rejects(authorize(current), { code: library.IntegrationFailureCode.Network }); });
test(Names.malformed, async () => { const current = fixture(); current.platform.openAuthorization = async () => ({ type: Fixture.success });
  await assertion.rejects(authorize(current), { code: library.IntegrationFailureCode.InvalidResponse }); });

const CloseFailureName = 'Native browser close failure cannot escape cancellation dispatch';
test(CloseFailureName, async () => { const current = fixture(); let finish; let started;
  const opening = new Promise(resolve => { started = resolve; });
  current.platform.openAuthorization = () => { started(); return new Promise(resolve => { finish = resolve; }); };
  current.platform.closeAuthorization = () => { throw new Error(Fixture.rawError); };
  const pending = authorize(current); await opening;
  assertion.doesNotThrow(() => current.cancellation.abort()); finish({ type: Fixture.success, url: Fixture.callback });
  await assertion.rejects(pending, { code: library.IntegrationFailureCode.Canceled });
});

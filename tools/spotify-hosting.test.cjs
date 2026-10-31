const test = require('node:test');
const assertion = require('node:assert/strict');
const { SpotifyHostingStore, SpotifyHostingStatus } = require('../.build/spotify/SpotifyHostingStore');
const { IntegrationFailureCode } = require('streaming-service-spotify-jam');
const Fixture = Object.freeze({ account: 'synthetic-account', spotify: 'synthetic-spotify', jam: 'synthetic-jam', device: 'synthetic-device', previous: 'synthetic-host',
  address: 'https://synthetic.example/', token: 'synthetic-token', handle: 3, generation: 7, market: 'GB', track: '4uLU6hMCjMI75M1A2tKUQC',
  queue: 'synthetic-queue', occurrence: 'synthetic-occurrence', recording: 'synthetic-recording', engine: 'synthetic-engine', authentication: 'synthetic-authentication',
  revision: 1, emptyCount: 0, singleCount: 1, flushTurns: 30, invalidMarket: 'invalid', invalidTrack: 'invalid', privateFailure: 'synthetic-private-error', stopped: '{"status":"Stopped","identity":null,"failure":null}' });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.flushTurns; turn += Fixture.singleCount) await Promise.resolve(); }
function fixture() {
  const context = { streamingServiceAccountIdentifier: Fixture.account, baseAddress: Fixture.address, spotifyAccountIdentifier: Fixture.spotify,
    jamSessionIdentifier: Fixture.jam, deviceIdentifier: Fixture.device, previousHostDeviceIdentifier: Fixture.previous, handle: Fixture.handle, generation: Fixture.generation };
  const queue = { playerEngineEpoch: Fixture.engine, playerAuthenticationEpoch: Fixture.authentication, expectedCursor: {
    queueIdentifier: Fixture.queue, queueRevision: Fixture.revision, contentRevision: Fixture.revision, controlRevision: Fixture.revision },
    entries: [{ occurrenceIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.recording }] };
  const state = { context, queue, stop: null, translation: null, initial: null, startFailure: null, stopFailure: null, translationFailure: null, track: Fixture.track };
  const calls = { starts: [], following: Fixture.emptyCount, translations: Fixture.emptyCount };
  let observed; let changed;
  const response = () => JSON.stringify({ status: SpotifyHostingStatus.Hosting, identity: { ...context, playerEngineEpoch: Fixture.engine, playerAuthenticationEpoch: Fixture.authentication }, failure: null });
  const store = new SpotifyHostingStore({ native: { async startHosting(serialized) { calls.starts.push(JSON.parse(serialized)); if (state.startFailure) throw state.startFailure; return response(); },
    async stopHosting() { if (state.stopFailure) throw state.stopFailure; if (state.stop) await state.stop.promise; }, async getHostingSnapshot() { return state.initial ? state.initial.promise : Fixture.stopped; } },
    observe(listener) { observed = listener; return () => undefined; }, getContext: () => state.context,
    subscribeConnection(listener) { changed = listener; return () => undefined; }, getAccessToken: () => Fixture.token,
    async whenPlayerReady() {}, async captureQueue() { return state.queue; }, async translate() { calls.translations += Fixture.singleCount; if (state.translationFailure) throw state.translationFailure; if (state.translation) await state.translation.promise; return state.track; },
    async stopFollowing() { calls.following += Fixture.singleCount; } });
  return { store, state, calls, response, observed: event => observed(event), changed: () => changed() };
}
test('Hosting sends actual queue mappings, epochs and the local native device only after cleanup', async () => {
  const current = fixture(); await current.store.start(Fixture.market);
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
  assertion.equal(current.calls.following, Fixture.singleCount);
  assertion.equal(current.calls.starts[Fixture.emptyCount].hostDeviceIdentifier, Fixture.device);
  assertion.equal(current.calls.starts[Fixture.emptyCount].mappings[Fixture.emptyCount].occurrenceIdentifier, Fixture.occurrence);
});
test('Changed account or native scope during matching prevents activation', async () => {
  const current = fixture(); current.state.translation = deferred(); const start = current.store.start(Fixture.market); await flush();
  current.state.context = null; current.state.translation.resolve(); await start;
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Superseded);
});
test('Explicit stop cancels delayed preparation and cannot activate later', async () => {
  const current = fixture(); current.state.translation = deferred(); const start = current.store.start(Fixture.market); await flush();
  await current.store.stop(); current.state.translation.resolve(); await start;
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Stopped);
});
test('Malformed market and uncertain catalog result never activate', async () => {
  const current = fixture(); await current.store.start(Fixture.invalidMarket); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  current.state.track = Fixture.invalidTrack; await current.store.start(Fixture.market); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
});
test('Disposing a React view does not stop acknowledged native hosting', async () => {
  const current = fixture(); await current.store.start(Fixture.market); current.store.dispose();
  current.observed(Fixture.stopped); assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
});
test('Late stop completion cannot replace a newer preparation', async () => {
  const current = fixture(); current.state.stop = deferred(); const stopping = current.store.stop();
  const start = current.store.start(Fixture.market); current.state.stop.resolve(); await stopping; await start;
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
});
test('Changed local queue during translation fails before native activation', async () => {
  const current = fixture(); current.state.translation = deferred(); const start = current.store.start(Fixture.market); await flush();
  current.state.queue = { ...current.state.queue, expectedCursor: { ...current.state.queue.expectedCursor, controlRevision: Fixture.revision + Fixture.singleCount } };
  current.state.translation.resolve(); await start; assertion.equal(current.calls.starts.length, Fixture.emptyCount);
});
test('Foreign or malformed native observations never become hosting acknowledgement', async () => {
  const current = fixture(); await flush(); current.observed(JSON.stringify({ status: SpotifyHostingStatus.Hosting, identity: { handle: Fixture.handle }, failure: null }));
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Stopped);
  current.observed(Fixture.invalidTrack); assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
});

for (const code of Object.values(IntegrationFailureCode)) {
  test(`Native hosting rejection preserves safe category ${code}`, async () => {
    const current = fixture(); current.state.startFailure = { code, message: Fixture.privateFailure };
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().failure, code);
    assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  });
  test(`Native hosting snapshot preserves safe category ${code}`, async () => {
    const current = fixture(); await current.store.start(Fixture.market);
    current.observed(JSON.stringify({ ...JSON.parse(current.response()), status: SpotifyHostingStatus.Failed, failure: code }));
    assertion.equal(current.store.getSnapshot().failure, code);
  });
}
test('Cleanup and catalog rejections preserve their safe failure categories', async () => {
  const cleanup = fixture(); cleanup.state.stopFailure = { code: IntegrationFailureCode.UnknownOutcome };
  await cleanup.store.start(Fixture.market);
  assertion.equal(cleanup.store.getSnapshot().failure, IntegrationFailureCode.UnknownOutcome);
  assertion.equal(cleanup.calls.translations, Fixture.emptyCount);
  const catalog = fixture(); catalog.state.translationFailure = { code: IntegrationFailureCode.Backpressure };
  await catalog.store.start(Fixture.market);
  assertion.equal(catalog.store.getSnapshot().failure, IntegrationFailureCode.Backpressure);
  assertion.equal(catalog.calls.starts.length, Fixture.emptyCount);
});
test('Explicit stop preserves safe native rejection without exposing private error data', async () => {
  const current = fixture(); current.state.stopFailure = { code: IntegrationFailureCode.Canceled, message: Fixture.privateFailure };
  await assertion.rejects(current.store.stop());
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Canceled);
  assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
});
test('Unknown and throwing native error codes stay private and become network failures', async () => {
  const failures = [null, Fixture.privateFailure, { code: Fixture.privateFailure },
    { get code() { throw new Error(Fixture.privateFailure); } }];
  for (const failure of failures) {
    const current = fixture(); current.state.startFailure = failure ?? { message: Fixture.privateFailure };
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
    assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  }
});
test('Unknown native snapshot failures stay private and become network failures', async () => {
  const current = fixture(); await current.store.start(Fixture.market);
  current.observed(JSON.stringify({ ...JSON.parse(current.response()), status: SpotifyHostingStatus.Failed, failure: Fixture.privateFailure }));
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
  assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
});

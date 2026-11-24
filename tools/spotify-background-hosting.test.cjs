const test = require('node:test');
const assertion = require('node:assert/strict');
const { SpotifyBackgroundHostingTask } = require('../.build/spotify/SpotifyBackgroundHostingTask');
const { IntegrationFailureCode } = require('streaming-service-spotify-jam');
const Fixture = Object.freeze({ request: 'synthetic-request', account: 'synthetic-account', spotify: 'synthetic-spotify', jam: 'synthetic-jam',
  host: 'synthetic-host', address: 'https://synthetic.example/', recording: 'synthetic-recording', track: '4uLU6hMCjMI75M1A2tKUQC',
  market: 'GB', handle: 3, generation: 7, emptyCount: 0, singleCount: 1, turns: 30, otherAccount: 'synthetic-other-account' });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.turns; turn += Fixture.singleCount) await Promise.resolve(); }
function fixture() {
  const job = { requestIdentifier: Fixture.request, streamingServiceAccountIdentifier: Fixture.account, spotifyAccountIdentifier: Fixture.spotify,
    jamSessionIdentifier: Fixture.jam, hostDeviceIdentifier: Fixture.host, handle: Fixture.handle, generation: Fixture.generation,
    baseAddress: Fixture.address, recordingIdentifier: Fixture.recording, market: Fixture.market };
  const state = { job, pending: true, account: Fixture.account, match: null, failure: null, track: Fixture.track };
  const calls = { failureCodes: [], completed: [], failures: [], matched: Fixture.emptyCount, timer: null, cancelled: false };
  const task = new SpotifyBackgroundHostingTask({ async claim() { return state.job; }, async isPending() { return state.pending; },
    async complete(identifier, track) { calls.completed.push([identifier, track]); }, async fail(identifier, code) { calls.failures.push(identifier); calls.failureCodes.push(code); if (state.failure) await state.failure.promise; },
    async restoreAccount() {}, currentAccountIdentifier: () => state.account,
    async match() { if (state.matchFailure) throw state.matchFailure; calls.matched += Fixture.singleCount; if (state.match) await state.match.promise; return state.track; },
    scheduler: { schedule(_delay, action) { calls.timer = action; return () => { calls.cancelled = true; }; } } });
  return { state, calls, task };
}
test('A scoped background match completes the original recording job without exposing credentials', async () => {
  const current = fixture(); await current.task.execute(Fixture.request);
  assertion.deepEqual(current.calls.completed, [[Fixture.request, Fixture.track]]); assertion.equal(current.calls.cancelled, true);
});
test('Account replacement while matching prevents a late successful completion', async () => {
  const current = fixture(); current.state.match = deferred(); const running = current.task.execute(Fixture.request); await flush();
  current.state.account = Fixture.otherAccount; current.state.match.resolve(); await running;
  assertion.equal(current.calls.completed.length, Fixture.emptyCount); assertion.deepEqual(current.calls.failures, [Fixture.request]);
});
test('An expired native scope is rejected before querying the catalog', async () => {
  const current = fixture(); current.state.pending = false; await current.task.execute(Fixture.request);
  assertion.equal(current.calls.matched, Fixture.emptyCount); assertion.equal(current.calls.completed.length, Fixture.emptyCount);
});
test('Ambiguous matching cannot choose or complete a Spotify track', async () => {
  const current = fixture(); current.state.track = null; await current.task.execute(Fixture.request);
  assertion.equal(current.calls.completed.length, Fixture.emptyCount); assertion.deepEqual(current.calls.failures, [Fixture.request]);
});
test('The task deadline retires work and ignores a later catalog response', async () => {
  const current = fixture(); current.state.match = deferred(); const running = current.task.execute(Fixture.request); await flush();
  current.calls.timer(); await running; current.state.match.resolve(); await flush(); assertion.equal(current.calls.completed.length, Fixture.emptyCount);
});
test('A malformed claim is refused without catalog or native search work', async () => {
  const current = fixture(); current.state.job = { ...current.state.job, handle: String(Fixture.handle) }; await current.task.execute(Fixture.request);
  assertion.equal(current.calls.matched, Fixture.emptyCount); assertion.equal(current.calls.completed.length, Fixture.emptyCount);
});

test('A native failure acknowledgement that never settles cannot hold a failed task beyond its deadline', async () => {
  const current = fixture(); current.state.track = null; current.state.failure = deferred();
  let completed = false;
  const running = current.task.execute(Fixture.request).then(() => { completed = true; });
  await flush(); assertion.deepEqual(current.calls.failures, [Fixture.request]);
  assertion.equal(completed, false); current.calls.timer(); await flush();
  assertion.equal(completed, true); assertion.equal(current.calls.cancelled, true);
  current.state.failure.resolve(); await running;
  assertion.equal(current.calls.completed.length, Fixture.emptyCount);
});

test('An expired match task settles even when native failure cleanup never acknowledges', async () => {
  const current = fixture(); current.state.match = deferred(); current.state.failure = deferred();
  let completed = false;
  const running = current.task.execute(Fixture.request).then(() => { completed = true; });
  await flush(); current.calls.timer(); await flush();
  assertion.equal(completed, true); assertion.equal(current.calls.cancelled, true);
  assertion.deepEqual(current.calls.failures, [Fixture.request]);
  current.state.failure.resolve(); current.state.match.resolve(); await running; await flush();
  assertion.equal(current.calls.completed.length, Fixture.emptyCount);
});

for (const code of Object.values(IntegrationFailureCode)) {
  test(`Background hosting preserves safe catalog failure ${code}`, async () => {
    const current = fixture(); current.state.matchFailure = { code };
    await current.task.execute(Fixture.request);
    assertion.deepEqual(current.calls.failureCodes, [code]);
    assertion.equal(current.calls.completed.length, Fixture.emptyCount);
  });
}
test('Unknown background hosting failures become Network without copying private details', async () => {
  const current = fixture(); current.state.matchFailure = new Error(Fixture.recording);
  await current.task.execute(Fixture.request);
  assertion.deepEqual(current.calls.failureCodes, [IntegrationFailureCode.Network]);
});

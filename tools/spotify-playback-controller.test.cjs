const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  controller: '../.build/spotify/SpotifyPlaybackController', protocol: '../.build/spotify/SpotifyJamPlaybackProtocol' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { SharedPlaybackStatus, IntegrationFailureCode } = require(Modules.library);
const { EmptySpotifyPlaybackSnapshot } = require(Modules.protocol);
const { SpotifyPlaybackController } = require(Modules.controller);
const Fixture = Object.freeze({ market: 'RO', emptyCount: 0, singleCount: 1, microtaskFlushTurns: 20, privateFailure: 'synthetic-private-failure' });
const Names = Object.freeze({ selected: 'The app selects exactly the native follower for device login and the foreground follower for browser login',
  cleanup: 'A different follower cannot start before both old playback authorities finish cleanup',
  failed: 'A failed native follower never starts the JavaScript follower as a fallback',
  background: 'Backgrounding preserves native following and stops foreground-only listening',
  pending: 'Backgrounding during route preparation prevents a late follower start',
  replacement: 'A stopped route preparation cannot replace the next explicit following request',
  restored: 'The app adopts an already restored native follower view without starting playback',
  dispose: 'Disposing app controls detaches native observation while cleaning up foreground playback',
  stop: 'An explicit stop waits for both playback authorities and exposes cleanup failures safely' });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.microtaskFlushTurns; turn += Fixture.singleCount) await Promise.resolve(); }
function control() {
  const listeners = new Set(); const calls = { starts: [], stops: Fixture.emptyCount, active: [], disposals: Fixture.emptyCount };
  const state = { snapshot: EmptySpotifyPlaybackSnapshot, stop: null, fail: false };
  function publish(status, failure = null) { state.snapshot = { ...EmptySpotifyPlaybackSnapshot, status, failure }; [...listeners].forEach(listener => listener()); }
  return { state, calls, publish, getSnapshot: () => state.snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start(market) { calls.starts.push(market); publish(state.fail ? SharedPlaybackStatus.Failed : SharedPlaybackStatus.Following,
      state.fail ? IntegrationFailureCode.Unsupported : null); },
    async stop() { calls.stops += Fixture.singleCount; if (state.stop) await state.stop.promise; publish(SharedPlaybackStatus.Detached); },
    setActive(active) { calls.active.push(active); }, dispose() { calls.disposals += Fixture.singleCount; listeners.clear(); },
  };
}
function fixture(nativeSelected = true, stopHosting) {
  const native = control(); const foreground = control(); const state = { nativeSelected };
  const controller = new SpotifyPlaybackController({ native, foreground, useNative: () => state.nativeSelected, ...(stopHosting ? { stopHosting } : {}) });
  return { native, foreground, state, controller };
}
test(Names.selected, async () => {
  for (const selected of [true, false]) {
    const current = fixture(selected); await current.controller.start(Fixture.market);
    assertion.deepEqual((selected ? current.native : current.foreground).calls.starts, [Fixture.market]);
    assertion.equal((selected ? current.foreground : current.native).calls.starts.length, Fixture.emptyCount);
  }
});
test(Names.cleanup, async () => {
  const current = fixture(); current.foreground.state.stop = deferred();
  const started = current.controller.start(Fixture.market); await flush(); assertion.equal(current.native.calls.starts.length, Fixture.emptyCount);
  current.foreground.state.stop.resolve(); await started; assertion.equal(current.native.calls.starts.length, Fixture.singleCount);
});
test(Names.failed, async () => {
  const current = fixture(); current.native.state.fail = true; await current.controller.start(Fixture.market);
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Unsupported);
  assertion.equal(current.foreground.calls.starts.length, Fixture.emptyCount);
});
test(Names.background, async () => {
  const current = fixture(); await current.controller.start(Fixture.market); const stops = current.native.calls.stops;
  current.controller.setActive(false); await flush(); assertion.equal(current.native.calls.stops, stops);
  assertion.equal(current.controller.getSnapshot().status, SharedPlaybackStatus.Following);
  current.controller.setActive(true); current.state.nativeSelected = false; await current.controller.start(Fixture.market);
  current.controller.setActive(false); await flush(); assertion.equal(current.controller.getSnapshot().status, SharedPlaybackStatus.Detached);
});
test(Names.pending, async () => {
  const current = fixture(); current.foreground.state.stop = deferred(); const started = current.controller.start(Fixture.market);
  current.controller.setActive(false); current.foreground.state.stop.resolve(); await started;
  assertion.equal(current.native.calls.starts.length, Fixture.emptyCount);
});
test(Names.replacement, async () => {
  const current = fixture(); const cleanup = deferred(); current.foreground.state.stop = cleanup;
  const first = current.controller.start(Fixture.market); const stopped = current.controller.stop();
  current.state.nativeSelected = false; const second = current.controller.start(Fixture.market);
  cleanup.resolve(); await Promise.all([first, stopped, second]);
  assertion.equal(current.native.calls.starts.length, Fixture.emptyCount); assertion.equal(current.foreground.calls.starts.length, Fixture.singleCount);
  assertion.equal(current.controller.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.restored, () => {
  const current = fixture(); current.native.publish(SharedPlaybackStatus.Following);
  assertion.equal(current.controller.getSnapshot().status, SharedPlaybackStatus.Following);
  assertion.equal(current.native.calls.starts.length, Fixture.emptyCount);
});
test(Names.dispose, async () => {
  const current = fixture(); await current.controller.start(Fixture.market); const stops = current.native.calls.stops;
  await current.controller.dispose(); assertion.equal(current.native.calls.disposals, Fixture.singleCount);
  assertion.equal(current.native.calls.stops, stops); assertion.equal(current.foreground.calls.disposals, Fixture.singleCount);
});
test(Names.stop, async () => {
  const current = fixture(); await current.controller.start(Fixture.market); current.native.state.stop = deferred();
  const stopped = current.controller.stop(); current.native.state.stop.reject(new Error(Fixture.privateFailure)); await assertion.rejects(stopped);
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Network);
  assertion.equal(JSON.stringify(current.controller.getSnapshot()).includes(Fixture.privateFailure), false);
});

test('Starting a follower waits for actual host retirement', async () => {
  const cleanup = deferred(); const current = fixture(true, () => cleanup.promise);
  const started = current.controller.start(Fixture.market); await flush();
  assertion.equal(current.native.calls.starts.length, Fixture.emptyCount);
  cleanup.resolve(); await started; assertion.equal(current.native.calls.starts.length, Fixture.singleCount);
});

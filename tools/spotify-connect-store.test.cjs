const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  store: '../.build/spotify/SpotifyConnectStore' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyConnectStore, SpotifyConnectStatus } = require(Imports.store);
const Fixture = Object.freeze({ account: 'synthetic-account', otherAccount: 'replacement-account', stored: 'synthetic-private-record',
  device: 'synthetic-native-device', deviceName: 'StreamingService', requestPrefix: 'connect-test-', handle: 4, otherHandle: 5, generation: 2, staleGeneration: 1, nextGeneration: 3,
  zero: 0, one: 1, observedMilliseconds: 123, nativeMilliseconds: 124, privateFailure: 'private native response',
  registered: 'registered', connecting: 'connecting', reconnecting: 'reconnecting', membership: 'membership', stopped: 'stopped',
  clusterVerification: 'cluster', statusVerification: 'deviceStatus',
  names: { start: 'Native connection starts only with the selected account and a private reusable credential',
    account: 'Cross-account native credentials fail before any native dispatch',
    registration: 'Native readiness requires account device registration and matching batch handle',
    replace: 'Replacement waits for native cleanup and fences all retired events',
    cancellation: 'Abort during queued native start closes the dispatched owner and ignores its late completion',
    generation: 'Reconnect clears readiness and older generation messages cannot restore it',
    malformed: 'Malformed and foreign-account native events retire the connection with safe failures',
    members: 'Membership pushes request passive recovery only after registration',
    refresh: 'Native refresh preserves the active owner and native generation',
    reentrant: 'A subscriber that detaches during a new generation cannot be overwritten by registration',
    cleanup: 'Failed native cleanup blocks replacement instead of registering over a live device',
    terminal: 'Native terminal failure preserves the preceding actionable failure category',
    unsupported: 'Missing native support and pre-canceled attachment cannot start a connection',
    nestedCancellation: 'Canceling an attachment waiting for cleanup cannot bypass the original native cleanup barrier',
    cleanupRetry: 'An explicit later attachment retries failed cleanup before starting a replacement',
    hidden: 'Hidden observer registration accepts an explicit native device-status verification without inventing a cluster device',
    invalidIdentifier: 'A failed identifier factory cannot retire the valid current device or expose its exception',
    detachedObserver: 'A replacement requested by a detached observer waits for the original cleanup',
    failedObserver: 'A replacement requested by a failed observer cannot overtake native cleanup' } });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
function fixture() {
  const listeners = new Set(); const calls = { starts: [], closes: [], refreshes: [], membership: Fixture.zero };
  const state = { credential: { accountIdentifier: Fixture.account, storedCredential: Fixture.stored }, start: null, close: null };
  const provider = { getNativeSessionCredential: async () => state.credential };
  const started = deferred();
  let sequence = Fixture.zero;
  const native = { async start(identifier, serialized) { calls.starts.push({ identifier, input: JSON.parse(serialized) }); started.resolve(); return state.start ? state.start.promise : Fixture.handle; },
    async close(identifier) { calls.closes.push(identifier); if (state.close) await state.close.promise; },
    async refresh(identifier, generation) { calls.refreshes.push({ identifier, generation }); } };
  const dependencies = { native: () => native, observe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    nextIdentifier: () => Fixture.requestPrefix + (sequence += Fixture.one), membershipChanged: () => { calls.membership += Fixture.one; } };
  const store = new SpotifyConnectStore(dependencies); const cancellation = new AbortController();
  return { store, state, provider, calls, dependencies, cancellation, listeners, started,
    attach: () => store.attach(provider, Fixture.account, cancellation.signal),
    send(data, generation = Fixture.generation, handle = Fixture.handle) {
      const event = { identifier: calls.starts.at(-Fixture.one).identifier, batch: JSON.stringify({ handle, finished: false,
        sampledNativeMonotonicMilliseconds: Fixture.nativeMilliseconds,
        events: [{ generation, observedMonotonicMilliseconds: Fixture.observedMilliseconds, data }] }) };
      for (const listener of [...listeners]) listener(event);
      return event;
    } };
}
function registration(accountIdentifier = Fixture.account) { return { type: Fixture.registered, accountIdentifier, deviceIdentifier: Fixture.device,
  verificationSource: Fixture.clusterVerification,
  cluster: { devices: [{ identifier: Fixture.device }] } }; }
test(Fixture.names.start, async () => { const current = fixture(); await current.attach();
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Connecting);
  assert.deepEqual(current.calls.starts[Fixture.zero].input, { accountIdentifier: Fixture.account, storedCredential: Fixture.stored,
    configuration: { name: Fixture.deviceName, playbackReady: false } });
  assert.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.stored), false); await current.store.detach();
});
test(Fixture.names.account, async () => { const current = fixture(); current.state.credential.accountIdentifier = Fixture.otherAccount;
  await assert.rejects(current.attach(), { code: library.IntegrationFailureCode.Unauthorized });
  assert.deepEqual(current.calls.starts, []); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Failed);
});
test(Fixture.names.registration, async () => { const current = fixture(); await current.attach(); current.send(registration());
  assert.equal(current.store.getSnapshot().deviceIdentifier, Fixture.device); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready);
  current.send(registration(), Fixture.generation, Fixture.otherHandle);
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Failed); await current.store.detach();
});
test(Fixture.names.replace, async () => { const current = fixture(); await current.attach(); current.send(registration());
  const previous = [...current.listeners]; current.state.close = deferred(); const replacement = current.attach(); await flush();
  assert.equal(current.calls.starts.length, Fixture.one); assert.equal(current.store.getSnapshot().deviceIdentifier, null);
  const stale = { identifier: current.calls.starts[Fixture.zero].identifier, batch: Fixture.privateFailure };
  previous.forEach(listener => listener(stale)); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Connecting);
  current.state.close.resolve(); await replacement; assert.equal(current.calls.starts.length, Fixture.one + Fixture.one);
  await current.store.detach();
});
test(Fixture.names.cancellation, async () => { const current = fixture(); current.state.start = deferred();
  const attaching = current.attach(); const rejected = assert.rejects(attaching, { code: library.IntegrationFailureCode.Canceled });
  await current.started.promise; current.cancellation.abort(); await flush(); current.state.start.resolve(Fixture.handle); await rejected; await current.store.detach();
  assert.equal(current.calls.closes.length, Fixture.one); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Detached);
});
test(Fixture.names.generation, async () => { const current = fixture(); await current.attach(); current.send(registration());
  current.send({ type: Fixture.reconnecting, failure: library.IntegrationFailureCode.Network });
  assert.equal(current.store.getSnapshot().deviceIdentifier, null);
  current.send({ type: Fixture.connecting }, Fixture.nextGeneration); current.send(registration(), Fixture.staleGeneration);
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Connecting);
  current.send(registration(), Fixture.nextGeneration); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready);
  await current.store.detach();
});
test(Fixture.names.malformed, async () => { for (const data of [registration(Fixture.otherAccount), { ...registration(), cluster: { devices: [] } }]) {
  const current = fixture(); await current.attach(); current.send(data); await flush();
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Failed); assert.equal(current.calls.closes.length, Fixture.one);
  assert.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.stored), false);
} });
test(Fixture.names.members, async () => { const current = fixture(); await current.attach(); current.send({ type: Fixture.membership });
  assert.equal(current.calls.membership, Fixture.zero); current.send(registration()); current.send({ type: Fixture.membership });
  assert.equal(current.calls.membership, Fixture.one); await current.store.detach();
});
test(Fixture.names.refresh, async () => { const current = fixture(); await current.attach();
  await assert.rejects(current.store.refresh(), { code: library.IntegrationFailureCode.Unsupported }); current.send(registration()); await current.store.refresh();
  assert.deepEqual(current.calls.refreshes, [{ identifier: current.calls.starts[Fixture.zero].identifier, generation: Fixture.generation }]);
  await current.store.detach();
});
test(Fixture.names.reentrant, async () => { const current = fixture(); await current.attach();
  const stop = current.store.subscribe(() => { if (current.store.getSnapshot().generation === Fixture.generation) void current.store.detach(); });
  current.send(registration()); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Detached); stop(); await current.store.detach();
});
test(Fixture.names.cleanup, async () => { const current = fixture(); await current.attach(); current.state.close = deferred();
  const cleanup = current.store.detach(); const rejected = assert.rejects(cleanup, { code: library.IntegrationFailureCode.Network });
  current.state.close.reject(new Error(Fixture.privateFailure)); await rejected;
  await assert.rejects(current.attach(), { code: library.IntegrationFailureCode.Network }); assert.equal(current.calls.starts.length, Fixture.one);
});
test(Fixture.names.terminal, async () => { const current = fixture(); await current.attach();
  current.send({ type: Fixture.reconnecting, failure: library.IntegrationFailureCode.Unauthorized });
  current.send({ type: Fixture.stopped, cleanupFailure: null });
  assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized); await current.store.detach();
});
test(Fixture.names.unsupported, async () => { const current = fixture(); current.dependencies.native = () => null;
  await assert.rejects(current.attach(), { code: library.IntegrationFailureCode.Unsupported });
  current.cancellation.abort(); await assert.rejects(current.attach(), { code: library.IntegrationFailureCode.Canceled });
  assert.deepEqual(current.calls.starts, []);
});
test(Fixture.names.nestedCancellation, async () => {
  const current = fixture(); await current.attach(); current.state.close = deferred();
  const pending = current.attach(); const rejected = assert.rejects(pending, { code: library.IntegrationFailureCode.Canceled });
  await flush(); const detaching = current.store.detach(); const replacement = current.attach(); await flush();
  assert.equal(current.calls.starts.length, Fixture.one);
  current.state.close.resolve(); await rejected; await detaching; await replacement;
  assert.equal(current.calls.starts.length, Fixture.one + Fixture.one); await current.store.detach();
});
test(Fixture.names.cleanupRetry, async () => {
  const current = fixture(); await current.attach(); current.state.close = deferred();
  const rejected = assert.rejects(current.store.detach(), { code: library.IntegrationFailureCode.Network });
  current.state.close.reject(new Error(Fixture.privateFailure)); await rejected;
  current.state.close = null; await current.attach(); assert.equal(current.calls.starts.length, Fixture.one + Fixture.one);
  await current.store.detach();
});
test(Fixture.names.hidden, async () => {
  const current = fixture(); await current.attach(); current.send({ ...registration(), verificationSource: Fixture.statusVerification, cluster: { devices: [] } });
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready); assert.equal(current.store.getSnapshot().deviceIdentifier, Fixture.device);
  await current.store.detach();
});
test(Fixture.names.invalidIdentifier, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  current.dependencies.nextIdentifier = () => { throw new Error(Fixture.privateFailure); };
  await assert.rejects(current.attach(), failure => failure.code === library.IntegrationFailureCode.InvalidInput && !failure.message.includes(Fixture.privateFailure));
  assert.equal(current.store.getSnapshot().deviceIdentifier, Fixture.device); assert.equal(current.calls.closes.length, Fixture.zero);
  await current.store.detach();
});
test(Fixture.names.detachedObserver, async () => {
  const current = fixture(); await current.attach(); current.state.close = deferred(); let replacement;
  const stop = current.store.subscribe(() => { if (current.store.getSnapshot().status === SpotifyConnectStatus.Detached && !replacement) replacement = current.attach(); });
  const cleanup = current.store.detach(); await flush(); assert.equal(current.calls.starts.length, Fixture.one);
  current.state.close.resolve(); await cleanup; await replacement; stop(); await current.store.detach();
});
test(Fixture.names.failedObserver, async () => {
  const current = fixture(); current.state.start = deferred(); current.state.close = deferred(); let replacement;
  const stop = current.store.subscribe(() => { if (current.store.getSnapshot().status === SpotifyConnectStatus.Failed && !replacement) {
    current.state.start = null; replacement = current.attach();
  } });
  const start = current.state.start; const attaching = current.attach(); const rejected = assert.rejects(attaching, { code: library.IntegrationFailureCode.Network });
  await current.started.promise; start.reject(new Error(Fixture.privateFailure)); await rejected; await flush();
  assert.equal(current.calls.starts.length, Fixture.one); current.state.close.resolve(); await replacement; stop(); await current.store.detach();
});

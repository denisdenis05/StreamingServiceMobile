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
    failedObserver: 'A replacement requested by a failed observer cannot overtake native cleanup',
    playbackBinding: 'Native playback receives only a ready account-bound handle and generation that retire on reconnect or detach' } });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
function fixture() {
  const listeners = new Set(); const calls = { searches: [], starts: [], closes: [], refreshes: [], reads: [], metadata: [], commands: [], canceledCommands: [], shutdowns: Fixture.zero, membership: Fixture.zero };
  const state = { credential: { accountIdentifier: Fixture.account, storedCredential: Fixture.stored }, start: null, close: null, shutdown: null, command: null, reading: null, metadata: null, nowMonotonicMilliseconds: ReadFixture.sent };
  const provider = { getNativeSessionCredential: async () => state.credential };
  const started = deferred();
  let sequence = Fixture.zero;
  const native = { async search(identifier, generation, serialized) {
      calls.searches.push({ identifier, generation, input: JSON.parse(serialized) });
      return JSON.stringify(state.searching ? await state.searching.promise : metadataResponse());
    }, async shutdown() { calls.shutdowns += Fixture.one; if (state.shutdown) await state.shutdown.promise; }, async metadata(identifier, generation, serialized) {
      const requested = JSON.parse(serialized); calls.metadata.push({ identifier, generation, requested });
      return JSON.stringify(state.metadata ? await state.metadata.promise : metadataResponse());
    }, async read(identifier, generation) {
      calls.reads.push({ identifier, generation });
      const value = state.reading ? await state.reading.promise : readResponse();
      state.nowMonotonicMilliseconds = ReadFixture.received;
      return JSON.stringify(value);
    }, async executeCommand(identifier, requestIdentifier, serialized) {
      calls.commands.push({ identifier, requestIdentifier, input: JSON.parse(serialized) }); if (state.command) await state.command.promise;
    }, async cancelCommand(identifier, requestIdentifier) { calls.canceledCommands.push({ identifier, requestIdentifier }); },
    async start(identifier, serialized) { calls.starts.push({ identifier, input: JSON.parse(serialized) }); started.resolve(); return state.start ? state.start.promise : Fixture.handle; },
    async close(identifier) { calls.closes.push(identifier); if (state.close) await state.close.promise; },
    async refresh(identifier, generation) { calls.refreshes.push({ identifier, generation }); } };
  const dependencies = { clock: { nowMonotonicMilliseconds: () => state.nowMonotonicMilliseconds }, native: () => native, observe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
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
test(Fixture.names.playbackBinding, async () => {
  const current = fixture(); assert.equal(current.store.getPlaybackConnection(Fixture.account), null);
  await current.attach(); assert.equal(current.store.getPlaybackConnection(Fixture.account), null);
  current.send(registration());
  assert.deepEqual(current.store.getPlaybackConnection(Fixture.account), { handle: Fixture.handle, generation: Fixture.generation });
  assert.equal(current.store.getPlaybackConnection(Fixture.otherAccount), null);
  current.send({ type: Fixture.reconnecting }); assert.equal(current.store.getPlaybackConnection(Fixture.account), null);
  current.send(registration(), Fixture.nextGeneration);
  assert.deepEqual(current.store.getPlaybackConnection(Fixture.account), { handle: Fixture.handle, generation: Fixture.nextGeneration });
  await current.store.detach(); assert.equal(current.store.getPlaybackConnection(Fixture.account), null);
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

const CommandFixture = Object.freeze({ host: 'synthetic-host', operation: 'command', invalidTarget: 'invalid target',
  names: { route: 'Typed native commands retain their account binding generation request identifier and host',
    unsupported: 'Unregistered and cross-account commands never dispatch native mutations',
    cancellation: 'Canceled dispatched commands cancel their reservation and report uncertainty without retry',
    replacement: 'Account replacement cancels old commands and ignores late successful receipts',
    generation: 'A receipt from a previous Dealer generation cannot report success',
    bounds: 'Malformed targets and pre-canceled commands do not dispatch or allocate native work',
    failure: 'Native denials remain classified without retry or credential exposure' } });
const command = () => ({ kind: library.HostedPlaybackCommandKind.Pause });
test(CommandFixture.names.route, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  await current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal);
  const submitted = current.calls.commands[Fixture.zero];
  assert.deepEqual(submitted.input, { operation: CommandFixture.operation, generation: Fixture.generation,
    requestIdentifier: submitted.requestIdentifier, targetDeviceIdentifier: CommandFixture.host, command: command() });
  assert.equal(submitted.identifier, current.calls.starts[Fixture.zero].identifier); await current.store.detach();
});
test(CommandFixture.names.unsupported, async () => {
  const current = fixture(); await current.attach();
  await assert.rejects(current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal), { code: library.IntegrationFailureCode.Unsupported });
  current.send(registration());
  await assert.rejects(current.store.execute(Fixture.otherAccount, command(), CommandFixture.host, new AbortController().signal), { code: library.IntegrationFailureCode.Unauthorized });
  assert.deepEqual(current.calls.commands, []); await current.store.detach();
});
test(CommandFixture.names.cancellation, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  const abort = new AbortController(); const execution = current.store.execute(Fixture.account, command(), CommandFixture.host, abort.signal);
  const rejected = assert.rejects(execution, { code: library.IntegrationFailureCode.UnknownOutcome }); abort.abort(); await rejected;
  assert.equal(current.calls.commands.length, Fixture.one);
  assert.deepEqual(current.calls.canceledCommands, [{ identifier: current.calls.commands[Fixture.zero].identifier,
    requestIdentifier: current.calls.commands[Fixture.zero].requestIdentifier }]);
  current.state.command.resolve(); await flush(); await current.store.detach();
});
test(CommandFixture.names.replacement, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  const execution = current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal);
  const rejected = assert.rejects(execution, { code: library.IntegrationFailureCode.UnknownOutcome });
  await current.attach(); current.send(registration()); await rejected;
  current.state.command.resolve(); await flush(); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready);
  assert.equal(current.calls.commands.length, Fixture.one); assert.equal(current.calls.canceledCommands.length, Fixture.one);
  await current.store.detach();
});
test(CommandFixture.names.generation, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  const execution = current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal);
  current.send(registration(), Fixture.nextGeneration); current.state.command.resolve();
  await assert.rejects(execution, { code: library.IntegrationFailureCode.UnknownOutcome }); await current.store.detach();
});
test(CommandFixture.names.bounds, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  const abort = new AbortController(); abort.abort();
  await assert.rejects(current.store.execute(Fixture.account, command(), CommandFixture.host, abort.signal), { code: library.IntegrationFailureCode.Canceled });
  await assert.rejects(current.store.execute(Fixture.account, command(), CommandFixture.invalidTarget, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidInput });
  assert.deepEqual(current.calls.commands, []); await current.store.detach();
});
test(CommandFixture.names.failure, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  const execution = current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal);
  current.state.command.reject({ code: library.IntegrationFailureCode.Forbidden, message: Fixture.privateFailure });
  await assert.rejects(execution, { code: library.IntegrationFailureCode.Forbidden });
  assert.equal(current.calls.commands.length, Fixture.one); assert.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  await current.store.detach();
});
const CapacityFixture = Object.freeze({ maximumPendingCommands: 16, fixedIdentifier: 'fixed-command',
  names: { capacity: 'Native pending commands are bounded until their transport receipt actually finishes',
    duplicate: 'A repeated identifier cannot reuse an active native command reservation',
    immutable: 'Native command values are copied before caller mutation',
    reentrant: 'Identifier allocation cannot dispatch into an account retired during allocation' } });
test(CapacityFixture.names.capacity, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  const executions = Array.from({ length: CapacityFixture.maximumPendingCommands }, () =>
    current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal));
  await assert.rejects(current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal),
    { code: library.IntegrationFailureCode.Backpressure });
  assert.equal(current.calls.commands.length, CapacityFixture.maximumPendingCommands);
  current.state.command.resolve(); await Promise.all(executions); await flush();
  await current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal);
  await current.store.detach();
});
test(CapacityFixture.names.duplicate, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  current.dependencies.nextIdentifier = () => CapacityFixture.fixedIdentifier;
  const execution = current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal);
  await assert.rejects(current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal),
    { code: library.IntegrationFailureCode.Backpressure });
  current.state.command.resolve(); await execution; await current.store.detach();
});
test(CapacityFixture.names.immutable, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.command = deferred();
  const intent = command(); const execution = current.store.execute(Fixture.account, intent, CommandFixture.host, new AbortController().signal);
  intent.kind = library.HostedPlaybackCommandKind.Next;
  assert.equal(current.calls.commands[Fixture.zero].input.command.kind, library.HostedPlaybackCommandKind.Pause);
  current.state.command.resolve(); await execution; await current.store.detach();
});
test(CapacityFixture.names.reentrant, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  current.dependencies.nextIdentifier = () => { void current.store.detach(); return CapacityFixture.fixedIdentifier; };
  await assert.rejects(current.store.execute(Fixture.account, command(), CommandFixture.host, new AbortController().signal),
    { code: library.IntegrationFailureCode.Canceled });
  assert.deepEqual(current.calls.commands, []); await current.store.detach();
});

const ReadFixture = Object.freeze({ sent: 1000, received: 1100, nativeStart: 8, nativeEnd: 25, nativeSample: 28,
  epoch: 1700000000000, position: 12000, duration: 180000, speed: 1, trackUri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa',
  provider: 'queue', occurrence: 'source-occurrence', revision: 'source-queue-revision',
  names: { fresh: 'Native source reads preserve the fresh account host generation and measured request timing',
    cancel: 'Native source reads cancel promptly and discard a late result without mutating registration',
    generation: 'Source reads from a retired generation cannot drive the current playback',
    malformed: 'Malformed native observation data is rejected without exposing private diagnostics' } });
function readResponse() { return { handle: Fixture.handle, generation: Fixture.generation, sampledNativeMonotonicMilliseconds: ReadFixture.nativeSample,
  reading: { requestStartedNativeMonotonicMilliseconds: ReadFixture.nativeStart, requestCompletedNativeMonotonicMilliseconds: ReadFixture.nativeEnd,
    cluster: { activeDeviceIdentifier: CommandFixture.host, serverAtMilliseconds: ReadFixture.epoch,
      playback: { track: { uri: ReadFixture.trackUri, occurrenceIdentifier: ReadFixture.occurrence, provider: ReadFixture.provider },
        queueRevision: ReadFixture.revision, timestampMilliseconds: ReadFixture.epoch,
        positionAsOfTimestampMilliseconds: ReadFixture.position, durationMilliseconds: ReadFixture.duration, playbackSpeed: ReadFixture.speed,
        playing: true, paused: false, buffering: false, nextTracks: [], previousTracks: [] } } } }; }
test(ReadFixture.names.fresh, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  const observed = await current.store.read(Fixture.account, CommandFixture.host, new AbortController().signal);
  assert.equal(observed.currentTrack.occurrenceIdentifier, ReadFixture.occurrence);
  assert.equal(observed.playback.observedMonotonicMilliseconds, ReadFixture.received);
  assert.deepEqual(current.calls.reads, [{ identifier: current.calls.starts[Fixture.zero].identifier, generation: Fixture.generation }]);
  await current.store.detach();
});
test(ReadFixture.names.cancel, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.reading = deferred();
  const abort = new AbortController(); const reading = current.store.read(Fixture.account, CommandFixture.host, abort.signal);
  const rejected = assert.rejects(reading, { code: library.IntegrationFailureCode.Canceled }); abort.abort(); await rejected;
  current.state.reading.resolve(readResponse()); await flush();
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready); await current.store.detach();
});
test(ReadFixture.names.generation, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.reading = deferred();
  const reading = current.store.read(Fixture.account, CommandFixture.host, new AbortController().signal);
  current.send(registration(), Fixture.nextGeneration); current.state.reading.resolve(readResponse());
  await assert.rejects(reading, { code: library.IntegrationFailureCode.Superseded }); await current.store.detach();
});
test(ReadFixture.names.malformed, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.reading = deferred();
  const reading = current.store.read(Fixture.account, CommandFixture.host, new AbortController().signal);
  current.state.reading.resolve({ reading: Fixture.privateFailure });
  await assert.rejects(reading, { code: library.IntegrationFailureCode.InvalidResponse });
  assert.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false); await current.store.detach();
});

const MetadataFixture = Object.freeze({ track: 'aaaaaaaaaaaaaaaaaaaaaa', title: 'Synthetic metadata title', artist: 'Synthetic artist', duration: 180000,
  names: { binding: 'Native metadata remains bound to its account generation and copied requested identities',
    cancel: 'Metadata cancellation rejects promptly and discards late private data',
    foreign: 'Metadata from a replaced native handle cannot supply another songs identity' } });
function metadataResponse() { return { handle: Fixture.handle, generation: Fixture.generation, tracks: [{ spotifyTrackIdentifier: MetadataFixture.track,
  title: MetadataFixture.title, artistNames: [MetadataFixture.artist], durationMilliseconds: MetadataFixture.duration, recordingCodes: [] }] }; }
test(MetadataFixture.names.binding, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  const songs = await current.store.readMetadata(Fixture.account, [MetadataFixture.track], new AbortController().signal);
  assert.equal(songs[Fixture.zero].title, MetadataFixture.title);
  assert.deepEqual(current.calls.metadata, [{ identifier: current.calls.starts[Fixture.zero].identifier, generation: Fixture.generation, requested: [MetadataFixture.track] }]);
  await assert.rejects(current.store.readMetadata(Fixture.otherAccount, [MetadataFixture.track], new AbortController().signal), { code: library.IntegrationFailureCode.Unauthorized });
  await current.store.detach();
});
test(MetadataFixture.names.cancel, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.metadata = deferred();
  const abort = new AbortController(); const reading = current.store.readMetadata(Fixture.account, [MetadataFixture.track], abort.signal);
  const rejected = assert.rejects(reading, { code: library.IntegrationFailureCode.Canceled }); abort.abort(); await rejected;
  current.state.metadata.resolve(metadataResponse()); await flush(); assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready);
  await current.store.detach();
});
test(MetadataFixture.names.foreign, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.metadata = deferred();
  const reading = current.store.readMetadata(Fixture.account, [MetadataFixture.track], new AbortController().signal);
  current.state.metadata.resolve({ ...metadataResponse(), handle: Fixture.otherHandle });
  await assert.rejects(reading, { code: library.IntegrationFailureCode.InvalidResponse }); await current.store.detach();
});

const SettledCancellationFixture = Object.freeze({ name: 'Cancellation after native receipt settlement still retires metadata before returning it to the caller' });
test(SettledCancellationFixture.name, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); const abort = new AbortController();
  current.dependencies.native().metadata = () => {
    const receipt = Promise.resolve(JSON.stringify(metadataResponse()));
    void receipt.then(() => queueMicrotask(() => abort.abort()));
    return receipt;
  };
  await assert.rejects(current.store.readMetadata(Fixture.account, [MetadataFixture.track], abort.signal), { code: library.IntegrationFailureCode.Canceled });
  await current.store.detach();
});

const ObserverAcknowledgementFixture = Object.freeze({ source: 'acknowledgedObserver',
  name: 'A native authenticated observer acknowledgement establishes readiness without inventing its presence in the playback device map' });
test(ObserverAcknowledgementFixture.name, async () => {
  const current = fixture(); await current.attach();
  current.send({ ...registration(), verificationSource: ObserverAcknowledgementFixture.source, cluster: { devices: [] } });
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready);
  assert.equal(current.store.getSnapshot().deviceIdentifier, Fixture.device); await current.store.detach();
});

const ShutdownFixture = Object.freeze({ names: {
  orphan: 'Explicit native logout closes retained application connection without a local binding',
  barrier: 'New attachment waits for explicit application shutdown even without a prior binding',
  stale: 'Disposed old store cannot shutdown or attach into a newer store lifetime',
  failure: 'Native application shutdown failure remains actionable and sanitized',
  reentrant: 'A detached observer cannot start replacement before application shutdown drains',
  disposal: 'Ordinary store disposal never invokes application shutdown' } });
test(ShutdownFixture.names.orphan, async () => { const current = fixture(); await current.store.shutdown();
  assert.equal(current.calls.shutdowns, Fixture.one); assert.deepEqual(current.calls.starts, []);
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Detached);
});
test(ShutdownFixture.names.barrier, async () => { const current = fixture(); current.state.shutdown = deferred();
  const shutdown = current.store.shutdown(); const attaching = current.attach(); await flush();
  assert.equal(current.calls.shutdowns, Fixture.one); assert.deepEqual(current.calls.starts, []);
  current.state.shutdown.resolve(); await shutdown; await attaching; assert.equal(current.calls.starts.length, Fixture.one);
  await current.store.detach();
});
test(ShutdownFixture.names.stale, async () => { const current = fixture(); await current.store.dispose();
  await assert.rejects(current.store.shutdown(), { code: library.IntegrationFailureCode.Canceled });
  await assert.rejects(current.attach(), { code: library.IntegrationFailureCode.Canceled }); assert.equal(current.calls.shutdowns, Fixture.zero);
});
test(ShutdownFixture.names.failure, async () => { const current = fixture(); current.state.shutdown = deferred();
  const shutdown = current.store.shutdown(); const rejected = assert.rejects(shutdown, { code: library.IntegrationFailureCode.Network });
  current.state.shutdown.reject(new Error(Fixture.privateFailure)); await rejected;
});
test(ShutdownFixture.names.reentrant, async () => { const current = fixture(); await current.attach(); current.state.shutdown = deferred();
  let replacement = null; const stop = current.store.subscribe(() => {
    if (current.store.getSnapshot().status === SpotifyConnectStatus.Detached && replacement === null) replacement = current.attach();
  });
  const shutdown = current.store.shutdown(); await flush(); assert.equal(current.calls.starts.length, Fixture.one);
  current.state.shutdown.resolve(); await shutdown; await replacement;
  assert.equal(current.calls.starts.length, Fixture.one + Fixture.one); stop(); await current.store.detach();
});
test(ShutdownFixture.names.disposal, async () => { const current = fixture(); await current.attach(); await current.store.dispose();
  assert.equal(current.calls.shutdowns, Fixture.zero); assert.equal(current.calls.closes.length, Fixture.one);
});

const RecoveryDescriptorName = 'Recovering descriptor retains only the bound account and actual native generation until detach';
test(RecoveryDescriptorName, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  current.send({ type: Fixture.reconnecting });
  assert.deepEqual(current.store.getRecoveringPlaybackConnection(Fixture.account), { handle: Fixture.handle, generation: Fixture.generation });
  assert.equal(current.store.getRecoveringPlaybackConnection(Fixture.otherAccount), null);
  current.send({ type: Fixture.connecting }, Fixture.nextGeneration);
  assert.deepEqual(current.store.getRecoveringPlaybackConnection(Fixture.account), { handle: Fixture.handle, generation: Fixture.nextGeneration });
  await current.store.detach(); assert.equal(current.store.getRecoveringPlaybackConnection(Fixture.account), null);
});

const SearchFixture = Object.freeze({ limit: 4, market: 'RO', names: {
  route: 'Native search captures query account generation and explicit country without web credentials',
  reconnect: 'Native search rejects a late reconnect response', cancel: 'Native search cancellation does not close the current session',
  foreign: 'Native search rejects another account before native dispatch' } });
function searchInput() { return { title: MetadataFixture.title, author: MetadataFixture.artist, limit: SearchFixture.limit }; }
test(SearchFixture.names.route, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  const songs = await current.store.search(Fixture.account, searchInput(), SearchFixture.market, new AbortController().signal);
  assert.equal(songs[Fixture.zero].identifier, MetadataFixture.track);
  assert.deepEqual(current.calls.searches, [{ identifier: current.calls.starts[Fixture.zero].identifier, generation: Fixture.generation,
    input: { ...searchInput(), market: SearchFixture.market } }]);
});
test(SearchFixture.names.foreign, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  await assert.rejects(current.store.search(Fixture.otherAccount, searchInput(), SearchFixture.market, new AbortController().signal), { code: library.IntegrationFailureCode.Unauthorized });
  assert.deepEqual(current.calls.searches, []);
});
test(SearchFixture.names.reconnect, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.searching = deferred();
  const result = current.store.search(Fixture.account, searchInput(), SearchFixture.market, new AbortController().signal);
  current.send(registration(), Fixture.nextGeneration); current.state.searching.resolve(metadataResponse());
  await assert.rejects(result, { code: library.IntegrationFailureCode.Superseded });
});
test(SearchFixture.names.cancel, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); current.state.searching = deferred();
  const cancellation = new AbortController(); const result = current.store.search(Fixture.account, searchInput(), SearchFixture.market, cancellation.signal);
  cancellation.abort(); await assert.rejects(result, { code: library.IntegrationFailureCode.Canceled });
  current.state.searching.resolve(metadataResponse()); await flush();
  assert.equal(current.store.getSnapshot().status, SpotifyConnectStatus.Ready); assert.deepEqual(current.calls.closes, []);
});

const GuestFixture = Object.freeze({ session: 'synthetic-guest-jam', host: 'synthetic-guest-host',
  admitted: 'Fresh native guest verification requires exact account session host and participant evidence',
  denied: 'Missing guest permission malformed participant lists and native denial stay closed',
  stale: 'Reconnect retires an in flight guest membership verification',
  malformed: 'Malformed native guest membership JSON is rejected without private details' });
function guestMembership(overrides = {}) {
  return { handle: Fixture.handle, generation: Fixture.generation, reading: { accountIdentifier: Fixture.account,
    membership: { sessionIdentifier: GuestFixture.session, hostDeviceIdentifier: GuestFixture.host, active: true,
      ownedByCurrentAccount: false, participantIdentifiers: [Fixture.account], ...overrides } } };
}
function guestIdentity() { return { accountIdentifier: Fixture.account, sessionIdentifier: GuestFixture.session, hostDeviceIdentifier: GuestFixture.host }; }
test(GuestFixture.admitted, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  current.dependencies.native().membership = async () => JSON.stringify(guestMembership());
  await current.store.verify(guestIdentity(), new AbortController().signal);
  assert.equal(current.calls.commands.length, Fixture.zero); await current.store.detach();
});
test(GuestFixture.denied, async () => {
  for (const [membership, code] of [[{ participantIdentifiers: [] }, library.IntegrationFailureCode.Forbidden],
    [{ participantIdentifiers: [Fixture.account, Fixture.account] }, library.IntegrationFailureCode.InvalidResponse],
    [{ active: false }, library.IntegrationFailureCode.Superseded], [{ hostDeviceIdentifier: Fixture.device }, library.IntegrationFailureCode.Superseded]]) {
    const current = fixture(); await current.attach(); current.send(registration());
    current.dependencies.native().membership = async () => JSON.stringify(guestMembership(membership));
    await assert.rejects(current.store.verify(guestIdentity(), new AbortController().signal), { code }); await current.store.detach();
  }
});
test(GuestFixture.stale, async () => {
  const current = fixture(); await current.attach(); current.send(registration()); const pending = deferred();
  current.dependencies.native().membership = async () => pending.promise;
  const verification = current.store.verify(guestIdentity(), new AbortController().signal);
  current.send({ type: Fixture.reconnecting }); pending.resolve(JSON.stringify(guestMembership()));
  await assert.rejects(verification, { code: library.IntegrationFailureCode.Superseded }); await current.store.detach();
});
test(GuestFixture.malformed, async () => {
  const current = fixture(); await current.attach(); current.send(registration());
  current.dependencies.native().membership = async () => Fixture.privateFailure;
  await assert.rejects(current.store.verify(guestIdentity(), new AbortController().signal), { code: library.IntegrationFailureCode.InvalidResponse });
  await current.store.detach();
});

const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackApplicationLifecycle } = require('../.build/audio-migration/PlaybackApplicationLifecycle');
const { PlaybackRuntime } = require('../.build/audio-migration/PlaybackRuntime');
const { NativePlayerCommandDispatcher } = require('../.build/audio-migration/NativePlayerCommandDispatcher');
const { PlayerErrorCode } = require('streaming-service-player');
const { environment, Fixture, RuntimeFixture, track, deferred, settleUntil } = require('./fixtures/playback-runtime.cjs');
function lifecycleEnvironment() {
  let state = { restored: false, isLoggedIn: false, accountIdentifier: null, token: null };
  const observers = new Set(); const operations = []; const failures = []; let restore = async () => {};
  let update = async () => {}; let disposals = 0;
  const authentication = { getSnapshot: () => state, restore: () => restore(), subscribe(listener) { observers.add(listener); return () => observers.delete(listener); } };
  const application = new PlaybackApplicationLifecycle(authentication, { async updateAuthentication(value) { operations.push(value); await update(value); },
    dispose() { disposals += 1; } }, failure => failures.push(failure));
  return { application, operations, failures, observers,
    restoreWith(operation) { restore = operation; }, updateWith(operation) { update = operation; },
    publish(changes = {}) { state = { restored: true, isLoggedIn: true, accountIdentifier: Fixture.account, token: RuntimeFixture.token, ...changes };
      for (const listener of observers) listener(); },
    get disposals() { return disposals; } };
}
test('app startup waits for restored authentication before initializing audio', async () => {
  const scenario = lifecycleEnvironment(); const pending = deferred(); scenario.restoreWith(() => pending.promise);
  const startup = scenario.application.start(); assertion.equal(scenario.operations.length, 0);
  scenario.publish(); pending.resolve(); await startup; await scenario.application.whenReady();
  assertion.equal(scenario.operations.length, 1); assertion.equal(scenario.application.getSnapshot().ready, true); scenario.application.dispose();
});
test('App and MusicProvider startup calls share one authentication subscription and initialization', async () => {
  const scenario = lifecycleEnvironment(); scenario.publish(); const pending = deferred(); scenario.updateWith(() => pending.promise);
  const first = scenario.application.start(); const second = scenario.application.start(); await Promise.resolve();
  assertion.equal(scenario.operations.length, 1); assertion.equal(scenario.observers.size, 1);
  pending.resolve(); await Promise.all([first, second]); scenario.application.dispose();
});
test('initialization failures are observable and the next Play readiness request retries', async () => {
  const scenario = lifecycleEnvironment(); scenario.publish(); let fail = true;
  scenario.updateWith(async () => { if (fail) throw new Error(Fixture.privateMessage); });
  await assertion.rejects(scenario.application.start()); assertion.equal(scenario.failures.length, 1);
  assertion.ok(scenario.application.getSnapshot().error); assertion.equal(scenario.application.getSnapshot().error.includes(Fixture.privateMessage), false);
  fail = false; await scenario.application.whenReady(); assertion.equal(scenario.application.getSnapshot().ready, true); scenario.application.dispose();
});
test('a failed authentication read can be retried rather than poisoning startup forever', async () => {
  const scenario = lifecycleEnvironment(); scenario.restoreWith(async () => { throw new Error(Fixture.privateMessage); });
  await assertion.rejects(scenario.application.start()); scenario.restoreWith(async () => scenario.publish());
  await scenario.application.whenReady(); assertion.equal(scenario.application.getSnapshot().ready, true); scenario.application.dispose();
});
test('signed-out startup resolves without pretending audio is authenticated', async () => {
  const scenario = lifecycleEnvironment(); scenario.publish({ isLoggedIn: false, accountIdentifier: null, token: null });
  await scenario.application.start(); await assertion.rejects(scenario.application.whenReady());
  assertion.equal(scenario.application.getSnapshot().ready, false); assertion.equal(scenario.failures.length, 0); scenario.application.dispose();
});
test('readiness follows the latest token transition and ignores a late older completion', async () => {
  const scenario = lifecycleEnvironment(); scenario.publish(); await scenario.application.start();
  const pending = deferred(); scenario.updateWith(value => value.accessToken === RuntimeFixture.nextToken ? pending.promise : Promise.resolve());
  scenario.publish({ token: RuntimeFixture.nextToken }); const readiness = scenario.application.whenReady();
  scenario.publish({ token: RuntimeFixture.token }); pending.resolve(); await readiness;
  assertion.equal(scenario.application.getSnapshot().ready, true); scenario.application.dispose();
});
test('hot disposal detaches authentication and prevents late bootstrap publication', async () => {
  const scenario = lifecycleEnvironment(); scenario.publish(); const pending = deferred(); scenario.updateWith(() => pending.promise);
  const startup = scenario.application.start(); await Promise.resolve(); scenario.application.dispose(); pending.resolve(); await startup;
  assertion.equal(scenario.observers.size, 0); assertion.equal(scenario.disposals, 1); assertion.equal(scenario.application.getSnapshot().ready, false);
});
function ownedEnvironment() {
  const scenario = environment(); scenario.runtime.dispose(); let receipt = null; let identifiers = 0; const errors = [];
  const ownership = { async read() { return receipt; }, async write(value) { receipt = { ...value }; }, async clear() { receipt = null; } };
  const create = () => new PlaybackRuntime({ native: scenario.native, sessionOwnership: ownership,
    mediaServerAddress: Fixture.server, identifiers: { nextIdentifier: () => 'reload-occurrence-' + (++identifiers) },
    cache: { async findReadableCachedAddress() { return null; } }, listening: () => ({ create() {
      return { start() {}, async pause() {}, async resume() {}, async seek() {}, async stop() {} };
    } }), fetchSuggestions: async () => [], reportFailure: failure => errors.push(failure), reportPlaybackFailure: failure => errors.push(failure) });
  const login = runtime => runtime.updateAuthentication({ restored: true, accountIdentifier: Fixture.account, accessToken: RuntimeFixture.token });
  return { scenario, ownership, create, login, errors, get receipt() { return receipt; }, setReceipt(value) { receipt = value; } };
}
test('a fresh JS runtime reattaches the same owned native queue without clearing it', async () => {
  const session = ownedEnvironment(); const first = session.create(); await session.login(first);
  await first.playTracks([track()], Fixture.firstIndex); const before = session.scenario.snapshot(); first.dispose();
  const second = session.create(); await session.login(second); await second.authentication.whenReady();
  assertion.equal(session.scenario.snapshot().cursor.queueIdentifier, before.cursor.queueIdentifier);
  assertion.equal(session.scenario.snapshot().currentEntry.entryIdentifier, before.currentEntry.entryIdentifier);
  await second.pause(); await second.play(); await second.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  assertion.equal(session.scenario.snapshot().currentEntry.recordingIdentifier, Fixture.secondRecording); second.dispose();
});
for (const field of ['accountIdentifier', 'engineEpoch', 'authenticationEpoch', 'serverAddress']) {
  test(`refresh cannot adopt a native session with mismatched ${field}`, async () => {
    const session = ownedEnvironment(); const first = session.create(); await session.login(first);
    await first.playTracks([track()], Fixture.firstIndex); first.dispose(); session.setReceipt({ ...session.receipt, [field]: 'different-owner' });
    const second = session.create(); await session.login(second); assertion.equal(session.scenario.snapshot().queueLength, 0); second.dispose();
  });
}
test('missing ownership storage clears unknown native playback safely', async () => {
  const session = ownedEnvironment(); const first = session.create(); await session.login(first);
  await first.playTracks([track()], Fixture.firstIndex); first.dispose(); session.setReceipt(null);
  const second = session.create(); await session.login(second); assertion.equal(session.scenario.snapshot().queueLength, 0); second.dispose();
});
test('storage failure cannot grant ownership of a foreign native session', async () => {
  const session = ownedEnvironment(); const first = session.create(); await session.login(first); await first.playTracks([track()], Fixture.firstIndex); first.dispose();
  session.ownership.read = async () => { throw new Error(Fixture.privateMessage); };
  const second = session.create(); await session.login(second); assertion.equal(session.scenario.snapshot().queueLength, 0); second.dispose();
});
test('logout removes the persisted ownership receipt', async () => {
  const session = ownedEnvironment(); const runtime = session.create(); await session.login(runtime);
  await runtime.updateAuthentication({ restored: true, accountIdentifier: null, accessToken: null }); assertion.equal(session.receipt, null); runtime.dispose();
});
test('retired runtime cannot finish configuring credentials after hot disposal', async () => {
  const session = ownedEnvironment(); const pending = deferred(); let bindings = 0;
  session.scenario.native.initialize = async () => { bindings += 1; await pending.promise; };
  const runtime = session.create(); const startup = session.login(runtime); await settleUntil(() => bindings > 0);
  runtime.dispose(); pending.resolve(); await startup;
  assertion.equal(session.scenario.credentials.length, 0); assertion.equal(session.receipt, null);
});
test('service unavailable snapshots rebind once before returning current native state', async () => {
  let bindings = 0; let reads = 0;
  const dispatcher = new NativePlayerCommandDispatcher({ async initialize() { bindings += 1; }, async clearSession() {},
    async getSnapshot() { reads += 1; if (reads === 1) throw { code: PlayerErrorCode.ServiceUnavailable }; return { cursor: {} }; } },
  { nextIdentifier: () => 'request' });
  await dispatcher.getSnapshot(); assertion.equal(bindings, 2); assertion.equal(reads, 2);
});
test('native engine recreation restores authentication before another playback command', async () => {
  const session = ownedEnvironment(); const runtime = session.create(); await session.login(runtime);
  const before = session.scenario.credentials.length; session.scenario.restart();
  await settleUntil(() => session.scenario.credentials.length > before); await runtime.authentication.whenReady();
  await runtime.playTracks([track()], Fixture.firstIndex); assertion.equal(session.scenario.snapshot().queueLength, 1); runtime.dispose();
});
test('native playback failures are reported once and can be reported again after recovery', async () => {
  const session = ownedEnvironment(); const runtime = session.create(); await session.login(runtime);
  const failure = { code: PlayerErrorCode.Network, message: 'fixture network failure', retryable: true, entryIdentifier: 'fixture-entry' };
  session.scenario.nativeFailure(failure); session.scenario.publish(); assertion.equal(session.errors.length, 1);
  session.scenario.nativeFailure(null); session.scenario.nativeFailure(failure); assertion.equal(session.errors.length, 2); runtime.dispose();
});
test('concurrent unavailable reads share their replacement native binding', async () => {
  let bindings = 0; let reads = 0; const failedReads = deferred();
  const dispatcher = new NativePlayerCommandDispatcher({ async initialize() { bindings += 1; }, async clearSession() {},
    async getSnapshot() { reads += 1; if (reads <= 2) { await failedReads.promise; throw { code: PlayerErrorCode.ServiceUnavailable }; } return { cursor: {} }; } },
  { nextIdentifier: () => 'request' });
  const first = dispatcher.getSnapshot(); const second = dispatcher.getSnapshot(); await settleUntil(() => reads === 2); failedReads.resolve();
  await Promise.all([first, second]); assertion.equal(bindings, 2);
});
test('an unstable native epoch rejects readiness at a fixed bound instead of hanging', async () => {
  const session = ownedEnvironment(); const runtime = session.create(); await session.login(runtime);
  let reads = 0; const read = session.scenario.native.getSnapshot;
  session.scenario.native.getSnapshot = async () => { const snapshot = await read(); reads += 1;
    return { ...snapshot, cursor: { ...snapshot.cursor, engineEpoch: 'restarting-' + reads } }; };
  await assertion.rejects(runtime.authentication.whenReady()); assertion.ok(reads < 20); runtime.dispose();
});
test('a late older startup failure cannot fail or report over the newest token transition', async () => {
  const scenario = lifecycleEnvironment(); scenario.publish(); const pending = deferred();
  scenario.updateWith(value => value.accessToken === RuntimeFixture.token ? pending.promise : Promise.resolve());
  const readiness = scenario.application.whenReady(); await settleUntil(() => scenario.operations.length > 0);
  scenario.publish({ token: RuntimeFixture.nextToken }); pending.reject(new Error(Fixture.privateMessage)); await readiness;
  assertion.equal(scenario.application.getSnapshot().ready, true); assertion.equal(scenario.failures.length, 0); scenario.application.dispose();
});
test('an engine change during startup shares authentication instead of recursively restarting it', async () => {
  const session = ownedEnvironment(); let restarted = false;
  session.scenario.setConfigure(async () => { if (!restarted) { restarted = true; session.scenario.restart(); } });
  const runtime = session.create(); await session.login(runtime); await runtime.authentication.whenReady();
  assertion.equal(session.scenario.credentials.length, 1);
  await runtime.playTracks([track()], Fixture.firstIndex); assertion.equal(session.scenario.snapshot().queueLength, 1); runtime.dispose();
});
function ownershipStorage() {
  const { readFileSync } = require('node:fs'); const { runInNewContext } = require('node:vm'); const typescript = require('typescript');
  const values = new Map(); const module = { exports: {} };
  const source = typescript.transpileModule(readFileSync(require.resolve('../src/services/PlaybackNativeSessionStorage.ts'), 'utf8'), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, { exports: module.exports, module, require() { return {
    getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  }; } });
  return { storage: module.exports.playbackNativeSessionStorage, values };
}
test('native ownership storage persists only binding identity and excludes credentials', async () => {
  const scenario = ownershipStorage(); await scenario.storage.write({ serverAddress: Fixture.server, accountIdentifier: Fixture.account,
    engineEpoch: Fixture.engine, authenticationEpoch: 'native-session', accessToken: 'private-fixture-token' });
  assertion.equal(JSON.stringify([...scenario.values.values()]).includes('private-fixture-token'), false);
  const restored = await scenario.storage.read(); assertion.equal(restored.accountIdentifier, Fixture.account);
  assertion.deepEqual(Object.keys(restored).sort(), ['accountIdentifier', 'authenticationEpoch', 'engineEpoch', 'serverAddress']);
});
test('malformed or incomplete stored ownership cannot grant native session access', async () => {
  const scenario = ownershipStorage(); const key = 'streaming.playback.native-owner.v1';
  for (const value of ['not-json', 'null', '{}', '{"serverAddress":123}', '{"serverAddress":""}']) {
    scenario.values.set(key, value); assertion.equal(await scenario.storage.read(), null);
  }
});
test('clearing native ownership removes the saved binding proof', async () => {
  const scenario = ownershipStorage(); await scenario.storage.write({ serverAddress: Fixture.server, accountIdentifier: Fixture.account,
    engineEpoch: Fixture.engine, authenticationEpoch: 'native-session' });
  await scenario.storage.clear(); assertion.equal(await scenario.storage.read(), null);
});

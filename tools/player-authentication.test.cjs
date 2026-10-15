const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackAccountIdentity, TokenIdentityPolicy } = require('../.build/audio-migration/PlaybackAccountIdentity');
const { PlaybackAuthenticationCoordinator } = require('../.build/audio-migration/PlaybackAuthenticationCoordinator');
const { NativePlayerCommandDispatcher } = require('../.build/audio-migration/NativePlayerCommandDispatcher');

const Fixture = Object.freeze({
  account: 'fixture-account', otherAccount: 'other-account', token: 'first-token', nextToken: 'refreshed-token',
  otherToken: 'other-token', server: 'https://catalog.example.invalid/', request: 'request', engine: 'fixture-engine',
  authentication: 'native-authentication', header: 'header', signature: 'signature', base64Encoding: 'base64url',
  subject: 'sub', name: 'name', unicodeName: 'Ștefan', unicodeAccount: 'cont-ș', separator: '.',
  invalidToken: 'invalid-sensitive-token', emptyText: '', failure: 'fixture failure',
  emptyCount: 0, increment: 1, singleCount: 1, twoCount: 2, threeCount: 3, maximumMicrotasks: 50,
  clearOperation: 'clear', configureOperation: 'configure', refreshOperation: 'refresh', resumeOperation: 'resume',
});
const TestNames = Object.freeze({
  subject: 'playback account identity reads the server subject from a token payload',
  refreshSubject: 'token rotation retains the same playback account identity',
  unicode: 'token payload decoding preserves UTF-8 characters',
  malformed: 'malformed token payloads reject with a redacted message',
  absentSubject: 'missing empty and non-string account subjects reject',
  payloadBound: 'oversized token payloads reject before decoding',
  restoration: 'unrestored authentication never clears or configures native playback',
  loggedOut: 'restored signed-out state clears native playback and remains suspended',
  initial: 'restored sign-in clears unknown ownership before configuring and observing native playback',
  sameToken: 'repeated authentication state shares the existing transition',
  rotation: 'same-account token refresh preserves the native queue and listening state',
  change: 'account changes immediately cancel preparation and hide the old queue',
  logout: 'logout clears credentials and cannot resume listening',
  late: 'a late old-account configuration cannot become the final active credential',
  waiting: 'audio readiness waits for the latest token transition',
  failure: 'failed credential configuration rejects readiness and can be retried',
  queued: 'account changes invalidate previously queued native commands immediately',
});
function token(subject, name = Fixture.unicodeName) {
  const payload = JSON.stringify({ [Fixture.subject]: subject, [Fixture.name]: name });
  return [Fixture.header, Buffer.from(payload).toString(Fixture.base64Encoding), Fixture.signature].join(Fixture.separator);
}
function state(accountIdentifier = Fixture.account, accessToken = Fixture.token) {
  return { restored: true, accountIdentifier, accessToken };
}
function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}
async function settleUntil(predicate) {
  for (let count = Fixture.emptyCount; count < Fixture.maximumMicrotasks; count += Fixture.increment) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assertion.ok(predicate());
}
function environment() {
  let clearCount = Fixture.emptyCount;
  let cancelCount = Fixture.emptyCount;
  let suspendCount = Fixture.emptyCount;
  let resumeCount = Fixture.emptyCount;
  let configurationOperation = null;
  let suspended = false;
  const operations = [];
  const dispatcher = new NativePlayerCommandDispatcher({ async initialize() {},
    async getSnapshot() { return { cursor: { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication } }; },
    async clearSession() { clearCount += Fixture.increment; operations.push({ name: Fixture.clearOperation }); },
  }, { nextIdentifier: () => Fixture.request });
  const coordinator = new PlaybackAuthenticationCoordinator(Fixture.server, {
    async configureMediaServer(address, accessToken) {
      operations.push({ name: Fixture.configureOperation, address, accessToken });
      if (configurationOperation !== null) await configurationOperation(accessToken);
    },
  }, dispatcher, { invalidateSession() { cancelCount += Fixture.increment; } }, {
    suspend() { suspended = true; suspendCount += Fixture.increment; }, connect() {},
    async refresh() { operations.push({ name: Fixture.refreshOperation }); },
    resume() { suspended = false; resumeCount += Fixture.increment; operations.push({ name: Fixture.resumeOperation }); },
  });
  return { coordinator, dispatcher, operations,
    setConfigurationOperation(operation) { configurationOperation = operation; },
    get clearCount() { return clearCount; }, get cancelCount() { return cancelCount; },
    get suspendCount() { return suspendCount; }, get resumeCount() { return resumeCount; }, get suspended() { return suspended; },
  };
}
test(TestNames.subject, () => {
  assertion.equal(new PlaybackAccountIdentity().identify(token(Fixture.account)), Fixture.account);
});
test(TestNames.refreshSubject, () => {
  const identity = new PlaybackAccountIdentity();
  assertion.equal(identity.identify(token(Fixture.account)), identity.identify(token(Fixture.account, Fixture.otherAccount)));
});
test(TestNames.unicode, () => {
  assertion.equal(new PlaybackAccountIdentity().identify(token(Fixture.unicodeAccount)), Fixture.unicodeAccount);
});
test(TestNames.malformed, () => {
  assertion.throws(() => new PlaybackAccountIdentity().identify(Fixture.invalidToken), { message: TokenIdentityPolicy.invalidTokenMessage });
});
test(TestNames.absentSubject, () => {
  for (const subject of [undefined, Fixture.emptyText, Fixture.singleCount]) assertion.throws(() => new PlaybackAccountIdentity().identify(token(subject)));
});
test(TestNames.payloadBound, () => {
  const oversized = [Fixture.header, Fixture.header.repeat(TokenIdentityPolicy.maximumPayloadCharacters), Fixture.signature].join(Fixture.separator);
  assertion.throws(() => new PlaybackAccountIdentity().identify(oversized));
});
test(TestNames.restoration, async () => {
  const scenario = environment(); await scenario.coordinator.update({ ...state(), restored: false });
  assertion.deepEqual(scenario.operations, []); assertion.equal(scenario.clearCount, Fixture.emptyCount);
  await assertion.rejects(scenario.coordinator.whenReady());
});
test(TestNames.loggedOut, async () => {
  const scenario = environment(); await scenario.coordinator.update(state(null, null));
  assertion.equal(scenario.clearCount, Fixture.singleCount); assertion.equal(scenario.suspended, true);
  assertion.equal(scenario.resumeCount, Fixture.emptyCount); await assertion.rejects(scenario.coordinator.whenReady());
});
test(TestNames.initial, async () => {
  const scenario = environment(); await scenario.coordinator.update(state()); await scenario.coordinator.whenReady();
  assertion.deepEqual(scenario.operations.map(operation => operation.name), [Fixture.clearOperation, Fixture.configureOperation,
    Fixture.refreshOperation, Fixture.resumeOperation]); assertion.equal(scenario.suspended, false);
});
test(TestNames.sameToken, async () => {
  const scenario = environment(); const first = scenario.coordinator.update(state()); const second = scenario.coordinator.update(state());
  assertion.equal(first, second); await first; assertion.equal(scenario.clearCount, Fixture.singleCount);
});
test(TestNames.rotation, async () => {
  const scenario = environment(); await scenario.coordinator.update(state()); const cancelCount = scenario.cancelCount;
  const suspendCount = scenario.suspendCount; await scenario.coordinator.update(state(Fixture.account, Fixture.nextToken));
  assertion.equal(scenario.clearCount, Fixture.singleCount); assertion.equal(scenario.cancelCount, cancelCount);
  assertion.equal(scenario.suspendCount, suspendCount); assertion.equal(scenario.suspended, false);
});
test(TestNames.change, async () => {
  const scenario = environment(); await scenario.coordinator.update(state());
  const changed = scenario.coordinator.update(state(Fixture.otherAccount, Fixture.otherToken));
  assertion.equal(scenario.suspended, true); assertion.equal(scenario.cancelCount, Fixture.twoCount);
  await changed; assertion.equal(scenario.clearCount, Fixture.twoCount);
  assertion.equal(scenario.coordinator.getAccountIdentifier(), Fixture.otherAccount);
});
test(TestNames.logout, async () => {
  const scenario = environment(); await scenario.coordinator.update(state()); const resumeCount = scenario.resumeCount;
  await scenario.coordinator.update(state(null, null)); assertion.equal(scenario.suspended, true);
  assertion.equal(scenario.resumeCount, resumeCount); assertion.equal(scenario.clearCount, Fixture.twoCount);
  await assertion.rejects(scenario.coordinator.whenReady());
});
test(TestNames.late, async () => {
  const scenario = environment(); const pending = deferred(); scenario.setConfigurationOperation(accessToken =>
    accessToken === Fixture.token ? pending.promise : Promise.resolve());
  const first = scenario.coordinator.update(state()); await settleUntil(() => scenario.operations.some(operation => operation.name === Fixture.configureOperation));
  const second = scenario.coordinator.update(state(Fixture.otherAccount, Fixture.otherToken)); pending.resolve(); await first; await second;
  const configurations = scenario.operations.filter(operation => operation.name === Fixture.configureOperation);
  assertion.equal(configurations[Fixture.singleCount].accessToken, Fixture.otherToken);
  assertion.equal(scenario.clearCount, Fixture.twoCount); assertion.equal(scenario.resumeCount, Fixture.singleCount);
});
test(TestNames.waiting, async () => {
  const scenario = environment(); const pending = deferred(); scenario.setConfigurationOperation(accessToken =>
    accessToken === Fixture.nextToken ? pending.promise : Promise.resolve());
  await scenario.coordinator.update(state()); const rotation = scenario.coordinator.update(state(Fixture.account, Fixture.nextToken));
  let ready = false; const readiness = scenario.coordinator.whenReady().then(() => { ready = true; });
  await settleUntil(() => scenario.operations.filter(operation => operation.name === Fixture.configureOperation).length === Fixture.twoCount);
  assertion.equal(ready, false); pending.resolve(); await rotation; await readiness; assertion.equal(ready, true);
});
test(TestNames.failure, async () => {
  const scenario = environment(); scenario.setConfigurationOperation(async () => { throw new Error(Fixture.failure); });
  await assertion.rejects(scenario.coordinator.update(state())); await assertion.rejects(scenario.coordinator.whenReady());
  assertion.equal(scenario.suspended, true); scenario.setConfigurationOperation(async () => {});
  await scenario.coordinator.update(state()); await scenario.coordinator.whenReady(); assertion.equal(scenario.suspended, false);
});
test(TestNames.queued, async () => {
  const scenario = environment(); await scenario.coordinator.update(state()); const pending = deferred(); const started = deferred();
  const active = scenario.dispatcher.playbackCommand(async () => { started.resolve(); await pending.promise; return {}; });
  const rejectedActive = assertion.rejects(active); await started.promise; let queuedCalled = false;
  const queued = scenario.dispatcher.playbackCommand(async () => { queuedCalled = true; return {}; }); const rejectedQueued = assertion.rejects(queued);
  await scenario.coordinator.update(state(null, null)); pending.resolve(); await rejectedActive; await rejectedQueued;
  assertion.equal(queuedCalled, false);
});

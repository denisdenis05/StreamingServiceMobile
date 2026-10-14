const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { NativeQueueSourcePreparation } = require('../.build/audio-migration/NativeQueueSourcePreparation');
const { NativePlayerCommandDispatcher } = require('../.build/audio-migration/NativePlayerCommandDispatcher');
const { CommandResultStatus, MediaSourceKind, MediaSourceOwnership, DefaultQueuePolicy, MediaSourcePolicy, MediaRequestMethod, MediaBodyEncoding } = require('streaming-service-player');

const Fixture = Object.freeze({
  engine: 'source-engine', account: 'source-account', otherAccount: 'other-account', request: 'source-request',
  firstEntry: 'first-entry', secondEntry: 'second-entry', recording: 'recording', sourcePrefix: 'source-',
  localAddress: 'file:///managed-cache/first.audio', remoteAddress: 'https://audio.example.invalid/file',
  headerName: 'X-Test', headerValue: 'captured-value', changedHeader: 'changed-value',
  title: 'captured-title', changedTitle: 'changed-title', failure: 'registration-fixture-failure',
  zeroCount: 0, emptyIdentifier: '', firstIndex: 0, oneCount: 1, twoCount: 2, largeQueueLength: 300,
});
const Context = Object.freeze({ engineEpoch: Fixture.engine, authenticationEpoch: Fixture.account, requestIdentifier: Fixture.request });
const TestNames = Object.freeze({
  catalog: 'catalog queue entries need no private source handles',
  owned: 'cached sources register with queue ownership and commit only opaque handles',
  large: 'prepares more than 256 cached sources without clearing the current queue',
  partial: 'partial registration failure releases earlier preparation handles',
  conflict: 'queue conflict releases every staged source without altering the old queue',
  superseded: 'superseded queue receipt releases staged sources',
  rejected: 'rejected queue receipt releases staged sources',
  failure: 'failed queue command releases staged sources',
  canceled: 'obsolete request does not register sources or invoke the queue operation',
  late: 'late source registration is released when a new selection supersedes preparation',
  capture: 'captures request secrets metadata and context before asynchronous registration',
  duplicate: 'duplicate occurrence identifiers reject before any source registration',
  mismatch: 'mismatched view occurrence rejects before registration',
  cleanup: 'cleanup failure does not prevent releasing remaining sources or replace the original error',
  ordered: 'registration and cleanup use bounded sequential native calls',
});
function track(identifier = Fixture.firstEntry, source = null) {
  return { entry: { entryIdentifier: identifier, ...(source === null ? { recordingIdentifier: Fixture.recording } : {}), title: Fixture.title },
    view: { entryIdentifier: identifier, title: Fixture.title, artist: Fixture.title, isLocalCached: source?.kind === MediaSourceKind.Local }, source };
}
function deferred() {
  let resolvePromise;
  const promise = new Promise(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}
function environment() {
  const registrations = [];
  const releases = [];
  const failures = [];
  const operations = [];
  let resultStatus = CommandResultStatus.Applied;
  let registrationOperation = null;
  let failQueue = false;
  let failRelease = false;
  const preparation = new NativeQueueSourcePreparation({
    async registerMediaSource(context, source, ownership) {
      if (registrationOperation !== null) await registrationOperation(registrations.length);
      const identifier = Fixture.sourcePrefix + registrations.length;
      registrations.push({ context: { ...context }, source: JSON.parse(JSON.stringify(source)), ownership, identifier });
      return identifier;
    },
    async releaseMediaSource(identifier) { releases.push(identifier); if (failRelease) throw new Error(Fixture.failure); },
  }, failure => failures.push(failure));
  return { preparation, registrations, releases, failures, operations,
    async operation(entries, views, context) { operations.push({ entries, views, context }); if (failQueue) throw new Error(Fixture.failure); return { status: resultStatus }; },
    setResultStatus(status) { resultStatus = status; },
    setRegistrationOperation(operation) { registrationOperation = operation; },
    setFailQueue(value) { failQueue = value; },
    setFailRelease(value) { failRelease = value; },
  };
}
const LocalSource = Object.freeze({ kind: MediaSourceKind.Local, address: Fixture.localAddress });
test(TestNames.catalog, async () => {
  const scenario = environment(); await scenario.preparation.execute([track()], Context, () => true, scenario.operation);
  assertion.deepEqual(scenario.registrations, []);
  assertion.equal(scenario.operations[Fixture.firstIndex].entries[Fixture.firstIndex].recordingIdentifier, Fixture.recording);
});
test(TestNames.owned, async () => {
  const scenario = environment(); await scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => true, scenario.operation);
  assertion.equal(scenario.registrations[Fixture.firstIndex].ownership, MediaSourceOwnership.Queue);
  const entry = scenario.operations[Fixture.firstIndex].entries[Fixture.firstIndex];
  assertion.equal(entry.sourceIdentifier, scenario.registrations[Fixture.firstIndex].identifier);
  assertion.equal(entry.address, undefined);
  assertion.deepEqual(scenario.releases, []);
});
test(TestNames.large, async () => {
  const scenario = environment();
  const tracks = Array.from({ length: Fixture.largeQueueLength }, (_, index) => track(Fixture.firstEntry + index, LocalSource));
  await scenario.preparation.execute(tracks, Context, () => true, scenario.operation);
  assertion.equal(scenario.registrations.length, Fixture.largeQueueLength);
  assertion.equal(scenario.operations.length, Fixture.oneCount);
  assertion.equal(scenario.operations[Fixture.firstIndex].entries.length, Fixture.largeQueueLength);
  assertion.deepEqual(scenario.releases, []);
});
test(TestNames.partial, async () => {
  const scenario = environment(); scenario.setRegistrationOperation(async count => { if (count === Fixture.oneCount) throw new Error(Fixture.failure); });
  await assertion.rejects(scenario.preparation.execute([track(Fixture.firstEntry, LocalSource), track(Fixture.secondEntry, LocalSource)], Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.releases, [scenario.registrations[Fixture.firstIndex].identifier]);
  assertion.deepEqual(scenario.operations, []);
});
for (const [name, status] of [[TestNames.conflict, CommandResultStatus.Conflict], [TestNames.superseded, CommandResultStatus.Superseded], [TestNames.rejected, CommandResultStatus.Rejected]]) {
  test(name, async () => {
    const scenario = environment(); scenario.setResultStatus(status);
    await scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => true, scenario.operation);
    assertion.deepEqual(scenario.releases, [scenario.registrations[Fixture.firstIndex].identifier]);
  });
}
test(TestNames.failure, async () => {
  const scenario = environment(); scenario.setFailQueue(true);
  await assertion.rejects(scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.releases, [scenario.registrations[Fixture.firstIndex].identifier]);
});
test(TestNames.canceled, async () => {
  const scenario = environment();
  await assertion.rejects(scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => false, scenario.operation));
  assertion.deepEqual(scenario.registrations, []); assertion.deepEqual(scenario.operations, []);
});
test(TestNames.late, async () => {
  const scenario = environment(); const registration = deferred(); const started = deferred(); let current = true;
  scenario.setRegistrationOperation(() => { started.resolve(); return registration.promise; });
  const execution = scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => current, scenario.operation);
  await started.promise;
  current = false; registration.resolve();
  await assertion.rejects(execution);
  assertion.deepEqual(scenario.releases, [scenario.registrations[Fixture.firstIndex].identifier]);
  assertion.deepEqual(scenario.operations, []);
});
test(TestNames.capture, async () => {
  const scenario = environment(); const registration = deferred();
  scenario.setRegistrationOperation(() => registration.promise);
  const source = { kind: MediaSourceKind.Remote, address: Fixture.remoteAddress, request: { headers: [{ name: Fixture.headerName, value: Fixture.headerValue }] } };
  const tracks = [track(Fixture.firstEntry, source), track(Fixture.secondEntry, source)]; const context = { ...Context };
  const execution = scenario.preparation.execute(tracks, context, () => true, scenario.operation);
  source.request.headers[Fixture.firstIndex].value = Fixture.changedHeader;
  tracks[Fixture.firstIndex].entry.title = Fixture.changedTitle; context.authenticationEpoch = Fixture.otherAccount;
  registration.resolve(); await execution;
  assertion.equal(scenario.registrations[Fixture.oneCount].source.request.headers[Fixture.firstIndex].value, Fixture.headerValue);
  assertion.equal(scenario.registrations[Fixture.oneCount].context.authenticationEpoch, Fixture.account);
  assertion.equal(scenario.operations[Fixture.firstIndex].entries[Fixture.firstIndex].title, Fixture.title);
});
test(TestNames.duplicate, async () => {
  const scenario = environment();
  await assertion.rejects(scenario.preparation.execute([track(), track()], Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.registrations, []);
});
test(TestNames.mismatch, async () => {
  const scenario = environment(); const prepared = track(); prepared.view.entryIdentifier = Fixture.secondEntry;
  await assertion.rejects(scenario.preparation.execute([prepared], Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.registrations, []);
});
test(TestNames.cleanup, async () => {
  const scenario = environment(); scenario.setFailQueue(true); scenario.setFailRelease(true);
  await assertion.rejects(scenario.preparation.execute([track(Fixture.firstEntry, LocalSource), track(Fixture.secondEntry, LocalSource)], Context, () => true, scenario.operation));
  assertion.equal(scenario.releases.length, Fixture.twoCount); assertion.equal(scenario.failures.length, Fixture.twoCount);
});
test(TestNames.ordered, async () => {
  const scenario = environment(); const registration = deferred();
  scenario.setRegistrationOperation(count => count === Fixture.zeroCount ? registration.promise : Promise.resolve());
  const execution = scenario.preparation.execute([track(Fixture.firstEntry, LocalSource), track(Fixture.secondEntry, LocalSource)], Context, () => true, scenario.operation);
  assertion.equal(scenario.registrations.length, Fixture.zeroCount); assertion.deepEqual(scenario.operations, []);
  registration.resolve(); await execution; assertion.equal(scenario.registrations.length, Fixture.twoCount);
});

const BoundaryTestNames = Object.freeze({
  empty: 'empty occurrence identifiers reject before registering private sources',
  invalid: 'invalid media source rejects before registering any part of the queue',
  capacity: 'preparing more than the logical queue limit rejects before registration',
  context: 'the queue operation receives the captured staging session context',
});
test(BoundaryTestNames.empty, async () => {
  const scenario = environment();
  await assertion.rejects(scenario.preparation.execute([track(Fixture.emptyIdentifier, LocalSource)], Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.registrations, []);
});
test(BoundaryTestNames.invalid, async () => {
  const scenario = environment();
  await assertion.rejects(scenario.preparation.execute([track(Fixture.firstEntry, LocalSource), track(Fixture.secondEntry, { kind: MediaSourceKind.Remote, address: Fixture.localAddress })], Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.registrations, []);
});
test(BoundaryTestNames.capacity, async () => {
  const scenario = environment();
  const tracks = Array.from({ length: DefaultQueuePolicy.maximumEntries + Fixture.oneCount }, (_, index) => track(Fixture.firstEntry + index));
  await assertion.rejects(scenario.preparation.execute(tracks, Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.registrations, []);
});
test(BoundaryTestNames.context, async () => {
  const scenario = environment(); const registration = deferred(); const context = { ...Context };
  scenario.setRegistrationOperation(() => registration.promise);
  const execution = scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], context, () => true, scenario.operation);
  context.authenticationEpoch = Fixture.otherAccount;
  registration.resolve(); await execution;
  assertion.equal(scenario.operations[Fixture.firstIndex].context.authenticationEpoch, Fixture.account);
});

const StorageTestNames = Object.freeze({
  budget: 'aggregate configuration budget rejects oversized preparation before any native registrations',
  copy: 'source capture retains supported request fields and omits unknown private fields',
});
const StorageFixture = Object.freeze({ bodyCharacter: 'x', contentType: 'text/plain', unknownPrivateField: 'unused-private-field' });
test(StorageTestNames.budget, async () => {
  const scenario = environment();
  const source = { kind: MediaSourceKind.Resolved, address: Fixture.remoteAddress,
    request: { method: MediaRequestMethod.Post, body: { encoding: MediaBodyEncoding.Utf8,
      value: StorageFixture.bodyCharacter.repeat(MediaSourcePolicy.maximumBodyBytes), contentType: StorageFixture.contentType } } };
  const count = Math.ceil(MediaSourcePolicy.maximumSourceConfigurationBytes / (MediaSourcePolicy.maximumBodyBytes * MediaSourcePolicy.sourceBodyStorageMultiplier));
  const tracks = Array.from({ length: count }, (_, index) => track(Fixture.firstEntry + index, source));
  await assertion.rejects(scenario.preparation.execute(tracks, Context, () => true, scenario.operation));
  assertion.deepEqual(scenario.registrations, []);
});
test(StorageTestNames.copy, async () => {
  const scenario = environment();
  const source = { kind: MediaSourceKind.Remote, address: Fixture.remoteAddress, extraPrivateField: StorageFixture.unknownPrivateField,
    request: { headers: [{ name: Fixture.headerName, value: Fixture.headerValue, extraPrivateField: StorageFixture.unknownPrivateField }] } };
  await scenario.preparation.execute([track(Fixture.firstEntry, source)], Context, () => true, scenario.operation);
  const captured = scenario.registrations[Fixture.firstIndex].source;
  assertion.equal(captured.extraPrivateField, undefined);
  assertion.deepEqual(captured.request.headers, [{ name: Fixture.headerName, value: Fixture.headerValue }]);
});

const OrderingTestNames = Object.freeze({
  cleanup: 'new selection waits for obsolete preparation cleanup before allocating replacement handles',
  recovery: 'failed source preparation does not block the next candidate',
});
test(OrderingTestNames.cleanup, async () => {
  const scenario = environment(); const registration = deferred(); let firstCurrent = true;
  scenario.setRegistrationOperation(count => count === Fixture.zeroCount ? registration.promise : Promise.resolve());
  const first = scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => firstCurrent, scenario.operation);
  await Promise.resolve();
  firstCurrent = false;
  const second = scenario.preparation.execute([track(Fixture.secondEntry, LocalSource)], Context, () => true, scenario.operation);
  assertion.equal(scenario.registrations.length, Fixture.zeroCount);
  registration.resolve(); await assertion.rejects(first); await second;
  assertion.equal(scenario.releases.length, Fixture.oneCount);
  assertion.equal(scenario.operations.length, Fixture.oneCount);
  assertion.equal(scenario.operations[Fixture.firstIndex].entries[Fixture.firstIndex].entryIdentifier, Fixture.secondEntry);
});
test(OrderingTestNames.recovery, async () => {
  const scenario = environment();
  const first = scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => false, scenario.operation);
  const second = scenario.preparation.execute([track(Fixture.secondEntry, LocalSource)], Context, () => true, scenario.operation);
  await assertion.rejects(first); await second;
  assertion.equal(scenario.operations.length, Fixture.oneCount);
  assertion.equal(scenario.operations[Fixture.firstIndex].entries[Fixture.firstIndex].entryIdentifier, Fixture.secondEntry);
});

const SourceControlIntegrationName = 'source preparation does not hold the real native audio command dispatcher';
test(SourceControlIntegrationName, async () => {
  const scenario = environment(); const registration = deferred(); const started = deferred();
  scenario.setRegistrationOperation(() => { started.resolve(); return registration.promise; });
  const execution = scenario.preparation.execute([track(Fixture.firstEntry, LocalSource)], Context, () => true, scenario.operation);
  await started.promise;
  const dispatcher = new NativePlayerCommandDispatcher({
    async initialize() {}, async getSnapshot() { return { cursor: { ...Context, eventSequence: Fixture.oneCount, queueRevision: Fixture.oneCount } }; },
    async clearSession() {},
  }, { nextIdentifier: () => Fixture.request });
  let controlApplied = false;
  await dispatcher.playbackCommand(async context => { controlApplied = true; return { status: CommandResultStatus.Applied, requestIdentifier: context.requestIdentifier, cursor: Context }; });
  assertion.equal(controlApplied, true);
  assertion.deepEqual(scenario.operations, []);
  registration.resolve(); await execution;
});

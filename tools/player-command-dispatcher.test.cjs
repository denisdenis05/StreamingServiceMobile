const { test } = require('node:test');
const { strict: assertion } = require('node:assert');
const { NativePlayerCommandDispatcher, PlayerDispatchPolicy } = require('../.build/audio-migration/NativePlayerCommandDispatcher');
const { CommandResultStatus } = require('streaming-service-player');

const InitialCount = 0;
const CountIncrement = 1;
const ExpectedSingleCall = 1;
const ExpectedReconnectCalls = 2;
const FirstContextIndex = 0;
const SecondContextIndex = 1;
const Fixture = Object.freeze({
  engineEpoch: 'fixture-engine', authenticationEpoch: 'fixture-account',
  anotherAuthenticationEpoch: 'other-account', anotherEngineEpoch: 'other-engine',
  firstRevision: 7, nextRevision: 8,
  requestPrefix: 'fixture-request-', failureMessage: 'Fixture native failure',
  firstOperation: 'first', secondOperation: 'second',
});
const TestNames = {
  initialization: 'concurrent initialization shares one native binding',
  initializationRetry: 'failed initialization is retried by the next operation',
  context: 'playback commands capture the current native engine and authentication epochs',
  order: 'native commands preserve submission order without involving history requests',
  recovery: 'a rejected operation does not poison later native commands',
  revision: 'queue commands use the native queue revision',
  retry: 'queue conflicts retry with fresh revisions and distinct request identifiers',
  retryLimit: 'persistent native queue conflicts have a finite retry limit',
  accountFence: 'queue conflict retries cannot cross an authentication epoch',
  engineFence: 'queue conflict retries cannot cross a native engine restart',
  clear: 'session clear bypasses an in-flight command and supersedes its late receipt',
  queuedFence: 'session clear drops queued commands belonging to the earlier session',
  snapshotRecovery: 'snapshot failures invalidate the cached binding for reconnection',
  clearRecovery: 'failed session clear invalidates the cached binding for reconnection',
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function fixtureDispatcher() {
  let initializationCount = InitialCount;
  let snapshotCount = InitialCount;
  let clearCount = InitialCount;
  let identifierSequence = InitialCount;
  const snapshot = { cursor: { engineEpoch: Fixture.engineEpoch, authenticationEpoch: Fixture.authenticationEpoch,
    queueRevision: Fixture.firstRevision } };
  const lifecycle = {
    async initialize() { initializationCount += CountIncrement; },
    async getSnapshot() { snapshotCount += CountIncrement; return snapshot; },
    async clearSession() { clearCount += CountIncrement; },
  };
  const dispatcher = new NativePlayerCommandDispatcher(lifecycle, {
    nextIdentifier() { identifierSequence += CountIncrement; return Fixture.requestPrefix + identifierSequence; },
  });
  return { dispatcher, lifecycle, snapshot,
    get initializationCount() { return initializationCount; },
    get snapshotCount() { return snapshotCount; },
    get clearCount() { return clearCount; } };
}

function receipt(context, status = CommandResultStatus.Applied) {
  return { status, requestIdentifier: context.requestIdentifier };
}

test(TestNames.initialization, async () => {
  const fixture = fixtureDispatcher();
  await Promise.all([fixture.dispatcher.initialize(), fixture.dispatcher.initialize()]);
  assertion.equal(fixture.initializationCount, ExpectedSingleCall);
});

test(TestNames.initializationRetry, async () => {
  const fixture = fixtureDispatcher();
  const originalInitialization = fixture.lifecycle.initialize;
  fixture.lifecycle.initialize = async () => { throw new Error(Fixture.failureMessage); };
  await assertion.rejects(fixture.dispatcher.initialize());
  fixture.lifecycle.initialize = originalInitialization;
  await fixture.dispatcher.initialize();
  assertion.equal(fixture.initializationCount, ExpectedSingleCall);
});

test(TestNames.context, async () => {
  const { dispatcher } = fixtureDispatcher();
  await dispatcher.playbackCommand(async context => {
    assertion.equal(context.engineEpoch, Fixture.engineEpoch);
    assertion.equal(context.authenticationEpoch, Fixture.authenticationEpoch);
    return receipt(context);
  });
});

test(TestNames.order, async () => {
  const { dispatcher } = fixtureDispatcher();
  const gate = deferred();
  const entered = deferred();
  const calls = [];
  const first = dispatcher.playbackCommand(async context => {
    calls.push(Fixture.firstOperation);
    entered.resolve();
    await gate.promise;
    return receipt(context);
  });
  const second = dispatcher.playbackCommand(async context => { calls.push(Fixture.secondOperation); return receipt(context); });
  await entered.promise;
  assertion.deepEqual(calls, [Fixture.firstOperation]);
  gate.resolve();
  await Promise.all([first, second]);
  assertion.deepEqual(calls, [Fixture.firstOperation, Fixture.secondOperation]);
});

test(TestNames.recovery, async () => {
  const { dispatcher } = fixtureDispatcher();
  await assertion.rejects(dispatcher.playbackCommand(async () => { throw new Error(Fixture.failureMessage); }));
  const result = await dispatcher.playbackCommand(async context => receipt(context));
  assertion.equal(result.status, CommandResultStatus.Applied);
});

test(TestNames.revision, async () => {
  const { dispatcher } = fixtureDispatcher();
  await dispatcher.queueCommand(async context => {
    assertion.equal(context.expectedQueueRevision, Fixture.firstRevision);
    return receipt(context);
  });
});

test(TestNames.retry, async () => {
  const fixture = fixtureDispatcher();
  const contexts = [];
  await fixture.dispatcher.queueCommand(async context => {
    contexts.push(context);
    if (context.expectedQueueRevision === Fixture.firstRevision) {
      fixture.snapshot.cursor.queueRevision = Fixture.nextRevision;
      return receipt(context, CommandResultStatus.Conflict);
    }
    return receipt(context);
  });
  assertion.equal(contexts[SecondContextIndex].expectedQueueRevision, Fixture.nextRevision);
  assertion.notEqual(contexts[FirstContextIndex].requestIdentifier, contexts[SecondContextIndex].requestIdentifier);
});

test(TestNames.retryLimit, async () => {
  const { dispatcher } = fixtureDispatcher();
  let attempts = InitialCount;
  await assertion.rejects(dispatcher.queueCommand(async context => {
    attempts += CountIncrement;
    return receipt(context, CommandResultStatus.Conflict);
  }), { message: PlayerDispatchPolicy.queueConflictMessage });
  assertion.equal(attempts, PlayerDispatchPolicy.maximumQueueAttempts);
});

for (const epochChange of [
  { name: TestNames.accountFence, field: 'authenticationEpoch', value: Fixture.anotherAuthenticationEpoch },
  { name: TestNames.engineFence, field: 'engineEpoch', value: Fixture.anotherEngineEpoch },
]) {
  test(epochChange.name, async () => {
    const fixture = fixtureDispatcher();
    let attempts = InitialCount;
    await assertion.rejects(fixture.dispatcher.queueCommand(async context => {
      attempts += CountIncrement;
      fixture.snapshot.cursor[epochChange.field] = epochChange.value;
      return receipt(context, CommandResultStatus.Conflict);
    }), { message: PlayerDispatchPolicy.supersededMessage });
    assertion.equal(attempts, ExpectedSingleCall);
  });
}

test(TestNames.clear, async () => {
  const fixture = fixtureDispatcher();
  const gate = deferred();
  const entered = deferred();
  const command = fixture.dispatcher.playbackCommand(async context => { entered.resolve(); await gate.promise; return receipt(context); });
  const rejected = assertion.rejects(command, { message: PlayerDispatchPolicy.supersededMessage });
  await entered.promise;
  await fixture.dispatcher.clearSession();
  assertion.equal(fixture.clearCount, ExpectedSingleCall);
  gate.resolve();
  await rejected;
});

test(TestNames.queuedFence, async () => {
  const { dispatcher } = fixtureDispatcher();
  const command = dispatcher.playbackCommand(async context => { assertion.fail(); return receipt(context); });
  const rejected = assertion.rejects(command, { message: PlayerDispatchPolicy.supersededMessage });
  await dispatcher.clearSession();
  await rejected;
});

test(TestNames.snapshotRecovery, async () => {
  const fixture = fixtureDispatcher();
  const originalSnapshot = fixture.lifecycle.getSnapshot;
  fixture.lifecycle.getSnapshot = async () => { throw new Error(Fixture.failureMessage); };
  await assertion.rejects(fixture.dispatcher.getSnapshot());
  fixture.lifecycle.getSnapshot = originalSnapshot;
  await fixture.dispatcher.getSnapshot();
  assertion.equal(fixture.initializationCount, ExpectedReconnectCalls);
});

test(TestNames.clearRecovery, async () => {
  const fixture = fixtureDispatcher();
  fixture.lifecycle.clearSession = async () => { throw new Error(Fixture.failureMessage); };
  await assertion.rejects(fixture.dispatcher.clearSession());
  await fixture.dispatcher.initialize();
  assertion.equal(fixture.initializationCount, ExpectedReconnectCalls);
});

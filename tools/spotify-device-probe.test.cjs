const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNativeReports, memoryAuthorizationStore, authorizeWithRecovery } = require('./probe-spotify-device-login.cjs');
const { IntegrationFailure, IntegrationFailureCode } = require('streaming-service-spotify-jam');

const Fixture = Object.freeze({ platform: 'linux', stage: 'keymaster-playback-scopes', success: 'success', failure: 'failure',
  rejectedStatus: 403, privateText: 'synthetic-private-response', malformed: '{synthetic-private-response',
  unknownStage: 'synthetic-private-stage', schemaRecord: 'synthetic-pending-record',
  names: Object.freeze({ sanitize: 'Probe reports preserve a known status without forwarding extra fields',
    reject: 'Probe output rejects unknown stages malformed JSON and inconsistent success categories without private details',
    storage: 'Diagnostic pending authorization is isolated in memory and cleared before bootstrap' }) });

function report(overrides = {}) {
  return { platform: Fixture.platform, stage: Fixture.stage, status: Fixture.failure,
    code: IntegrationFailureCode.Unauthorized, upstreamStatus: Fixture.rejectedStatus, ...overrides };
}

test(Fixture.names.sanitize, () => {
  const parsed = parseNativeReports(JSON.stringify(report({ token: Fixture.privateText, payload: Fixture.privateText })));
  assert.deepEqual(parsed, [report()]);
  assert.equal(JSON.stringify(parsed).includes(Fixture.privateText), false);
});

const RecoveryFixture = Object.freeze({ pending: 'synthetic-pending-authorization', result: 'synthetic-completed-probe',
  singleCallCount: 1, noCalls: 0, delayMilliseconds: 5000,
  retryAfterSeconds: 30, retryAfterMilliseconds: 30000,
  maximumRecoveries: 12,
  resumeName: 'A transient poll failure resumes the existing pairing without requesting another approval',
  consumedName: 'A consumed approval is never replayed after a bootstrap failure',
  permanentName: 'A permanent pairing rejection never enters automatic recovery',
  rateLimitName: 'Diagnostic recovery respects Spotify retry-after before resuming a pending ticket' });

test(RecoveryFixture.resumeName, async () => {
  const store = memoryAuthorizationStore(); await store.write(RecoveryFixture.pending);
  const calls = { authorize: RecoveryFixture.noCalls, resume: RecoveryFixture.noCalls, waits: [], failures: [] };
  const result = await authorizeWithRecovery({ store, cancellation: new AbortController().signal,
    broker: { authorize: async () => { calls.authorize += RecoveryFixture.singleCallCount; throw new IntegrationFailure(IntegrationFailureCode.Network); },
      resume: async () => { calls.resume += RecoveryFixture.singleCallCount; return RecoveryFixture.result; } },
    wait: async delayMilliseconds => { calls.waits.push(delayMilliseconds); }, onRecovery: code => { calls.failures.push(code); } });
  assert.equal(result, RecoveryFixture.result); assert.equal(calls.authorize, RecoveryFixture.singleCallCount);
  assert.equal(calls.resume, RecoveryFixture.singleCallCount); assert.deepEqual(calls.waits, [RecoveryFixture.delayMilliseconds]);
  assert.deepEqual(calls.failures, [IntegrationFailureCode.Network]);
});

test(RecoveryFixture.consumedName, async () => {
  const store = memoryAuthorizationStore();
  const rejected = new IntegrationFailure(IntegrationFailureCode.Network);
  let resumed = false;
  await assert.rejects(authorizeWithRecovery({ store, cancellation: new AbortController().signal,
    broker: { authorize: async () => { throw rejected; }, resume: async () => { resumed = true; } },
    wait: async () => assert.fail(), onRecovery: () => assert.fail() }), failure => failure === rejected);
  assert.equal(resumed, false);
});

test(RecoveryFixture.permanentName, async () => {
  const store = memoryAuthorizationStore(); await store.write(RecoveryFixture.pending);
  const rejected = new IntegrationFailure(IntegrationFailureCode.Unauthorized);
  await assert.rejects(authorizeWithRecovery({ store, cancellation: new AbortController().signal,
    broker: { authorize: async () => { throw rejected; }, resume: async () => assert.fail() },
    wait: async () => assert.fail(), onRecovery: () => assert.fail() }), failure => failure === rejected);
});

test(RecoveryFixture.rateLimitName, async () => {
  const store = memoryAuthorizationStore(); await store.write(RecoveryFixture.pending);
  const waits = [];
  await authorizeWithRecovery({ store, cancellation: new AbortController().signal,
    broker: { authorize: async () => { throw new IntegrationFailure(IntegrationFailureCode.RateLimited, RecoveryFixture.retryAfterSeconds); },
      resume: async () => RecoveryFixture.result }, wait: async delayMilliseconds => { waits.push(delayMilliseconds); }, onRecovery: () => undefined });
  assert.deepEqual(waits, [RecoveryFixture.retryAfterMilliseconds]);
});

const RecoveryLimitName = 'Repeated diagnostic transport failures stop at the configured recovery bound';
test(RecoveryLimitName, async () => {
  const store = memoryAuthorizationStore(); await store.write(RecoveryFixture.pending);
  const rejected = new IntegrationFailure(IntegrationFailureCode.Network);
  let recoveries = RecoveryFixture.noCalls;
  await assert.rejects(authorizeWithRecovery({ store, cancellation: new AbortController().signal,
    broker: { authorize: async () => { throw rejected; }, resume: async () => { throw rejected; } },
    wait: async () => { recoveries += RecoveryFixture.singleCallCount; }, onRecovery: () => undefined }), failure => failure === rejected);
  assert.equal(recoveries, RecoveryFixture.maximumRecoveries);
});

const PreCanceledRecoveryName = 'A pre-canceled diagnostic never opens or resumes pairing';
test(PreCanceledRecoveryName, async () => {
  const cancellation = new AbortController(); cancellation.abort();
  await assert.rejects(authorizeWithRecovery({ store: memoryAuthorizationStore(), cancellation: cancellation.signal,
    broker: { authorize: async () => assert.fail(), resume: async () => assert.fail() },
    wait: async () => assert.fail(), onRecovery: () => assert.fail() }), failure => failure.code === IntegrationFailureCode.Canceled);
});

test(Fixture.names.reject, () => {
  for (const serialized of [Fixture.malformed, JSON.stringify(report({ stage: Fixture.unknownStage })),
    JSON.stringify(report({ status: Fixture.success })), JSON.stringify(report({ code: null }))]) {
    assert.throws(() => parseNativeReports(serialized), failure => failure instanceof IntegrationFailure
      && failure.code === IntegrationFailureCode.InvalidResponse && !failure.message.includes(Fixture.privateText));
  }
});

test(Fixture.names.storage, async () => {
  const first = memoryAuthorizationStore();
  const second = memoryAuthorizationStore();
  assert.equal(await first.read(), null);
  await first.write(Fixture.schemaRecord);
  assert.equal(await first.read(), Fixture.schemaRecord);
  assert.equal(await second.read(), null);
  await first.clear();
  assert.equal(await first.read(), null);
});

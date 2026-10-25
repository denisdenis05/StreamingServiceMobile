const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNativeReports, memoryAuthorizationStore } = require('./probe-spotify-device-login.cjs');
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

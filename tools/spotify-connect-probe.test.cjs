const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', events: 'node:events',
  stream: 'node:stream', probe: './probe-spotify-connect.cjs' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const { EventEmitter } = require(Imports.events);
const { PassThrough } = require(Imports.stream);
const { projectEvent, observeConnect } = require(Imports.probe);
const Fixture = Object.freeze({ generation: 1, observedMilliseconds: 57, privateValue: 'synthetic-private-value',
  track: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', revision: 'synthetic-revision', occurrence: 'synthetic-occurrence',
  connecting: 'connecting', registered: 'registered', membership: 'membership', reconnecting: 'reconnecting', stopped: 'stopped',
  forbidden: 'forbidden', stage: 'connect-probe', failureStage: 'registrationProtobuf', line: '\n', refresh: 'refresh', stop: 'stop', restart: 'restart',
  zero: 0, one: 1, positionMilliseconds: 1234, anchorMilliseconds: 1700000000000,
  stdoutEvent: 'data', closeEvent: 'close',
  names: { projection: 'Connect diagnostics exclude account device session track and invitation identifiers',
    lifecycle: 'Connect lifecycle diagnostics allow fixed failure categories only',
    framing: 'Connect IPC joins split frames and writes credentials only to private child input',
    control: 'Connect probe sends only explicit refresh and stop operations',
    malformed: 'Malformed native output is terminated without forwarding private text',
    restart: 'Native probe restart waits for cleanup and asks its parent to reuse the in-memory credential',
    stage: 'Diagnostic failure stages allow fixed phase names without private request details' } });
function event(data) { return { generation: Fixture.generation, observedMonotonicMilliseconds: Fixture.observedMilliseconds, data }; }
function registration() { return event({ type: Fixture.registered, accountIdentifier: Fixture.privateValue,
  deviceIdentifier: Fixture.privateValue, cluster: { devices: [{ identifier: Fixture.privateValue }], activeDeviceIdentifier: Fixture.privateValue,
    playback: { track: { uri: Fixture.track }, queueRevision: Fixture.revision, nextTracks: [{ occurrenceIdentifier: Fixture.occurrence }],
      previousTracks: [], playing: true, paused: false, buffering: false,
      positionAsOfTimestampMilliseconds: Fixture.positionMilliseconds, timestampMilliseconds: Fixture.anchorMilliseconds } } }); }
function childFixture() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
  const writes = []; child.stdin.on(Fixture.stdoutEvent, bytes => writes.push(bytes.toString()));
  child.kill = () => child.emit(Fixture.closeEvent, Fixture.one);
  return { child, writes, input: new PassThrough() };
}
test(Fixture.names.projection, () => {
  const summary = projectEvent(registration());
  assert.equal(summary.hasActiveDevice, true); assert.equal(summary.playing, true);
  assert.equal(summary.positionMilliseconds, Fixture.positionMilliseconds);
  assert.equal(summary.anchorMilliseconds, Fixture.anchorMilliseconds);
  assert.equal(summary.queueHasOccurrenceIdentifiers, true);
  for (const value of [Fixture.privateValue, Fixture.track, Fixture.revision, Fixture.occurrence]) {
    assert.equal(JSON.stringify(summary).includes(value), false);
  }
  assert.deepEqual(projectEvent(event({ type: Fixture.membership, update: { invitation: Fixture.privateValue } })),
    { stage: Fixture.stage, generation: Fixture.generation, event: Fixture.membership });
});
test(Fixture.names.lifecycle, () => {
  assert.equal(projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.forbidden })).failure, Fixture.forbidden);
  assert.equal(projectEvent(event({ type: Fixture.stopped, cleanupFailure: null })).failure, null);
  assert.equal(projectEvent({ ...event({ type: Fixture.stopped, cleanupFailure: null }), generation: Fixture.zero }).failure, null);
  assert.throws(() => projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.privateValue })),
    failure => !failure.message.includes(Fixture.privateValue));
});
test(Fixture.names.framing, async () => {
  const fixture = childFixture(); const summaries = [];
  const observing = observeConnect(Fixture.privateValue, summary => summaries.push(summary), () => fixture.child, fixture.input);
  const serialized = JSON.stringify(registration()) + Fixture.line;
  fixture.child.stdout.write(serialized.slice(Fixture.zero, Fixture.one));
  fixture.child.stdout.write(serialized.slice(Fixture.one));
  assert.equal(summaries.length, Fixture.one);
  assert.equal(JSON.parse(fixture.writes[Fixture.zero]).storedCredential, Fixture.privateValue);
  assert.equal(JSON.parse(fixture.writes[Fixture.zero]).configuration.playbackReady, false);
  assert.equal(JSON.stringify(summaries).includes(Fixture.privateValue), false);
  fixture.child.emit(Fixture.closeEvent, Fixture.zero); await observing;
});
test(Fixture.names.control, async () => {
  const fixture = childFixture();
  const observing = observeConnect(Fixture.privateValue, () => undefined, () => fixture.child, fixture.input);
  fixture.input.write(Fixture.refresh + Fixture.line); fixture.input.write(Fixture.stop + Fixture.line);
  fixture.child.emit(Fixture.closeEvent, Fixture.zero); await observing;
  assert.deepEqual(fixture.writes.slice(Fixture.one).map(serialized => JSON.parse(serialized)),
    [{ operation: Fixture.refresh }, { operation: Fixture.stop }]);
});
test(Fixture.names.malformed, async () => {
  const fixture = childFixture(); const summaries = [];
  const observing = observeConnect(Fixture.privateValue, summary => summaries.push(summary), () => fixture.child, fixture.input);
  fixture.child.stdout.write(Fixture.privateValue + Fixture.line);
  await assert.rejects(observing, failure => !failure.message.includes(Fixture.privateValue));
  assert.deepEqual(summaries, []);
});
test(Fixture.names.restart, async () => {
  const fixture = childFixture(); const observing = observeConnect(Fixture.privateValue, () => undefined, () => fixture.child, fixture.input);
  fixture.input.write(Fixture.restart + Fixture.line); fixture.child.emit(Fixture.closeEvent, Fixture.zero);
  assert.equal(await observing, true);
  assert.deepEqual(JSON.parse(fixture.writes.at(-Fixture.one)), { operation: Fixture.stop });
});
test(Fixture.names.stage, () => {
  assert.equal(projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.forbidden, stage: Fixture.failureStage })).failureStage, Fixture.failureStage);
  assert.throws(() => projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.forbidden, stage: Fixture.privateValue })),
    failure => !failure.message.includes(Fixture.privateValue));
});

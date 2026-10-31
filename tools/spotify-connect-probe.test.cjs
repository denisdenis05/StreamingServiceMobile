const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', events: 'node:events',
  stream: 'node:stream', probe: './probe-spotify-connect.cjs' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
const { EventEmitter } = require(Imports.events);
const { PassThrough } = require(Imports.stream);
const { projectEvent, projectFailure, projectCatalogDiagnostic, observeConnect } = require(Imports.probe);
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
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const writes = []; child.stdin.on(Fixture.stdoutEvent, bytes => writes.push(bytes.toString()));
  child.kill = () => child.emit(Fixture.closeEvent, Fixture.one);
  return { child, writes, input: new PassThrough() };
}
test(Fixture.names.projection, () => {
  const summary = projectEvent(registration());
  assertion.equal(summary.hasActiveDevice, true); assertion.equal(summary.playing, true);
  assertion.equal(summary.positionMilliseconds, Fixture.positionMilliseconds);
  assertion.equal(summary.anchorMilliseconds, Fixture.anchorMilliseconds);
  assertion.equal(summary.queueHasOccurrenceIdentifiers, true);
  for (const value of [Fixture.privateValue, Fixture.track, Fixture.revision, Fixture.occurrence]) {
    assertion.equal(JSON.stringify(summary).includes(value), false);
  }
  assertion.deepEqual(projectEvent(event({ type: Fixture.membership, update: { invitation: Fixture.privateValue } })),
    { stage: Fixture.stage, generation: Fixture.generation, event: Fixture.membership });
});
test(Fixture.names.lifecycle, () => {
  assertion.equal(projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.forbidden })).failure, Fixture.forbidden);
  assertion.equal(projectEvent(event({ type: Fixture.stopped, cleanupFailure: null })).failure, null);
  assertion.equal(projectEvent({ ...event({ type: Fixture.stopped, cleanupFailure: null }), generation: Fixture.zero }).failure, null);
  assertion.throws(() => projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.privateValue })),
    failure => !failure.message.includes(Fixture.privateValue));
});
test(Fixture.names.framing, async () => {
  const fixture = childFixture(); const summaries = [];
  const observing = observeConnect(Fixture.privateValue, summary => summaries.push(summary), () => fixture.child, fixture.input);
  const serialized = JSON.stringify(registration()) + Fixture.line;
  fixture.child.stdout.write(serialized.slice(Fixture.zero, Fixture.one));
  fixture.child.stdout.write(serialized.slice(Fixture.one));
  assertion.equal(summaries.length, Fixture.one);
  assertion.equal(JSON.parse(fixture.writes[Fixture.zero]).storedCredential, Fixture.privateValue);
  assertion.equal(JSON.parse(fixture.writes[Fixture.zero]).configuration.playbackReady, false);
  assertion.equal(JSON.stringify(summaries).includes(Fixture.privateValue), false);
  fixture.child.emit(Fixture.closeEvent, Fixture.zero); await observing;
});
test(Fixture.names.control, async () => {
  const fixture = childFixture();
  const observing = observeConnect(Fixture.privateValue, () => undefined, () => fixture.child, fixture.input);
  fixture.input.write(Fixture.refresh + Fixture.line); fixture.input.write(Fixture.stop + Fixture.line);
  fixture.child.emit(Fixture.closeEvent, Fixture.zero); await observing;
  assertion.deepEqual(fixture.writes.slice(Fixture.one).map(serialized => JSON.parse(serialized)),
    [{ operation: Fixture.refresh }, { operation: Fixture.stop }]);
});
test(Fixture.names.malformed, async () => {
  const fixture = childFixture(); const summaries = [];
  const observing = observeConnect(Fixture.privateValue, summary => summaries.push(summary), () => fixture.child, fixture.input);
  fixture.child.stdout.write(Fixture.privateValue + Fixture.line);
  await assertion.rejects(observing, failure => !failure.message.includes(Fixture.privateValue));
  assertion.deepEqual(summaries, []);
});
test(Fixture.names.restart, async () => {
  const fixture = childFixture(); const observing = observeConnect(Fixture.privateValue, () => undefined, () => fixture.child, fixture.input);
  fixture.input.write(Fixture.restart + Fixture.line); fixture.child.emit(Fixture.closeEvent, Fixture.zero);
  assertion.equal(await observing, true);
  assertion.deepEqual(JSON.parse(fixture.writes.at(-Fixture.one)), { operation: Fixture.stop });
});
test(Fixture.names.stage, () => {
  assertion.equal(projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.forbidden, stage: Fixture.failureStage })).failureStage, Fixture.failureStage);
  assertion.throws(() => projectEvent(event({ type: Fixture.reconnecting, failure: Fixture.forbidden, stage: Fixture.privateValue })),
    failure => !failure.message.includes(Fixture.privateValue));
});

const CommandFixture = Object.freeze({ pause: 'pause', play: 'play', checkedCommand: 'checkedCommand', commandPrefix: 'connect-probe-',
  name: 'Typed probe commands use the observed host and generation and stop dispatching on reconnect' });
test(CommandFixture.name, async () => {
  const fixture = childFixture();
  const observing = observeConnect(Fixture.privateValue, () => undefined, () => fixture.child, fixture.input);
  fixture.input.write(CommandFixture.pause + Fixture.line);
  assertion.equal(fixture.writes.length, Fixture.one);
  fixture.child.stdout.write(JSON.stringify(registration()) + Fixture.line);
  fixture.input.write(CommandFixture.pause + Fixture.line);
  assertion.deepEqual(JSON.parse(fixture.writes.at(-Fixture.one)), { operation: CommandFixture.checkedCommand,
    generation: Fixture.generation, requestIdentifier: CommandFixture.commandPrefix + Fixture.one,
    targetDeviceIdentifier: Fixture.privateValue, command: { kind: CommandFixture.pause } });
  const count = fixture.writes.length;
  fixture.child.stdout.write(JSON.stringify(event({ type: Fixture.reconnecting, failure: Fixture.forbidden })) + Fixture.line);
  fixture.input.write(CommandFixture.play + Fixture.line); assertion.equal(fixture.writes.length, count);
  fixture.child.emit(Fixture.closeEvent, Fixture.zero); await observing;
});

const FailureFixture = Object.freeze({ authorization: 'authorization', grant: 'nativeGrant', observation: 'observation', network: 'network',
  names: { known: 'Probe failures preserve only known categories and fixed lifecycle phases',
    private: 'Raw exceptions unknown codes and throwing properties never escape failure summaries' } });
test(FailureFixture.names.known, () => {
  for (const phase of [FailureFixture.authorization, FailureFixture.grant, FailureFixture.observation]) {
    assertion.deepEqual(projectFailure({ code: Fixture.forbidden, message: Fixture.privateValue }, phase),
      { stage: Fixture.stage, phase, failure: Fixture.forbidden });
  }
});
test(FailureFixture.names.private, () => {
  for (const failure of [new Error(Fixture.privateValue), { code: Fixture.privateValue }, null,
    Object.defineProperty({}, 'code', { get() { throw new Error(Fixture.privateValue); } })]) {
    const summary = projectFailure(failure, Fixture.privateValue);
    assertion.deepEqual(summary, { stage: Fixture.stage, phase: FailureFixture.authorization, failure: FailureFixture.network });
    assertion.equal(JSON.stringify(summary).includes(Fixture.privateValue), false);
  }
});

const CatalogFixture = Object.freeze({ origin: 'https://api.spotify.com', stage: 'httpResponse', admission: 'dispatchAdmission', status: 429,
  failure: 'backpressure', summaryStage: 'native-catalog-http', privateValue: 'synthetic-private-diagnostic',
  foreignOrigin: 'https://synthetic.example/', invalidStatus: 999 });
test('Catalog diagnostics preserve fixed HTTP origin and status while discarding every private extra field', () => {
  const projected = projectCatalogDiagnostic({ ...CatalogFixture, token: CatalogFixture.privateValue, query: CatalogFixture.privateValue });
  assertion.deepEqual(projected, { stage: CatalogFixture.summaryStage, origin: CatalogFixture.origin,
    operation: CatalogFixture.stage, status: CatalogFixture.status, failure: CatalogFixture.failure });
  assertion.equal(JSON.stringify(projected).includes(CatalogFixture.privateValue), false);
});
test('Catalog diagnostics cannot claim an HTTP status for admission or malformed private transport output', () => {
  assertion.equal(projectCatalogDiagnostic({ ...CatalogFixture, origin: CatalogFixture.foreignOrigin }), null);
  assertion.equal(projectCatalogDiagnostic({ ...CatalogFixture, status: CatalogFixture.invalidStatus }), null);
  assertion.equal(projectCatalogDiagnostic({ ...CatalogFixture, failure: CatalogFixture.privateValue }), null);
  const admitted = projectCatalogDiagnostic({ ...CatalogFixture, stage: CatalogFixture.admission, status: null });
  assertion.equal(admitted.status, null);
});

test('Native catalog diagnostic framing ignores raw errors and forwards bounded validated summaries without stopping the owner', async () => {
  const fixture = childFixture(); const summaries = [];
  const observing = observeConnect(Fixture.privateValue, summary => summaries.push(summary), () => fixture.child, fixture.input);
  fixture.child.stderr.write(Fixture.privateValue + Fixture.line);
  const diagnostic = JSON.stringify({ ...CatalogFixture, token: Fixture.privateValue }) + Fixture.line;
  fixture.child.stderr.write(diagnostic.slice(Fixture.zero, Fixture.one)); fixture.child.stderr.write(diagnostic.slice(Fixture.one));
  assertion.equal(summaries.length, Fixture.one); assertion.equal(summaries[Fixture.zero].status, CatalogFixture.status);
  assertion.equal(JSON.stringify(summaries).includes(Fixture.privateValue), false);
  fixture.child.emit(Fixture.closeEvent, Fixture.zero); await observing;
});

const RateLimitDiagnostic = Object.freeze({ failure: 'rate-limited', name: 'Catalog diagnostics preserve actual HTTP rate limits independently from local backpressure' });
test(RateLimitDiagnostic.name, () => {
  const projected = projectCatalogDiagnostic({ ...CatalogFixture, failure: RateLimitDiagnostic.failure });
  assertion.equal(projected.failure, RateLimitDiagnostic.failure);
  assertion.equal(projected.status, CatalogFixture.status);
  assertion.notEqual(projected.failure, CatalogFixture.failure);
});

const TrafficDiagnosticFixture = Object.freeze({ retryAfterSeconds: 120, cooldownRemainingSeconds: 119, requestCount: 1,
  quotaExceeded: true, invalidCount: -1, invalidSeconds: Number.POSITIVE_INFINITY, unsafeCount: Number.MAX_SAFE_INTEGER + 1,
  name: 'Catalog diagnostics preserve bounded server cooldown quota and request counters without private fields',
  invalidName: 'Catalog diagnostics discard malformed pacing fields instead of exporting arbitrary values' });
test(TrafficDiagnosticFixture.name, () => {
  const projected = projectCatalogDiagnostic({ ...CatalogFixture, ...TrafficDiagnosticFixture });
  assertion.equal(projected.retryAfterSeconds, TrafficDiagnosticFixture.retryAfterSeconds);
  assertion.equal(projected.cooldownRemainingSeconds, TrafficDiagnosticFixture.cooldownRemainingSeconds);
  assertion.equal(projected.requestCount, TrafficDiagnosticFixture.requestCount);
  assertion.equal(projected.quotaExceeded, true);
  assertion.equal(JSON.stringify(projected).includes(TrafficDiagnosticFixture.name), false);
});
test(TrafficDiagnosticFixture.invalidName, () => {
  const projected = projectCatalogDiagnostic({ ...CatalogFixture, retryAfterSeconds: TrafficDiagnosticFixture.invalidSeconds,
    cooldownRemainingSeconds: TrafficDiagnosticFixture.invalidCount, requestCount: TrafficDiagnosticFixture.unsafeCount,
    quotaExceeded: CatalogFixture.privateValue });
  assertion.equal(projected.retryAfterSeconds, undefined); assertion.equal(projected.cooldownRemainingSeconds, undefined);
  assertion.equal(projected.requestCount, undefined); assertion.equal(projected.quotaExceeded, undefined);
});

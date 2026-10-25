const Imports = Object.freeze({ subprocess: 'node:child_process', path: 'node:path', readline: 'node:readline',
  timers: 'node:timers/promises', login: './probe-spotify-device-login.cjs' });
const { spawn } = require(Imports.subprocess);
const path = require(Imports.path);
const readline = require(Imports.readline);
const { setTimeout: wait } = require(Imports.timers);
const { createDeviceAuthorization, memoryAuthorizationStore, authorizeWithRecovery, nativeSessionGrant } = require(Imports.login);
const Policy = Object.freeze({ program: '../native/librespot-session/target/debug/examples/connect_probe',
  deviceName: 'StreamingService protocol test', lineSeparator: '\n', maximumLineBytes: 1048576,
  initialGeneration: 0, firstGeneration: 1, emptyCount: 0, exitFailure: 1,
  objectType: 'object', stringType: 'string', connecting: 'connecting', registered: 'registered', cluster: 'cluster',
  membership: 'membership', sessionMessage: 'sessionMessage', command: 'command', reconnecting: 'reconnecting', stopped: 'stopped',
  refresh: 'refresh', stop: 'stop', quit: 'quit', interrupt: 'SIGINT', terminate: 'SIGTERM',
  lineEvent: 'line', closeEvent: 'close', errorEvent: 'error', dataEvent: 'data', endEvent: 'end', failureField: 'failure',
  networkFailure: 'network', invalidResponse: 'invalid-response', canceled: 'canceled',
  allowedFailures: ['network', 'invalid-response', 'invalid-input', 'unauthorized', 'forbidden', 'not-found',
    'deadline', 'canceled', 'backpressure', 'unknown-outcome', 'unsupported'],
  stage: 'connect-probe', inputOutput: 'pipe', diagnosticOutput: 'ignore' });
const Copy = Object.freeze({ ready: 'Observing Spotify Connect. Commands: refresh, stop. Playback capability is disabled for this transport test.' });

function projectEvent(value) {
  if (!value || typeof value !== Policy.objectType || !Number.isSafeInteger(value.generation)
    || value.generation < Policy.initialGeneration || value.generation < Policy.firstGeneration && value.data?.type !== Policy.stopped
    || !Number.isSafeInteger(value.observedMonotonicMilliseconds)
    || value.observedMonotonicMilliseconds < Policy.initialGeneration || !value.data) throw new Error(Policy.invalidResponse);
  const data = value.data;
  const summary = { stage: Policy.stage, generation: value.generation, event: data.type };
  if ([Policy.connecting, Policy.membership, Policy.sessionMessage, Policy.command].includes(data.type)) return summary;
  if ([Policy.reconnecting, Policy.stopped].includes(data.type)) {
    const failure = data.type === Policy.stopped ? data.cleanupFailure : data.failure;
    if (failure !== null && !Policy.allowedFailures.includes(failure)) throw new Error(Policy.invalidResponse);
    return { ...summary, failure };
  }
  if (![Policy.registered, Policy.cluster].includes(data.type) || !data.cluster
    || !Array.isArray(data.cluster.devices)) throw new Error(Policy.invalidResponse);
  const cluster = data.cluster;
  const playback = cluster.playback;
  if (playback && (!Array.isArray(playback.nextTracks) || !Array.isArray(playback.previousTracks))) throw new Error(Policy.invalidResponse);
  return { ...summary, deviceCount: cluster.devices.length, hasActiveDevice: Boolean(cluster.activeDeviceIdentifier),
    hasPlayback: playback !== null, hasTrack: Boolean(playback?.track), playing: playback?.playing ?? false,
    paused: playback?.paused ?? false, buffering: playback?.buffering ?? false,
    positionMilliseconds: Number.isSafeInteger(playback?.positionAsOfTimestampMilliseconds) ? playback.positionAsOfTimestampMilliseconds : null,
    anchorMilliseconds: Number.isSafeInteger(playback?.timestampMilliseconds) ? playback.timestampMilliseconds : null,
    nextCount: playback?.nextTracks.length ?? Policy.emptyCount,
    hasQueueRevision: Boolean(playback?.queueRevision),
    queueHasOccurrenceIdentifiers: playback?.nextTracks.every(track => typeof track.occurrenceIdentifier === Policy.stringType
      && Boolean(track.occurrenceIdentifier)) ?? false,
    hasAcknowledgement: Boolean(cluster.acknowledgementIdentifier) };
}

function observeConnect(storedCredential, onSummary, childFactory = spawn, input = process.stdin) {
  return new Promise((resolve, reject) => {
    const child = childFactory(path.resolve(__dirname, Policy.program), [], {
      stdio: [Policy.inputOutput, Policy.inputOutput, Policy.diagnosticOutput] });
    let buffer = Buffer.alloc(Policy.emptyCount);
    let ended = false;
    let terminalFailure = null;
    const controls = readline.createInterface({ input });
    const stop = () => {
      if (ended) return;
      ended = true;
      child.stdin.end(JSON.stringify({ operation: Policy.stop }) + Policy.lineSeparator);
      controls.close();
    };
    const fail = () => { terminalFailure = new Error(Policy.invalidResponse); child.kill(); };
    const write = operation => child.stdin.write(JSON.stringify({ operation }) + Policy.lineSeparator);
    child.stdin.on(Policy.errorEvent, () => undefined);
    child.on(Policy.errorEvent, () => { terminalFailure = new Error(Policy.networkFailure); controls.close(); reject(terminalFailure); });
    child.on(Policy.closeEvent, code => {
      process.removeListener(Policy.interrupt, stop); process.removeListener(Policy.terminate, stop);
      input.removeListener(Policy.endEvent, stop);
      controls.close();
      if (terminalFailure || code !== Policy.initialGeneration || buffer.length !== Policy.emptyCount) {
        reject(terminalFailure ?? new Error(Policy.networkFailure));
      } else resolve();
    });
    child.stdout.on(Policy.dataEvent, bytes => {
      buffer = Buffer.concat([buffer, bytes]);
      let boundary = buffer.indexOf(Policy.lineSeparator);
      while (boundary !== -Policy.firstGeneration) {
        if (boundary > Policy.maximumLineBytes) { fail(); return; }
        const line = buffer.subarray(Policy.emptyCount, boundary);
        buffer = buffer.subarray(boundary + Policy.firstGeneration);
        try {
          const value = JSON.parse(line.toString());
          if (Object.hasOwn(value, Policy.failureField)) {
            if (value.failure !== null && !Policy.allowedFailures.includes(value.failure)) throw new Error(Policy.invalidResponse);
            onSummary({ stage: Policy.stage, operation: Policy.refresh, failure: value.failure });
          } else onSummary(projectEvent(value));
        } catch { fail(); return; }
        boundary = buffer.indexOf(Policy.lineSeparator);
      }
      if (buffer.length > Policy.maximumLineBytes) fail();
    });
    controls.on(Policy.lineEvent, command => {
      if (command === Policy.refresh && !ended) write(Policy.refresh);
      if ([Policy.stop, Policy.quit].includes(command)) stop();
    });
    input.once(Policy.endEvent, stop);
    process.once(Policy.interrupt, stop); process.once(Policy.terminate, stop);
    child.stdin.write(JSON.stringify({ storedCredential, configuration: { name: Policy.deviceName, playbackReady: false } }) + Policy.lineSeparator);
  });
}

async function main() {
  const cancellation = new AbortController();
  const store = memoryAuthorizationStore();
  const broker = createDeviceAuthorization((token, signal) => nativeSessionGrant(token, false, signal), store);
  try {
    const grant = await authorizeWithRecovery({ broker, store, cancellation: cancellation.signal,
      wait: (delayMilliseconds, signal) => wait(delayMilliseconds, undefined, { signal }),
      onRecovery: code => console.log(JSON.stringify({ stage: Policy.stage, code })) });
    console.log(Copy.ready);
    await observeConnect(grant.storedCredential, summary => console.log(JSON.stringify(summary)));
  } catch {
    console.log(JSON.stringify({ stage: Policy.stage, failure: Policy.networkFailure }));
    process.exitCode = Policy.exitFailure;
  } finally { cancellation.abort(); }
}

module.exports = { projectEvent, observeConnect };
if (require.main === module) void main();

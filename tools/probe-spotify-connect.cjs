const Imports = Object.freeze({ subprocess: 'node:child_process', path: 'node:path', readline: 'node:readline',
  timers: 'node:timers/promises', library: 'streaming-service-spotify-jam', login: './probe-spotify-device-login.cjs' });
const { spawn } = require(Imports.subprocess);
const { IntegrationFailureCode } = require(Imports.library);
const path = require(Imports.path);
const readline = require(Imports.readline);
const { setTimeout: wait } = require(Imports.timers);
const { createDeviceAuthorization, memoryAuthorizationStore, authorizeWithRecovery, nativeSessionGrant } = require(Imports.login);
const Policy = Object.freeze({ program: '../native/librespot-session/target/debug/examples/connect_probe',
  deviceName: 'StreamingService protocol test', lineSeparator: '\n', maximumLineBytes: 1048576,
  initialGeneration: 0, firstGeneration: 1, emptyCount: 0, exitFailure: 1,
  objectType: 'object', stringType: 'string', connecting: 'connecting', registered: 'registered', cluster: 'cluster',
  membership: 'membership', sessionMessage: 'sessionMessage', command: 'command', reconnecting: 'reconnecting', stopped: 'stopped',
  checkedCommand: 'checkedCommand', commandPrefix: 'connect-probe-', play: 'play', pause: 'pause',
  next: 'next', previous: 'previous', queuePrefix: 'queue ', addToQueue: 'addToQueue', trackPattern: /^[a-zA-Z0-9]{22}$/,
  refresh: 'refresh', stop: 'stop', quit: 'quit', restart: 'restart', interrupt: 'SIGINT', terminate: 'SIGTERM',
  failureStages: ['restore', 'dealerResolution', 'dealerAddress', 'dealerWebsocket', 'dealerEvents',
    'registrationEncoding', 'registrationHttp', 'registrationProtobuf', 'registrationDevice'],
  lineEvent: 'line', closeEvent: 'close', errorEvent: 'error', dataEvent: 'data', endEvent: 'end', failureField: 'failure',
  networkFailure: 'network', invalidResponse: 'invalid-response', canceled: 'canceled',
  allowedFailures: ['network', 'invalid-response', 'invalid-input', 'unauthorized', 'forbidden', 'not-found',
    'deadline', 'canceled', 'backpressure', 'rate-limited', 'unknown-outcome', 'unsupported', 'superseded', 'native-token-rejected'],
  failureCodes: Object.values(IntegrationFailureCode),
  phases: ['authorization', 'nativeGrant', 'observation'], authorizationPhase: 'authorization', grantPhase: 'nativeGrant', observationPhase: 'observation',
  stage: 'connect-probe', inputOutput: 'pipe', diagnosticOutput: 'pipe',
  catalogOrigin: 'https://api-partner.spotify.com', clientTokenOrigin: 'https://clienttoken.spotify.com', clientTokenStage: 'clientToken', catalogStage: 'native-catalog-http', minimumHttpStatus: 100, maximumHttpStatus: 599,
  diagnosticStages: ['requestCompletion', 'dispatchAdmission', 'transport', 'httpResponse', 'responseBody', 'decode', 'clientToken'] });
const Copy = Object.freeze({ ready: 'Observing Spotify Connect. Commands: refresh, play, pause, next, previous, queue <Spotify track ID>, restart, stop. Restart reuses the in-memory credential after native cleanup. Playback capability is disabled for this transport test.' });

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
    if (data.stage !== undefined && !Policy.failureStages.includes(data.stage)) throw new Error(Policy.invalidResponse);
    return { ...summary, failure, ...(data.stage === undefined ? {} : { failureStage: data.stage }) };
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

const CatalogBooleanType = 'boolean';
const CatalogTrafficFields = Object.freeze(['retryAfterSeconds', 'cooldownRemainingSeconds', 'requestCount']);
function projectCatalogDiagnostic(value) {
  if (!value || !Policy.diagnosticStages.includes(value.stage)
    || value.origin !== (value.stage === Policy.clientTokenStage ? Policy.clientTokenOrigin : Policy.catalogOrigin)
    || value.status !== null && (!Number.isSafeInteger(value.status) || value.status < Policy.minimumHttpStatus || value.status > Policy.maximumHttpStatus)
    || value.failure !== null && !Policy.allowedFailures.includes(value.failure)) return null;
  const projected = { stage: Policy.catalogStage, origin: value.origin, operation: value.stage, status: value.status, failure: value.failure };
  for (const field of CatalogTrafficFields) {
    if (Number.isSafeInteger(value[field]) && value[field] >= Policy.emptyCount) projected[field] = value[field];
  }
  if (typeof value.quotaExceeded === CatalogBooleanType) projected.quotaExceeded = value.quotaExceeded;
  return projected;
}

function observeConnect(storedCredential, onSummary, childFactory = spawn, input = process.stdin) {
  return new Promise((resolve, reject) => {
    const child = childFactory(path.resolve(__dirname, Policy.program), [], {
      stdio: [Policy.inputOutput, Policy.inputOutput, Policy.diagnosticOutput] });
    let diagnosticBuffer = Buffer.alloc(Policy.emptyCount);
    let discardingDiagnosticLine = false;
    child.stderr?.on(Policy.dataEvent, bytes => {
      diagnosticBuffer = Buffer.concat([diagnosticBuffer, bytes]);
      let boundary = diagnosticBuffer.indexOf(Policy.lineSeparator);
      while (boundary !== -Policy.firstGeneration) {
        const line = diagnosticBuffer.subarray(Policy.emptyCount, boundary);
        diagnosticBuffer = diagnosticBuffer.subarray(boundary + Policy.firstGeneration);
        if (!discardingDiagnosticLine && line.length <= Policy.maximumLineBytes) {
          try { const diagnostic = projectCatalogDiagnostic(JSON.parse(line.toString())); if (diagnostic) onSummary(diagnostic); } catch {}
        }
        discardingDiagnosticLine = false;
        boundary = diagnosticBuffer.indexOf(Policy.lineSeparator);
      }
      if (diagnosticBuffer.length > Policy.maximumLineBytes) {
        diagnosticBuffer = Buffer.alloc(Policy.emptyCount); discardingDiagnosticLine = true;
      }
    });
    let buffer = Buffer.alloc(Policy.emptyCount);
    let ended = false;
    let terminalFailure = null;
    let restarting = false;
    let activeHost = null;
    let generation = Policy.initialGeneration;
    let commandSequence = Policy.emptyCount;
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
      } else resolve(restarting);
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
          } else {
            const summary = projectEvent(value);
            if (value.generation >= generation) {
              generation = value.generation;
              if ([Policy.registered, Policy.cluster].includes(value.data.type)) activeHost = value.data.cluster.activeDeviceIdentifier || null;
              else if ([Policy.connecting, Policy.reconnecting, Policy.stopped].includes(value.data.type)) activeHost = null;
            }
            onSummary(summary);
          }
        } catch { fail(); return; }
        boundary = buffer.indexOf(Policy.lineSeparator);
      }
      if (buffer.length > Policy.maximumLineBytes) fail();
    });
    controls.on(Policy.lineEvent, command => {
      if (command === Policy.refresh && !ended) write(Policy.refresh);
      if (!ended && activeHost && generation >= Policy.firstGeneration) {
        let intent = null;
        if ([Policy.play, Policy.pause, Policy.next, Policy.previous].includes(command)) intent = { kind: command };
        if (command.startsWith(Policy.queuePrefix)) {
          const spotifyTrackIdentifier = command.slice(Policy.queuePrefix.length);
          if (Policy.trackPattern.test(spotifyTrackIdentifier)) intent = { kind: Policy.addToQueue, spotifyTrackIdentifier,
            occurrenceIdentifier: Policy.commandPrefix + generation + Policy.commandPrefix + (commandSequence + Policy.firstGeneration) };
        }
        if (intent !== null) {
          commandSequence += Policy.firstGeneration;
          child.stdin.write(JSON.stringify({ operation: Policy.checkedCommand, generation,
            requestIdentifier: Policy.commandPrefix + commandSequence, targetDeviceIdentifier: activeHost, command: intent }) + Policy.lineSeparator);
        }
      }
      if (command === Policy.restart && !ended) { restarting = true; stop(); }
      if ([Policy.stop, Policy.quit].includes(command)) stop();
    });
    input.once(Policy.endEvent, stop);
    process.once(Policy.interrupt, stop); process.once(Policy.terminate, stop);
    child.stdin.write(JSON.stringify({ storedCredential, configuration: { name: Policy.deviceName, playbackReady: false } }) + Policy.lineSeparator);
  });
}

function projectFailure(failure, phase) {
  let code = Policy.networkFailure;
  try { if (Policy.failureCodes.includes(failure?.code)) code = failure.code; } catch {}
  return { stage: Policy.stage, phase: Policy.phases.includes(phase) ? phase : Policy.authorizationPhase, failure: code };
}

async function main() {
  const cancellation = new AbortController();
  const store = memoryAuthorizationStore();
  let phase = Policy.authorizationPhase;
  const broker = createDeviceAuthorization((token, signal) => {
    phase = Policy.grantPhase;
    console.log(JSON.stringify({ stage: Policy.stage, phase }));
    return nativeSessionGrant(token, false, signal);
  }, store);
  try {
    const grant = await authorizeWithRecovery({ broker, store, cancellation: cancellation.signal,
      wait: (delayMilliseconds, signal) => wait(delayMilliseconds, undefined, { signal }),
      onRecovery: code => console.log(JSON.stringify({ stage: Policy.stage, code })) });
    phase = Policy.observationPhase;
    console.log(Copy.ready);
    let restarting = true;
    while (restarting) restarting = await observeConnect(grant.storedCredential, summary => console.log(JSON.stringify(summary)));
  } catch (failure) {
    console.log(JSON.stringify(projectFailure(failure, phase)));
    process.exitCode = Policy.exitFailure;
  } finally { cancellation.abort(); }
}

module.exports = { projectEvent, projectFailure, projectCatalogDiagnostic, observeConnect };
if (require.main === module) void main();

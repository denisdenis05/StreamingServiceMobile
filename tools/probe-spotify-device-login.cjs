const Imports = Object.freeze({ subprocess: 'node:child_process', path: 'node:path', readline: 'node:readline',
  timers: 'node:timers/promises', library: 'streaming-service-spotify-jam' });
const { execFile } = require(Imports.subprocess);
const path = require(Imports.path);
const readline = require(Imports.readline);
const { setTimeout: wait } = require(Imports.timers);
const library = require(Imports.library);
const NativeProgramRelativePath = '../native/librespot-session/target/debug/examples/session_probe';

const ProbePolicy = Object.freeze({ browserProgram: 'xdg-open', browserTimeoutMilliseconds: 20000,
  requestTimeoutMilliseconds: 30000, nativeTimeoutMilliseconds: 490000, maximumOutputBytes: 16384,
  successStatus: 'success', failureStatus: 'failure', lineSeparator: '\n',
  minimumHttpStatus: 100, maximumHttpStatus: 599, failureExitCode: 1,
  interactiveArgument: '--interactive', retryCommand: 'retry', stopCommand: 'stop',
  grantArgument: '--grant', restoreArgument: '--restore', maximumGrantBytes: 131072,
  stringType: 'string',
  profileAddress: 'https://api.spotify.com/v1/me',
  jamStatusAddress: 'https://gew1-spclient.spotify.com/social-connect/v2/sessions/current',
  tokenProfileStage: 'approved-token-profile', tokenJamStage: 'approved-token-jam-status',
  deviceAuthorizationStage: 'device-authorization',
  pipeErrorEvent: 'error',
  recoveryDelayMilliseconds: 5000, maximumRecoveryAttempts: 12, initialRecoveryCount: 0, recoveryIncrement: 1,
  millisecondsPerSecond: 1000, maximumRecoveryDelayMilliseconds: 300000,
  nativeProgram: path.resolve(__dirname, NativeProgramRelativePath),
  platforms: Object.values({ linux: 'linux', android: 'android', ios: 'ios', windows: 'windows', macos: 'macos' }),
  nativeStages: Object.values({ connection: 'access-point', keymaster: 'keymaster-playback-scopes',
    streaming: 'keymaster-streaming-scope', login: 'login5', directLogin: 'login5-without-client-token',
    androidLogin: 'android-user-agent-login5-without-client-token', bootstrap: 'native-bootstrap', restore: 'native-restore', input: 'input', runtime: 'runtime' }),
  failureCodes: Object.values(library.IntegrationFailureCode) });

const ProbeCopy = Object.freeze({ codePrefix: 'Pairing code: ', addressPrefix: 'Approval URL: ',
  waiting: 'Complete Spotify sign-in and Pair in the desktop browser. Waiting for approval.',
  approved: 'Spotify approval received. Comparing token exchanges without saving credentials.',
  interactive: 'Diagnostic session remains in memory. Commands: retry or stop.' });

function parseNativeReports(serialized) {
  if (Buffer.byteLength(serialized) > ProbePolicy.maximumOutputBytes) throw new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse);
  let reports;
  try { reports = serialized.trim().split(ProbePolicy.lineSeparator).map(line => JSON.parse(line)); }
  catch { throw new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse); }
  return reports.map(report => {
    if (!report || !ProbePolicy.platforms.includes(report.platform) || !ProbePolicy.nativeStages.includes(report.stage)
      || ![ProbePolicy.successStatus, ProbePolicy.failureStatus].includes(report.status)
      || (report.status === ProbePolicy.successStatus) !== (report.code === null)
      || report.code !== null && !ProbePolicy.failureCodes.includes(report.code)
      || report.upstreamStatus !== null && (!Number.isInteger(report.upstreamStatus)
        || report.upstreamStatus < ProbePolicy.minimumHttpStatus || report.upstreamStatus > ProbePolicy.maximumHttpStatus)) {
      throw new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse);
    }
    return { platform: report.platform, stage: report.stage, status: report.status, code: report.code, upstreamStatus: report.upstreamStatus };
  });
}

function nativeProbe(accessToken, cancellation) {
  return new Promise((resolve, reject) => {
    const child = execFile(ProbePolicy.nativeProgram, [], { signal: cancellation, timeout: ProbePolicy.nativeTimeoutMilliseconds,
      maxBuffer: ProbePolicy.maximumOutputBytes }, (failure, standardOutput) => {
      if (failure) { reject(new library.IntegrationFailure(library.IntegrationFailureCode.Network)); return; }
      try { resolve(parseNativeReports(standardOutput)); }
      catch { reject(new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse)); }
    });
    child.stdin.on(ProbePolicy.pipeErrorEvent, () => undefined);
    child.stdin.end(accessToken);
  });
}

function parseNativeGrant(serialized) {
  try {
    const value = JSON.parse(serialized);
    if (value && ProbePolicy.failureCodes.includes(value.failure)) throw new library.IntegrationFailure(value.failure);
    if (!value || typeof value.accountIdentifier !== ProbePolicy.stringType || typeof value.accessToken !== ProbePolicy.stringType
      || typeof value.storedCredential !== ProbePolicy.stringType || !Number.isSafeInteger(value.expiresAtMilliseconds)) {
      throw new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse);
    }
    return { accountIdentifier: value.accountIdentifier, accessToken: value.accessToken,
      storedCredential: value.storedCredential, expiresAtMilliseconds: value.expiresAtMilliseconds };
  } catch (failure) {
    throw new library.IntegrationFailure(failure instanceof library.IntegrationFailure ? failure.code : library.IntegrationFailureCode.InvalidResponse);
  }
}

function nativeSessionGrant(credential, restore, cancellation) {
  return new Promise((resolve, reject) => {
    const child = execFile(ProbePolicy.nativeProgram, [restore ? ProbePolicy.restoreArgument : ProbePolicy.grantArgument],
      { signal: cancellation, timeout: ProbePolicy.nativeTimeoutMilliseconds, maxBuffer: ProbePolicy.maximumGrantBytes }, (failure, standardOutput) => {
        if (failure) { reject(new library.IntegrationFailure(library.IntegrationFailureCode.Network)); return; }
        try { resolve(parseNativeGrant(standardOutput)); } catch (failure) { reject(failure); }
      });
    child.stdin.on(ProbePolicy.pipeErrorEvent, () => undefined); child.stdin.end(credential);
  });
}

function openBrowser(address, cancellation) {
  return new Promise((resolve, reject) => {
    execFile(ProbePolicy.browserProgram, [address], { signal: cancellation, timeout: ProbePolicy.browserTimeoutMilliseconds,
      maxBuffer: ProbePolicy.maximumOutputBytes }, failure => {
      if (failure) reject(new library.IntegrationFailure(library.IntegrationFailureCode.Unsupported));
      else resolve();
    });
  });
}

function memoryAuthorizationStore() {
  let serialized = null;
  return { read: async () => serialized, write: async value => { serialized = value; }, clear: async () => { serialized = null; } };
}

async function authorizeWithRecovery(dependencies) {
  let recoveries = ProbePolicy.initialRecoveryCount;
  while (true) {
    if (dependencies.cancellation.aborted) throw new library.IntegrationFailure(library.IntegrationFailureCode.Canceled);
    try {
      return await (recoveries === ProbePolicy.initialRecoveryCount
        ? dependencies.broker.authorize(dependencies.cancellation) : dependencies.broker.resume(dependencies.cancellation));
    } catch (failure) {
      if (!(failure instanceof library.IntegrationFailure)
        || ![library.IntegrationFailureCode.Network, library.IntegrationFailureCode.Deadline,
          library.IntegrationFailureCode.RateLimited].includes(failure.code)
        || recoveries >= ProbePolicy.maximumRecoveryAttempts || await dependencies.store.read(dependencies.cancellation) === null) throw failure;
      const retryAfterMilliseconds = Number.isFinite(failure.retryAfterSeconds)
        ? failure.retryAfterSeconds * ProbePolicy.millisecondsPerSecond : ProbePolicy.recoveryDelayMilliseconds;
      const delayMilliseconds = Math.max(ProbePolicy.recoveryDelayMilliseconds, retryAfterMilliseconds);
      if (delayMilliseconds > ProbePolicy.maximumRecoveryDelayMilliseconds) throw failure;
      recoveries += ProbePolicy.recoveryIncrement;
      dependencies.onRecovery(failure.code);
      await dependencies.wait(delayMilliseconds, dependencies.cancellation);
    }
  }
}

async function observeNative(accessToken, signal) {
  const reports = await nativeProbe(accessToken, signal);
  for (const report of reports) console.log(JSON.stringify(report));
  return reports;
}

async function interactiveProbe(accessToken, signal) {
  if (!process.argv.includes(ProbePolicy.interactiveArgument)) return;
  console.log(ProbeCopy.interactive);
  const input = readline.createInterface({ input: process.stdin });
  try {
    for await (const command of input) {
      if (command === ProbePolicy.stopCommand) break;
      if (command === ProbePolicy.retryCommand) await observeNative(accessToken, signal);
    }
  } finally { input.close(); }
}

async function tokenStatus(stage, address, accessToken, cancellation) {
  try {
    const response = await fetch(address, { headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.any([cancellation, AbortSignal.timeout(ProbePolicy.requestTimeoutMilliseconds)]) });
    await response.body?.cancel();
    return { stage, upstreamStatus: response.status };
  } catch { return { stage, code: library.IntegrationFailureCode.Network }; }
}

function createDeviceAuthorization(bootstrap, store) {
  return new library.LibrespotDeviceAuthorization({
    clock: { nowMilliseconds: () => Date.now() }, authorizationStore: store,
    scheduler: { schedule: (delayMilliseconds, callback) => { const handle = setTimeout(callback, delayMilliseconds); return () => clearTimeout(handle); } },
    requests: { execute: async request => {
      const response = await fetch(request.address, { method: request.method, headers: request.headers, body: request.body,
        signal: AbortSignal.any([request.cancellation, AbortSignal.timeout(ProbePolicy.requestTimeoutMilliseconds)]) });
      return { status: response.status, body: await response.json() };
    } },
    openVerificationPage: openBrowser,
    onAuthorization: view => {
      console.log(ProbeCopy.codePrefix + view.userCode);
      console.log(ProbeCopy.addressPrefix + view.verificationAddress);
      console.log(ProbeCopy.waiting);
    },
    bootstrap,
  });
}

async function main() {
  const cancellation = new AbortController();
  const store = memoryAuthorizationStore();
  const broker = createDeviceAuthorization(async (accessToken, signal) => {
      console.log(ProbeCopy.approved);
      console.log(JSON.stringify(await tokenStatus(ProbePolicy.tokenProfileStage, ProbePolicy.profileAddress, accessToken, signal)));
      console.log(JSON.stringify(await tokenStatus(ProbePolicy.tokenJamStage, ProbePolicy.jamStatusAddress, accessToken, signal)));
      const reports = await observeNative(accessToken, signal);
      await interactiveProbe(accessToken, signal);
      return reports;
    }, store);
  try { await authorizeWithRecovery({ broker, store, cancellation: cancellation.signal,
    wait: (delayMilliseconds, signal) => wait(delayMilliseconds, undefined, { signal }),
    onRecovery: code => console.log(JSON.stringify({ stage: ProbePolicy.deviceAuthorizationStage, code, resuming: true })),
  }); }
  catch (failure) {
    console.log(JSON.stringify({ stage: ProbePolicy.deviceAuthorizationStage, code: failure instanceof library.IntegrationFailure
      ? failure.code : library.IntegrationFailureCode.Network }));
    process.exitCode = ProbePolicy.failureExitCode;
  }
}

module.exports = { parseNativeReports, memoryAuthorizationStore, authorizeWithRecovery, createDeviceAuthorization,
  parseNativeGrant, nativeSessionGrant };
if (require.main === module) void main();

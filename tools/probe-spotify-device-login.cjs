const { execFile } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const library = require('streaming-service-spotify-jam');

const ProbePolicy = Object.freeze({ browserProgram: 'xdg-open', browserTimeoutMilliseconds: 20000,
  requestTimeoutMilliseconds: 30000, nativeTimeoutMilliseconds: 250000, maximumOutputBytes: 16384,
  successStatus: 'success', failureStatus: 'failure', lineSeparator: '\n',
  minimumHttpStatus: 100, maximumHttpStatus: 599, failureExitCode: 1,
  interactiveArgument: '--interactive', retryCommand: 'retry', stopCommand: 'stop',
  profileAddress: 'https://api.spotify.com/v1/me',
  jamStatusAddress: 'https://gew1-spclient.spotify.com/social-connect/v2/sessions/current',
  tokenProfileStage: 'approved-token-profile', tokenJamStage: 'approved-token-jam-status',
  deviceAuthorizationStage: 'device-authorization',
  pipeErrorEvent: 'error',
  nativeProgram: path.resolve(__dirname, '../native/librespot-session/target/debug/examples/session_probe'),
  platforms: Object.values({ linux: 'linux', android: 'android', ios: 'ios', windows: 'windows', macos: 'macos' }),
  nativeStages: Object.values({ connection: 'access-point', keymaster: 'keymaster-playback-scopes',
    streaming: 'keymaster-streaming-scope', login: 'login5', directLogin: 'login5-without-client-token', input: 'input', runtime: 'runtime' }),
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

async function main() {
  const cancellation = new AbortController();
  const broker = new library.LibrespotDeviceAuthorization({
    clock: { nowMilliseconds: () => Date.now() }, authorizationStore: memoryAuthorizationStore(),
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
    bootstrap: async (accessToken, signal) => {
      console.log(ProbeCopy.approved);
      console.log(JSON.stringify(await tokenStatus(ProbePolicy.tokenProfileStage, ProbePolicy.profileAddress, accessToken, signal)));
      console.log(JSON.stringify(await tokenStatus(ProbePolicy.tokenJamStage, ProbePolicy.jamStatusAddress, accessToken, signal)));
      const reports = await observeNative(accessToken, signal);
      await interactiveProbe(accessToken, signal);
      return reports;
    },
  });
  try { await broker.authorize(cancellation.signal); }
  catch (failure) {
    console.log(JSON.stringify({ stage: ProbePolicy.deviceAuthorizationStage, code: failure instanceof library.IntegrationFailure
      ? failure.code : library.IntegrationFailureCode.Network }));
    process.exitCode = ProbePolicy.failureExitCode;
  }
}

module.exports = { parseNativeReports, memoryAuthorizationStore };
if (require.main === module) void main();

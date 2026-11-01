const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const { NativePlaybackReporting } = require('../.build/audio-migration/NativePlaybackReporting');
const { createPlaybackListeningPayload } = require('../.build/audio-migration/PlaybackListeningPayload');
const { PlaybackState, PlaybackIntent, PlayerEventType, EntryChangeReason } = require('streaming-service-player');

const IntegrationFixture = Object.freeze({
  trackerPath: '../src/services/PlaybackTracker.ts', sourceEncoding: 'utf8', engine: 'integration-engine', account: 'integration-account',
  otherAccount: 'other-integration-account', firstEntry: 'first-entry', secondEntry: 'second-entry',
  firstSession: 'first-reporting-session', secondSession: 'second-reporting-session', initialSequence: 1,
  albumIdentifier: 'album-source', playlistIdentifier: 'playlist-source', title: 'Fixture title', artist: 'Fixture artist', durationSeconds: 180,
  changeSequence: 2, playingSequence: 3, seekSequence: 4, initialRevision: 1, initialTimeMilliseconds: 0,
  intervalIncrement: 1, originalPositionMilliseconds: 40000, destinationPositionMilliseconds: 2000,
  originalPositionSeconds: 40, destinationPositionSeconds: 2, millisecondsPerSecond: 1000,
  firstIndex: 0, secondIndex: 1, oneRequest: 1, twoSessions: 2, settlingTurns: 30, firstTurn: 0,
  turnIncrement: 1, startEndpoint: '/lastfm/start-playback', stopEndpoint: '/lastfm/stop-playback',
  seekEndpoint: '/lastfm/seek', failure: 'reporting-integration-failure', startOperation: 'start',
});
const TestNames = Object.freeze({
  pending: 'real tracker session creation never delays accepting a new native occurrence',
  identity: 'late start responses keep stop and seek requests tied to their captured sessions',
  failure: 'failed old session creation allows the next real reporting session to start',
  logout: 'late old-account responses cannot report a seek against the new account',
});
function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveOperation, rejectOperation) => { resolvePromise = resolveOperation; rejectPromise = rejectOperation; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
function loadTracker() {
  const source = readFileSync(resolve(__dirname, IntegrationFixture.trackerPath), IntegrationFixture.sourceEncoding);
  const compiled = typescript.transpileModule(source, { compilerOptions: {
    target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS,
  } }).outputText;
  const module = { exports: {} };
  const intervals = new Map();
  const failures = [];
  let intervalIdentifier = IntegrationFixture.initialTimeMilliseconds;
  let timeMilliseconds = IntegrationFixture.initialTimeMilliseconds;
  runInNewContext(compiled, { exports: module.exports, module,
    Date: { now: () => timeMilliseconds },
    setInterval: callback => { intervalIdentifier += IntegrationFixture.intervalIncrement; intervals.set(intervalIdentifier, callback); return intervalIdentifier; },
    clearInterval: identifier => intervals.delete(identifier),
    console: { error: failure => failures.push(failure) },
  });
  return { ...module.exports, intervals, failures,
    advanceTime(milliseconds) { timeMilliseconds += milliseconds; },
  };
}
function snapshot(sequence = IntegrationFixture.initialSequence, entryIdentifier = IntegrationFixture.firstEntry,
  account = IntegrationFixture.account) {
  return { cursor: { engineEpoch: IntegrationFixture.engine, authenticationEpoch: account,
    eventSequence: sequence, queueRevision: IntegrationFixture.initialRevision },
    state: PlaybackState.Playing, playbackIntent: PlaybackIntent.Play, currentEntry: { entryIdentifier },
    positionMilliseconds: IntegrationFixture.initialTimeMilliseconds };
}
async function settle() {
  for (let turn = IntegrationFixture.firstTurn; turn < IntegrationFixture.settlingTurns; turn += IntegrationFixture.turnIncrement) await Promise.resolve();
}
function scenario() {
  const tracker = loadTracker();
  const startResponse = deferred();
  const requests = [];
  const capturedEntries = [];
  const reportingQueue = new tracker.PlaybackReportingQueue();
  const reporting = new NativePlaybackReporting({ create: currentSnapshot => {
    const entryIdentifier = currentSnapshot.currentEntry.entryIdentifier;
    const account = currentSnapshot.cursor.authenticationEpoch;
    capturedEntries.push(entryIdentifier);
    const client = { post: async (endpoint, body) => {
      requests.push({ endpoint, body, account });
      if (endpoint === IntegrationFixture.startEndpoint && entryIdentifier === IntegrationFixture.firstEntry) return startResponse.promise;
      return { data: { sessionId: IntegrationFixture.secondSession } };
    } };
    const payload = createPlaybackListeningPayload({ entryIdentifier, recordingIdentifier: entryIdentifier,
      title: IntegrationFixture.title, artist: IntegrationFixture.artist, isLocalCached: false,
      ...(entryIdentifier === IntegrationFixture.firstEntry ? { sourceAlbumIdentifier: IntegrationFixture.albumIdentifier }
        : { playlistIdentifier: IntegrationFixture.playlistIdentifier }),
    }, IntegrationFixture.durationSeconds);
    return new tracker.PlaybackTracker(async () => {
      const response = await client.post(IntegrationFixture.startEndpoint, payload);
      return response.data.sessionId;
    }, client, reportingQueue);
  } }, failure => tracker.failures.push(failure));
  reporting.synchronize(snapshot());
  function next() {
    const nextSnapshot = snapshot(IntegrationFixture.playingSequence, IntegrationFixture.secondEntry);
    reporting.receive({ type: PlayerEventType.EntryChanged, cursor: snapshot(IntegrationFixture.changeSequence).cursor,
      entry: nextSnapshot.currentEntry, reason: EntryChangeReason.Next });
    reporting.receive({ type: PlayerEventType.State, snapshot: nextSnapshot });
  }
  function seek(account = IntegrationFixture.account) {
    reporting.receive({ type: PlayerEventType.Seeked, cursor: snapshot(IntegrationFixture.seekSequence, IntegrationFixture.secondEntry, account).cursor,
      entryIdentifier: IntegrationFixture.secondEntry, previousPositionMilliseconds: IntegrationFixture.originalPositionMilliseconds,
      positionMilliseconds: IntegrationFixture.destinationPositionMilliseconds });
  }
  return { tracker, reporting, requests, capturedEntries, startResponse, next, seek };
}

test(TestNames.pending, async () => {
  const environment = scenario(); await settle();
  assertion.equal(environment.requests.length, IntegrationFixture.oneRequest);
  environment.next(); environment.seek(); await settle();
  assertion.deepEqual(environment.capturedEntries, [IntegrationFixture.firstEntry, IntegrationFixture.secondEntry]);
  assertion.equal(environment.requests.length, IntegrationFixture.oneRequest);
  environment.startResponse.resolve({ data: { sessionId: IntegrationFixture.firstSession } });
  await settle(); environment.reporting.clear(); await settle();
  assertion.equal(environment.tracker.intervals.size, IntegrationFixture.initialTimeMilliseconds);
});
test(TestNames.identity, async () => {
  const environment = scenario(); await settle();
  environment.tracker.advanceTime(IntegrationFixture.millisecondsPerSecond);
  environment.next(); environment.seek();
  environment.startResponse.resolve({ data: { sessionId: IntegrationFixture.firstSession } }); await settle();
  const stopped = environment.requests.find(request => request.endpoint === IntegrationFixture.stopEndpoint);
  const seeked = environment.requests.find(request => request.endpoint === IntegrationFixture.seekEndpoint);
  assertion.equal(stopped.body.sessionId, IntegrationFixture.firstSession);
  assertion.equal(seeked.body.sessionId, IntegrationFixture.secondSession);
  assertion.equal(seeked.body.fromSeconds, IntegrationFixture.originalPositionSeconds);
  assertion.equal(seeked.body.toSeconds, IntegrationFixture.destinationPositionSeconds);
  const startEntries = environment.requests.filter(request => request.endpoint === IntegrationFixture.startEndpoint).map(request => request.body.trackId);
  assertion.deepEqual(startEntries, [IntegrationFixture.firstEntry, IntegrationFixture.secondEntry]);
  const startRequests = environment.requests.filter(request => request.endpoint === IntegrationFixture.startEndpoint);
  assertion.equal(startRequests[IntegrationFixture.firstIndex].body.sourceAlbumId, IntegrationFixture.albumIdentifier);
  assertion.equal(startRequests[IntegrationFixture.firstIndex].body.playlistId, null);
  assertion.equal(startRequests[IntegrationFixture.secondIndex].body.sourceAlbumId, null);
  assertion.equal(startRequests[IntegrationFixture.secondIndex].body.playlistId, IntegrationFixture.playlistIdentifier);
  environment.reporting.clear(); await settle();
});
test(TestNames.failure, async () => {
  const environment = scenario(); await settle(); environment.next(); environment.seek();
  environment.startResponse.reject(new Error(IntegrationFixture.failure)); await settle();
  assertion.equal(environment.requests.find(request => request.endpoint === IntegrationFixture.seekEndpoint).body.sessionId, IntegrationFixture.secondSession);
  assertion.equal(environment.requests.filter(request => request.endpoint === IntegrationFixture.stopEndpoint).length, IntegrationFixture.initialTimeMilliseconds);
  environment.reporting.clear(); await settle();
});
test(TestNames.logout, async () => {
  const environment = scenario(); await settle();
  environment.reporting.synchronize(snapshot(IntegrationFixture.initialSequence, IntegrationFixture.secondEntry, IntegrationFixture.otherAccount));
  environment.seek(); environment.seek(IntegrationFixture.otherAccount);
  environment.startResponse.resolve({ data: { sessionId: IntegrationFixture.firstSession } }); await settle();
  const seeks = environment.requests.filter(request => request.endpoint === IntegrationFixture.seekEndpoint);
  assertion.equal(seeks.length, IntegrationFixture.oneRequest);
  assertion.equal(seeks[IntegrationFixture.firstIndex].account, IntegrationFixture.otherAccount);
  assertion.equal(seeks[IntegrationFixture.firstIndex].body.sessionId, IntegrationFixture.secondSession);
  assertion.equal(environment.requests.find(request => request.endpoint === IntegrationFixture.stopEndpoint).account, IntegrationFixture.account);
  environment.reporting.clear(); await settle();
});

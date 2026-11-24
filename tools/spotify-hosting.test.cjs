const test = require('node:test');
const assertion = require('node:assert/strict');
const { SpotifyHostingStore, SpotifyHostingStatus, SpotifyHostingFailureStage } = require('../.build/spotify/SpotifyHostingStore');
const { SpotifyHostingQueueFailure, SpotifyHostingQueueIssue } = require('../.build/spotify/SpotifyHostingQueue');
const { IntegrationFailureCode } = require('streaming-service-spotify-jam');
const { SpotifyHostingFailureDetailMessages, spotifyHostingFailureDetail } = require('../.build/spotify/SpotifyHostingFailureCopy');
const { SpotifyFailureMessages } = require('../.build/spotify/SpotifyMobilePolicy');
const Fixture = Object.freeze({ account: 'synthetic-account', spotify: 'synthetic-spotify', jam: 'synthetic-jam', device: 'synthetic-device', previous: 'synthetic-host',
  address: 'https://synthetic.example/', token: 'synthetic-token', handle: 3, generation: 7, market: 'GB', track: '4uLU6hMCjMI75M1A2tKUQC',
  queue: 'synthetic-queue', occurrence: 'synthetic-occurrence', recording: 'synthetic-recording', engine: 'synthetic-engine', authentication: 'synthetic-authentication',
  openerOccurrence: 'synthetic-opener-occurrence', openerRecording: 'synthetic-opener-recording', revision: 1, emptyCount: 0, singleCount: 1, flushTurns: 30, invalidMarket: 'invalid', invalidTrack: 'invalid', privateFailure: 'synthetic-private-error', stopped: '{"status":"Stopped","identity":null,"failure":null}' });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.flushTurns; turn += Fixture.singleCount) await Promise.resolve(); }
function fixture() {
  const context = { streamingServiceAccountIdentifier: Fixture.account, baseAddress: Fixture.address, spotifyAccountIdentifier: Fixture.spotify,
    jamSessionIdentifier: Fixture.jam, deviceIdentifier: Fixture.device, previousHostDeviceIdentifier: Fixture.previous, handle: Fixture.handle, generation: Fixture.generation };
  const queue = { currentOccurrenceIdentifier: Fixture.occurrence, playerEngineEpoch: Fixture.engine, playerAuthenticationEpoch: Fixture.authentication, expectedCursor: {
    queueIdentifier: Fixture.queue, queueRevision: Fixture.revision, contentRevision: Fixture.revision, controlRevision: Fixture.revision },
    entries: [{ occurrenceIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.recording }] };
  const state = { context, queue, stop: null, translation: null, initial: null, startFailure: null, startResponse: null, stopFailure: null, translationFailure: null, track: Fixture.track };
  const calls = { translatedRecordings: [], preparations: [], publications: Fixture.emptyCount, starts: [], following: Fixture.emptyCount, translations: Fixture.emptyCount };
  let observed; let changed;
  const response = () => JSON.stringify({ status: SpotifyHostingStatus.Hosting, identity: { ...context, playerEngineEpoch: Fixture.engine, playerAuthenticationEpoch: Fixture.authentication }, failure: null });
  const store = new SpotifyHostingStore({ native: {
    async prepareHostingRecordings(serialized) { calls.preparations.push(JSON.parse(serialized)); if (state.preparation) await state.preparation.promise; },
    async publishHostingChanges() { calls.publications += Fixture.singleCount; }, async startHosting(serialized) { calls.starts.push(JSON.parse(serialized)); if (state.startFailure) throw state.startFailure; return state.startResponse ?? response(); },
    async stopHosting() { if (state.stopFailure) throw state.stopFailure; if (state.stop) await state.stop.promise; }, async getHostingSnapshot() { return state.initial ? state.initial.promise : Fixture.stopped; } },
    observe(listener) { observed = listener; return () => undefined; }, getContext: () => state.context,
    subscribeConnection(listener) { changed = listener; return () => undefined; }, getAccessToken: () => state.missingToken ? null : Fixture.token,
    async whenPlayerReady() { if (state.readinessFailure) throw state.readinessFailure; }, async captureQueue() { if (state.captureFailure) throw state.captureFailure; return state.queue; }, async translate(recordingIdentifier) { calls.translatedRecordings.push(recordingIdentifier); calls.translations += Fixture.singleCount; if (state.translationFailure) throw state.translationFailure; if (state.translation) await state.translation.promise; return state.track; },
    async stopFollowing() { calls.following += Fixture.singleCount; } });
  return { store, state, calls, response, observed: event => observed(event), changed: () => changed() };
}
test('Hosting sends actual queue mappings, epochs and the local native device only after cleanup', async () => {
  const current = fixture(); await current.store.start(Fixture.market);
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
  assertion.equal(current.calls.following, Fixture.singleCount);
  assertion.equal(current.calls.starts[Fixture.emptyCount].hostDeviceIdentifier, Fixture.device);
  assertion.equal(current.calls.starts[Fixture.emptyCount].mappings[Fixture.emptyCount].occurrenceIdentifier, Fixture.occurrence);
});
test('Changed account or native scope during matching prevents activation', async () => {
  const current = fixture(); current.state.translation = deferred(); const start = current.store.start(Fixture.market); await flush();
  current.state.context = null; current.state.translation.resolve(); await start;
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Superseded);
});
test('Explicit stop cancels delayed preparation and cannot activate later', async () => {
  const current = fixture(); current.state.translation = deferred(); const start = current.store.start(Fixture.market); await flush();
  await current.store.stop(); current.state.translation.resolve(); await start;
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Stopped);
});
test('Malformed market and uncertain catalog result never activate', async () => {
  const current = fixture(); await current.store.start(Fixture.invalidMarket); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  current.state.track = Fixture.invalidTrack; await current.store.start(Fixture.market); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
});
test('Disposing a React view does not stop acknowledged native hosting', async () => {
  const current = fixture(); await current.store.start(Fixture.market); current.store.dispose();
  current.observed(Fixture.stopped); assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
});
test('Late stop completion cannot replace a newer preparation', async () => {
  const current = fixture(); current.state.stop = deferred(); const stopping = current.store.stop();
  const start = current.store.start(Fixture.market); current.state.stop.resolve(); await stopping; await start;
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
});
test('Changed local queue during translation fails before native activation', async () => {
  const current = fixture(); current.state.translation = deferred(); const start = current.store.start(Fixture.market); await flush();
  current.state.queue = { ...current.state.queue, expectedCursor: { ...current.state.queue.expectedCursor, controlRevision: Fixture.revision + Fixture.singleCount } };
  current.state.translation.resolve(); await start; assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  assertion.equal(current.store.getSnapshot().failureStage, SpotifyHostingFailureStage.QueueValidation);
});
test('A delayed stopped snapshot cannot erase a newer catalog failure or its actionable stage', async () => {
  const current = fixture(); await flush();
  current.state.translation = deferred();
  const start = current.store.start(Fixture.market); await flush();
  current.state.initial = deferred(); current.changed();
  current.state.track = Fixture.invalidTrack;
  current.state.translation.resolve(); await start;
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Failed);
  current.state.initial.resolve(Fixture.stopped); await flush();
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Failed);
  assertion.equal(current.store.getSnapshot().failureStage, SpotifyHostingFailureStage.CatalogMatching);
});
test('Membership refresh cannot dismiss a failed hosting attempt with an idle native snapshot', async () => {
  const current = fixture(); await flush();
  current.state.translationFailure = { code: IntegrationFailureCode.Backpressure };
  await current.store.start(Fixture.market); current.changed(); await flush();
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Backpressure);
  assertion.equal(current.store.getSnapshot().failureStage, SpotifyHostingFailureStage.CatalogMatching);
});
test('Native cleanup after failed activation preserves its error until an explicit stop clears it', async () => {
  const current = fixture(); await flush();
  current.state.startFailure = { code: IntegrationFailureCode.Network };
  await current.store.start(Fixture.market);
  current.observed(Fixture.stopped);
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
  assertion.equal(current.store.getSnapshot().failureStage, SpotifyHostingFailureStage.NativeActivation);
  await current.store.stop();
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Stopped);
  assertion.equal(current.store.getSnapshot().failure, null);
});
test('Foreign or malformed native observations never become hosting acknowledgement', async () => {
  const current = fixture(); await flush(); current.observed(JSON.stringify({ status: SpotifyHostingStatus.Hosting, identity: { handle: Fixture.handle }, failure: null }));
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Stopped);
  current.observed(Fixture.invalidTrack); assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
});

for (const code of Object.values(IntegrationFailureCode)) {
  test(`Native hosting rejection preserves safe category ${code}`, async () => {
    const current = fixture(); current.state.startFailure = { code, message: Fixture.privateFailure };
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().failure, code);
    assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  });
  test(`Native hosting snapshot preserves safe category ${code}`, async () => {
    const current = fixture(); await current.store.start(Fixture.market);
    current.observed(JSON.stringify({ ...JSON.parse(current.response()), status: SpotifyHostingStatus.Failed, failure: code }));
    assertion.equal(current.store.getSnapshot().failure, code);
  });
}
test('Cleanup and catalog rejections preserve their safe failure categories', async () => {
  const cleanup = fixture(); cleanup.state.stopFailure = { code: IntegrationFailureCode.UnknownOutcome };
  await cleanup.store.start(Fixture.market);
  assertion.equal(cleanup.store.getSnapshot().failure, IntegrationFailureCode.UnknownOutcome);
  assertion.equal(cleanup.calls.translations, Fixture.emptyCount);
  const catalog = fixture(); catalog.state.translationFailure = { code: IntegrationFailureCode.Backpressure };
  await catalog.store.start(Fixture.market);
  assertion.equal(catalog.store.getSnapshot().failure, IntegrationFailureCode.Backpressure);
  assertion.equal(catalog.calls.starts.length, Fixture.emptyCount);
});
test('Explicit stop preserves safe native rejection without exposing private error data', async () => {
  const current = fixture(); current.state.stopFailure = { code: IntegrationFailureCode.Canceled, message: Fixture.privateFailure };
  await assertion.rejects(current.store.stop());
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Canceled);
  assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
});
test('Unknown and throwing native error codes stay private and become network failures', async () => {
  const failures = [null, Fixture.privateFailure, { code: Fixture.privateFailure },
    { get code() { throw new Error(Fixture.privateFailure); } }];
  for (const failure of failures) {
    const current = fixture(); current.state.startFailure = failure ?? { message: Fixture.privateFailure };
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
    assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  }
});
test('Unknown native snapshot failures stay private and become network failures', async () => {
  const current = fixture(); await current.store.start(Fixture.market);
  current.observed(JSON.stringify({ ...JSON.parse(current.response()), status: SpotifyHostingStatus.Failed, failure: Fixture.privateFailure }));
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
  assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
});

test('Native startup must return an actual hosting acknowledgement rather than a stopped snapshot', async () => {
  const current = fixture(); current.state.startResponse = Fixture.stopped;
  await current.store.start(Fixture.market);
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Failed);
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
});
test('Native startup acknowledgement must match the captured player epochs and connection generation', async () => {
  for (const identity of [{ playerEngineEpoch: Fixture.invalidTrack }, { playerAuthenticationEpoch: Fixture.invalidTrack },
    { generation: Fixture.generation + Fixture.singleCount }]) {
    const current = fixture(); const response = JSON.parse(current.response());
    current.state.startResponse = JSON.stringify({ ...response, identity: { ...response.identity, ...identity } });
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Failed);
    assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
  }
});

test('Active hosting prepares real recordings and schedules publication without another activation', async () => {
  const current = fixture(); await current.store.start(Fixture.market);
  await current.store.prepareRecordings([Fixture.recording]); await current.store.publishLocalChanges();
  assertion.deepEqual(current.calls.preparations, [[Fixture.recording]]); assertion.equal(current.calls.publications, Fixture.singleCount);
  assertion.equal(current.calls.starts.length, Fixture.singleCount); assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
});
test('Inactive hosting preparation and local publication do not dispatch native work', async () => {
  const current = fixture(); await flush(); await current.store.prepareRecordings([Fixture.recording]); await current.store.publishLocalChanges();
  assertion.equal(current.calls.preparations.length, Fixture.emptyCount); assertion.equal(current.calls.publications, Fixture.emptyCount);
});
test('Stopped or replaced hosting rejects a delayed preparation before its caller can play', async () => {
  const current = fixture(); await current.store.start(Fixture.market); current.state.preparation = deferred();
  const prepared = current.store.prepareRecordings([Fixture.recording]); await flush(); await current.store.stop(); current.state.preparation.resolve();
  await assertion.rejects(prepared, failure => failure.code === IntegrationFailureCode.Superseded);
  assertion.equal(current.calls.publications, Fixture.emptyCount);
});
test('Resolving and disposed hosting cannot authorize a new explicit local selection', async () => {
  const resolving = fixture(); await resolving.store.start(Fixture.market);
  resolving.observed(JSON.stringify({ ...JSON.parse(resolving.response()), status: SpotifyHostingStatus.Resolving }));
  await assertion.rejects(resolving.store.prepareRecordings([Fixture.recording]), failure => failure.code === IntegrationFailureCode.Superseded);
  assertion.equal(resolving.calls.preparations.length, Fixture.emptyCount);
  const disposed = fixture(); await disposed.store.start(Fixture.market); disposed.store.dispose();
  await assertion.rejects(disposed.store.prepareRecordings([Fixture.recording]), failure => failure.code === IntegrationFailureCode.Superseded);
  assertion.equal(disposed.calls.preparations.length, Fixture.emptyCount);
});

for (const [field, stage] of [
  ['stopFailure', SpotifyHostingFailureStage.Cleanup],
  ['readinessFailure', SpotifyHostingFailureStage.PlayerReadiness],
  ['captureFailure', SpotifyHostingFailureStage.QueueCapture],
  ['translationFailure', SpotifyHostingFailureStage.CatalogMatching],
  ['startFailure', SpotifyHostingFailureStage.NativeActivation],
]) {
  test(`Hosting failures identify ${stage} without copying raw rejection data`, async () => {
    const current = fixture(); current.state[field] = { code: IntegrationFailureCode.Network, message: Fixture.privateFailure };
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().failureStage, stage);
    assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  });
}
test('Invalid market and absent credentials identify validation and authentication stages', async () => {
  const invalid = fixture(); await invalid.store.start(Fixture.invalidMarket);
  assertion.equal(invalid.store.getSnapshot().failureStage, SpotifyHostingFailureStage.Validation);
  const authentication = fixture(); authentication.state.missingToken = true; await authentication.store.start(Fixture.market);
  assertion.equal(authentication.store.getSnapshot().failureStage, SpotifyHostingFailureStage.Authentication);
});
test('Native publication stages are retained and unknown stages cannot expose raw data', async () => {
  const current = fixture(); await current.store.start(Fixture.market);
  for (const stage of [SpotifyHostingFailureStage.Publication, Fixture.privateFailure]) {
    current.observed(JSON.stringify({ ...JSON.parse(current.response()), status: SpotifyHostingStatus.Failed,
      failure: IntegrationFailureCode.Network, failureStage: stage }));
    assertion.equal(current.store.getSnapshot().failureStage, stage === Fixture.privateFailure ? SpotifyHostingFailureStage.Observation : stage);
    assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
  }
});

for (const queueIssue of Object.values(SpotifyHostingQueueIssue)) {
  test(`Queue capture retains actionable safe issue ${queueIssue}`, async () => {
    const current = fixture(); current.state.captureFailure = new SpotifyHostingQueueFailure(queueIssue);
    await current.store.start(Fixture.market);
    assertion.equal(current.store.getSnapshot().queueIssue, queueIssue);
    assertion.equal(current.store.getSnapshot().failureStage, SpotifyHostingFailureStage.QueueCapture);
    assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Unsupported);
  });
}
test('Untrusted queue issues and raw messages cannot enter hosting snapshots', async () => {
  const current = fixture(); current.state.captureFailure = { code: IntegrationFailureCode.Unsupported, queueIssue: Fixture.privateFailure };
  await current.store.start(Fixture.market);
  assertion.equal(current.store.getSnapshot().queueIssue, null);
  assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateFailure), false);
});
for (const stage of [SpotifyHostingFailureStage.CatalogMatching, SpotifyHostingFailureStage.RecordingPreparation]) {
  test(`Catalog rejection in ${stage} reports Spotify request failure without asking for client credentials`, () => {
    assertion.equal(spotifyHostingFailureDetail(stage, IntegrationFailureCode.InvalidInput),
      SpotifyHostingFailureDetailMessages.catalogRequestRejected);
  });
}
for (const failure of [IntegrationFailureCode.RateLimited, IntegrationFailureCode.Unauthorized, IntegrationFailureCode.Network]) {
  test(`Hosting detail retains actionable ${failure} guidance for catalog matching and recording preparation`, () => {
    for (const stage of [SpotifyHostingFailureStage.CatalogMatching, SpotifyHostingFailureStage.RecordingPreparation])
      assertion.equal(spotifyHostingFailureDetail(stage, failure), SpotifyFailureMessages[failure]);
  });
}
test('Noncatalog validation and absent stage retain ordinary invalid-input guidance', () => {
  for (const stage of [SpotifyHostingFailureStage.Validation, SpotifyHostingFailureStage.NativeActivation, null, undefined])
    assertion.equal(spotifyHostingFailureDetail(stage, IntegrationFailureCode.InvalidInput), SpotifyFailureMessages[IntegrationFailureCode.InvalidInput]);
});
test('Hosting detail without an actual failure is absent even when a catalog stage is retained', () => {
  assertion.equal(spotifyHostingFailureDetail(SpotifyHostingFailureStage.CatalogMatching, null), null);
});

const MatchingDiagnosticModule = '../.build/spotify/SpotifyMatchingDiagnostic';
const { spotifyMatchingDiagnostic } = require(MatchingDiagnosticModule);
const { ArtistCreditSource, MatchStatus, MatchEvidence } = require('streaming-service-spotify-jam');
const JoinedCreditSeparator = ' feat. ';
test('Matching diagnostics contain only status and evidence counts without recording identities or metadata', () => {
  const result = { status: MatchStatus.NotFound, selected: null, failure: null, candidates: [
    { song: { identifier: Fixture.recording, title: Fixture.privateFailure, author: Fixture.spotify }, score: Fixture.singleCount,
      acceptable: false, evidence: [MatchEvidence.Title, MatchEvidence.Artist] },
  ] };
  assertion.deepEqual(spotifyMatchingDiagnostic(result), { status: MatchStatus.NotFound, candidateCount: Fixture.singleCount,
    acceptableCount: Fixture.emptyCount, titleMatchCount: Fixture.singleCount, artistMatchCount: Fixture.singleCount,
    durationMatchCount: Fixture.emptyCount, versionConflictCount: Fixture.emptyCount });
  assertion.equal(JSON.stringify(spotifyMatchingDiagnostic(result)).includes(Fixture.privateFailure), false);
});

test('Source matching diagnostics report shared credit counts and provenance without artist or song text', () => {
  const source = { identifier: Fixture.recording, title: Fixture.privateFailure, author: Fixture.spotify,
    artistNames: [Fixture.spotify, Fixture.device], artistCreditSource: ArtistCreditSource.Release };
  const candidate = { identifier: Fixture.track, title: Fixture.privateFailure, author: Fixture.spotify, artistNames: [Fixture.spotify] };
  const result = { status: MatchStatus.NotFound, selected: null, failure: null,
    candidates: [{ song: candidate, score: Fixture.emptyCount, acceptable: false, evidence: [MatchEvidence.Title] }] };
  const diagnostic = spotifyMatchingDiagnostic(result, source);
  assertion.equal(diagnostic.releaseCreditOnly, true);
  assertion.equal(diagnostic.sourceArtistCount, source.artistNames.length);
  assertion.equal(diagnostic.sourceHasJoinedArtistCredits, false);
  assertion.deepEqual(diagnostic.titleCandidateArtistCounts, [Fixture.singleCount]);
  assertion.deepEqual(diagnostic.titleCandidateSharedArtistCounts, [Fixture.singleCount]);
  for (const privateValue of [Fixture.recording, Fixture.track, Fixture.privateFailure, Fixture.spotify, Fixture.device])
    assertion.equal(JSON.stringify(diagnostic).includes(privateValue), false);
  assertion.equal(spotifyMatchingDiagnostic(result, { ...source,
    artistNames: [Fixture.spotify + JoinedCreditSeparator + Fixture.device] }).sourceHasJoinedArtistCredits, true);
});

test('Catalog no-match guidance describes the recording rather than a missing Jam or device', () => {
  for (const stage of [SpotifyHostingFailureStage.CatalogMatching, SpotifyHostingFailureStage.RecordingPreparation])
    assertion.equal(spotifyHostingFailureDetail(stage, IntegrationFailureCode.NotFound), SpotifyHostingFailureDetailMessages.catalogNoMatch);
  assertion.equal(spotifyHostingFailureDetail(SpotifyHostingFailureStage.NativeActivation, IntegrationFailureCode.NotFound),
    SpotifyFailureMessages[IntegrationFailureCode.NotFound]);
});

test('An unmatched album opener cannot prevent hosting the actual selected current recording', async () => {
  const current = fixture();
  current.state.queue = { ...current.state.queue, entries: [
    { occurrenceIdentifier: Fixture.openerOccurrence, recordingIdentifier: Fixture.openerRecording },
    ...current.state.queue.entries,
  ] };
  await current.store.start(Fixture.market);
  assertion.deepEqual(current.calls.translatedRecordings, [Fixture.recording]);
  assertion.deepEqual(current.calls.starts[Fixture.emptyCount].mappings, [{ occurrenceIdentifier: Fixture.occurrence,
    recordingIdentifier: Fixture.recording, spotifyTrackIdentifier: Fixture.track }]);
  assertion.equal(current.store.getSnapshot().status, SpotifyHostingStatus.Hosting);
});
test('A captured current occurrence absent from the actual entries cannot activate any other recording', async () => {
  const current = fixture(); current.state.queue.currentOccurrenceIdentifier = Fixture.openerOccurrence;
  await current.store.start(Fixture.market);
  assertion.equal(current.calls.translations, Fixture.emptyCount);
  assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
});

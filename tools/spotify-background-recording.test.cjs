const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  task: '../.build/spotify/SpotifyBackgroundRecordingTask' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const library = require(Modules.library);
const { SpotifyBackgroundRecordingTask, SpotifyBackgroundRecordingPolicy } = require(Modules.task);
const Fixture = Object.freeze({ request: 'synthetic-resolution-request', appAccount: 'synthetic-app-account', otherAccount: 'synthetic-other-account',
  spotifyAccount: 'synthetic-spotify-account', session: 'synthetic-session', host: 'synthetic-host', handle: 7, generation: 3,
  otherGeneration: 4, baseAddress: 'https://streaming.example.test/', apiBaseAddress: 'https://streaming.example.test/api/',
  unsafeBaseAddresses: ['http://streaming.example.test/', 'https://credential@streaming.example.test/', 'https://streaming.example.test/?credential=private', 'https://streaming.example.test/#private'],
  track: '0000000000000000000001', otherTrack: '0000000000000000000002', market: 'RO', invalidMarket: 'invalid',
  title: 'Synthetic Song', artist: 'Synthetic Artist', otherTitle: 'Different Song', duration: 180000, recording: 'synthetic-recording',
  otherRecording: 'synthetic-other-recording', catalog: 'synthetic-catalog', zero: 0, one: 1, two: 2, flushTurns: 40,
  matched: 'matched', ambiguous: 'ambiguous', unavailable: 'unavailable', privateMessage: 'synthetic-private-diagnostic' });
const Names = Object.freeze({ match: 'Background matching uses native metadata and the existing strict translator for an unseen song',
  ambiguity: 'Equivalent catalog candidates remain ambiguous instead of selecting one in the background',
  titleOnly: 'A title without artist and duration evidence cannot become a playable recording',
  duration: 'Conflicting recording duration remains unavailable', confirmed: 'Verified confirmed associations work through the existing translator',
  account: 'A different restored app account cannot search or complete the old job', replaced: 'Account replacement during the query cannot publish a match',
  retired: 'A native request retired during lookup cannot complete or fail its replacement', duplicate: 'An already claimed request does no network work',
  cancel: 'Cancellation interrupts an uncooperative search without a late completion', deadline: 'The native task deadline cancels pending matching and reports a safe deadline',
  before: 'An already canceled task never claims a native request', invalid: 'Invalid native identity and market values fail before authentication or lookup',
  metadata: 'Native metadata must match the exact handle generation and requested song', snapshot: 'Native job and metadata are captured before account restoration awaits',
  failure: 'Unexpected lookup errors retain only a safe failure code', synchronize: 'Native player authentication is synchronized before and after a query that can renew app credentials',
  authFailure: 'Player authentication failure prevents a matched result from reaching native playback', cleanup: 'Failure reporting cannot leak unexpected native error details',
  apiAddress: 'A secure API base path survives native job capture and recording resolution',
  unsafeAddress: 'Insecure credential-bearing and query-bearing API addresses cannot start background requests' });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushTurns; turn += Fixture.one) await Promise.resolve(); }
function recording(identifier = Fixture.recording) { return { identifier, title: Fixture.title, author: Fixture.artist,
  artistNames: [Fixture.artist], durationMilliseconds: Fixture.duration }; }
function job() { return { requestIdentifier: Fixture.request, streamingServiceAccountIdentifier: Fixture.appAccount,
  spotifyAccountIdentifier: Fixture.spotifyAccount, jamSessionIdentifier: Fixture.session, hostDeviceIdentifier: Fixture.host,
  handle: Fixture.handle, generation: Fixture.generation, spotifyTrackIdentifier: Fixture.track, market: Fixture.market, baseAddress: Fixture.baseAddress,
  metadata: { handle: Fixture.handle, generation: Fixture.generation, tracks: [{ spotifyTrackIdentifier: Fixture.track,
    title: Fixture.title, artistNames: [Fixture.artist], durationMilliseconds: Fixture.duration, recordingCodes: [] }] } }; }
function fixture() {
  const state = { job: job(), account: Fixture.appAccount, pending: true, claimed: false, candidates: [recording()],
    restore: async () => undefined, search: null, synchronize: async () => undefined, fail: null };
  const calls = { claims: Fixture.zero, restorations: Fixture.zero, search: [], lookups: [], synchronized: [], completions: [], failures: [], timers: [] };
  const associations = new library.MemoryAssociationStore();
  const catalog = { identity: Fixture.catalog, namespace: library.RecordingNamespace.Local,
    lookup: async identifier => { calls.lookups.push(identifier); return state.candidates.find(candidate => candidate.identifier === identifier) ?? null; },
    search: async (query, cancellation) => { calls.search.push({ query, cancellation }); return state.search ? state.search(query, cancellation) : state.candidates; } };
  const dependencies = {
    claim: async () => { calls.claims += Fixture.one; if (state.claimed) return null; state.claimed = true; return state.job; },
    isPending: async () => state.pending,
    complete: async (requestIdentifier, result) => { calls.completions.push({ requestIdentifier, result }); state.pending = false; },
    fail: async (requestIdentifier, failure) => { if (state.fail) return state.fail(); calls.failures.push({ requestIdentifier, failure }); state.pending = false; },
    restoreAccount: async () => { calls.restorations += Fixture.one; await state.restore(); }, currentAccountIdentifier: () => state.account,
    recordings: () => catalog, associations: () => associations,
    synchronizePlayerAuthentication: async (request, cancellation) => { calls.synchronized.push({ request, cancellation }); await state.synchronize(); },
    scheduler: { schedule(delayMilliseconds, action) { const timer = { delayMilliseconds, action, active: true }; calls.timers.push(timer); return () => { timer.active = false; }; } },
  };
  return { state, calls, associations, catalog, dependencies, task: new SpotifyBackgroundRecordingTask(dependencies) };
}
function failure(context, code) { assertion.deepEqual(context.calls.failures, [{ requestIdentifier: Fixture.request, failure: code }]); assertion.equal(context.calls.completions.length, Fixture.zero); }

test(Names.match, async () => {
  const context = fixture(); await context.task.execute(Fixture.request);
  assertion.deepEqual(context.calls.completions, [{ requestIdentifier: Fixture.request, result: { status: Fixture.matched,
    recordingIdentifier: Fixture.recording, title: Fixture.title, artist: Fixture.artist } }]);
  assertion.deepEqual(context.calls.search[Fixture.zero].query, { title: Fixture.title, author: Fixture.artist, limit: library.DefaultMatchingPolicy.maximumCandidates });
  assertion.equal(context.calls.timers[Fixture.zero].active, false);
});
test(Names.ambiguity, async () => { const context = fixture(); context.state.candidates.push(recording(Fixture.otherRecording)); await context.task.execute(Fixture.request);
  assertion.equal(context.calls.completions[Fixture.zero].result.status, Fixture.ambiguous); });
test(Names.titleOnly, async () => { const context = fixture(); context.state.candidates = [{ identifier: Fixture.recording, title: Fixture.title, author: Fixture.otherTitle }];
  await context.task.execute(Fixture.request); assertion.equal(context.calls.completions[Fixture.zero].result.status, Fixture.unavailable); });
test(Names.duration, async () => { const context = fixture(); context.state.candidates[Fixture.zero].durationMilliseconds += library.DefaultMatchingPolicy.durationToleranceMilliseconds + Fixture.one;
  await context.task.execute(Fixture.request); assertion.notEqual(context.calls.completions[Fixture.zero].result.status, Fixture.matched); });
test(Names.confirmed, async () => {
  const context = fixture(); context.state.candidates.push(recording(Fixture.otherRecording));
  const song = library.decodeSpotifyConnectMetadata(context.state.job.metadata, Fixture.handle, Fixture.generation, [Fixture.track])[Fixture.zero];
  const translator = new library.TrackTranslator(context.catalog, { lookup: async () => song, search: async () => [] }, new library.CandidateRanker(), context.associations);
  await translator.confirm(Fixture.recording, Fixture.track, Fixture.market, new AbortController().signal);
  await context.task.execute(Fixture.request); assertion.equal(context.calls.completions[Fixture.zero].result.recordingIdentifier, Fixture.recording);
});
test(Names.account, async () => { const context = fixture(); context.state.account = Fixture.otherAccount; await context.task.execute(Fixture.request);
  failure(context, library.IntegrationFailureCode.Superseded); assertion.equal(context.calls.search.length, Fixture.zero); });
test(Names.replaced, async () => { const context = fixture(); const pending = deferred(); context.state.search = () => pending.promise;
  const operation = context.task.execute(Fixture.request); await flush(); context.state.account = Fixture.otherAccount; pending.resolve([recording()]); await operation;
  failure(context, library.IntegrationFailureCode.Superseded); });
test(Names.retired, async () => { const context = fixture(); const pending = deferred(); context.state.search = () => pending.promise;
  const operation = context.task.execute(Fixture.request); await flush(); context.state.pending = false; pending.resolve([recording()]); await operation;
  assertion.equal(context.calls.completions.length, Fixture.zero); assertion.equal(context.calls.failures.length, Fixture.zero); });
test(Names.duplicate, async () => { const context = fixture(); context.state.claimed = true; await context.task.execute(Fixture.request);
  assertion.equal(context.calls.restorations, Fixture.zero); assertion.equal(context.calls.search.length, Fixture.zero); });
test(Names.cancel, async () => { const context = fixture(); const pending = deferred(); context.state.search = () => pending.promise; const cancellation = new AbortController();
  const operation = context.task.execute(Fixture.request, cancellation.signal); await flush(); cancellation.abort(); await operation;
  failure(context, library.IntegrationFailureCode.Canceled); assertion.equal(context.calls.search[Fixture.zero].cancellation.aborted, true);
  pending.resolve([recording()]); await flush(); assertion.equal(context.calls.completions.length, Fixture.zero); });
test(Names.deadline, async () => { const context = fixture(); const pending = deferred(); context.state.search = () => pending.promise;
  const operation = context.task.execute(Fixture.request); await flush(); assertion.equal(context.calls.timers[Fixture.zero].delayMilliseconds, SpotifyBackgroundRecordingPolicy.timeoutMilliseconds);
  context.calls.timers[Fixture.zero].action(); await operation; failure(context, library.IntegrationFailureCode.Deadline);
  pending.resolve([recording()]); await flush(); assertion.equal(context.calls.completions.length, Fixture.zero); });
test(Names.before, async () => { const context = fixture(); const cancellation = new AbortController(); cancellation.abort();
  await context.task.execute(Fixture.request, cancellation.signal); assertion.equal(context.calls.claims, Fixture.zero); });
test(Names.invalid, async () => { for (const mutation of [request => { request.market = Fixture.invalidMarket; }, request => { request.handle = Fixture.zero; },
  request => { request.requestIdentifier = Fixture.otherRecording; }]) { const context = fixture(); mutation(context.state.job); await context.task.execute(Fixture.request);
    failure(context, library.IntegrationFailureCode.InvalidInput); assertion.equal(context.calls.restorations, Fixture.zero); } });
test(Names.metadata, async () => { for (const mutation of [metadata => { metadata.generation = Fixture.otherGeneration; }, metadata => { metadata.tracks[Fixture.zero].spotifyTrackIdentifier = Fixture.otherTrack; }]) {
  const context = fixture(); mutation(context.state.job.metadata); await context.task.execute(Fixture.request); failure(context, library.IntegrationFailureCode.InvalidResponse);
} });
test(Names.snapshot, async () => { const context = fixture(); const restored = deferred(); context.state.restore = () => restored.promise;
  const operation = context.task.execute(Fixture.request); await flush(); context.state.job.market = Fixture.invalidMarket;
  context.state.job.metadata.tracks[Fixture.zero].title = Fixture.otherTitle; restored.resolve(); await operation;
  assertion.equal(context.calls.completions[Fixture.zero].result.recordingIdentifier, Fixture.recording);
  assertion.equal(context.calls.search[Fixture.zero].query.title, Fixture.title);
});
test(Names.failure, async () => { const context = fixture(); context.state.search = async () => { throw new Error(Fixture.privateMessage); };
  await context.task.execute(Fixture.request); failure(context, library.IntegrationFailureCode.Network); });
test(Names.synchronize, async () => { const context = fixture(); await context.task.execute(Fixture.request);
  assertion.equal(context.calls.synchronized.length, Fixture.two); assertion.equal(context.calls.synchronized[Fixture.zero].request.streamingServiceAccountIdentifier, Fixture.appAccount);
  assertion.equal(Object.isFrozen(context.calls.synchronized[Fixture.zero].request), true);
});
test(Names.authFailure, async () => { const context = fixture(); context.state.synchronize = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unauthorized); };
  await context.task.execute(Fixture.request); failure(context, library.IntegrationFailureCode.Unauthorized); assertion.equal(context.calls.search.length, Fixture.zero); });
test(Names.cleanup, async () => { const context = fixture(); context.state.account = Fixture.otherAccount; context.state.fail = async () => { throw new Error(Fixture.privateMessage); };
  await assertion.rejects(context.task.execute(Fixture.request), error => error instanceof library.IntegrationFailure && error.code === library.IntegrationFailureCode.Network);
});
test(Names.apiAddress, async () => {
  const context = fixture(); context.state.job.baseAddress = Fixture.apiBaseAddress;
  await context.task.execute(Fixture.request);
  assertion.equal(context.calls.completions[Fixture.zero].result.status, Fixture.matched);
  assertion.equal(context.calls.synchronized[Fixture.zero].request.baseAddress, Fixture.apiBaseAddress);
});
test(Names.unsafeAddress, async () => {
  for (const baseAddress of Fixture.unsafeBaseAddresses) {
    const context = fixture(); context.state.job.baseAddress = baseAddress;
    await context.task.execute(Fixture.request); failure(context, library.IntegrationFailureCode.InvalidInput);
    assertion.equal(context.calls.restorations, Fixture.zero);
  }
});

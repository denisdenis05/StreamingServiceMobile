const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SpotifyBackgroundRecordingTask } = require('../.build/spotify/SpotifyBackgroundRecordingTask');
const { RecordingNamespace, MemoryAssociationStore } = require('streaming-service-spotify-jam');
const { SpotifyRecordingImportMatcher, SpotifyRecordingImportPolicy } = require('../.build/spotify/SpotifyRecordingImportMatcher');
const { IntegrationFailureCode } = require('streaming-service-spotify-jam');
const Fixture = Object.freeze({ spotify: '4uLU6hMCjMI75M1A2tKUQC', recording: '11111111-2222-3333-4444-555555555555',
  title: 'Raid (feat. MED)', artist: 'Madvillain', guest: 'MED', release: 'Madvillainy', count: 1,
  missingStatus: 404, rateLimitedStatus: 429, replacementTitle: 'Different recording', request: 'test-request', account: 'test-account', spotifyAccount: 'test-spotify-account',
  session: 'test-session', host: 'test-host', handle: 3, generation: 7, address: 'https://catalog.example.test/', market: 'RO', durationMilliseconds: 180000,
  resultMatched: 'matched', catalog: 'test-catalog', baseTitle: 'Raid' });
function song() { return { identifier: Fixture.spotify, title: Fixture.title, author: Fixture.artist + ', ' + Fixture.guest,
  artistNames: [Fixture.artist, Fixture.guest], releaseTitle: Fixture.release }; }
function preview(changes = {}) { return { originalName: Fixture.title, originalArtist: Fixture.artist, originalAlbum: Fixture.release,
  matchedRecordingId: Fixture.recording, isAvailable: true, isExactMatch: true, isSuggested: false, ...changes }; }
function harness(response = [preview()]) {
  const state = { current: true, calls: [] };
  const matcher = new SpotifyRecordingImportMatcher({ isCurrent: () => state.current,
    async preview(tracks, cancellation) { state.calls.push({ tracks, cancellation }); return response; } });
  return { state, matcher };
}
test('Importer posts actual titles and the first Spotify artist credit without joining guest credits', async () => {
  const { matcher, state } = harness(); const cancellation = new AbortController().signal;
  assert.deepEqual(await matcher.match([song()], cancellation), [{ spotifyIdentifier: Fixture.spotify, recordingIdentifier: Fixture.recording, exact: true }]);
  assert.deepEqual(state.calls, [{ tracks: [{ name: Fixture.title, artistName: Fixture.artist, releaseName: Fixture.release }], cancellation }]);
});
for (const changes of [{ isSuggested: true }, { isExactMatch: false }, { isAvailable: false }]) {
  test('Importer does not promote unavailable or suggested results to exact matches ' + JSON.stringify(changes), async () => {
    const { matcher } = harness([preview(changes)]);
    assert.equal((await matcher.match([song()], new AbortController().signal)).at(SpotifyRecordingImportPolicy.firstPosition).exact, false);
  });
}
for (const response of [[], [preview(), preview()], [preview({ originalName: Fixture.replacementTitle })],
  [preview({ originalArtist: Fixture.guest })], [preview({ matchedRecordingId: Fixture.spotify })], [preview({ isExactMatch: undefined })], [null]]) {
  test('Importer rejects malformed or mismatched response ' + JSON.stringify(response), async () => {
    const { matcher } = harness(response);
    await assert.rejects(matcher.match([song()], new AbortController().signal), { code: IntegrationFailureCode.InvalidResponse });
  });
}
test('Empty database identifiers remain unmatched', async () => {
  const { matcher } = harness([preview({ matchedRecordingId: SpotifyRecordingImportPolicy.emptyRecording })]);
  assert.deepEqual(await matcher.match([song()], new AbortController().signal), []);
});
test('Canceled and replaced-account requests do not reach the importer', async () => {
  const { matcher, state } = harness(); const cancellation = new AbortController(); cancellation.abort();
  await assert.rejects(matcher.match([song()], cancellation.signal), { code: IntegrationFailureCode.Canceled });
  state.current = false;
  await assert.rejects(matcher.match([song()], new AbortController().signal), { code: IntegrationFailureCode.Superseded });
  assert.deepEqual(state.calls, []);
});
test('A replaced account cannot consume delayed importer results', async () => {
  let finish; let current = true;
  const matcher = new SpotifyRecordingImportMatcher({ isCurrent: () => current, preview: () => new Promise(resolve => { finish = resolve; }) });
  const pending = matcher.match([song()], new AbortController().signal); current = false; finish([preview()]);
  await assert.rejects(pending, { code: IntegrationFailureCode.Superseded });
});
test('Cancellation wins over an importer completion that ignores its signal', async () => {
  let finish; const cancellation = new AbortController();
  const matcher = new SpotifyRecordingImportMatcher({ isCurrent: () => true, preview: () => new Promise(resolve => { finish = resolve; }) });
  const pending = matcher.match([song()], cancellation.signal); cancellation.abort(); finish([preview()]);
  await assert.rejects(pending, { code: IntegrationFailureCode.Canceled });
});
test('A rate limit is typed and never automatically retried', async () => {
  let calls = SpotifyRecordingImportPolicy.emptyCount;
  const matcher = new SpotifyRecordingImportMatcher({ isCurrent: () => true, async preview() { calls += Fixture.count; throw { response: { status: Fixture.rateLimitedStatus } }; } });
  await assert.rejects(matcher.match([song()], new AbortController().signal), { code: IntegrationFailureCode.RateLimited });
  assert.equal(calls, Fixture.count);
});
test('Empty batches do not issue importer requests', async () => {
  const { matcher, state } = harness(); assert.deepEqual(await matcher.match([], new AbortController().signal), []); assert.deepEqual(state.calls, []);
});

test('Background recording resolution consumes the injected importer for featured credits', async () => {
  const completions = []; const failures = []; const importer = harness([preview({ originalAlbum: SpotifyRecordingImportPolicy.emptyText })]);
  const job = { requestIdentifier: Fixture.request, streamingServiceAccountIdentifier: Fixture.account,
    spotifyAccountIdentifier: Fixture.spotifyAccount, jamSessionIdentifier: Fixture.session, hostDeviceIdentifier: Fixture.host,
    handle: Fixture.handle, generation: Fixture.generation, spotifyTrackIdentifier: Fixture.spotify, market: Fixture.market, baseAddress: Fixture.address,
    metadata: { handle: Fixture.handle, generation: Fixture.generation, tracks: [{ spotifyTrackIdentifier: Fixture.spotify,
      title: Fixture.title, artistNames: [Fixture.artist, Fixture.guest], durationMilliseconds: Fixture.durationMilliseconds, recordingCodes: [] }] } };
  const catalog = { identity: Fixture.catalog, namespace: RecordingNamespace.Local,
    async lookup() { return { identifier: Fixture.recording, title: Fixture.baseTitle, author: Fixture.artist }; }, async search() { return []; } };
  const task = new SpotifyBackgroundRecordingTask({ claim: async () => job, isPending: async () => true,
    complete: async (_identifier, result) => completions.push(result), fail: async (_identifier, failure) => failures.push(failure),
    restoreAccount: async () => undefined, currentAccountIdentifier: () => Fixture.account, recordings: () => catalog,
    associations: () => new MemoryAssociationStore(), recordingImportMatcher: () => importer.matcher,
    synchronizePlayerAuthentication: async () => undefined, scheduler: { schedule: () => () => undefined } });
  await task.execute(Fixture.request);
  assert.deepEqual(failures, []);
  assert.deepEqual(completions, [{ status: Fixture.resultMatched, recordingIdentifier: Fixture.recording, title: Fixture.baseTitle, artist: Fixture.artist }]);
  assert.equal(importer.state.calls.length, Fixture.count);
});

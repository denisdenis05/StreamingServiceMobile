const test = require('node:test');
const assertion = require('node:assert/strict');
const UrlFixture = './fixtures/spotify-url.cjs';
require(UrlFixture);
const { SpotifyLibraryCatalogQuery, SpotifyLibraryCatalogPolicy } = require('../.build/spotify/SpotifyLibraryCatalogQuery');
const { IntegrationFailure, IntegrationFailureCode } = require('streaming-service-spotify-jam');
const Fixture = Object.freeze({ address: 'https://synthetic.example/', identifier: 'real-observed-recording', title: 'Observed title', author: 'Observed artist',
  privateText: 'private-server-message', emptyCount: 0, singleCount: 1, durationMilliseconds: 123000, alternateDurationMilliseconds: 456000 });
function fixture() {
  const song = { identifier: Fixture.identifier, title: Fixture.title, author: Fixture.author };
  const state = { current: true, primarySong: null, primaryFailure: null, response: { tracks: [{ id: song.identifier, title: song.title, artistName: song.author }] },
    observed: [], pending: null, readFailure: null };
  const calls = { lookups: Fixture.emptyCount, searches: Fixture.emptyCount, reads: [] };
  const cancellation = new AbortController();
  const query = new SpotifyLibraryCatalogQuery(Fixture.address, {
    primary: { async lookup() { calls.lookups += Fixture.singleCount; if (state.primaryFailure) throw state.primaryFailure; return state.primarySong; },
      async search() { calls.searches += Fixture.singleCount; if (state.primaryFailure) throw state.primaryFailure; return [state.primarySong ?? song]; } },
    async read(address, signal) { calls.reads.push({ address, signal }); if (state.pending) await state.pending; if (state.readFailure) throw state.readFailure; return state.response; },
    observedRecordings: () => state.observed, isCurrent: () => state.current,
  });
  const search = { title: Fixture.title, author: Fixture.author, limit: SpotifyLibraryCatalogPolicy.maximumCandidates };
  return { query, state, calls, cancellation, song, search };
}
function unavailable(current) { current.state.primaryFailure = new IntegrationFailure(IntegrationFailureCode.NotFound); }
test('Primary catalog success uses the authenticated primary without compatibility requests', async () => {
  const current = fixture(); current.state.primarySong = current.song;
  assertion.deepEqual(await current.query.lookup(Fixture.identifier, current.cancellation.signal), current.song);
  assertion.deepEqual(await current.query.search(current.search, current.cancellation.signal), [current.song]);
  assertion.equal(current.calls.reads.length, Fixture.emptyCount);
});
test('Unknown primary lookup uses only real observed exact identifier metadata', async () => {
  const current = fixture(); current.state.observed = [{ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }];
  assertion.deepEqual(await current.query.lookup(Fixture.identifier, current.cancellation.signal), current.state.observed[Fixture.emptyCount]);
  assertion.equal(await current.query.lookup(Fixture.privateText, current.cancellation.signal), null);
  assertion.equal(current.calls.reads.length, Fixture.emptyCount);
});
test('Verified primary search not found uses bounded existing database route and caches real candidates', async () => {
  const current = fixture(); unavailable(current);
  const songs = await current.query.search(current.search, current.cancellation.signal);
  assertion.deepEqual(songs, [current.song]);
  const address = new URL(current.calls.reads[Fixture.emptyCount].address);
  assertion.equal(address.pathname, '/' + SpotifyLibraryCatalogPolicy.route);
  assertion.equal(address.searchParams.get(SpotifyLibraryCatalogPolicy.queryParameter), Fixture.title);
  assertion.equal(address.searchParams.get(SpotifyLibraryCatalogPolicy.pageSizeParameter), String(SpotifyLibraryCatalogPolicy.maximumCandidates));
  assertion.equal(current.calls.reads[Fixture.emptyCount].signal, current.cancellation.signal);
  assertion.deepEqual(await current.query.lookup(Fixture.identifier, current.cancellation.signal), current.song);
  assertion.equal(current.calls.lookups, Fixture.emptyCount);
  await current.query.search(current.search, current.cancellation.signal);
  assertion.equal(current.calls.searches, Fixture.singleCount);
});
for (const code of [IntegrationFailureCode.Unauthorized, IntegrationFailureCode.Forbidden, IntegrationFailureCode.Network, IntegrationFailureCode.Backpressure]) {
  test(`Primary ${code} does not switch to legacy catalog or expose error messages`, async () => {
    const current = fixture(); current.state.primaryFailure = new IntegrationFailure(code);
    await assertion.rejects(current.query.search(current.search, current.cancellation.signal), { code });
    assertion.equal(current.calls.reads.length, Fixture.emptyCount);
  });
}
test('Authenticated compatibility read failures are preserved without another request', async () => {
  const current = fixture(); unavailable(current); current.state.readFailure = new IntegrationFailure(IntegrationFailureCode.Unauthorized);
  await assertion.rejects(current.query.search(current.search, current.cancellation.signal), { code: IntegrationFailureCode.Unauthorized });
  assertion.equal(current.calls.reads.length, Fixture.singleCount);
});
test('Cancellation blocks requests and cannot publish or cache a delayed response', async () => {
  const canceled = fixture(); canceled.cancellation.abort();
  await assertion.rejects(canceled.query.lookup(Fixture.identifier, canceled.cancellation.signal), { code: IntegrationFailureCode.Canceled });
  assertion.equal(canceled.calls.lookups, Fixture.emptyCount);
  const current = fixture(); unavailable(current); let complete;
  current.state.pending = new Promise(resolve => { complete = resolve; });
  const searching = current.query.search(current.search, current.cancellation.signal);
  await Promise.resolve(); current.cancellation.abort(); complete();
  await assertion.rejects(searching, { code: IntegrationFailureCode.Canceled });
  assertion.equal(await current.query.lookup(Fixture.identifier, new AbortController().signal), null);
});
test('Changed account scope retires cache and rejects late search or later reuse', async () => {
  const current = fixture(); unavailable(current); let complete;
  current.state.pending = new Promise(resolve => { complete = resolve; });
  const searching = current.query.search(current.search, current.cancellation.signal);
  await Promise.resolve(); current.state.current = false; complete();
  await assertion.rejects(searching, { code: IntegrationFailureCode.Superseded });
  current.state.current = true;
  await assertion.rejects(current.query.lookup(Fixture.identifier, current.cancellation.signal), { code: IntegrationFailureCode.Superseded });
});
test('Malformed compatibility data is rejected without manufacturing song identity or duration', async () => {
  for (const response of [null, {}, { tracks: [{ id: Fixture.identifier, title: Fixture.title }] }, { tracks: [], fuzzyTracks: Fixture.privateText }]) {
    const current = fixture(); unavailable(current); current.state.response = response;
    await assertion.rejects(current.query.search(current.search, current.cancellation.signal), { code: IntegrationFailureCode.InvalidResponse });
  }
});
test('Candidate and observed caches remain bounded and evict oldest actual recordings', async () => {
  const current = fixture();
  for (let position = Fixture.emptyCount; position <= SpotifyLibraryCatalogPolicy.maximumCachedRecordings; position += Fixture.singleCount) {
    const song = { ...current.song, identifier: Fixture.identifier + position }; current.state.observed = [song];
    await current.query.lookup(song.identifier, current.cancellation.signal);
  }
  current.state.observed = [];
  assertion.equal(await current.query.lookup(Fixture.identifier + Fixture.emptyCount, current.cancellation.signal), null);
  assertion.notEqual(await current.query.lookup(Fixture.identifier + SpotifyLibraryCatalogPolicy.maximumCachedRecordings, current.cancellation.signal), null);
});

test('Exact observed lookup can find a newly selected song beyond the search-candidate bound', async () => {
  const current = fixture();
  current.state.observed = Array.from({ length: SpotifyLibraryCatalogPolicy.maximumCandidates }, (unusedRecording, position) => ({
    ...current.song, identifier: Fixture.identifier + position,
  }));
  current.state.observed.push(current.song);
  assertion.deepEqual(await current.query.lookup(Fixture.identifier, current.cancellation.signal), current.song);
});

test('Legacy search retains actual observed duration so conservative reverse matching can select the known recording', async () => {
  const { CandidateRanker, MatchStatus } = require('streaming-service-spotify-jam');
  const current = fixture(); unavailable(current);
  current.state.observed = [{ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }];
  const candidates = await current.query.search(current.search, current.cancellation.signal);
  const ranked = new CandidateRanker().rank({ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }, candidates);
  assertion.equal(ranked.status, MatchStatus.Matched);
  assertion.equal(ranked.selected.identifier, Fixture.identifier);
  assertion.equal(ranked.selected.durationMilliseconds, Fixture.durationMilliseconds);
});
test('Legacy unknown future recordings remain ambiguous without observed duration', async () => {
  const { CandidateRanker, MatchStatus } = require('streaming-service-spotify-jam');
  const current = fixture(); unavailable(current);
  const candidates = await current.query.search(current.search, current.cancellation.signal);
  const ranked = new CandidateRanker().rank({ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }, candidates);
  assertion.equal(ranked.status, MatchStatus.Ambiguous);
  assertion.equal(candidates[Fixture.emptyCount].durationMilliseconds, undefined);
});
test('Observed duration cannot cross recording title artist or identifier boundaries', async () => {
  for (const identity of [{ title: Fixture.privateText }, { author: Fixture.privateText }, { identifier: Fixture.privateText }]) {
    const current = fixture(); unavailable(current);
    current.state.observed = [{ ...current.song, ...identity, durationMilliseconds: Fixture.durationMilliseconds }];
    const candidates = await current.query.search(current.search, current.cancellation.signal);
    assertion.equal(candidates[Fixture.emptyCount].durationMilliseconds, undefined);
  }
});
test('A present primary recording duration is not replaced with an observed value', async () => {
  const current = fixture();
  current.state.primarySong = { ...current.song, durationMilliseconds: Fixture.alternateDurationMilliseconds };
  current.state.observed = [{ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }];
  const candidates = await current.query.search(current.search, current.cancellation.signal);
  assertion.equal(candidates[Fixture.emptyCount].durationMilliseconds, Fixture.alternateDurationMilliseconds);
});
test('Verified cached duration can enrich a matching legacy candidate after leaving the observed queue', async () => {
  const current = fixture();
  current.state.observed = [{ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }];
  await current.query.lookup(Fixture.identifier, current.cancellation.signal);
  current.state.observed = []; unavailable(current);
  const candidates = await current.query.search(current.search, current.cancellation.signal);
  assertion.equal(candidates[Fixture.emptyCount].durationMilliseconds, Fixture.durationMilliseconds);
});

test('Missing primary duration uses the exact known recording without dropping credit provenance', async () => {
  const { ArtistCreditSource, CandidateRanker, MatchStatus } = require('streaming-service-spotify-jam');
  const current = fixture();
  current.state.primarySong = { ...current.song, artistCreditSource: ArtistCreditSource.Release };
  current.state.observed = [{ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }];
  const lookedUp = await current.query.lookup(Fixture.identifier, current.cancellation.signal);
  const candidates = await current.query.search(current.search, current.cancellation.signal);
  assertion.equal(lookedUp.durationMilliseconds, Fixture.durationMilliseconds);
  assertion.equal(candidates[Fixture.emptyCount].durationMilliseconds, Fixture.durationMilliseconds);
  assertion.equal(lookedUp.artistCreditSource, ArtistCreditSource.Release);
  const ranked = new CandidateRanker().rank({ ...current.song, durationMilliseconds: Fixture.durationMilliseconds }, candidates);
  assertion.equal(ranked.status, MatchStatus.Ambiguous);
});

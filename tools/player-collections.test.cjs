const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackCollectionLoader, CollectionLoadingPolicy } = require('../.build/audio-migration/PlaybackCollectionLoader');
const { PlaybackCatalogMapping } = require('../.build/audio-migration/PlaybackCatalogMapping');
const { deferred } = require('./fixtures/queue-rewrite.cjs');
const Fixture = Object.freeze({ server: 'https://catalog.example.invalid', artwork: 'https://catalog.example.invalid/placeholder',
  recording: 'song & identity', title: 'Song', artist: 'Artist', album: 'Album', albumIdentifier: 'album-identity', playlist: 'playlist-identity',
  streamRoute: 'Stream?id=', firstIndex: 0, secondPage: 2, extraEntry: 1, emptyLength: 0 });
const recording = () => ({ id: Fixture.recording, title: Fixture.title, artistName: Fixture.artist, releaseTitle: Fixture.album });
test('catalog mapping encodes the stream identity and preserves public collection metadata', () => {
  const mapped = new PlaybackCatalogMapping(Fixture.server, Fixture.artwork).map({ ...recording(), isLiked: true }, Fixture.albumIdentifier, Fixture.playlist);
  assertion.equal(mapped.mediaAddress, new URL(Fixture.streamRoute + encodeURIComponent(Fixture.recording), Fixture.server).href);
  assertion.equal(mapped.recordingIdentifier, Fixture.recording); assertion.equal(mapped.albumIdentifier, Fixture.albumIdentifier);
  assertion.equal(mapped.playlistIdentifier, Fixture.playlist); assertion.equal(mapped.isLiked, true);
  assertion.equal(mapped.artworkAddress, Fixture.artwork); assertion.equal(mapped.mediaRequest, undefined);
});
test('catalog mapping uses recording artwork and release identity when present', () => {
  const mapped = new PlaybackCatalogMapping(Fixture.server, Fixture.artwork).map({ ...recording(), cover: Fixture.server, releaseId: Fixture.albumIdentifier });
  assertion.equal(mapped.artworkAddress, Fixture.server); assertion.equal(mapped.albumIdentifier, Fixture.albumIdentifier);
  assertion.equal(mapped.playlistIdentifier, undefined); assertion.equal(mapped.isLiked, undefined);
});
test('collection loading reads every page and copies caller-owned rows', async () => {
  const pages = []; const firstPage = Array.from({ length: CollectionLoadingPolicy.pageSize }, recording);
  const result = await new PlaybackCollectionLoader().load(async (page, pageSize) => {
    pages.push(page); assertion.equal(pageSize, CollectionLoadingPolicy.pageSize);
    return page === CollectionLoadingPolicy.firstPage ? firstPage : [recording()];
  }, () => true);
  assertion.deepEqual(pages, [CollectionLoadingPolicy.firstPage, Fixture.secondPage]);
  assertion.equal(result.length, CollectionLoadingPolicy.pageSize + Fixture.extraEntry);
  firstPage[Fixture.firstIndex].title = Fixture.album; assertion.equal(result[Fixture.firstIndex].title, Fixture.title);
});
test('collection loading rejects supersession before issuing a request', async () => {
  let requested = false;
  await assertion.rejects(new PlaybackCollectionLoader().load(async () => { requested = true; return []; }, () => false));
  assertion.equal(requested, false);
});
test('collection loading rejects a superseded response without requesting more pages', async () => {
  const pending = deferred(); let current = true;
  const operation = new PlaybackCollectionLoader().load(() => pending.promise, () => current);
  current = false; pending.resolve([recording()]); await assertion.rejects(operation);
});
test('collection loading rejects oversized server pages', async () => {
  await assertion.rejects(new PlaybackCollectionLoader().load(async () =>
    Array.from({ length: CollectionLoadingPolicy.pageSize + Fixture.extraEntry }, recording), () => true));
});
test('collection loading accepts the exact queue capacity followed by an empty page', async () => {
  const lastPage = CollectionLoadingPolicy.maximumEntries / CollectionLoadingPolicy.pageSize;
  const result = await new PlaybackCollectionLoader().load(async page => page <= lastPage
    ? Array.from({ length: CollectionLoadingPolicy.pageSize }, recording) : [], () => true);
  assertion.equal(result.length, CollectionLoadingPolicy.maximumEntries);
});
test('collection loading rejects a collection beyond native queue capacity', async () => {
  await assertion.rejects(new PlaybackCollectionLoader().load(async () =>
    Array.from({ length: CollectionLoadingPolicy.pageSize }, recording), () => true));
});

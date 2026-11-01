const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackCatalogMapping } = require('../.build/audio-migration/PlaybackCatalogMapping');
const { PlaybackTrackMapper } = require('../.build/audio-migration/PlaybackTrackMapper');
const { PlaybackMetadataRegistry } = require('../.build/audio-migration/PlaybackMetadataRegistry');
const { createPlaybackListeningPayload } = require('../.build/audio-migration/PlaybackListeningPayload');
const Fixture = Object.freeze({
  serverAddress: 'https://catalog.example.invalid/', artworkAddress: 'https://catalog.example.invalid/cover',
  recordingIdentifier: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', displayAlbumIdentifier: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  sourceAlbumIdentifier: 'cccccccc-cccc-cccc-cccc-cccccccccccc', playlistIdentifier: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  entryIdentifier: 'listening-occurrence', secondEntryIdentifier: 'another-occurrence',
  title: 'Fixture song', artist: 'Fixture artist', album: 'Fixture album', durationSeconds: 180,
});
const TestNames = Object.freeze({
  direct: 'direct search and suggestions retain album display metadata without album history attribution',
  album: 'an explicit album queue reports its source album independently of recording release metadata',
  playlist: 'playlist context wins over an album argument and album display metadata',
  defensive: 'manually supplied conflicting playback context reports only the playlist',
  immutable: 'preparation captures source context before asynchronous cache lookup finishes',
  edits: 'occurrence metadata preserves source context through order and current occurrence changes',
  suggestions: 'new suggestions never inherit the current album queue context',
  restored: 'native restored album display metadata never invents an album queue origin',
  restoredPlaylist: 'restored native playlist context remains explicit history attribution',
  retirement: 'metadata clear does not retain source album context for a later session',
});
function recording() {
  return { id: Fixture.recordingIdentifier, title: Fixture.title, artistName: Fixture.artist,
    releaseTitle: Fixture.album, releaseId: Fixture.displayAlbumIdentifier };
}
function environment() {
  return { catalog: new PlaybackCatalogMapping(Fixture.serverAddress, Fixture.artworkAddress),
    mapper: new PlaybackTrackMapper(Fixture.serverAddress, { async findReadableCachedAddress() { return null; } }),
    metadata: new PlaybackMetadataRegistry() };
}
async function preparedContext(albumIdentifier, playlistIdentifier) {
  const context = environment();
  const track = context.catalog.map(recording(), albumIdentifier, playlistIdentifier);
  const prepared = await context.mapper.prepare(track, Fixture.entryIdentifier);
  context.metadata.stage([prepared.view]).settle(true);
  return { ...context, track, prepared, payload: createPlaybackListeningPayload(context.metadata.viewFor(prepared.entry), Fixture.durationSeconds) };
}
test(TestNames.direct, async () => {
  const context = await preparedContext();
  assertion.equal(context.track.albumIdentifier, Fixture.displayAlbumIdentifier);
  assertion.equal(context.track.sourceAlbumIdentifier, undefined);
  assertion.equal(context.payload.sourceAlbumId, null);
  assertion.equal(context.payload.playlistId, null);
});
test(TestNames.album, async () => {
  const context = await preparedContext(Fixture.sourceAlbumIdentifier);
  assertion.equal(context.payload.sourceAlbumId, Fixture.sourceAlbumIdentifier);
  assertion.equal(context.payload.playlistId, null);
  assertion.equal(context.prepared.view.albumIdentifier, Fixture.displayAlbumIdentifier);
  assertion.equal(context.payload.trackId, Fixture.recordingIdentifier);
  assertion.equal(context.payload.durationSeconds, Fixture.durationSeconds);
});
test(TestNames.playlist, async () => {
  const context = await preparedContext(Fixture.sourceAlbumIdentifier, Fixture.playlistIdentifier);
  assertion.equal(context.track.sourceAlbumIdentifier, undefined);
  assertion.equal(context.payload.sourceAlbumId, null);
  assertion.equal(context.payload.playlistId, Fixture.playlistIdentifier);
  assertion.equal(context.payload.album, Fixture.album);
});
test(TestNames.defensive, async () => {
  const context = environment();
  const prepared = await context.mapper.prepare({ ...context.catalog.map(recording()),
    sourceAlbumIdentifier: Fixture.sourceAlbumIdentifier, playlistIdentifier: Fixture.playlistIdentifier }, Fixture.entryIdentifier);
  assertion.equal(prepared.view.sourceAlbumIdentifier, undefined);
  const payload = createPlaybackListeningPayload({ ...prepared.view, sourceAlbumIdentifier: Fixture.sourceAlbumIdentifier }, Fixture.durationSeconds);
  assertion.equal(payload.sourceAlbumId, null);
  assertion.equal(payload.playlistId, Fixture.playlistIdentifier);
});
test(TestNames.immutable, async () => {
  const context = environment();
  let finishLookup;
  const mapper = new PlaybackTrackMapper(Fixture.serverAddress, {
    findReadableCachedAddress() { return new Promise(resolve => { finishLookup = resolve; }); },
  });
  const track = context.catalog.map(recording(), Fixture.sourceAlbumIdentifier);
  const pending = mapper.prepare(track, Fixture.entryIdentifier);
  track.sourceAlbumIdentifier = Fixture.displayAlbumIdentifier;
  finishLookup(null);
  assertion.equal((await pending).view.sourceAlbumIdentifier, Fixture.sourceAlbumIdentifier);
});
test(TestNames.edits, async () => {
  const context = await preparedContext(Fixture.sourceAlbumIdentifier);
  const another = await context.mapper.prepare(context.catalog.map(recording()), Fixture.secondEntryIdentifier);
  context.metadata.stage([another.view]).settle(true);
  context.metadata.observe([another.view, context.prepared.view], another.entry);
  assertion.equal(context.metadata.viewFor(context.prepared.entry).sourceAlbumIdentifier, Fixture.sourceAlbumIdentifier);
  assertion.equal(context.metadata.viewFor(another.entry).sourceAlbumIdentifier, undefined);
  context.metadata.observe([context.prepared.view], context.prepared.entry);
  assertion.equal(context.metadata.viewFor(context.prepared.entry).sourceAlbumIdentifier, Fixture.sourceAlbumIdentifier);
});
test(TestNames.suggestions, async () => {
  const context = await preparedContext(Fixture.sourceAlbumIdentifier);
  const suggestion = await context.mapper.prepare(context.catalog.map(recording()), Fixture.secondEntryIdentifier);
  context.metadata.stage([suggestion.view]).settle(true);
  const payload = createPlaybackListeningPayload(context.metadata.viewFor(suggestion.entry), Fixture.durationSeconds);
  assertion.equal(payload.sourceAlbumId, null);
  assertion.equal(payload.playlistId, null);
});
test(TestNames.restored, async () => {
  const context = await preparedContext(Fixture.sourceAlbumIdentifier);
  const restored = new PlaybackMetadataRegistry().viewFor(context.prepared.entry);
  assertion.equal(restored.album, Fixture.album);
  assertion.equal(restored.sourceAlbumIdentifier, undefined);
  assertion.equal(createPlaybackListeningPayload(restored, Fixture.durationSeconds).sourceAlbumId, null);
});
test(TestNames.restoredPlaylist, async () => {
  const context = await preparedContext(undefined, Fixture.playlistIdentifier);
  const restored = new PlaybackMetadataRegistry().viewFor(context.prepared.entry);
  const payload = createPlaybackListeningPayload(restored, Fixture.durationSeconds);
  assertion.equal(payload.playlistId, Fixture.playlistIdentifier);
  assertion.equal(payload.sourceAlbumId, null);
});
test(TestNames.retirement, async () => {
  const context = await preparedContext(Fixture.sourceAlbumIdentifier);
  context.metadata.clear();
  assertion.equal(context.metadata.viewFor(context.prepared.entry).sourceAlbumIdentifier, undefined);
});

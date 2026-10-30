const test = require('node:test');
const assertion = require('node:assert/strict');
const { captureSpotifyHostingQueue } = require('../.build/spotify/SpotifyHostingQueue');
const { QueuePageStatus } = require('streaming-service-player');
const Fixture = Object.freeze({ engine: 'synthetic-engine', authentication: 'synthetic-authentication', queue: 'synthetic-queue', occurrence: 'synthetic-first',
  other: 'synthetic-second', recording: 'synthetic-recording', revision: 1, offset: 0, count: 2, first: 0 });
function fixture() {
  const cursor = { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication, queueIdentifier: Fixture.queue,
    queueRevision: Fixture.revision, queueContentRevision: Fixture.revision, playbackControlRevision: Fixture.revision };
  const entries = [{ entryIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.recording }, { entryIdentifier: Fixture.other, recordingIdentifier: Fixture.recording }];
  const state = { cursor, entries, changed: false, authority: null };
  let reads = Fixture.offset;
  return { state, player: { async getSnapshot() { reads += Fixture.revision; return { cursor: state.changed && reads > Fixture.revision ? { ...cursor, queueRevision: Fixture.count } : cursor,
    externalAuthorityIdentifier: state.authority, currentEntry: entries[Fixture.first], queueLength: entries.length }; },
  async getQueuePage() { return { status: QueuePageStatus.Success, page: { cursor, entries: state.entries, offset: Fixture.offset, totalEntries: entries.length } }; } } };
}
test('Host queue capture preserves actual repeated recording occurrences and cursor', async () => {
  const current = fixture(); const queue = await captureSpotifyHostingQueue(current.player);
  assertion.equal(queue.entries.length, Fixture.count); assertion.equal(queue.entries[Fixture.first].occurrenceIdentifier, Fixture.occurrence);
  assertion.equal(queue.expectedCursor.contentRevision, Fixture.revision);
});
test('A changing app cursor cannot produce a hosting configuration', async () => {
  const current = fixture(); current.state.changed = true; await assertion.rejects(captureSpotifyHostingQueue(current.player));
});
test('Source-only app entries and duplicate occurrences cannot be advertised as mapped recordings', async () => {
  const missing = fixture(); missing.state.entries = [{ entryIdentifier: Fixture.occurrence }]; await assertion.rejects(captureSpotifyHostingQueue(missing.player));
  const duplicate = fixture(); duplicate.state.entries[Fixture.revision].entryIdentifier = Fixture.occurrence; await assertion.rejects(captureSpotifyHostingQueue(duplicate.player));
});

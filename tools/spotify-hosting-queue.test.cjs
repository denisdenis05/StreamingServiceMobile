const test = require('node:test');
const assertion = require('node:assert/strict');
const { captureSpotifyHostingQueue, SpotifyHostingQueueIssue, SpotifyHostingQueuePolicy } = require('../.build/spotify/SpotifyHostingQueue');
const { IntegrationFailureCode } = require('streaming-service-spotify-jam');
const { QueuePageStatus } = require('streaming-service-player');
const Fixture = Object.freeze({ engine: 'synthetic-engine', authentication: 'synthetic-authentication', queue: 'synthetic-queue', occurrence: 'synthetic-first',
  externalAuthority: 'synthetic-authority', other: 'synthetic-second', recording: 'synthetic-recording', revision: 1, offset: 0, count: 2, first: 0 });
function fixture() {
  const cursor = { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication, queueIdentifier: Fixture.queue,
    queueRevision: Fixture.revision, queueContentRevision: Fixture.revision, playbackControlRevision: Fixture.revision };
  const entries = [{ entryIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.recording }, { entryIdentifier: Fixture.other, recordingIdentifier: Fixture.recording }];
  const state = { cursor, entries, changed: false, authority: null, finalAuthority: null, finalCurrentEntry: entries[Fixture.first], finalQueueLength: entries.length, currentEntry: entries[Fixture.first], queueLength: entries.length };
  let reads = Fixture.offset;
  return { state, player: { async getSnapshot() { reads += Fixture.revision; return { cursor: state.changed && reads > Fixture.revision ? { ...cursor, queueRevision: Fixture.count } : cursor,
    externalAuthorityIdentifier: reads > Fixture.revision ? state.finalAuthority : state.authority, currentEntry: reads > Fixture.revision ? state.finalCurrentEntry : state.currentEntry, queueLength: reads > Fixture.revision ? state.finalQueueLength : state.queueLength }; },
  async getQueuePage() { return { status: QueuePageStatus.Success, page: { cursor, entries: state.entries, offset: Fixture.offset, totalEntries: state.queueLength } }; } } };
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

test('External authority acquired during queue sampling prevents app hosting even with an unchanged cursor', async () => {
  const current = fixture(); current.state.finalAuthority = Fixture.externalAuthority;
  await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.Superseded });
});
test('A changed current occurrence or queue length cannot pass a matching cursor alone', async () => {
  const changedOccurrence = fixture(); changedOccurrence.state.finalCurrentEntry = changedOccurrence.state.entries[Fixture.revision];
  await assertion.rejects(captureSpotifyHostingQueue(changedOccurrence.player), { code: IntegrationFailureCode.Superseded });
  const changedLength = fixture(); changedLength.state.finalQueueLength = Fixture.revision;
  await assertion.rejects(captureSpotifyHostingQueue(changedLength.player), { code: IntegrationFailureCode.Superseded });
});
test('The current player occurrence must exist in the captured hosting queue', async () => {
  const current = fixture(); current.state.entries = current.state.entries.map(entry => ({ ...entry, entryIdentifier: Fixture.other }));
  current.state.entries[Fixture.revision].entryIdentifier = Fixture.externalAuthority;
  await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.InvalidResponse });
});

test('No current song and empty queues give an actionable empty queue issue', async () => {
  for (const values of [{ currentEntry: null }, { queueLength: SpotifyHostingQueuePolicy.firstOffset }]) {
    const current = fixture(); Object.assign(current.state, values);
    await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.Unsupported, queueIssue: SpotifyHostingQueueIssue.EmptyQueue });
  }
});
test('A queue beyond the hosting bound identifies the capacity issue', async () => {
  const current = fixture(); current.state.queueLength = SpotifyHostingQueuePolicy.maximumEntries + SpotifyHostingQueuePolicy.minimumEntries;
  await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.Unsupported, queueIssue: SpotifyHostingQueueIssue.CapacityExceeded });
});
test('External follower ownership identifies the stop following requirement', async () => {
  const current = fixture(); current.state.authority = Fixture.externalAuthority;
  await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.Unsupported, queueIssue: SpotifyHostingQueueIssue.ExternalAuthority });
});
test('Malformed queue lengths remain invalid responses rather than empty or capacity issues', async () => {
  for (const queueLength of [Number.NaN, Number.POSITIVE_INFINITY, -Fixture.revision, Fixture.revision / Fixture.count]) {
    const current = fixture(); current.state.queueLength = queueLength;
    await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.InvalidResponse });
  }
});
test('Malformed recording identities remain invalid responses', async () => {
  const current = fixture(); current.state.entries[Fixture.first].recordingIdentifier = null;
  await assertion.rejects(captureSpotifyHostingQueue(current.player), { code: IntegrationFailureCode.InvalidResponse });
});

test('The exact hosting queue capacity remains capturable', async () => {
  const current = fixture();
  current.state.entries = Array.from({ length: SpotifyHostingQueuePolicy.maximumEntries }, (unused, occurrenceIndex) => ({
    entryIdentifier: occurrenceIndex === Fixture.first ? Fixture.occurrence : Fixture.other + occurrenceIndex,
    recordingIdentifier: Fixture.recording,
  }));
  current.state.queueLength = SpotifyHostingQueuePolicy.maximumEntries;
  current.state.finalQueueLength = SpotifyHostingQueuePolicy.maximumEntries;
  const captured = await captureSpotifyHostingQueue(current.player);
  assertion.equal(captured.entries.length, SpotifyHostingQueuePolicy.maximumEntries);
});

test('Hosting capture identifies the actual selected occurrence after an album opener', async () => {
  const current = fixture();
  current.state.currentEntry = current.state.entries[Fixture.revision];
  current.state.finalCurrentEntry = current.state.currentEntry;
  const captured = await captureSpotifyHostingQueue(current.player);
  assertion.equal(captured.currentOccurrenceIdentifier, Fixture.other);
  assertion.equal(captured.entries[Fixture.first].occurrenceIdentifier, Fixture.occurrence);
});

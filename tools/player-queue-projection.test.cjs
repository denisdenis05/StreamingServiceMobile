const { test } = require('node:test');
const { strict: assertion } = require('node:assert');
const { NativeQueueProjection, QueueProjectionPolicy } = require('../.build/audio-migration/NativeQueueProjection');
const { QueuePageStatus } = require('streaming-service-player');

const Fixture = Object.freeze({
  engineEpoch: 'fixture-engine', authenticationEpoch: 'fixture-account',
  otherEngineEpoch: 'other-engine', otherAuthenticationEpoch: 'other-account',
  revision: 7, newerRevision: 8, eventSequence: 1, laterEventSequence: 2,
  firstIdentifier: 'occurrence-one', secondIdentifier: 'occurrence-two',
  title: 'Fixture title', updatedTitle: 'Updated title', artist: 'Fixture artist',
  firstEntryIndex: 0, anotherPageEntryCount: 1, expectedPageCount: 3,
  fullPageCount: 2, expectedSinglePageReadCount: 1,
  entryPrefix: 'occurrence-', invalidLength: -1,
});
const TestNames = {
  pages: 'native queue pages are read completely using bounded page sizes',
  order: 'the projected queue preserves native playback order',
  cache: 'progress-only cursor changes reuse the completed queue projection',
  selection: 'selection-only revisions preserve the existing UI queue identity',
  metadata: 'native metadata changes update the queue view',
  conflict: 'queue conflicts discard the incomplete projection',
  engine: 'queue pages from another engine cannot populate the current projection',
  account: 'queue pages from another account cannot populate the current projection',
  newer: 'a newer empty queue supersedes an earlier pending page read',
  clear: 'clearing the projection invalidates pending page results',
  malformed: 'malformed page offsets lengths and totals are rejected',
  duplicate: 'duplicate occurrence identifiers are rejected',
  invalidLength: 'invalid native queue lengths are rejected',
  cachedReadFence: 'a newer cached read supersedes an earlier pending read',
};

function snapshot(queueLength, queueRevision = Fixture.revision) {
  return { queueLength, cursor: { engineEpoch: Fixture.engineEpoch, authenticationEpoch: Fixture.authenticationEpoch,
    queueRevision, eventSequence: Fixture.eventSequence } };
}

function queueEntry(entryIdentifier, title = Fixture.title) {
  return { entryIdentifier, title, artist: Fixture.artist };
}

function page(currentSnapshot, entries, offset = QueueProjectionPolicy.firstPageOffset) {
  return { status: QueuePageStatus.Success, page: { cursor: { ...currentSnapshot.cursor }, offset,
    totalEntries: currentSnapshot.queueLength, entries } };
}

function fixtureProjection(entries, reader) {
  const reads = [];
  const currentSnapshot = snapshot(entries.length);
  const observation = {
    async getQueuePage(offset, limit, expectedRevision) {
      reads.push({ offset, limit, expectedRevision });
      return reader ? reader(offset, limit, expectedRevision) : page(currentSnapshot, entries.slice(offset, offset + limit), offset);
    },
  };
  const projection = new NativeQueueProjection(observation, {
    viewFor(entry) { return { ...entry, isLocalCached: false }; },
  });
  return { projection, reads, currentSnapshot };
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

test(TestNames.pages, async () => {
  const entries = Array.from({ length: QueueProjectionPolicy.maximumPageEntries * Fixture.fullPageCount + Fixture.anotherPageEntryCount },
    (unusedValue, entryIndex) => queueEntry(Fixture.entryPrefix + entryIndex));
  const { projection, currentSnapshot, reads } = fixtureProjection(entries);
  const views = await projection.read(currentSnapshot);
  assertion.equal(views.length, entries.length);
  assertion.equal(reads.length, Fixture.expectedPageCount);
  for (const read of reads) assertion.equal(read.limit, QueueProjectionPolicy.maximumPageEntries);
});

test(TestNames.order, async () => {
  const entries = [queueEntry(Fixture.secondIdentifier), queueEntry(Fixture.firstIdentifier)];
  const { projection, currentSnapshot } = fixtureProjection(entries);
  assertion.deepEqual((await projection.read(currentSnapshot)).map(view => view.entryIdentifier), entries.map(entry => entry.entryIdentifier));
});

test(TestNames.cache, async () => {
  const { projection, currentSnapshot, reads } = fixtureProjection([queueEntry(Fixture.firstIdentifier)]);
  const first = await projection.read(currentSnapshot);
  const next = await projection.read({ ...currentSnapshot, cursor: { ...currentSnapshot.cursor, eventSequence: Fixture.laterEventSequence } });
  assertion.equal(first, next);
  assertion.equal(reads.length, Fixture.expectedSinglePageReadCount);
});

test(TestNames.selection, async () => {
  const entries = [queueEntry(Fixture.firstIdentifier)];
  let currentSnapshot = snapshot(entries.length);
  const { projection } = fixtureProjection(entries, offset => page(currentSnapshot, entries, offset));
  const first = await projection.read(currentSnapshot);
  currentSnapshot = snapshot(entries.length, Fixture.newerRevision);
  assertion.equal(await projection.read(currentSnapshot), first);
});

test(TestNames.metadata, async () => {
  const entries = [queueEntry(Fixture.firstIdentifier)];
  let currentSnapshot = snapshot(entries.length);
  const { projection } = fixtureProjection(entries, offset => page(currentSnapshot, entries.map(entry => ({ ...entry })), offset));
  await projection.read(currentSnapshot);
  entries[Fixture.firstEntryIndex].title = Fixture.updatedTitle;
  currentSnapshot = snapshot(entries.length, Fixture.newerRevision);
  assertion.equal((await projection.read(currentSnapshot))[Fixture.firstEntryIndex].title, Fixture.updatedTitle);
});

test(TestNames.conflict, async () => {
  const { projection, currentSnapshot } = fixtureProjection([queueEntry(Fixture.firstIdentifier)], () => ({ status: QueuePageStatus.Conflict }));
  assertion.equal(await projection.read(currentSnapshot), null);
});

for (const epochChange of [
  { name: TestNames.engine, field: 'engineEpoch', value: Fixture.otherEngineEpoch },
  { name: TestNames.account, field: 'authenticationEpoch', value: Fixture.otherAuthenticationEpoch },
]) {
  test(epochChange.name, async () => {
    const entries = [queueEntry(Fixture.firstIdentifier)];
    const currentSnapshot = snapshot(entries.length);
    const { projection } = fixtureProjection(entries, () => {
      const result = page(currentSnapshot, entries);
      result.page.cursor[epochChange.field] = epochChange.value;
      return result;
    });
    assertion.equal(await projection.read(currentSnapshot), null);
  });
}

test(TestNames.newer, async () => {
  const gate = deferred();
  const entries = [queueEntry(Fixture.firstIdentifier)];
  const { projection, currentSnapshot } = fixtureProjection(entries, () => gate.promise);
  const pending = projection.read(currentSnapshot);
  assertion.deepEqual(await projection.read(snapshot(QueueProjectionPolicy.emptyQueueLength, Fixture.newerRevision)), []);
  gate.resolve(page(currentSnapshot, entries));
  assertion.equal(await pending, null);
});

test(TestNames.clear, async () => {
  const gate = deferred();
  const entries = [queueEntry(Fixture.firstIdentifier)];
  const { projection, currentSnapshot } = fixtureProjection(entries, () => gate.promise);
  const pending = projection.read(currentSnapshot);
  projection.clear();
  gate.resolve(page(currentSnapshot, entries));
  assertion.equal(await pending, null);
});

test(TestNames.malformed, async () => {
  const entries = [queueEntry(Fixture.firstIdentifier)];
  const currentSnapshot = snapshot(entries.length);
  for (const overrides of [
    { offset: Fixture.anotherPageEntryCount },
    { totalEntries: QueueProjectionPolicy.emptyQueueLength },
    { entries: [] },
    { entries: [...entries, ...entries] },
  ]) {
    const { projection } = fixtureProjection(entries, () => ({ status: QueuePageStatus.Success,
      page: { ...page(currentSnapshot, entries).page, ...overrides } }));
    assertion.equal(await projection.read(currentSnapshot), null);
  }
});

test(TestNames.duplicate, async () => {
  const entries = [queueEntry(Fixture.firstIdentifier), queueEntry(Fixture.firstIdentifier)];
  const { projection, currentSnapshot } = fixtureProjection(entries);
  assertion.equal(await projection.read(currentSnapshot), null);
});

test(TestNames.invalidLength, async () => {
  const { projection } = fixtureProjection([]);
  for (const queueLength of [Fixture.invalidLength, NaN, Infinity]) assertion.equal(await projection.read(snapshot(queueLength)), null);
});

test(TestNames.cachedReadFence, async () => {
  const entries = [queueEntry(Fixture.firstIdentifier)];
  const currentSnapshot = snapshot(entries.length);
  const gate = deferred();
  let readingNewRevision = false;
  const { projection } = fixtureProjection(entries, () => readingNewRevision ? gate.promise : page(currentSnapshot, entries));
  const original = await projection.read(currentSnapshot);
  readingNewRevision = true;
  const pending = projection.read(snapshot(entries.length, Fixture.newerRevision));
  assertion.equal(await projection.read(currentSnapshot), original);
  gate.resolve(page(snapshot(entries.length, Fixture.newerRevision), entries));
  assertion.equal(await pending, null);
});

const ContentRevisionFixture = Object.freeze({ queueIdentifier: 'content-queue', otherQueueIdentifier: 'other-content-queue',
  contentRevision: 12, controlRevision: 20, changedControlRevision: 21 });
test('native content stamps reuse queue pages across selection and redundant playback controls', async () => {
  const entries = [queueEntry(Fixture.firstIdentifier)]; const scenario = fixtureProjection(entries);
  scenario.currentSnapshot.cursor = { ...scenario.currentSnapshot.cursor, queueIdentifier: ContentRevisionFixture.queueIdentifier,
    queueContentRevision: ContentRevisionFixture.contentRevision, playbackControlRevision: ContentRevisionFixture.controlRevision };
  const first = await scenario.projection.read(scenario.currentSnapshot);
  const selected = { ...scenario.currentSnapshot, cursor: { ...scenario.currentSnapshot.cursor, queueRevision: Fixture.newerRevision,
    playbackControlRevision: ContentRevisionFixture.changedControlRevision } };
  assertion.equal(await scenario.projection.read(selected), first);
  assertion.equal(scenario.reads.length, Fixture.expectedSinglePageReadCount);
});
test('a changed native queue identity invalidates equal-content cached pages', async () => {
  const entries = [queueEntry(Fixture.firstIdentifier)]; const scenario = fixtureProjection(entries);
  scenario.currentSnapshot.cursor = { ...scenario.currentSnapshot.cursor, queueIdentifier: ContentRevisionFixture.queueIdentifier,
    queueContentRevision: ContentRevisionFixture.contentRevision };
  await scenario.projection.read(scenario.currentSnapshot);
  scenario.currentSnapshot.cursor = { ...scenario.currentSnapshot.cursor, queueIdentifier: ContentRevisionFixture.otherQueueIdentifier };
  await scenario.projection.read(scenario.currentSnapshot);
  assertion.equal(scenario.reads.length, Fixture.expectedSinglePageReadCount + Fixture.expectedSinglePageReadCount);
});

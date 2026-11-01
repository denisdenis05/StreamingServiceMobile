const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackQueueContextPersistence } = require('../.build/audio-migration/PlaybackQueueContextPersistence');
const { PlaybackRuntime } = require('../.build/audio-migration/PlaybackRuntime');
const { environment: runtimeEnvironment, Fixture: RuntimeFixture, RuntimeFixture: RuntimePolicy, track, deferred, settleUntil } = require('./fixtures/playback-runtime.cjs');
const Fixture = Object.freeze({ server: 'https://catalog.example.invalid/', account: 'context-account', engine: 'context-engine',
  authentication: 'context-authentication', queue: 'context-queue', entry: 'context-occurrence', anotherEntry: 'another-occurrence',
  recording: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', album: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  playlist: 'cccccccc-cccc-cccc-cccc-cccccccccccc', title: 'Fixture song', artist: 'Fixture artist',
  revision: 1, nextRevision: 2, initialCount: 0, oneCount: 1, twoCount: 2, otherIdentity: 'other-context', identifierPrefix: 'context-identifier-',
});
const TestNames = Object.freeze({ restore: 'matching persisted queue origins restore only explicit occurrence origins',
  missing: 'legacy missing sidecars leave album origins unknown', malformed: 'malformed receipts cannot restore collection origins',
  rewrite: 'queue rewrites during sidecar hydration discard restored origins', retirement: 'account retirement discards a delayed sidecar read',
  recording: 'reused occurrence identifiers cannot restore a different recording origin', playlist: 'native playlist entries ignore stored album origins',
  writes: 'sidecar writes serialize so a delayed older write cannot replace the newer queue',
  invalidated: 'retired queued writes are skipped before storage starts', failure: 'failed storage allows a later capture to retry without rejecting controls',
  duplicate: 'unchanged queue metadata does not write repeatedly', privacy: 'sidecars contain collection bindings without titles media sources or credentials',
  reload: 'runtime reload restores album context before the first new listening session starts',
  controls: 'unresolved sidecar writes do not block Pause or a new queue',
});
function snapshot() { return { cursor: { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication,
  queueIdentifier: Fixture.queue, queueContentRevision: Fixture.revision, queueRevision: Fixture.revision }, queueLength: Fixture.oneCount }; }
function view() { return { entryIdentifier: Fixture.entry, recordingIdentifier: Fixture.recording,
  sourceAlbumIdentifier: Fixture.album, title: Fixture.title, artist: Fixture.artist, isLocalCached: false }; }
function receipt() { return { serverAddress: Fixture.server, accountIdentifier: Fixture.account, engineEpoch: Fixture.engine,
  authenticationEpoch: Fixture.authentication, queueIdentifier: Fixture.queue, queueContentRevision: Fixture.revision,
  origins: [{ entryIdentifier: Fixture.entry, recordingIdentifier: Fixture.recording, sourceAlbumIdentifier: Fixture.album, isLocalCached: false }] }; }
function environment() {
  let stored = receipt(); let current = snapshot(); let entries = [{ ...view(), sourceAlbumIdentifier: undefined }];
  let read = async () => stored; let write = async () => undefined;
  const restored = []; const writes = []; const failures = [];
  const persistence = new PlaybackQueueContextPersistence({ serverAddress: Fixture.server,
    storage: { read: () => read(), async write(value) { writes.push(value); await write(value); } },
    metadata: { stage(values) { restored.push(...values); return { settle() {} }; } },
    getSnapshot: async () => current, readQueue: async () => entries, reportFailure: failure => failures.push(failure) });
  return { persistence, restored, writes, failures, setStored(value) { stored = value; }, setSnapshot(value) { current = value; },
    setEntries(value) { entries = value; }, setRead(operation) { read = operation; }, setWrite(operation) { write = operation; },
    restore: () => persistence.restore(Fixture.account, snapshot(), () => true) };
}
test(TestNames.restore, async () => {
  const context = environment(); await context.restore();
  assertion.equal(context.restored.length, Fixture.oneCount); assertion.equal(context.restored[Fixture.initialCount].sourceAlbumIdentifier, Fixture.album);
});
test(TestNames.missing, async () => {
  const context = environment(); context.setStored(null); await context.restore(); assertion.deepEqual(context.restored, []);
});
for (const field of ['serverAddress', 'accountIdentifier', 'engineEpoch', 'authenticationEpoch', 'queueIdentifier', 'queueContentRevision']) {
  test(`persisted context with a different ${field} is ignored`, async () => {
    const context = environment(); context.setStored({ ...receipt(), [field]: field === 'queueContentRevision' ? Fixture.nextRevision : Fixture.otherIdentity });
    await context.restore(); assertion.deepEqual(context.restored, []);
  });
}
test(TestNames.malformed, async () => {
  for (const value of [{}, { ...receipt(), origins: [receipt().origins[Fixture.initialCount], receipt().origins[Fixture.initialCount]] },
    { ...receipt(), origins: [{ ...receipt().origins[Fixture.initialCount], sourceAlbumIdentifier: Fixture.otherIdentity }] }]) {
    const context = environment(); context.setStored(value); await context.restore(); assertion.deepEqual(context.restored, []);
  }
});
test(TestNames.rewrite, async () => {
  const context = environment(); context.setSnapshot({ ...snapshot(), cursor: { ...snapshot().cursor, queueContentRevision: Fixture.nextRevision } });
  await context.restore(); assertion.deepEqual(context.restored, []);
});
test(TestNames.retirement, async () => {
  const context = environment(); const pending = deferred(); context.setRead(() => pending.promise);
  const restoring = context.restore(); context.persistence.invalidate(); pending.resolve(receipt()); await restoring;
  assertion.deepEqual(context.restored, []);
});
test(TestNames.recording, async () => {
  const context = environment(); context.setEntries([{ ...view(), recordingIdentifier: Fixture.album }]);
  await context.restore(); assertion.deepEqual(context.restored, []);
});
test(TestNames.playlist, async () => {
  const context = environment(); context.setEntries([{ ...view(), playlistIdentifier: Fixture.playlist }]);
  await context.restore(); assertion.deepEqual(context.restored, []);
});
test(TestNames.writes, async () => {
  const context = environment(); const pending = deferred(); context.setWrite(() => pending.promise);
  context.persistence.capture(Fixture.account, snapshot(), [view()]); await settleUntil(() => context.writes.length === Fixture.oneCount);
  context.persistence.capture(Fixture.account, { ...snapshot(), cursor: { ...snapshot().cursor, queueContentRevision: Fixture.nextRevision } },
    [{ ...view(), sourceAlbumIdentifier: undefined }]);
  assertion.equal(context.writes.length, Fixture.oneCount); pending.resolve();
  await settleUntil(() => context.writes.length === Fixture.twoCount); assertion.deepEqual(context.writes[Fixture.oneCount].origins, []);
});
test(TestNames.invalidated, async () => {
  const context = environment(); context.persistence.capture(Fixture.account, snapshot(), [view()]); context.persistence.invalidate();
  await Promise.resolve(); await Promise.resolve(); assertion.deepEqual(context.writes, []);
});
test(TestNames.failure, async () => {
  const context = environment(); context.setWrite(async () => { throw new Error(Fixture.otherIdentity); });
  context.persistence.capture(Fixture.account, snapshot(), [view()]); await settleUntil(() => context.failures.length === Fixture.oneCount);
  context.setWrite(async () => undefined); context.persistence.capture(Fixture.account, snapshot(), [view()]);
  await settleUntil(() => context.writes.length === Fixture.twoCount);
});
test(TestNames.duplicate, async () => {
  const context = environment(); context.persistence.capture(Fixture.account, snapshot(), [view()]);
  context.persistence.capture(Fixture.account, snapshot(), [view()]); await settleUntil(() => context.writes.length === Fixture.oneCount);
  assertion.equal(context.writes.length, Fixture.oneCount);
});
test(TestNames.privacy, async () => {
  const context = environment(); context.persistence.capture(Fixture.account, snapshot(), [view()]);
  await settleUntil(() => context.writes.length === Fixture.oneCount);
  const serialized = JSON.stringify(context.writes);
  assertion.equal(serialized.includes(Fixture.title), false); assertion.equal(serialized.includes(Fixture.artist), false);
});
function runtimeContext() {
  const nativeContext = runtimeEnvironment(); nativeContext.runtime.dispose();
  let ownership = null; let saved = null; let identifier = Fixture.initialCount; let writing = async () => undefined; let cachedAddress = null;
  const starts = [];
  const create = () => new PlaybackRuntime({ native: nativeContext.native, mediaServerAddress: RuntimeFixture.server,
    sessionOwnership: { async read() { return ownership; }, async write(value) { ownership = value; }, async clear() { ownership = null; } },
    queueContextStorage: { async read() { return saved; }, async write(value) { await writing(); saved = value; } },
    identifiers: { nextIdentifier() { identifier += Fixture.oneCount; return Fixture.identifierPrefix + identifier; } },
    cache: { async findReadableCachedAddress() { return cachedAddress; } },
    listening: metadata => ({ create(snapshot) { const captured = metadata.viewFor(snapshot.currentEntry);
      return { start() { starts.push(captured); }, async pause() {}, async resume() {}, async seek() {}, async stop() {} }; } }),
    fetchSuggestions: async () => [], reportFailure() {} });
  return { nativeContext, create, starts, get saved() { return saved; }, setCachedAddress(value) { cachedAddress = value; }, setWrite(operation) { writing = operation; },
    login: runtime => runtime.updateAuthentication({ restored: true, accountIdentifier: RuntimeFixture.account, accessToken: RuntimePolicy.token }) };
}
test(TestNames.reload, async () => {
  const context = runtimeContext(); const first = context.create(); await context.login(first);
  await first.playTracks([{ ...track(), sourceAlbumIdentifier: Fixture.album }], RuntimeFixture.firstIndex);
  await settleUntil(() => context.saved?.origins.length === Fixture.oneCount); first.dispose();
  const previousStarts = context.starts.length; const second = context.create(); await context.login(second);
  await settleUntil(() => context.starts.length > previousStarts);
  assertion.equal(context.starts[previousStarts].sourceAlbumIdentifier, Fixture.album);
  assertion.equal(second.views.getSnapshot().currentTrack.sourceAlbumIdentifier, Fixture.album); second.dispose();
});
test(TestNames.controls, async () => {
  const context = runtimeContext(); const pending = deferred(); context.setWrite(() => pending.promise);
  const runtime = context.create(); await context.login(runtime);
  await runtime.playTracks([{ ...track(), sourceAlbumIdentifier: Fixture.album }], RuntimeFixture.firstIndex);
  await runtime.pause(); await runtime.playTracks([track(RuntimeFixture.secondRecording)], RuntimeFixture.firstIndex);
  assertion.equal(context.nativeContext.snapshot().currentEntry.recordingIdentifier, RuntimeFixture.secondRecording);
  pending.resolve(); runtime.dispose();
});

const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const StorageFixture = Object.freeze({ sourcePath: 'src/services/PlaybackQueueContextStorage.ts', encoding: 'utf8',
  contextModule: './player/PlaybackQueueContextPersistence', invalidJson: '{', oversizeCharacter: 'x',
});
function storageEnvironment() {
  const source = typescript.transpileModule(readFileSync(StorageFixture.sourcePath, StorageFixture.encoding), {
    compilerOptions: { target: typescript.ScriptTarget.ES2020, module: typescript.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  let stored = null; let read = async () => stored; const timers = new Map(); let identifier = Fixture.initialCount;
  const module = { exports: {} };
  runInNewContext(source, { module, exports: module.exports, JSON,
    require(path) { return path === StorageFixture.contextModule ? require('../.build/audio-migration/PlaybackQueueContextPersistence')
      : { getItem: () => read(), async setItem(key, value) { stored = value; } }; },
    setTimeout(callback, delay) { identifier += Fixture.oneCount; timers.set(identifier, { callback, delay }); return identifier; },
    clearTimeout(timerIdentifier) { timers.delete(timerIdentifier); },
  });
  return { storage: module.exports.playbackQueueContextStorage, policy: module.exports.PlaybackQueueContextStoragePolicy, timers,
    setStored(value) { stored = value; }, setRead(operation) { read = operation; } };
}
test('platform queue context storage returns unknown when a read exceeds its bounded deadline', async () => {
  const context = storageEnvironment(); context.setRead(() => new Promise(() => undefined));
  const reading = context.storage.read();
  const timer = [...context.timers.values()][Fixture.initialCount]; assertion.equal(timer.delay, context.policy.readDeadlineMilliseconds);
  timer.callback(); assertion.equal(await reading, null); assertion.equal(context.timers.size, Fixture.initialCount);
});
test('platform queue context storage handles malformed oversized and failed reads without throwing', async () => {
  const context = storageEnvironment(); context.setStored(StorageFixture.invalidJson); assertion.equal(await context.storage.read(), null);
  const { QueueContextPersistencePolicy } = require('../.build/audio-migration/PlaybackQueueContextPersistence');
  context.setStored(StorageFixture.oversizeCharacter.repeat(QueueContextPersistencePolicy.maximumSerializedCharacters + Fixture.oneCount));
  assertion.equal(await context.storage.read(), null);
  context.setRead(async () => { throw new Error(Fixture.otherIdentity); }); assertion.equal(await context.storage.read(), null);
  assertion.equal(context.timers.size, Fixture.initialCount);
});
test('platform queue context storage persists the explicit receipt without adding credentials or media metadata', async () => {
  const context = storageEnvironment(); await context.storage.write(receipt()); assertion.deepEqual(await context.storage.read(), receipt());
  assertion.equal(context.timers.size, Fixture.initialCount);
});

test('native shuffle repeat selection move remove and append preserve only each explicit queue origin', async () => {
  const { RepeatMode } = require('streaming-service-player');
  const context = runtimeContext(); const runtime = context.create(); await context.login(runtime);
  await runtime.playTracks([{ ...track(), sourceAlbumIdentifier: Fixture.album },
    { ...track(RuntimeFixture.secondRecording), sourceAlbumIdentifier: Fixture.album }], RuntimeFixture.firstIndex);
  await settleUntil(() => context.saved?.origins.length === Fixture.twoCount);
  await runtime.setShuffle(true); await runtime.setRepeat(RepeatMode.One);
  const entries = runtime.views.getSnapshot().queue;
  await runtime.select(entries[Fixture.oneCount].entryIdentifier); await runtime.next();
  assertion.equal(runtime.views.getSnapshot().currentTrack.sourceAlbumIdentifier, Fixture.album);
  await runtime.append([track(RuntimeFixture.thirdRecording)]);
  await settleUntil(() => runtime.views.getSnapshot().queue.length === RuntimeFixture.threeCount);
  const suggestion = runtime.views.getSnapshot().queue.find(entry => entry.recordingIdentifier === RuntimeFixture.thirdRecording);
  assertion.equal(suggestion.sourceAlbumIdentifier, undefined);
  await runtime.move(suggestion.entryIdentifier, runtime.views.getSnapshot().currentTrack.entryIdentifier);
  await runtime.removeMany([entries[Fixture.initialCount].entryIdentifier]);
  await settleUntil(() => context.saved?.queueContentRevision === context.nativeContext.snapshot().cursor.queueContentRevision);
  assertion.equal(context.saved.origins.length, Fixture.oneCount);
  assertion.equal(context.saved.origins[Fixture.initialCount].sourceAlbumIdentifier, Fixture.album); runtime.dispose();
});

test('matching queue and occurrence bindings restore cached album recording identity without guessing from display metadata', async () => {
  const context = environment();
  context.setStored({ ...receipt(), origins: [{ ...receipt().origins[Fixture.initialCount], isLocalCached: true }] });
  context.setEntries([{ ...view(), recordingIdentifier: undefined, isLocalCached: false }]);
  await context.restore();
  assertion.equal(context.restored[Fixture.initialCount].recordingIdentifier, Fixture.recording);
  assertion.equal(context.restored[Fixture.initialCount].sourceAlbumIdentifier, Fixture.album);
  assertion.equal(context.restored[Fixture.initialCount].isLocalCached, true);
});

test('runtime reload preserves explicit cached album reporting identity before listening resumes', async () => {
  const context = runtimeContext(); context.setCachedAddress(RuntimeFixture.localAddress);
  const first = context.create(); await context.login(first);
  await first.playTracks([{ ...track(), sourceAlbumIdentifier: Fixture.album }], RuntimeFixture.firstIndex);
  await settleUntil(() => context.saved?.origins.length === Fixture.oneCount); first.dispose();
  const previousStarts = context.starts.length; const second = context.create(); await context.login(second);
  await settleUntil(() => context.starts.length > previousStarts);
  assertion.equal(context.starts[previousStarts].recordingIdentifier, RuntimeFixture.firstRecording);
  assertion.equal(context.starts[previousStarts].sourceAlbumIdentifier, Fixture.album);
  assertion.equal(context.starts[previousStarts].isLocalCached, true); second.dispose();
});

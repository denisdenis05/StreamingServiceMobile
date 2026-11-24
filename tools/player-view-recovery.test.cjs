const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { NativePlaybackViewStore, PlaybackViewPolicy } = require('../.build/audio-migration/NativePlaybackViewStore');
const { PlaybackIntent, PlaybackState, RepeatMode } = require('streaming-service-player');
const { deferred, settleUntil, Fixture } = require('./fixtures/queue-rewrite.cjs');
const Policy = Object.freeze({ revision: 1, nextRevision: 2, queue: 'queue-one', otherQueue: 'queue-two', firstSequence: 1 });
function environment() {
  let snapshot = { cursor: { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.account,
    queueRevision: Policy.revision, queueIdentifier: Policy.queue, queueContentRevision: Policy.revision,
    eventSequence: Policy.firstSequence }, queueLength: Fixture.singleCount, currentEntry: { entryIdentifier: Fixture.firstRecording },
    state: PlaybackState.Paused, playbackIntent: PlaybackIntent.Pause, shuffled: false, repeatMode: RepeatMode.Off,
    canNext: false, canPrevious: false, canSeek: true };
  let notify; let read = async () => [{ entryIdentifier: Fixture.firstRecording }]; let readCount = Fixture.initialCount;
  const failures = []; const retries = []; let cancellations = Fixture.initialCount;
  const view = new NativePlaybackViewStore({ getSnapshot: () => snapshot, subscribe(listener) { notify = listener; return () => undefined; } },
    { subscribe: () => () => undefined }, { async read() { readCount += Fixture.increment; return read(); }, clear() {} },
    { viewFor: entry => ({ entryIdentifier: entry.entryIdentifier }), observe() {}, observeCurrentEntry() {}, clear() {} },
    { receive() {}, clear() {}, synchronize() {} }, failure => failures.push(failure), retry => {
      const scheduled = { run: retry, active: true }; retries.push(scheduled);
      return () => { scheduled.active = false; cancellations += Fixture.increment; };
    });
  return { view, retries, failures, get readCount() { return readCount; }, get cancellations() { return cancellations; },
    setRead(operation) { read = operation; }, update(change) { snapshot = change(snapshot); notify(); } };
}
test('failed queue projection retries while paused and clears its loading state', async () => {
  const scenario = environment(); scenario.setRead(async () => { throw new Error(Fixture.failure); }); scenario.view.connect();
  await settleUntil(() => scenario.retries.length === Fixture.singleCount);
  assertion.equal(scenario.view.getSnapshot().isQueueLoading, false);
  scenario.setRead(async () => [{ entryIdentifier: Fixture.firstRecording }]); scenario.retries[Fixture.firstIndex].run();
  await settleUntil(() => scenario.view.getSnapshot().queue.length === Fixture.singleCount);
  assertion.equal(scenario.readCount, Fixture.twoCount); scenario.view.dispose();
});
test('queue read retries stop at the configured bound', async () => {
  const scenario = environment(); scenario.setRead(async () => { throw new Error(Fixture.failure); }); scenario.view.connect();
  for (let attempt = Fixture.singleCount; attempt < PlaybackViewPolicy.maximumReadAttempts; attempt += Fixture.increment) {
    await settleUntil(() => scenario.retries.length === attempt); scenario.retries[attempt - Fixture.increment].run();
  }
  await settleUntil(() => scenario.failures.length === PlaybackViewPolicy.maximumReadAttempts);
  scenario.update(snapshot => snapshot); assertion.equal(scenario.readCount, PlaybackViewPolicy.maximumReadAttempts); scenario.view.dispose();
});
test('a late failed queue read preserves the latest selected entry', async () => {
  const scenario = environment(); const pending = deferred(); scenario.setRead(() => pending.promise); scenario.view.connect();
  scenario.update(snapshot => ({ ...snapshot, currentEntry: { entryIdentifier: Fixture.secondRecording },
    cursor: { ...snapshot.cursor, queueRevision: Policy.nextRevision } }));
  pending.reject(new Error(Fixture.failure)); await settleUntil(() => scenario.failures.length === Fixture.singleCount);
  assertion.equal(scenario.view.getSnapshot().currentTrack.entryIdentifier, Fixture.secondRecording); scenario.view.dispose();
});
test('suspension cancels recovery and rejects its late scheduled callback', async () => {
  const scenario = environment(); scenario.setRead(async () => null); scenario.view.connect();
  await settleUntil(() => scenario.retries.length === Fixture.singleCount); scenario.view.suspend();
  scenario.retries[Fixture.firstIndex].run(); assertion.equal(scenario.readCount, Fixture.singleCount);
  assertion.equal(scenario.view.getSnapshot().currentTrack, null); assertion.equal(scenario.cancellations, Fixture.singleCount); scenario.view.dispose();
});
test('new native queue content recovers immediately after an older queue exhausted retries', async () => {
  const scenario = environment(); scenario.setRead(async () => { throw new Error(Fixture.failure); }); scenario.view.connect();
  await settleUntil(() => scenario.retries.length === Fixture.singleCount);
  scenario.setRead(async () => [{ entryIdentifier: Fixture.secondRecording }]);
  scenario.update(snapshot => ({ ...snapshot, currentEntry: { entryIdentifier: Fixture.secondRecording },
    cursor: { ...snapshot.cursor, queueIdentifier: Policy.otherQueue, queueContentRevision: Policy.nextRevision } }));
  await settleUntil(() => scenario.view.getSnapshot().queue.length === Fixture.singleCount);
  assertion.equal(scenario.view.getSnapshot().queue[Fixture.firstIndex].entryIdentifier, Fixture.secondRecording); scenario.view.dispose();
});

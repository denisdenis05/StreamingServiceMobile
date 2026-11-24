const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackIntent, RepeatMode } = require('streaming-service-player');
const { QueueIntentSupersededError } = require('../.build/audio-migration/QueueIntentScheduler');
const { environment, RuntimeFixture, Fixture, track, deferred, settleUntil } = require('./fixtures/playback-runtime.cjs');
async function initialized() {
  const scenario = environment(); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex); return scenario;
}
const ExternalContinuationTest = Object.freeze({ name: 'external playback authority prevents local recommendation continuation',
  authorityIdentifier: 'shared-remote-authority' });
test(ExternalContinuationTest.name, async () => {
  const scenario = await initialized(); const snapshot = scenario.native.getSnapshot;
  scenario.native.getSnapshot = async () => ({ ...await snapshot(), currentEntry: null,
    externalAuthorityIdentifier: ExternalContinuationTest.authorityIdentifier });
  await scenario.runtime.next();
  assertion.equal(scenario.suggestionCalls, Fixture.initialCount); scenario.runtime.dispose();
});
test('the selected runtime shares one native subscription and releases it on disposal', async () => {
  const scenario = await initialized(); assertion.equal(scenario.listenerCount, Fixture.singleCount);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.firstRecording);
  scenario.runtime.dispose(); assertion.equal(scenario.listenerCount, Fixture.initialCount);
});
test('runtime captures playback metadata before asynchronous authentication readiness', async () => {
  const scenario = environment(); const pending = deferred(); scenario.setConfigure(() => pending.promise);
  const login = scenario.login(); const candidate = track(); const playing = scenario.runtime.playTracks([candidate], Fixture.firstIndex);
  candidate.title = Fixture.privateMessage; pending.resolve(); await login; await playing;
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.title, Fixture.title); scenario.runtime.dispose();
});
test('a newer collection request prevents an older unresolved collection from replacing audio', async () => {
  const scenario = await initialized(); const pending = deferred();
  const first = scenario.runtime.playCollection(() => pending.promise); const rejected = assertion.rejects(first, QueueIntentSupersededError);
  await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  pending.resolve({ tracks: [track()], selectedIndex: Fixture.firstIndex }); await rejected;
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording); scenario.runtime.dispose();
});
test('same-account token refresh retains the native queue and current occurrence', async () => {
  const scenario = await initialized(); const before = scenario.snapshot();
  await scenario.runtime.updateAuthentication({ restored: true, accountIdentifier: Fixture.account, accessToken: RuntimeFixture.nextToken });
  assertion.equal(scenario.snapshot().cursor.queueIdentifier, before.cursor.queueIdentifier);
  assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, before.currentEntry.entryIdentifier); scenario.runtime.dispose();
});
test('logout clears audio and rejects further controls', async () => {
  const scenario = await initialized(); await scenario.runtime.updateAuthentication({ restored: true, accountIdentifier: null, accessToken: null });
  assertion.equal(scenario.snapshot().currentEntry, null); assertion.equal(scenario.runtime.views.getSnapshot().currentTrack, null);
  await assertion.rejects(scenario.runtime.play()); scenario.runtime.dispose();
});
test('native Pause cancels source preparation for a pending replacement', async () => {
  const scenario = await initialized(); const pending = deferred(); const started = deferred();
  scenario.setCache(() => { started.resolve(); return pending.promise; });
  const replacing = scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(replacing, QueueIntentSupersededError); await started.promise;
  scenario.nativePause(); await rejected; pending.resolve(null);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Pause);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.firstRecording); scenario.runtime.dispose();
});
test('accepting a collection cancels an older pending replacement before collection HTTP finishes', async () => {
  const scenario = await initialized(); const pendingCache = deferred(); const started = deferred();
  scenario.setCache(() => { started.resolve(); return pendingCache.promise; });
  const replacing = scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(replacing, QueueIntentSupersededError); await started.promise;
  const pendingCollection = deferred(); const collection = scenario.runtime.playCollection(() => pendingCollection.promise);
  await rejected; pendingCache.resolve(null);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.firstRecording);
  scenario.setCache(async () => null);
  pendingCollection.resolve({ tracks: [track(Fixture.thirdRecording)], selectedIndex: Fixture.firstIndex }); await collection;
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.thirdRecording); scenario.runtime.dispose();
});
test('end-of-queue continuation shares one request and atomically appends and selects', async () => {
  const scenario = await initialized(); const pending = deferred(); scenario.setSuggestions(() => pending.promise);
  await scenario.runtime.next(); await settleUntil(() => scenario.suggestionCalls === Fixture.singleCount);
  const nextAgain = scenario.runtime.next(); pending.resolve([track(Fixture.thirdRecording)]); await nextAgain;
  await settleUntil(() => scenario.snapshot().currentEntry !== null);
  assertion.equal(scenario.suggestionCalls, Fixture.singleCount);
  assertion.ok(scenario.operations.includes(RuntimeFixture.appendSelectName));
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.thirdRecording); scenario.runtime.dispose();
});
test('late suggestions cannot replace a newer manual selection', async () => {
  const scenario = await initialized(); const pending = deferred(); scenario.setSuggestions(() => pending.promise);
  await scenario.runtime.next(); await settleUntil(() => scenario.suggestionCalls === Fixture.singleCount);
  await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); pending.resolve([track(Fixture.thirdRecording)]);
  await scenario.runtime.next();
  assertion.equal(scenario.operations.filter(operation => operation === RuntimeFixture.appendSelectName).length, Fixture.initialCount);
  scenario.runtime.dispose();
});
test('repeat-one Next restarts the same occurrence without requesting suggestions', async () => {
  const scenario = await initialized(); const identifier = scenario.snapshot().currentEntry.entryIdentifier;
  await scenario.runtime.setRepeat(RepeatMode.One); await scenario.runtime.next();
  assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, identifier);
  assertion.equal(scenario.suggestionCalls, Fixture.initialCount); scenario.runtime.dispose();
});
test('unresolved listening HTTP work does not block Pause or a new track', async () => {
  const scenario = await initialized(); const pending = deferred(); scenario.setReporting(() => pending.promise);
  await scenario.runtime.pause(); await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording);
  pending.resolve(); scenario.runtime.dispose();
});
test('native queue replacement makes an ordinary edit fail rather than mutating a foreign queue', async () => {
  const scenario = await initialized(); scenario.replaceOutsideApplication(); await assertion.rejects(scenario.runtime.setRepeat(RepeatMode.One));
  assertion.equal(scenario.snapshot().repeatMode, RepeatMode.Off); scenario.runtime.dispose();
});
test('engine restart clears native state and restores credentials before further playback', async () => {
  const scenario = await initialized(); const credentialCount = scenario.credentials.length; scenario.restart();
  await settleUntil(() => scenario.credentials.length > credentialCount); await scenario.runtime.authentication.whenReady();
  await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording); scenario.runtime.dispose();
});

test('a canceled recommendation append is rejected after source preparation without changing the queue', async () => {
  const scenario = await initialized();
  const waiting = deferred(); const opened = deferred(); let wanted = true;
  scenario.setCache(async () => { opened.resolve(); await waiting.promise; return null; });
  const appending = scenario.runtime.append([track(Fixture.secondRecording)], () => wanted);
  await opened.promise; wanted = false; waiting.resolve();
  await assertion.rejects(appending, QueueIntentSupersededError);
  assertion.equal(scenario.runtime.views.getSnapshot().queueLength, Fixture.singleCount);
  scenario.runtime.dispose();
});

test('a committed recommendation append still reports its queue receipt after its own view changes', async () => {
  let committed = 0;
  const scenario = environment({ async prepare() { return { async committed() { committed++; } }; } });
  await scenario.login(); await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  const before = scenario.runtime.views.getSnapshot().queueLength;
  const receipts = committed;
  await scenario.runtime.append([track(Fixture.secondRecording)], () => scenario.runtime.views.getSnapshot().queueLength === before);
  assertion.equal(scenario.runtime.views.getSnapshot().queueLength, before + Fixture.singleCount);
  assertion.equal(committed, receipts + Fixture.singleCount);
  scenario.runtime.dispose();
});

for (const intent of [PlaybackIntent.Pause, PlaybackIntent.Stop]) {
  for (const direction of [RuntimeFixture.nextName, RuntimeFixture.previousName]) {
    test(`${direction} starts playback after ${intent}`, async () => {
      const scenario = environment();
      await scenario.login();
      await scenario.runtime.playTracks([track(Fixture.firstRecording), track(Fixture.secondRecording)],
        direction === RuntimeFixture.nextName ? Fixture.firstIndex : Fixture.secondIndex);
      if (intent === PlaybackIntent.Pause) await scenario.runtime.pause();
      else await scenario.runtime.stop();
      await scenario.runtime[direction]();
      assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Play);
      assertion.equal(scenario.snapshot().currentEntry.recordingIdentifier,
        direction === RuntimeFixture.nextName ? Fixture.secondRecording : Fixture.firstRecording);
      scenario.runtime.dispose();
    });
  }
}
test('a newer Pause supersedes Next during navigation preflight', async () => {
  const scenario = await initialized();
  await scenario.runtime.append([track(Fixture.secondRecording)]);
  await scenario.runtime.pause();
  const next = scenario.runtime.next();
  const rejected = assertion.rejects(next, QueueIntentSupersededError);
  await scenario.runtime.pause();
  await rejected;
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Pause);
  scenario.runtime.dispose();
});
test('Next from the paused final song continues the queue with playback enabled', async () => {
  const scenario = await initialized();
  await scenario.runtime.pause();
  await scenario.runtime.next();
  await settleUntil(() => scenario.snapshot().currentEntry?.recordingIdentifier === Fixture.thirdRecording);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Play);
  scenario.runtime.dispose();
});
test('a newer native Pause before the navigation receipt prevents automatic Play', async () => {
  const scenario = await initialized();
  await scenario.runtime.append([track(Fixture.secondRecording)]);
  await scenario.runtime.pause();
  const next = scenario.native.next;
  scenario.native.next = async context => {
    const receipt = await next(context);
    scenario.nativePause();
    return receipt;
  };
  await assertion.rejects(scenario.runtime.next(), QueueIntentSupersededError);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Pause);
  scenario.runtime.dispose();
});

test('Previous on the first paused song restarts playback without changing its occurrence', async () => {
  const scenario = await initialized();
  const identifier = scenario.snapshot().currentEntry.entryIdentifier;
  await scenario.runtime.pause();
  await scenario.runtime.previous();
  assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, identifier);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Play);
  scenario.runtime.dispose();
});
test('Repeat Song Next on a paused song resumes its existing occurrence', async () => {
  const scenario = await initialized();
  const identifier = scenario.snapshot().currentEntry.entryIdentifier;
  await scenario.runtime.setRepeat(RepeatMode.One);
  await scenario.runtime.pause();
  await scenario.runtime.next();
  assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, identifier);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Play);
  scenario.runtime.dispose();
});

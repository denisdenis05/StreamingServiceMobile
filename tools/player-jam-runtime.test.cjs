const test = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackQueueChangeKind } = require('../.build/audio-migration/PlaybackQueueChangeLifecycle');
const { QueueIntentSupersededError } = require('../.build/audio-migration/QueueIntentScheduler');
const { environment, Fixture, track, deferred, settleUntil } = require('./fixtures/playback-runtime.cjs');
const Policy = Object.freeze({ initial: 0, one: 1, externalAuthority: 'synthetic-following-authority' });
function lifecycle() {
  const state = { preparation: null, rejected: false, requests: [], commits: [] };
  return { state, async prepare(request) {
    state.requests.push(request); if (state.preparation) await state.preparation.promise;
    if (state.rejected) throw new QueueIntentSupersededError();
    return { async committed() { state.commits.push(request.kind); } };
  } };
}
test('Actual runtime waits for confirmed Jam mappings before assigning a replacement queue', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login(); changes.state.preparation = deferred();
  const playing = scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  await settleUntil(() => changes.state.requests.length === Policy.one);
  assertion.equal(scenario.snapshot().currentEntry, null); changes.state.preparation.resolve(); await playing;
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.firstRecording);
  assertion.deepEqual(changes.state.commits, [PlaybackQueueChangeKind.Replace]); scenario.runtime.dispose();
});
test('Actual runtime preserves the old queue when new Jam preparation is rejected', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex); changes.state.rejected = true;
  await assertion.rejects(scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex));
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.firstRecording);
  assertion.equal(changes.state.commits.length, Policy.one); scenario.runtime.dispose();
});
test('A later manual selection supersedes an old mapping request before native replacement', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login(); changes.state.preparation = deferred();
  const first = scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(first, QueueIntentSupersededError); await settleUntil(() => changes.state.requests.length === Policy.one);
  const old = changes.state.preparation; changes.state.preparation = null;
  await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); old.resolve(); await rejected;
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording);
  assertion.equal(changes.state.commits.length, Policy.one); scenario.runtime.dispose();
});
test('Loaded playlists use the same mapping barrier before replacing actual audio', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playCollection(async () => ({ tracks: [track(Fixture.firstRecording)], selectedIndex: Fixture.firstIndex }));
  assertion.equal(changes.state.requests[Policy.initial].tracks[Policy.initial].recordingIdentifier, Fixture.firstRecording);
  assertion.equal(changes.state.commits[Policy.initial], PlaybackQueueChangeKind.Replace); scenario.runtime.dispose();
});
test('Append and queue selection publish only after their real queue changes', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  await scenario.runtime.append([track(Fixture.secondRecording)]);
  const next = scenario.runtime.views.getSnapshot().queue.find(entry => entry.recordingIdentifier === Fixture.secondRecording);
  await scenario.runtime.select(next.entryIdentifier);
  assertion.deepEqual(changes.state.commits, [PlaybackQueueChangeKind.Replace, PlaybackQueueChangeKind.Append, PlaybackQueueChangeKind.Select]);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording); scenario.runtime.dispose();
});
test('Queue clearing reaches lifecycle retirement before native empty-state commit', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex); await scenario.runtime.clear();
  assertion.equal(changes.state.requests[Policy.one].kind, PlaybackQueueChangeKind.Clear);
  assertion.equal(scenario.snapshot().currentEntry, null); scenario.runtime.dispose();
});
test('A later remote-style Next prevents old prepared mappings from overriding the new occurrence', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording), track(Fixture.thirdRecording)], Fixture.firstIndex);
  changes.state.preparation = deferred(); const replacing = scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(replacing, QueueIntentSupersededError);
  await settleUntil(() => changes.state.requests.length > Policy.one); await scenario.runtime.next(); changes.state.preparation.resolve(); await rejected;
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.thirdRecording); scenario.runtime.dispose();
});

test('Explicit owner handoff accepts a cleared external queue before committing new app playback', async () => {
  let scenario;
  const changes = { async prepare(request) {
    if (scenario.snapshot().externalAuthorityIdentifier) {
      scenario.releaseExternalAuthority();
      await request.acknowledgeAuthorityRelease();
    }
    return { async committed() {} };
  } };
  scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  scenario.setExternalAuthority(Policy.externalAuthority);
  await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording);
  assertion.equal(scenario.snapshot().externalAuthorityIdentifier, null); scenario.runtime.dispose();
});
test('Owner handoff rejects a replacement queue created by another actor during authority cleanup', async () => {
  let scenario;
  const changes = { async prepare(request) {
    if (scenario.snapshot().externalAuthorityIdentifier) {
      scenario.setExternalAuthority(null);
      scenario.replaceOutsideApplication();
      await request.acknowledgeAuthorityRelease();
    }
    return { async committed() {} };
  } };
  scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  scenario.setExternalAuthority(Policy.externalAuthority);
  await assertion.rejects(scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex), QueueIntentSupersededError);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.firstRecording);
  scenario.runtime.dispose();
});
test('Authority release cannot rebase a newer player engine even when its queue is empty', async () => {
  let scenario;
  const changes = { async prepare(request) {
    if (scenario.snapshot().externalAuthorityIdentifier) {
      scenario.releaseExternalAuthority(); scenario.restart(); await request.acknowledgeAuthorityRelease();
    }
    return { async committed() {} };
  } };
  scenario = environment(changes); await scenario.login();
  scenario.setExternalAuthority(Policy.externalAuthority);
  await assertion.rejects(scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex), QueueIntentSupersededError);
  assertion.equal(scenario.snapshot().currentEntry, null); scenario.runtime.dispose();
});
test('Owned Available Jam accepts unchanged local authority before replacing an existing app queue', async () => {
  const changes = { async prepare(request) {
    await request.acknowledgeAuthorityRelease();
    return { async committed() {} };
  } };
  const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  await scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording);
  scenario.runtime.dispose();
});
test('Authority handoff rejects a native source that remains externally controlled', async () => {
  const changes = { async prepare(request) {
    await request.acknowledgeAuthorityRelease();
    return { async committed() {} };
  } };
  const scenario = environment(changes); await scenario.login(); scenario.setExternalAuthority(Policy.externalAuthority);
  await assertion.rejects(scenario.runtime.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex), QueueIntentSupersededError);
  assertion.equal(scenario.snapshot().currentEntry, null); scenario.runtime.dispose();
});

for (const collection of [false, true]) {
  test(`Actual ${collection ? 'collection' : 'track list'} replacement carries the selected recording after its album opener`, async () => {
    const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
    const tracks = [track(Fixture.firstRecording), track(Fixture.secondRecording)];
    if (collection) await scenario.runtime.playCollection(async () => ({ tracks, selectedIndex: Fixture.secondIndex }));
    else await scenario.runtime.playTracks(tracks, Fixture.secondIndex);
    assertion.equal(changes.state.requests[Policy.initial].selectedRecordingIdentifier, Fixture.secondRecording);
    assertion.equal(changes.state.requests[Policy.initial].tracks[Fixture.firstIndex].recordingIdentifier, Fixture.firstRecording);
    assertion.equal(scenario.runtime.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.secondRecording);
    scenario.runtime.dispose();
  });
}
test('Actual append carries no selected replacement recording for blocking preparation', async () => {
  const changes = lifecycle(); const scenario = environment(changes); await scenario.login();
  await scenario.runtime.playTracks([track(Fixture.firstRecording)], Fixture.firstIndex);
  await scenario.runtime.append([track(Fixture.secondRecording)]);
  assertion.equal(changes.state.requests[Policy.one].selectedRecordingIdentifier, undefined);
  scenario.runtime.dispose();
});

const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  urlFixture: './fixtures/spotify-url.cjs', controller: '../.build/spotify/SpotifyMobileController', playback: '../.build/spotify/SpotifyPlaybackCommandStore',
  recording: '../.build/spotify/SpotifyRecordingQueueStore' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const library = require(Modules.library);
require(Modules.urlFixture);
const { SpotifyMobileController } = require(Modules.controller);
const { SpotifyPlaybackCommandStore } = require(Modules.playback);
const { SpotifyRecordingQueueStore } = require(Modules.recording);
const Fixture = Object.freeze({ applicationAccount: 'application-account', replacementAccount: 'replacement-account',
  spotifyAccount: 'spotify-account', host: 'host-device', replacementHost: 'replacement-host', session: 'shared-session', track: '0123456789abcdefghijkl',
  token: 'temporary-token', requestPrefix: 'request-', zero: 0, one: 1, two: 2, flushTurns: 24,
  oldRequest: 'request-2', initialClockMilliseconds: 0, displayName: 'Listener' });
const Names = Object.freeze({ playback: 'Successful explicit verification clears playback uncertainty and permits a fresh intent',
  queue: 'Successful explicit verification permits a new queue request while preserving the original unknown receipt',
  refresh: 'Ordinary membership refresh leaves mobile playback uncertainty fenced',
  failure: 'Failed shared state verification preserves mobile playback uncertainty',
  cancellation: 'Canceled shared state verification preserves mobile playback uncertainty',
  replacement: 'Account replacement cancels verification and cannot complete recovery for new ownership',
  unavailable: 'A connection without shared state verification capability cannot start recovery',
  staleRuntime: 'A captured playback recovery cannot clear a replacement runtime uncertainty',
  staleFence: 'A captured playback recovery cannot clear a newer uncertainty on the same runtime',
  changedHost: 'Host replacement prevents a captured playback recovery from clearing the existing fence',
  busy: 'A repeated recovery press cannot start another verifier while the first is pending',
  disposed: 'Disposal cancels pending verification and prevents recovery completion',
  recording: 'Recording recovery clears only the captured unknown selection without resubmitting it',
  staleRecording: 'Recording recovery leaves replacement coordinators and selections unchanged' });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushTurns; turn += Fixture.one) await Promise.resolve(); }
function membership() { return { session: { identifier: Fixture.session, hostDeviceIdentifier: Fixture.host,
  ownedByCurrentAccount: true, active: true, participants: [] }, invitation: null }; }
function fixture(verificationAvailable = true) {
  let sequence = Fixture.zero;
  let account = { accountIdentifier: Fixture.applicationAccount, isLoggedIn: true };
  let runtime = null;
  let playbackStore;
  const listeners = new Set();
  const state = { unknown: true, verify: async () => undefined };
  const calls = { playback: Fixture.zero, queue: Fixture.zero, verification: [], completions: Fixture.zero };
  const controller = new SpotifyMobileController({ account: { getSnapshot: () => account,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
    clock: { nowMilliseconds: () => Fixture.initialClockMilliseconds },
    gateway: { inspect: async () => ({ accountIdentifier: Fixture.spotifyAccount, displayName: Fixture.displayName, serviceOrigin: null }),
      devices: async () => [] }, nextIdentifier: () => Fixture.requestPrefix + (sequence += Fixture.one),
    connect: identity => {
      const sessions = new library.JamSessionClient(undefined, true);
      sessions.attachAccount(identity.accountIdentifier, { createOrActivate: async () => membership(), end: async () => undefined,
        readCurrentAccount: async () => membership() },
      { addToQueue: async () => { calls.queue += Fixture.one; if (state.unknown) throw new library.IntegrationFailure(library.IntegrationFailureCode.UnknownOutcome); } },
      { execute: async () => { calls.playback += Fixture.one; if (state.unknown) throw new library.IntegrationFailure(library.IntegrationFailureCode.UnknownOutcome); } },
      verificationAvailable ? { verify: async (identity, cancellation) => { calls.verification.push({ identity, cancellation }); await state.verify(cancellation); } } : null);
      runtime = { sessions };
      return sessions;
    }, disconnect: () => { runtime?.sessions.detachAccount(); runtime = null; },
    prepareSharedStateRecovery: sessions => {
      const capturedRuntime = runtime;
      const completePlayback = playbackStore.prepareSharedStateRecovery(capturedRuntime);
      return () => { if (runtime !== capturedRuntime || runtime.sessions !== sessions) return;
        completePlayback(); calls.completions += Fixture.one; };
    },
  });
  playbackStore = new SpotifyPlaybackCommandStore({ getRuntime: () => runtime,
    subscribeConnection: controller.subscribe, nextIdentifier: () => Fixture.requestPrefix + (sequence += Fixture.one) });
  return { controller, playbackStore, state, calls, runtime: () => runtime,
    replaceAccount() { account = { accountIdentifier: Fixture.replacementAccount, isLoggedIn: true }; for (const listener of listeners) listener(); },
    dispose() { playbackStore.dispose(); controller.dispose(); } };
}
async function uncertainPlayback(current) {
  await current.controller.connect(Fixture.token);
  await current.playbackStore.execute(library.HostedPlaybackCommandKind.Next);
  assertion.equal(current.playbackStore.getSnapshot().uncertain, true);
}
test(Names.playback, async () => {
  const current = fixture(); await uncertainPlayback(current); current.state.unknown = false;
  assertion.equal(await current.controller.reconcileSharedState(), true);
  assertion.equal(current.playbackStore.getSnapshot().uncertain, false);
  assertion.equal(current.playbackStore.getSnapshot().failure, null);
  await current.playbackStore.execute(library.HostedPlaybackCommandKind.Play);
  assertion.equal(current.calls.playback, Fixture.two); current.dispose();
});
test(Names.queue, async () => {
  const current = fixture(); await current.controller.connect(Fixture.token);
  assertion.equal(await current.controller.addToQueue(Fixture.track), false);
  current.state.unknown = false; assertion.equal(await current.controller.reconcileSharedState(), true);
  const original = await current.runtime().sessions.addToQueue(Fixture.track, Fixture.oldRequest);
  assertion.equal(original.failure, library.IntegrationFailureCode.UnknownOutcome);
  assertion.equal(current.calls.queue, Fixture.one);
  assertion.equal(await current.controller.addToQueue(Fixture.track), true);
  assertion.equal(current.calls.queue, Fixture.two); current.dispose();
});
test(Names.refresh, async () => { const current = fixture(); await uncertainPlayback(current);
  await current.controller.refreshSession(); assertion.equal(current.playbackStore.getSnapshot().uncertain, true);
  assertion.equal(current.calls.verification.length, Fixture.zero); current.dispose(); });
for (const [name, failure] of [[Names.failure, library.IntegrationFailureCode.Network], [Names.cancellation, library.IntegrationFailureCode.Canceled]]) {
  test(name, async () => { const current = fixture(); await uncertainPlayback(current);
    current.state.verify = async () => { throw new library.IntegrationFailure(failure); };
    assertion.equal(await current.controller.reconcileSharedState(), false);
    assertion.equal(current.playbackStore.getSnapshot().uncertain, true);
    assertion.equal(current.calls.completions, Fixture.zero); current.dispose(); });
}
test(Names.replacement, async () => { const current = fixture(); await uncertainPlayback(current);
  const pending = deferred(); current.state.verify = () => pending.promise;
  const recovery = current.controller.reconcileSharedState(); await flush(); current.replaceAccount();
  assertion.equal(current.calls.verification[Fixture.zero].cancellation.aborted, true);
  await current.controller.connect(Fixture.token);
  await current.playbackStore.execute(library.HostedPlaybackCommandKind.Next);
  pending.resolve(); assertion.equal(await recovery, false);
  assertion.equal(current.playbackStore.getSnapshot().uncertain, true);
  assertion.equal(current.calls.completions, Fixture.zero); current.dispose(); });
test(Names.unavailable, async () => { const current = fixture(false); await current.controller.connect(Fixture.token);
  assertion.equal(current.controller.getSnapshot().canReconcileSharedState, false);
  assertion.equal(await current.controller.reconcileSharedState(), false);
  assertion.equal(current.calls.verification.length, Fixture.zero); current.dispose(); });
test(Names.staleRuntime, async () => { const current = fixture(); await uncertainPlayback(current);
  const complete = current.playbackStore.prepareSharedStateRecovery(current.runtime());
  await current.controller.connect(Fixture.token); await current.playbackStore.execute(library.HostedPlaybackCommandKind.Next);
  complete(); assertion.equal(current.playbackStore.getSnapshot().uncertain, true); current.dispose(); });
test(Names.staleFence, async () => { const current = fixture(); await uncertainPlayback(current);
  const oldCompletion = current.playbackStore.prepareSharedStateRecovery(current.runtime());
  await current.controller.reconcileSharedState();
  await current.playbackStore.execute(library.HostedPlaybackCommandKind.Next);
  oldCompletion(); assertion.equal(current.playbackStore.getSnapshot().uncertain, true); current.dispose(); });
function recordingFixture() {
  let current = null;
  const listeners = new Set();
  const store = new SpotifyRecordingQueueStore({ getCoordinator: () => current, nextIdentifier: () => Fixture.oldRequest,
    subscribeConnection: listener => { listeners.add(listener); return () => listeners.delete(listener); } });
  function coordinator() {
    let snapshot = { status: library.RecordingQueueStatus.Failed, failure: library.IntegrationFailureCode.UnknownOutcome };
    const observers = new Set(); const calls = { clear: Fixture.zero };
    return { calls, getSnapshot: () => snapshot, subscribe: listener => { observers.add(listener); return () => observers.delete(listener); },
      clear() { calls.clear += Fixture.one; snapshot = { status: library.RecordingQueueStatus.Idle, failure: null };
        for (const observer of observers) observer(); },
      replaceSelection() { snapshot = { ...snapshot }; for (const observer of observers) observer(); } };
  }
  return { store, coordinator, replace(value) { current = value; for (const listener of listeners) listener(); } };
}
test(Names.recording, () => { const current = recordingFixture(); const coordinator = current.coordinator(); current.replace(coordinator);
  current.store.prepareSharedStateRecovery(coordinator)(); assertion.equal(coordinator.calls.clear, Fixture.one);
  assertion.equal(current.store.getSnapshot().failure, null); current.store.dispose(); });
test(Names.staleRecording, () => { const current = recordingFixture(); const coordinator = current.coordinator(); current.replace(coordinator);
  const retiredSelection = current.store.prepareSharedStateRecovery(coordinator); coordinator.replaceSelection(); retiredSelection();
  assertion.equal(coordinator.calls.clear, Fixture.zero);
  const retiredCoordinator = current.store.prepareSharedStateRecovery(coordinator); const replacement = current.coordinator(); current.replace(replacement);
  retiredCoordinator(); assertion.equal(replacement.calls.clear, Fixture.zero); assertion.equal(coordinator.calls.clear, Fixture.zero); current.store.dispose(); });

test(Names.changedHost, async () => {
  const current = fixture(); await uncertainPlayback(current);
  const complete = current.playbackStore.prepareSharedStateRecovery(current.runtime());
  const sessions = current.runtime().sessions;
  const previousSnapshot = sessions.getSnapshot();
  sessions.getSnapshot = () => ({ ...previousSnapshot, session: { ...previousSnapshot.session, hostDeviceIdentifier: Fixture.replacementHost } });
  complete(); assertion.equal(current.playbackStore.getSnapshot().uncertain, true); current.dispose();
});
test(Names.busy, async () => {
  const current = fixture(); await uncertainPlayback(current); const pending = deferred();
  current.state.verify = () => pending.promise;
  const recovery = current.controller.reconcileSharedState(); await flush();
  assertion.equal(await current.controller.reconcileSharedState(), false);
  assertion.equal(current.calls.verification.length, Fixture.one);
  pending.resolve(); assertion.equal(await recovery, true); current.dispose();
});
test(Names.disposed, async () => {
  const current = fixture(); await uncertainPlayback(current); const pending = deferred();
  current.state.verify = () => pending.promise;
  const recovery = current.controller.reconcileSharedState(); await flush(); current.dispose();
  assertion.equal(current.calls.verification[Fixture.zero].cancellation.aborted, true);
  pending.resolve(); assertion.equal(await recovery, false); assertion.equal(current.calls.completions, Fixture.zero);
});

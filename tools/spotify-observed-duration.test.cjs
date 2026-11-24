const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', player: 'streaming-service-player',
  store: '../.build/spotify/SpotifyObservedRecordingStore', duration: '../.build/spotify/SpotifyObservedRecordingDuration' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { PlaybackState, PlaybackInterruption } = require(Modules.player);
const { SpotifyObservedRecordingStore } = require(Modules.store);
const { SpotifyObservedRecordingDuration } = require(Modules.duration);
const Fixture = Object.freeze({ scope: 'actual-account@actual-server', otherScope: 'another-account@actual-server',
  identifier: 'actual-current-recording', futureIdentifier: 'actual-future-recording', occurrence: 'actual-current-occurrence',
  otherOccurrence: 'another-occurrence', title: 'Real current title', artist: 'Real current artist', changedTitle: 'Updated real title',
  queue: 'actual-queue', engine: 'actual-engine', authentication: 'actual-authentication', replacement: 'replaced-identity',
  durationMilliseconds: 1001, otherDurationMilliseconds: 2002, revision: 1, otherRevision: 2, zero: 0, one: 1, two: 2,
  privateFailure: 'private-player-response', invalidDurationMilliseconds: -1, flushTurns: 20,
  names: Object.freeze({ actual: 'Actual native duration fills only missing current recording duration without changing its metadata',
    ready: 'Only actual ready paused playing or ended media can supply duration',
    missing: 'Missing unready nonpositive or unsafe native duration cannot enter observed metadata',
    mismatch: 'An unknown current recording cannot attach its duration to a known future recording',
    cursor: 'Changing current occurrence recording duration or ownership cursor rejects stale duration',
    scope: 'Account replacement or same-account logout during native sampling rejects old duration',
    metadata: 'Metadata replacement or a newer actual duration during sampling cannot be overwritten',
    errors: 'Native snapshot rejection does not leak errors or mutate observed recordings',
    existing: 'Existing actual recording duration is retained without another sample' }) });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushTurns; turn += Fixture.one) await Promise.resolve(); }
function track(overrides = {}) { return { recordingIdentifier: Fixture.identifier, title: Fixture.title, artist: Fixture.artist, ...overrides }; }
function snapshot(overrides = {}) { return { state: PlaybackState.Playing, interruption: PlaybackInterruption.None, error: null,
  currentEntry: { entryIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.identifier }, durationMilliseconds: Fixture.durationMilliseconds,
  cursor: { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication, queueIdentifier: Fixture.queue,
    queueRevision: Fixture.revision, queueContentRevision: Fixture.revision, playbackControlRevision: Fixture.revision, eventSequence: Fixture.revision }, ...overrides }; }
function fixture() {
  const state = { scope: Fixture.scope, snapshots: [snapshot(), snapshot()], requests: Fixture.zero, read: null };
  const store = new SpotifyObservedRecordingStore({ getScope: () => state.scope });
  store.remember([track(), track({ recordingIdentifier: Fixture.futureIdentifier })]);
  const duration = new SpotifyObservedRecordingDuration({ store, player: { async getSnapshot() {
    const position = state.requests; state.requests += Fixture.one;
    return state.read ? state.read(position) : state.snapshots[position];
  } } });
  return { state, store, duration };
}
function currentSong(current) { return current.store.read().find(song => song.identifier === Fixture.identifier); }
test(Fixture.names.actual, async () => {
  const current = fixture(); await current.duration.capture();
  assertion.deepEqual(currentSong(current), { identifier: Fixture.identifier, title: Fixture.title, author: Fixture.artist,
    durationMilliseconds: Fixture.durationMilliseconds });
  assertion.equal(current.store.read().find(song => song.identifier === Fixture.futureIdentifier).durationMilliseconds, undefined);
  assertion.equal(current.state.requests, Fixture.two);
});
test(Fixture.names.ready, async () => {
  for (const state of [PlaybackState.Playing, PlaybackState.Paused, PlaybackState.Ended]) {
    const current = fixture(); current.state.snapshots = [snapshot({ state }), snapshot({ state })]; await current.duration.capture();
    assertion.equal(currentSong(current).durationMilliseconds, Fixture.durationMilliseconds);
  }
});
test(Fixture.names.missing, async () => {
  for (const overrides of [{ currentEntry: null }, { state: PlaybackState.Buffering }, { state: PlaybackState.Resolving },
    { interruption: PlaybackInterruption.Focus }, { error: { message: Fixture.privateFailure } },
    ...[null, Fixture.zero, Fixture.invalidDurationMilliseconds, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE].map(durationMilliseconds => ({ durationMilliseconds }))]) {
    const current = fixture(); current.state.snapshots = [snapshot(overrides)]; await current.duration.capture();
    assertion.equal(currentSong(current).durationMilliseconds, undefined);
  }
});
test(Fixture.names.mismatch, async () => {
  const current = fixture(); current.state.snapshots = [snapshot({ currentEntry: { entryIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.replacement } })];
  await current.duration.capture(); assertion.equal(current.store.read().every(song => song.durationMilliseconds === undefined), true);
});
test(Fixture.names.cursor, async () => {
  for (const overrides of [
    { currentEntry: { entryIdentifier: Fixture.otherOccurrence, recordingIdentifier: Fixture.identifier } },
    { currentEntry: { entryIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.futureIdentifier } },
    { durationMilliseconds: Fixture.otherDurationMilliseconds },
    ...[EngineField, AuthenticationField, QueueField].map(field => ({ cursor: { ...snapshot().cursor, [field]: Fixture.replacement } })),
    ...[QueueRevisionField, ContentRevisionField, ControlRevisionField].map(field => ({ cursor: { ...snapshot().cursor, [field]: Fixture.otherRevision } })),
  ]) {
    const current = fixture(); current.state.snapshots[Fixture.one] = snapshot(overrides); await current.duration.capture();
    assertion.equal(currentSong(current).durationMilliseconds, undefined);
  }
});
test(Fixture.names.scope, async () => {
  for (const sameAccount of [false, true]) {
    const current = fixture(); const pending = deferred(); current.state.read = () => pending.promise;
    const capture = current.duration.capture(); await flush();
    current.state.scope = null; current.store.scopeChanged();
    current.state.scope = sameAccount ? Fixture.scope : Fixture.otherScope; current.store.scopeChanged(); current.store.remember([track()]);
    pending.resolve(snapshot()); await capture; assertion.equal(currentSong(current).durationMilliseconds, undefined);
  }
});
test(Fixture.names.metadata, async () => {
  for (const hasNewDuration of [false, true]) {
    const current = fixture(); const pending = deferred();
    current.state.read = position => position === Fixture.zero ? snapshot() : pending.promise;
    const capture = current.duration.capture(); await flush();
    current.store.remember([track({ title: Fixture.changedTitle,
      ...(hasNewDuration ? { durationMilliseconds: Fixture.otherDurationMilliseconds } : {}) })]);
    pending.resolve(snapshot()); await capture;
    assertion.equal(currentSong(current).title, Fixture.changedTitle);
    assertion.equal(currentSong(current).durationMilliseconds, hasNewDuration ? Fixture.otherDurationMilliseconds : undefined);
  }
});
test(Fixture.names.errors, async () => {
  const current = fixture(); current.state.read = () => { throw new Error(Fixture.privateFailure); };
  await assertion.doesNotReject(current.duration.capture()); assertion.equal(currentSong(current).durationMilliseconds, undefined);
});
test(Fixture.names.existing, async () => {
  const current = fixture(); current.store.remember([track({ durationMilliseconds: Fixture.otherDurationMilliseconds })]);
  await current.duration.capture(); assertion.equal(currentSong(current).durationMilliseconds, Fixture.otherDurationMilliseconds);
  assertion.equal(current.state.requests, Fixture.one);
});
const EngineField = 'engineEpoch';
const AuthenticationField = 'authenticationEpoch';
const QueueField = 'queueIdentifier';
const QueueRevisionField = 'queueRevision';
const ContentRevisionField = 'queueContentRevision';
const ControlRevisionField = 'playbackControlRevision';

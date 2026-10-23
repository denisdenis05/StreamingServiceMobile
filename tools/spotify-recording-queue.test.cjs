const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  store: '../.build/spotify/SpotifyRecordingQueueStore', selection: '../.build/spotify/SpotifySongSelection' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyRecordingQueueStore } = require(Imports.store);
const { spotifySongSelection } = require(Imports.selection);
const Fixture = Object.freeze({ recordingIdentifier: 'local-recording', accountIdentifier: 'app-account', title: 'Song', author: 'Performer',
  market: 'US', spotifyIdentifier: '0123456789abcdefghijkl', requestPrefix: 'queue-', initialCount: 0, increment: 1, singleCount: 1,
  firstPosition: 0, lastPosition: -1, requestPosition: 1, maximumSelection: 100, excessSelections: 101, emptyText: '' });
const Names = Object.freeze({ anonymous: 'Disconnected recording selection sends no catalog request',
  connected: 'Connected recording workflow projects its snapshot and receives selection input',
  replacement: 'Replacing a workflow aborts its caller signal and retires its observation',
  enqueue: 'Enqueue supplies exactly one unique command identifier and the current cancellation lifetime',
  disposal: 'Disposal releases all observations and prevents new queue work',
  selection: 'Song selections copy valid metadata and preserve app-account ownership',
  invalid: 'Song selections reject malformed records and deduplicate recording identities',
  bounded: 'Song selection limits navigation payloads to a bounded number of records' });
function snapshot() { return { status: library.RecordingQueueStatus.Idle, recordingIdentifier: null,
  market: null, match: null, acceptedSpotifyIdentifier: null, failure: null }; }
function workflow() {
  const listeners = new Set(); const calls = []; let state = snapshot();
  return { calls, listeners, getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    prepare: async (...parameters) => { calls.push(parameters); }, enqueue: async (...parameters) => { calls.push(parameters); return true; },
    clear() { state = snapshot(); for (const listener of [...listeners]) listener(); },
    publish(next) { state = next; for (const listener of [...listeners]) listener(); } };
}
function fixture() {
  const listeners = new Set(); let current = null; let sequence = Fixture.initialCount;
  const store = new SpotifyRecordingQueueStore({ getCoordinator: () => current,
    subscribeConnection(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    nextIdentifier: () => { sequence += Fixture.increment; return Fixture.requestPrefix + sequence; } });
  return { store, listeners, change(next) { current = next; for (const listener of [...listeners]) listener(); } };
}
test(Names.anonymous, async () => { const current = fixture(); await current.store.prepare(Fixture.recordingIdentifier, Fixture.market);
  assertion.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized); assertion.equal(await current.store.enqueue(Fixture.spotifyIdentifier), false); current.store.dispose(); });
test(Names.connected, async () => { const current = fixture(); const coordinator = workflow(); current.change(coordinator);
  await current.store.prepare(Fixture.recordingIdentifier, Fixture.market);
  assertion.equal(coordinator.calls[Fixture.firstPosition][Fixture.firstPosition], Fixture.recordingIdentifier);
  const next = { ...snapshot(), status: library.RecordingQueueStatus.Matching }; coordinator.publish(next);
  assertion.equal(current.store.getSnapshot(), next); current.store.dispose(); });
test(Names.replacement, async () => { const current = fixture(); const previous = workflow(); current.change(previous);
  await current.store.prepare(Fixture.recordingIdentifier, Fixture.market); const previousSignal = previous.calls[Fixture.firstPosition].at(Fixture.lastPosition);
  const next = workflow(); current.change(next); assertion.equal(previousSignal.aborted, true); assertion.equal(previous.listeners.size, Fixture.initialCount);
  previous.publish({ ...snapshot(), status: library.RecordingQueueStatus.Accepted }); assertion.equal(current.store.getSnapshot().status, library.RecordingQueueStatus.Idle); current.store.dispose(); });
test(Names.enqueue, async () => { const current = fixture(); const coordinator = workflow(); current.change(coordinator);
  assertion.equal(await current.store.enqueue(Fixture.spotifyIdentifier), true); assertion.equal(coordinator.calls.length, Fixture.singleCount);
  assertion.equal(coordinator.calls[Fixture.firstPosition][Fixture.requestPosition], Fixture.requestPrefix + Fixture.singleCount); current.store.dispose(); });
test(Names.disposal, async () => { const current = fixture(); const coordinator = workflow(); current.change(coordinator); current.store.dispose();
  await current.store.prepare(Fixture.recordingIdentifier, Fixture.market); assertion.equal(await current.store.enqueue(Fixture.spotifyIdentifier), false);
  assertion.equal(current.listeners.size, Fixture.initialCount); assertion.equal(coordinator.listeners.size, Fixture.initialCount); assertion.equal(coordinator.calls.length, Fixture.initialCount); });
test(Names.selection, () => { const source = { id: Fixture.recordingIdentifier, title: Fixture.title, artistName: Fixture.author };
  const selection = spotifySongSelection([source], Fixture.accountIdentifier); source.title = Fixture.emptyText;
  assertion.equal(selection.recordings[Fixture.firstPosition].title, Fixture.title); assertion.equal(selection.applicationAccountIdentifier, Fixture.accountIdentifier);
  assertion.ok(Object.isFrozen(selection.recordings[Fixture.firstPosition])); });
test(Names.invalid, () => { const source = { id: Fixture.recordingIdentifier, title: Fixture.title, artistName: Fixture.author };
  const selection = spotifySongSelection([null, {}, { ...source, id: Fixture.emptyText }, source, source], Fixture.accountIdentifier);
  assertion.equal(selection.recordings.length, Fixture.singleCount); assertion.equal(spotifySongSelection(null, null).recordings.length, Fixture.initialCount); });
test(Names.bounded, () => { const songs = Array.from({ length: Fixture.excessSelections }, (value, position) => ({ id: Fixture.recordingIdentifier + position, title: Fixture.title, artistName: Fixture.author }));
  assertion.equal(spotifySongSelection(songs, Fixture.accountIdentifier).recordings.length, Fixture.maximumSelection); });

const RouteFixture = Object.freeze({ name: 'Navigation payloads validate recording metadata and account identity before use',
  malformed: 'Untrusted navigation payloads cannot fabricate a selectable recording' });
const { spotifyRouteSongSelection } = require(Imports.selection);
test(RouteFixture.name, () => { const original = spotifySongSelection([{ id: Fixture.recordingIdentifier, title: Fixture.title, artistName: Fixture.author }], Fixture.accountIdentifier);
  const copied = spotifyRouteSongSelection(original); assertion.deepEqual(copied, original); assertion.notEqual(copied, original); });
test(RouteFixture.malformed, () => { assertion.equal(spotifyRouteSongSelection(null), null);
  assertion.equal(spotifyRouteSongSelection({ recordings: [] }), null);
  assertion.equal(spotifyRouteSongSelection({ applicationAccountIdentifier: Fixture.accountIdentifier, recordings: {} }), null);
  assertion.equal(spotifyRouteSongSelection({ applicationAccountIdentifier: Fixture.accountIdentifier, recordings: [null, {}] }).recordings.length, Fixture.initialCount); });

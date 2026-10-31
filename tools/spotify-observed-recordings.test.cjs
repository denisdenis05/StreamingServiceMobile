const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', store: '../.build/spotify/SpotifyObservedRecordingStore' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { SpotifyObservedRecordingStore, SpotifyObservedRecordingPolicy } = require(Modules.store);
const Fixture = Object.freeze({ scope: 'account-one@server-one', otherScope: 'account-two@server-one', otherServer: 'account-one@server-two',
  identifier: 'observed-recording', secondIdentifier: 'second-recording', thirdIdentifier: 'third-recording', title: 'Observed title',
  artist: 'Observed artist', changedTitle: 'Updated observed title', privateAddress: 'https://private.example/media?token=private',
  privateToken: 'private-authentication-token', privateField: 'accessToken', durationSeconds: 123, durationMilliseconds: 123000,
  zero: 0, one: 1, two: 2, invalidDurationSeconds: -1, invalidCapacity: 2002, invalidText: '', invalidControlText: 'invalid\ntext',
  names: Object.freeze({ real: 'Observed recordings copy only real metadata and freeze returned records',
    missing: 'Incomplete recordings never acquire fabricated identity title or artist',
    duration: 'Only real finite positive exact durations enter catalog metadata',
    scope: 'Account and server changes clear observed recordings and reject stale captured work',
    logout: 'Observed logout clears immediately and a same-account login rejects prelogout work',
    capture: 'Remember rejects forged scope tokens and reentrant scope replacement during metadata capture',
    bounds: 'Observed recording storage has a strict bounded capacity and replacement keeps freshest metadata',
    configuration: 'Invalid cache capacity cannot bypass the production bound',
    privacy: 'Throwing metadata and scope providers do not expose private details',
    observation: 'Scope observation returns the platform unsubscribe and does not mutate playback' }) });
function track(overrides = {}) { return { recordingIdentifier: Fixture.identifier, title: Fixture.title, artist: Fixture.artist,
  durationSeconds: Fixture.durationSeconds, ...overrides }; }
function fixture(maximumRecordings) {
  const state = { scope: Fixture.scope, listener: null, stopped: false };
  const store = new SpotifyObservedRecordingStore({ getScope: () => state.scope,
    ...(maximumRecordings === undefined ? {} : { maximumRecordings }) });
  return { state, store };
}
test(Fixture.names.real, () => {
  const current = fixture(); const input = track({ mediaAddress: Fixture.privateAddress, accessToken: Fixture.privateToken });
  current.store.remember([input]); input.title = Fixture.changedTitle;
  const songs = current.store.read();
  assertion.deepEqual(songs, [{ identifier: Fixture.identifier, title: Fixture.title, author: Fixture.artist, durationMilliseconds: Fixture.durationMilliseconds }]);
  assertion.ok(Object.isFrozen(songs)); assertion.ok(Object.isFrozen(songs[Fixture.zero]));
  assertion.equal(JSON.stringify(songs).includes(Fixture.privateToken), false);
  assertion.equal(JSON.stringify(songs).includes(Fixture.privateAddress), false);
});
test(Fixture.names.missing, () => {
  const current = fixture();
  for (const property of Object.keys(track())) {
    if (property === DurationField) continue;
    const incomplete = track(); delete incomplete[property]; current.store.remember([incomplete]);
  }
  for (const invalid of [Fixture.invalidText, Fixture.invalidControlText]) current.store.remember([track({ title: invalid }), track({ artist: invalid }), track({ recordingIdentifier: invalid })]);
  assertion.deepEqual(current.store.read(), []);
});
test(Fixture.names.duration, () => {
  const current = fixture();
  for (const durationSeconds of [undefined, Fixture.zero, Fixture.invalidDurationSeconds, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
    current.store.remember([track({ durationSeconds })]);
    assertion.equal(Object.hasOwn(current.store.read()[Fixture.zero], DurationMillisecondsField), false);
  }
  current.store.remember([track()]); assertion.equal(current.store.read()[Fixture.zero].durationMilliseconds, Fixture.durationMilliseconds);
});
test(Fixture.names.scope, () => {
  const current = fixture(); const captured = current.store.captureScope(); current.store.remember([track()], captured);
  current.state.scope = Fixture.otherScope; assertion.deepEqual(current.store.read(), []);
  current.store.remember([track()], captured); assertion.deepEqual(current.store.read(), []);
  current.store.remember([track()]); current.state.scope = Fixture.otherServer; current.store.scopeChanged();
  assertion.deepEqual(current.store.read(), []);
});
test(Fixture.names.logout, () => {
  const current = fixture(); const captured = current.store.captureScope(); current.store.remember([track()], captured);
  const stop = current.store.observeScope(listener => { current.state.listener = listener; return () => { current.state.stopped = true; }; });
  current.state.scope = null; current.state.listener(); assertion.deepEqual(current.store.read(), []);
  current.state.scope = Fixture.scope; current.state.listener(); current.store.remember([track()], captured);
  assertion.deepEqual(current.store.read(), []); current.store.remember([track()]); assertion.equal(current.store.read().length, Fixture.one);
  stop(); assertion.equal(current.state.stopped, true);
});
test(Fixture.names.capture, () => {
  const current = fixture(); const captured = current.store.captureScope(); current.store.remember([track()], { ...captured });
  assertion.deepEqual(current.store.read(), []);
  const input = track(); Object.defineProperty(input, TitleField, { get() { current.state.scope = Fixture.otherScope; return Fixture.title; } });
  current.store.remember([input], captured); assertion.deepEqual(current.store.read(), []);
});
test(Fixture.names.bounds, () => {
  const current = fixture(Fixture.two);
  current.store.remember([track(), track({ recordingIdentifier: Fixture.secondIdentifier })]);
  current.store.remember([track({ recordingIdentifier: Fixture.thirdIdentifier })]);
  assertion.deepEqual(current.store.read().map(song => song.identifier), [Fixture.secondIdentifier, Fixture.thirdIdentifier]);
  current.store.remember([track({ recordingIdentifier: Fixture.secondIdentifier, title: Fixture.changedTitle })]);
  assertion.equal(current.store.read().at(-Fixture.one).title, Fixture.changedTitle);
  const bounded = fixture();
  bounded.store.remember(Array.from({ length: SpotifyObservedRecordingPolicy.maximumRecordings + Fixture.one }, (unused, position) => track({ recordingIdentifier: Fixture.identifier + position })));
  assertion.equal(bounded.store.read().length, SpotifyObservedRecordingPolicy.maximumRecordings);
});
test(Fixture.names.configuration, () => {
  for (const maximumRecordings of [Fixture.zero, Fixture.invalidDurationSeconds, Fixture.invalidCapacity, Number.NaN]) assertion.throws(() => fixture(maximumRecordings), RangeError);
});
test(Fixture.names.privacy, () => {
  const current = fixture(); const input = track();
  Object.defineProperty(input, TitleField, { get() { throw new Error(Fixture.privateToken); } });
  assertion.doesNotThrow(() => current.store.remember([input])); assertion.deepEqual(current.store.read(), []);
  const unavailable = new SpotifyObservedRecordingStore({ getScope() { throw new Error(Fixture.privateToken); } });
  assertion.doesNotThrow(() => unavailable.remember([track()])); assertion.deepEqual(unavailable.read(), []);
});
test(Fixture.names.observation, () => {
  const current = fixture(); let observed = null;
  const stop = current.store.observeScope(listener => { observed = listener; return () => { observed = null; }; });
  assertion.equal(typeof observed, FunctionType); stop(); assertion.equal(observed, null);
});
const TitleField = 'title';
const DurationField = 'durationSeconds';
const DurationMillisecondsField = 'durationMilliseconds';
const FunctionType = 'function';

const test = require('node:test');
const assertion = require('node:assert/strict');
const { IntegrationFailureCode, QueueSide } = require('streaming-service-spotify-jam');
const { SpotifyControllableQueuePort } = require('../.build/spotify/SpotifyControllableQueuePort');
const Fixture = Object.freeze({ account: 'synthetic-account-scope', replacementAccount: 'synthetic-account-replacement',
  scope: 'synthetic-native-scope', revision: 'synthetic-native-cursor', changedRevision: 'synthetic-changed-cursor',
  occurrence: 'synthetic-occurrence', otherOccurrence: 'synthetic-other-occurrence', recording: 'synthetic-recording',
  spotify: 'synthetic-spotify-track', operation: 'synthetic-operation', otherOperation: 'synthetic-other-operation',
  malformed: '{', initial: 0, single: 1, second: 2 });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
function fixture(side = QueueSide.Local) {
  const snapshot = { scopeIdentifier: Fixture.scope, revision: Fixture.revision,
    currentOccurrenceIdentifier: Fixture.occurrence, entries: [
      { occurrenceIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.recording, spotifyIdentifier: Fixture.spotify },
      { occurrenceIdentifier: Fixture.otherOccurrence, recordingIdentifier: Fixture.recording, spotifyIdentifier: Fixture.spotify },
    ], lastOperationIdentifier: null, complete: true };
  const state = { scope: Fixture.account, snapshot, read: null, apply: null, response: null };
  const calls = { reads: [], writes: [] };
  const port = new SpotifyControllableQueuePort({ side, getScope: () => state.scope,
    native: {
      async getHostingQueue(requestedSide) { calls.reads.push(requestedSide); if (state.read) await state.read.promise;
        return state.response ?? JSON.stringify(state.snapshot); },
      async applyHostingQueue(requestedSide, serialized) { calls.writes.push({ side: requestedSide, change: JSON.parse(serialized) });
        if (state.apply) return state.apply.promise;
        return JSON.stringify({ ...state.snapshot, revision: Fixture.changedRevision, lastOperationIdentifier: Fixture.operation }); },
    } });
  const change = { expectedScopeIdentifier: Fixture.scope, expectedRevision: Fixture.revision,
    operationIdentifier: Fixture.operation, entries: snapshot.entries.map(entry => ({ ...entry })),
    currentOccurrenceIdentifier: Fixture.occurrence };
  return { port, state, calls, change, cancellation: new AbortController() };
}
for (const side of [QueueSide.Local, QueueSide.Spotify]) {
  test(`Controllable ${side} queue reads actual native occurrences including repeated recordings`, async () => {
    const current = fixture(side); const snapshot = await current.port.read(current.cancellation.signal);
    assertion.deepEqual(current.calls.reads, [side]);
    assertion.equal(snapshot.entries.length, Fixture.second);
    assertion.equal(snapshot.entries[Fixture.single].occurrenceIdentifier, Fixture.otherOccurrence);
    assertion.equal(Object.isFrozen(snapshot.entries), true);
  });
  test(`Controllable ${side} queue forwards a scoped compare-and-set command and accepts actual receipt`, async () => {
    const current = fixture(side); const receipt = await current.port.apply(current.change, current.cancellation.signal);
    assertion.equal(current.calls.writes.length, Fixture.single);
    assertion.equal(current.calls.writes[Fixture.initial].side, side);
    assertion.deepEqual(current.calls.writes[Fixture.initial].change, current.change);
    assertion.equal(receipt.revision, Fixture.changedRevision);
    assertion.equal(receipt.lastOperationIdentifier, Fixture.operation);
  });
}
test('A stale queue revision never submits a native write', async () => {
  const current = fixture(); current.state.snapshot.revision = Fixture.changedRevision;
  await assertion.rejects(current.port.apply(current.change, current.cancellation.signal), { code: IntegrationFailureCode.Superseded });
  assertion.equal(current.calls.writes.length, Fixture.initial);
});
test('A foreign native queue scope never submits a native write', async () => {
  const current = fixture(); current.change.expectedScopeIdentifier = Fixture.replacementAccount;
  await assertion.rejects(current.port.apply(current.change, current.cancellation.signal), { code: IntegrationFailureCode.Superseded });
  assertion.equal(current.calls.writes.length, Fixture.initial);
});
test('Cancellation before a queue read does not access native playback', async () => {
  const current = fixture(); current.cancellation.abort();
  await assertion.rejects(current.port.read(current.cancellation.signal), { code: IntegrationFailureCode.Canceled });
  assertion.equal(current.calls.reads.length, Fixture.initial);
});
test('A canceled pending native queue read cannot acknowledge stale playback', async () => {
  const current = fixture(); current.state.read = deferred();
  const pending = current.port.read(current.cancellation.signal); current.cancellation.abort(); current.state.read.resolve();
  await assertion.rejects(pending, { code: IntegrationFailureCode.Canceled });
});
test('Account replacement during a native queue read retires the response', async () => {
  const current = fixture(); current.state.read = deferred();
  const pending = current.port.read(current.cancellation.signal); current.state.scope = Fixture.replacementAccount; current.state.read.resolve();
  await assertion.rejects(pending, { code: IntegrationFailureCode.Superseded });
});
test('Account replacement after a queue write never acknowledges into a new account', async () => {
  const current = fixture(); current.state.apply = deferred();
  const pending = current.port.apply(current.change, current.cancellation.signal);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  current.state.scope = Fixture.replacementAccount;
  current.state.apply.resolve(JSON.stringify({ ...current.state.snapshot, lastOperationIdentifier: Fixture.operation }));
  await assertion.rejects(pending, { code: IntegrationFailureCode.Superseded });
});
test('A malformed native response cannot expose any unvalidated queue', async () => {
  const current = fixture(); current.state.response = Fixture.malformed;
  await assertion.rejects(current.port.read(current.cancellation.signal), { code: IntegrationFailureCode.InvalidResponse });
});
test('Missing current occurrence and duplicate occurrence identities reject native snapshots', async () => {
  const missing = fixture(); missing.state.snapshot.currentOccurrenceIdentifier = Fixture.operation;
  await assertion.rejects(missing.port.read(missing.cancellation.signal), { code: IntegrationFailureCode.InvalidResponse });
  const duplicate = fixture(); duplicate.state.snapshot.entries[Fixture.single].occurrenceIdentifier = Fixture.occurrence;
  await assertion.rejects(duplicate.port.read(duplicate.cancellation.signal), { code: IntegrationFailureCode.InvalidResponse });
});
test('A partial native queue retains its explicit incomplete marker', async () => {
  const current = fixture(); current.state.snapshot.complete = false;
  assertion.equal((await current.port.read(current.cancellation.signal)).complete, false);
});
test('A write receipt from a different operation cannot become an acknowledgement', async () => {
  const current = fixture(); current.state.apply = deferred();
  const pending = current.port.apply(current.change, current.cancellation.signal);
  current.state.apply.resolve(JSON.stringify({ ...current.state.snapshot, lastOperationIdentifier: Fixture.otherOperation }));
  await assertion.rejects(pending, { code: IntegrationFailureCode.InvalidResponse });
});
test('An invalid candidate queue cannot reach native playback', async () => {
  const current = fixture(); current.change.entries[Fixture.single].recordingIdentifier = null;
  current.change.entries[Fixture.single].spotifyIdentifier = null;
  await assertion.rejects(current.port.apply(current.change, current.cancellation.signal), { code: IntegrationFailureCode.InvalidResponse });
  assertion.equal(current.calls.writes.length, Fixture.initial);
});
test('Mutable caller input is captured before the pending native revision check', async () => {
  const current = fixture(); current.state.read = deferred();
  const pending = current.port.apply(current.change, current.cancellation.signal);
  current.change.entries[Fixture.initial].recordingIdentifier = Fixture.operation;
  current.state.read.resolve(); await pending;
  assertion.equal(current.calls.writes[Fixture.initial].change.entries[Fixture.initial].recordingIdentifier, Fixture.recording);
});

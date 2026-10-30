const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  probe: './validate-spotify-native-search.cjs' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { IntegrationFailure, IntegrationFailureCode } = require(Modules.library);
const { validateNativeSearch } = require(Modules.probe);
const Fixture = Object.freeze({ handle: 1, generation: 3, otherGeneration: 4, track: '4uLU6hMCjMI75M1A2tKUQC',
  title: 'Synthetic private title', artist: 'Synthetic private artist', durationMilliseconds: 180000, emptyCount: 0, singleCount: 1,
  trackPrefix: 'spotify:track:', read: 'read', metadata: 'metadata', search: 'search',
  names: { summary: 'Live search diagnostics validate actual metadata and search without outputting private song data',
    failure: 'Live search diagnostics preserve safe backpressure failures without retrying or mutating',
    malformed: 'Live search diagnostics reject foreign generations and malformed metadata before claiming success' } });
function fixture() {
  const calls = [];
  const state = { failure: null, generation: Fixture.generation, metadata: null };
  const tracks = [{ spotifyTrackIdentifier: Fixture.track, title: Fixture.title, artistNames: [Fixture.artist],
    recordingCodes: [], durationMilliseconds: Fixture.durationMilliseconds }];
  return { calls, state, async request(input) {
    calls.push(input);
    if (input.operation === Fixture.read) return { handle: Fixture.handle, generation: Fixture.generation,
      reading: { cluster: { playback: { track: { uri: Fixture.trackPrefix + Fixture.track } } } } };
    if (input.operation === Fixture.search && state.failure) throw new IntegrationFailure(state.failure);
    return { handle: Fixture.handle, generation: input.operation === Fixture.search ? state.generation : Fixture.generation,
      tracks: input.operation === Fixture.metadata && state.metadata ? state.metadata : tracks };
  } };
}
test(Fixture.names.summary, async () => {
  const current = fixture(); const summary = await validateNativeSearch(current.request);
  assertion.equal(summary.searchValidated, true); assertion.equal(summary.metadataValidated, true);
  assertion.equal(summary.resultCount, Fixture.singleCount); assertion.equal(summary.includesSourceTrack, true);
  const output = JSON.stringify(summary);
  for (const privateValue of [Fixture.track, Fixture.title, Fixture.artist]) assertion.equal(output.includes(privateValue), false);
  assertion.deepEqual(current.calls.map(call => call.operation), [Fixture.read, Fixture.metadata, Fixture.search]);
});
test(Fixture.names.failure, async () => {
  const current = fixture(); current.state.failure = IntegrationFailureCode.Backpressure;
  const summary = await validateNativeSearch(current.request);
  assertion.equal(summary.failure, IntegrationFailureCode.Backpressure); assertion.equal(summary.operation, Fixture.search);
  assertion.equal(current.calls.filter(call => call.operation === Fixture.search).length, Fixture.singleCount);
});
test(Fixture.names.malformed, async () => {
  const stale = fixture(); stale.state.generation = Fixture.otherGeneration;
  assertion.equal((await validateNativeSearch(stale.request)).failure, IntegrationFailureCode.InvalidResponse);
  const missing = fixture(); missing.state.metadata = [];
  assertion.equal((await validateNativeSearch(missing.request)).failure, IntegrationFailureCode.InvalidResponse);
  assertion.equal(missing.calls.filter(call => call.operation === Fixture.search).length, Fixture.emptyCount);
});

const test = require('node:test');
const assertion = require('node:assert/strict');
const { IntegrationFailure, IntegrationFailureCode } = require('streaming-service-spotify-jam');
const { spotifyRecordingRequestFailure, spotifyRecordingHttpStatus, SpotifyRecordingRequestPolicy } = require('../.build/spotify/SpotifyRecordingRequestFailure');
const Fixture = Object.freeze({ serverFailure: 503, fractionalStatus: 404.5, invalidStatus: 999, privateText: 'synthetic-private-request' });
const Cases = new Map([[SpotifyRecordingRequestPolicy.unauthorized, IntegrationFailureCode.Unauthorized],
  [SpotifyRecordingRequestPolicy.forbidden, IntegrationFailureCode.Forbidden],
  [SpotifyRecordingRequestPolicy.notFound, IntegrationFailureCode.NotFound],
  [SpotifyRecordingRequestPolicy.deadline, IntegrationFailureCode.Deadline],
  [SpotifyRecordingRequestPolicy.rateLimited, IntegrationFailureCode.RateLimited],
  [Fixture.serverFailure, IntegrationFailureCode.Network]]);
for (const [status, code] of Cases) test(`Recording HTTP status ${status} retains its safe failure category without copying response data`, () => {
  const failure = { response: { status, data: Fixture.privateText }, message: Fixture.privateText };
  const result = spotifyRecordingRequestFailure(failure, new AbortController().signal);
  assertion.equal(result.code, code);
  assertion.equal(JSON.stringify(result).includes(Fixture.privateText), false);
});
test('A canceled recording request never looks like a missing endpoint or triggers compatibility work', () => {
  const cancellation = new AbortController(); cancellation.abort();
  assertion.equal(spotifyRecordingRequestFailure({ response: { status: SpotifyRecordingRequestPolicy.notFound } }, cancellation.signal).code,
    IntegrationFailureCode.Canceled);
});
test('Known integration failures retain identity and scope retirement without copying unknown fields', () => {
  const failure = new IntegrationFailure(IntegrationFailureCode.Superseded);
  assertion.equal(spotifyRecordingRequestFailure(failure, new AbortController().signal), failure);
});
test('Untrusted status and throwing getters cannot supply a request status or private failure text', () => {
  const getter = { get response() { throw new Error(Fixture.privateText); } };
  for (const failure of [getter, { response: { status: Fixture.fractionalStatus } }, { response: { status: Fixture.invalidStatus } }, null]) {
    assertion.equal(spotifyRecordingHttpStatus(failure), null);
    assertion.equal(spotifyRecordingRequestFailure(failure, new AbortController().signal).code, IntegrationFailureCode.Network);
  }
});

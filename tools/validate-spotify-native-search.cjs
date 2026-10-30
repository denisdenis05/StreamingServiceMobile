const Modules = Object.freeze({ network: 'node:net', library: 'streaming-service-spotify-jam' });
const network = require(Modules.network);
const { IntegrationFailure, IntegrationFailureCode, copySpotifyConnectMetadataIdentifiers,
  decodeSpotifyConnectMetadata, copySpotifyConnectSearch, decodeSpotifyConnectSearch } = require(Modules.library);
const Policy = Object.freeze({ socketPath: 'build/spotify-jam/connect-probe.sock', timeoutMilliseconds: 25000,
  maximumResponseCharacters: 2097152, lineSeparator: '\n', firstPosition: 0, singleResult: 1, emptyCount: 0,
  firstIdentity: 1, market: 'RO', limit: 10, trackPrefix: 'spotify:track:', stringType: 'string',
  encoding: 'utf8', errorEvent: 'error', connectEvent: 'connect', dataEvent: 'data',
  stage: 'native-catalog-search', read: 'read', metadata: 'metadata', search: 'search' });
const Failures = new Set(Object.values(IntegrationFailureCode));
function failureCode(failure) { return Failures.has(failure?.code) ? failure.code : IntegrationFailureCode.Network; }
function request(value) {
  return new Promise((resolve, reject) => {
    let received = '';
    const socket = network.createConnection(Policy.socketPath);
    const fail = code => { socket.destroy(); reject(new IntegrationFailure(code)); };
    socket.setEncoding(Policy.encoding);
    socket.setTimeout(Policy.timeoutMilliseconds, () => fail(IntegrationFailureCode.Deadline));
    socket.on(Policy.errorEvent, () => fail(IntegrationFailureCode.Network));
    socket.on(Policy.connectEvent, () => socket.write(JSON.stringify(value) + Policy.lineSeparator));
    socket.on(Policy.dataEvent, chunk => {
      received += chunk;
      if (received.length > Policy.maximumResponseCharacters) { fail(IntegrationFailureCode.InvalidResponse); return; }
      const ending = received.indexOf(Policy.lineSeparator);
      if (ending < Policy.firstPosition) return;
      socket.destroy();
      try {
        const response = JSON.parse(received.slice(Policy.firstPosition, ending));
        if (response.failure) { fail(Failures.has(response.failure) ? response.failure : IntegrationFailureCode.Network); return; }
        resolve(response);
      } catch { fail(IntegrationFailureCode.InvalidResponse); }
    });
  });
}
function identity(value) {
  if (![value.handle, value.generation].every(selected => Number.isSafeInteger(selected) && selected >= Policy.firstIdentity)) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  }
}
async function validateNativeSearch(requestOperation) {
  let operation = Policy.read;
  try {
    const observed = await requestOperation({ operation }); identity(observed);
    const address = observed.reading?.cluster?.playback?.track?.uri;
    if (typeof address !== Policy.stringType || !address.startsWith(Policy.trackPrefix)) throw new IntegrationFailure(IntegrationFailureCode.NotFound);
    const identifiers = copySpotifyConnectMetadataIdentifiers([address.slice(Policy.trackPrefix.length)]);
    operation = Policy.metadata;
    const metadata = await requestOperation({ operation, identifiers });
    const songs = decodeSpotifyConnectMetadata(metadata, observed.handle, observed.generation, identifiers);
    const song = songs[Policy.firstPosition];
    if (!song) throw new IntegrationFailure(IntegrationFailureCode.NotFound);
    operation = Policy.search;
    const input = copySpotifyConnectSearch({ title: song.title, author: song.author, limit: Policy.limit }, Policy.market);
    const response = await requestOperation({ operation, input });
    const matches = decodeSpotifyConnectSearch(response, observed.handle, observed.generation, input.limit);
    return Object.freeze({ stage: Policy.stage, generation: observed.generation, metadataValidated: songs.length === Policy.singleResult,
      searchValidated: true, resultCount: matches.length, includesSourceTrack: matches.some(match => match.identifier === song.identifier) });
  } catch (failure) {
    return Object.freeze({ stage: Policy.stage, operation, failure: failureCode(failure) });
  }
}
module.exports = { validateNativeSearch };
if (require.main === module) void validateNativeSearch(request).then(summary => {
  process.stdout.write(JSON.stringify(summary) + Policy.lineSeparator);
  if (summary.failure) process.exitCode = Policy.singleResult;
});

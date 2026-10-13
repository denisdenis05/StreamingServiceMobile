const { test } = require('node:test');
const { strict: assertion } = require('node:assert');
const { PlaybackTrackMapper } = require('../.build/audio-migration/PlaybackTrackMapper');
const { PlaybackTrackPolicy } = require('../.build/audio-migration/PlaybackTrack');
const { MediaSourceKind, MediaRequestMethod, MediaBodyEncoding } = require('streaming-service-player');

const Fixture = Object.freeze({
  serverAddress: 'https://streaming.example.invalid/',
  recordingIdentifier: 'recording-one',
  entryIdentifier: 'occurrence-one',
  anotherEntryIdentifier: 'occurrence-two',
  title: 'Fixture song',
  changedTitle: 'Changed title',
  artist: 'Fixture artist',
  album: 'Fixture album',
  albumIdentifier: 'fixture-album',
  artworkAddress: 'https://images.example.invalid/cover.jpg',
  playlistIdentifier: 'fixture-playlist',
  localAddress: 'file:///cache/audio-cache/recording-one.mp3',
  remoteAddress: 'https://media.example.invalid/song?signature=fixture-secret',
  resolverAddress: 'https://media.example.invalid/resolve',
  insecureAddress: 'http://media.example.invalid/song',
  authorizationHeader: 'Authorization',
  authorizationValue: 'Bearer fixture-secret',
  bodyValue: '{"fixture":"private-value"}',
  bodyContentType: 'application/json',
  emptyAddress: '',
  cacheFailure: 'Cache read failed',
  durationSeconds: 123.456,
  durationMilliseconds: 123456,
  negativeDurationSeconds: -1,
});
const FirstHeaderIndex = 0;
const TestNames = {
  catalog: 'catalog recordings use native server authentication without private source registrations',
  cached: 'catalog recordings prefer a readable managed cache file',
  cacheFailure: 'catalog cache failures fall back to the recording source',
  local: 'explicit local files use managed-file source registration',
  remote: 'signed media addresses preserve their exact query and skip the catalog cache',
  headers: 'remote authentication headers remain private source configuration',
  resolver: 'explicit POST resolution preserves request bodies and selected media authentication',
  view: 'queue views preserve album playlist artwork and favorite metadata',
  privacy: 'queue views and entries omit source addresses request headers and bodies',
  occurrences: 'duplicate recordings keep distinct queue occurrence identifiers',
  duration: 'track duration is converted from seconds into native milliseconds',
  captured: 'asynchronous cache reads use the captured track metadata',
  copiedRequest: 'asynchronous preparation does not share mutable caller request headers',
  missing: 'missing media addresses are rejected',
  insecure: 'insecure remote media addresses are rejected',
  invalidDuration: 'invalid duration hints are rejected before cache or registration work',
  artist: 'missing artist metadata receives the named native-compatible default',
  title: 'URL-only playback receives the named title and artist defaults',
  baseAddress: 'catalog matching works with a media server address without a trailing slash',
};

function catalogTrack() {
  return {
    recordingIdentifier: Fixture.recordingIdentifier,
    mediaAddress: Fixture.serverAddress + PlaybackTrackPolicy.catalogStreamRoute + Fixture.recordingIdentifier,
    title: Fixture.title,
    artist: Fixture.artist,
  };
}

function fixtureMapper(cachedAddress = null) {
  const cacheReads = [];
  return {
    cacheReads,
    mapper: new PlaybackTrackMapper(Fixture.serverAddress, {
      async findReadableCachedAddress(mediaAddress) {
        cacheReads.push(mediaAddress);
        return cachedAddress;
      },
    }),
  };
}

test(TestNames.catalog, async () => {
  const { mapper } = fixtureMapper();
  const prepared = await mapper.prepare(catalogTrack(), Fixture.entryIdentifier);
  assertion.equal(prepared.entry.recordingIdentifier, Fixture.recordingIdentifier);
  assertion.equal(prepared.source, null);
  assertion.equal(prepared.view.isLocalCached, false);
});

test(TestNames.cached, async () => {
  const { mapper } = fixtureMapper(Fixture.localAddress);
  const prepared = await mapper.prepare(catalogTrack(), Fixture.entryIdentifier);
  assertion.deepEqual(prepared.source, { kind: MediaSourceKind.Local, address: Fixture.localAddress });
  assertion.equal(prepared.view.isLocalCached, true);
  assertion.equal(prepared.entry.recordingIdentifier, undefined);
});

test(TestNames.cacheFailure, async () => {
  const mapper = new PlaybackTrackMapper(Fixture.serverAddress, {
    async findReadableCachedAddress() { throw new Error(Fixture.cacheFailure); },
  });
  assertion.equal((await mapper.prepare(catalogTrack(), Fixture.entryIdentifier)).source, null);
});

test(TestNames.local, async () => {
  const { mapper, cacheReads } = fixtureMapper();
  const prepared = await mapper.prepare({ ...catalogTrack(), mediaAddress: Fixture.localAddress }, Fixture.entryIdentifier);
  assertion.deepEqual(prepared.source, { kind: MediaSourceKind.Local, address: Fixture.localAddress });
  assertion.deepEqual(cacheReads, []);
});

test(TestNames.remote, async () => {
  const { mapper, cacheReads } = fixtureMapper(Fixture.localAddress);
  const prepared = await mapper.prepare({ ...catalogTrack(), mediaAddress: Fixture.remoteAddress }, Fixture.entryIdentifier);
  assertion.deepEqual(prepared.source, { kind: MediaSourceKind.Remote, address: Fixture.remoteAddress });
  assertion.deepEqual(cacheReads, []);
});

test(TestNames.headers, async () => {
  const { mapper } = fixtureMapper();
  const request = { headers: [{ name: Fixture.authorizationHeader, value: Fixture.authorizationValue }] };
  const prepared = await mapper.prepare({ ...catalogTrack(), mediaAddress: Fixture.remoteAddress, mediaRequest: request }, Fixture.entryIdentifier);
  assertion.deepEqual(prepared.source.request, request);
});

function resolverTrack() {
  return { ...catalogTrack(), mediaSource: {
    kind: MediaSourceKind.Resolved,
    address: Fixture.resolverAddress,
    request: { method: MediaRequestMethod.Post, body: {
      encoding: MediaBodyEncoding.Utf8, value: Fixture.bodyValue, contentType: Fixture.bodyContentType,
    } },
    mediaRequest: { headers: [{ name: Fixture.authorizationHeader, value: Fixture.authorizationValue }] },
  } };
}

test(TestNames.resolver, async () => {
  const { mapper, cacheReads } = fixtureMapper();
  const track = resolverTrack();
  assertion.deepEqual((await mapper.prepare(track, Fixture.entryIdentifier)).source, track.mediaSource);
  assertion.deepEqual(cacheReads, []);
});

test(TestNames.view, async () => {
  const { mapper } = fixtureMapper();
  const prepared = await mapper.prepare({ ...catalogTrack(), album: Fixture.album,
    albumIdentifier: Fixture.albumIdentifier, artworkAddress: Fixture.artworkAddress,
    playlistIdentifier: Fixture.playlistIdentifier, isLiked: true }, Fixture.entryIdentifier);
  assertion.equal(prepared.view.albumIdentifier, Fixture.albumIdentifier);
  assertion.equal(prepared.view.playlistIdentifier, Fixture.playlistIdentifier);
  assertion.equal(prepared.view.artworkAddress, Fixture.artworkAddress);
  assertion.equal(prepared.view.isLiked, true);
  assertion.equal(prepared.entry.album, Fixture.album);
});

test(TestNames.privacy, async () => {
  const { mapper } = fixtureMapper();
  const prepared = await mapper.prepare(resolverTrack(), Fixture.entryIdentifier);
  const publicMetadata = JSON.stringify({ entry: prepared.entry, view: prepared.view });
  for (const privateValue of [Fixture.authorizationValue, Fixture.bodyValue, Fixture.resolverAddress]) {
    assertion.equal(publicMetadata.includes(privateValue), false);
  }
});

test(TestNames.occurrences, async () => {
  const { mapper } = fixtureMapper();
  const first = await mapper.prepare(catalogTrack(), Fixture.entryIdentifier);
  const second = await mapper.prepare(catalogTrack(), Fixture.anotherEntryIdentifier);
  assertion.notEqual(first.entry.entryIdentifier, second.entry.entryIdentifier);
  assertion.equal(first.entry.recordingIdentifier, second.entry.recordingIdentifier);
});

test(TestNames.duration, async () => {
  const { mapper } = fixtureMapper();
  const prepared = await mapper.prepare({ ...catalogTrack(), durationSeconds: Fixture.durationSeconds }, Fixture.entryIdentifier);
  assertion.equal(prepared.entry.durationHintMilliseconds, Fixture.durationMilliseconds);
});

test(TestNames.captured, async () => {
  let finishCacheRead;
  const mapper = new PlaybackTrackMapper(Fixture.serverAddress, {
    findReadableCachedAddress() { return new Promise(resolve => { finishCacheRead = resolve; }); },
  });
  const track = catalogTrack();
  const preparation = mapper.prepare(track, Fixture.entryIdentifier);
  track.title = Fixture.changedTitle;
  finishCacheRead(null);
  assertion.equal((await preparation).view.title, Fixture.title);
});

test(TestNames.copiedRequest, async () => {
  const { mapper } = fixtureMapper();
  const track = resolverTrack();
  const preparation = mapper.prepare(track, Fixture.entryIdentifier);
  track.mediaSource.mediaRequest.headers.splice(FirstHeaderIndex);
  const prepared = await preparation;
  assertion.equal(prepared.source.mediaRequest.headers[FirstHeaderIndex].value, Fixture.authorizationValue);
});

test(TestNames.missing, async () => {
  const { mapper } = fixtureMapper();
  await assertion.rejects(mapper.prepare({ ...catalogTrack(), mediaAddress: Fixture.emptyAddress }, Fixture.entryIdentifier));
});

test(TestNames.insecure, async () => {
  const { mapper } = fixtureMapper();
  await assertion.rejects(mapper.prepare({ ...catalogTrack(), mediaAddress: Fixture.insecureAddress }, Fixture.entryIdentifier));
});

test(TestNames.invalidDuration, async () => {
  const { mapper, cacheReads } = fixtureMapper();
  for (const durationSeconds of [NaN, Infinity, Fixture.negativeDurationSeconds]) {
    await assertion.rejects(mapper.prepare({ ...catalogTrack(), durationSeconds }, Fixture.entryIdentifier));
  }
  assertion.deepEqual(cacheReads, []);
});

test(TestNames.artist, async () => {
  const { mapper } = fixtureMapper();
  const track = catalogTrack();
  delete track.artist;
  assertion.equal((await mapper.prepare(track, Fixture.entryIdentifier)).entry.artist, PlaybackTrackPolicy.unknownArtist);
});

test(TestNames.title, async () => {
  const { mapper } = fixtureMapper();
  const prepared = await mapper.prepare({ mediaAddress: Fixture.remoteAddress }, Fixture.entryIdentifier);
  assertion.equal(prepared.view.title, PlaybackTrackPolicy.untitledTrack);
  assertion.equal(prepared.view.artist, PlaybackTrackPolicy.unknownArtist);
});

test(TestNames.baseAddress, async () => {
  const serverAddress = Fixture.serverAddress.slice(FirstHeaderIndex, -PlaybackTrackPolicy.pathSeparator.length);
  const mapper = new PlaybackTrackMapper(serverAddress, { async findReadableCachedAddress() { return null; } });
  assertion.equal((await mapper.prepare(catalogTrack(), Fixture.entryIdentifier)).source, null);
});

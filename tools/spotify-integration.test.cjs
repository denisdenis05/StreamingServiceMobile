const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', path: 'node:path',
  connection: '../.build/spotify/SpotifyIntegrationConnection', library: 'streaming-service-spotify-jam',
  metro: '../metro.config.js', manifest: '../package.json' });
const { test } = require(Imports.test);
const assertion = require(Imports.assertion);
const { resolve } = require(Imports.path);
const { SpotifyIntegrationConnection } = require(Imports.connection);
const library = require(Imports.library);
const metroConfiguration = require(Imports.metro);
const applicationManifest = require(Imports.manifest);

const Fixture = Object.freeze({ applicationAccount: 'application-account', otherAccount: 'other-application-account',
  spotifyAccount: 'spotify-account', token: 'spotify-test-token', nowMilliseconds: 0,
  expiresAtMilliseconds: 900000, catalogIdentity: 'local-test-catalog', serviceOrigin: 'https://gew1-spclient.spotify.com',
  packageName: 'streaming-service-spotify-jam', dependencyAddress: 'file:../StreamingServiceSpotifyJam',
  repository: '../StreamingServiceSpotifyJam', recordingIdentifier: 'recording', market: 'RO', noObserversCount: 0, singleRefreshCount: 1, firstPosition: 0 });
const Names = Object.freeze({
  dependency: 'Mobile declares and resolves the sibling Spotify package',
  metro: 'Metro watches the Spotify library and retains the shared React runtime',
  connect: 'Connection requires application authentication and keeps Spotify identity separate',
  anonymous: 'Anonymous application accounts cannot connect Spotify',
  logout: 'Application logout disposes the Spotify runtime without ending remote sessions',
  accountChange: 'An application account change detaches the previous Spotify account',
  replace: 'Connecting a new runtime detaches the old runtime',
  dispose: 'Disposal unsubscribes account observation and prevents reconnection',
  lateResolution: 'Account change discards a catalog resolution that finishes late',
  foreground: 'Foreground transition requests one passive refresh of the selected device',
  noDevice: 'Foreground transition without a selected device performs no network operation',
  failedSelection: 'A failing device selection cannot escape the application foreground callback',
});

function fixture(onForegroundFailure) {
  let account = { accountIdentifier: Fixture.applicationAccount, isLoggedIn: true };
  const listeners = new Set();
  const application = { getSnapshot: () => account, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  const connection = new SpotifyIntegrationConnection(application, onForegroundFailure);
  const credentials = { accountIdentifier: Fixture.spotifyAccount, accessToken: Fixture.token, expiresAtMilliseconds: Fixture.expiresAtMilliseconds };
  const dependencies = {
    accountIdentifier: Fixture.spotifyAccount,
    credentials: { getCredentials: async () => credentials, renewCredentials: async () => credentials },
    endpoints: { resolveServiceOrigin: async () => Fixture.serviceOrigin },
    recordings: new library.QueryableRecordingCatalog(Fixture.catalogIdentity, library.RecordingNamespace.Local,
      { lookup: async () => null, search: async () => [] }),
    associations: new library.MemoryAssociationStore(), requests: { execute: async () => assertion.fail() },
    clock: { nowMilliseconds: () => Fixture.nowMilliseconds },
  };
  return { connection, dependencies, listeners, changeAccount(next) { account = next; for (const listener of listeners) listener(); } };
}

test(Names.dependency, () => {
  assertion.equal(applicationManifest.dependencies[Fixture.packageName], Fixture.dependencyAddress);
  assertion.equal(typeof library.SpotifyJamRuntime, FunctionType);
});
const FunctionType = 'function';

test(Names.metro, () => {
  assertion.ok(metroConfiguration.watchFolders.includes(resolve(__dirname, ParentDirectory, Fixture.repository)));
  assertion.equal(metroConfiguration.resolver.extraNodeModules[ReactPackage], resolve(__dirname, ParentDirectory, DependenciesDirectory, ReactPackage));
});
const ParentDirectory = '..';
const ReactPackage = 'react';
const DependenciesDirectory = 'node_modules';

test(Names.connect, () => {
  const state = fixture(); const runtime = state.connection.connect(state.dependencies);
  assertion.equal(runtime.sessions.getSnapshot().accountIdentifier, Fixture.spotifyAccount);
  assertion.equal(state.connection.runtime, runtime); state.connection.dispose();
});

test(Names.anonymous, () => {
  const state = fixture(); state.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  assertion.throws(() => state.connection.connect(state.dependencies), { code: library.IntegrationFailureCode.Unauthorized });
  state.connection.dispose();
});

test(Names.logout, () => {
  const state = fixture(); const runtime = state.connection.connect(state.dependencies);
  state.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  assertion.equal(state.connection.runtime, null);
  assertion.equal(runtime.sessions.getSnapshot().status, library.JamConnectionStatus.Detached); state.connection.dispose();
});

test(Names.accountChange, () => {
  const state = fixture(); const runtime = state.connection.connect(state.dependencies);
  state.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true });
  assertion.equal(runtime.sessions.getSnapshot().session, null); assertion.equal(state.connection.runtime, null); state.connection.dispose();
});

test(Names.replace, () => {
  const state = fixture(); const first = state.connection.connect(state.dependencies);
  const second = state.connection.connect(state.dependencies);
  assertion.notEqual(first, second); assertion.equal(first.sessions.getSnapshot().status, library.JamConnectionStatus.Detached);
  state.connection.dispose();
});

test(Names.dispose, () => {
  const state = fixture(); state.connection.connect(state.dependencies); state.connection.dispose(); state.connection.dispose();
  assertion.equal(state.listeners.size, Fixture.noObserversCount);
  assertion.throws(() => state.connection.connect(state.dependencies), { code: library.IntegrationFailureCode.Unauthorized });
});

test(Names.lateResolution, async () => {
  const state = fixture(); let completeLookup;
  state.dependencies.recordings = { identity: Fixture.catalogIdentity, namespace: library.RecordingNamespace.Local,
    lookup: () => new Promise(resolveLookup => { completeLookup = resolveLookup; }), search: async () => [] };
  const runtime = state.connection.connect(state.dependencies);
  const result = runtime.translateToSpotify(Fixture.recordingIdentifier, Fixture.market, new AbortController().signal);
  state.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true }); completeLookup(null);
  assertion.equal((await result).failure, library.IntegrationFailureCode.Canceled); state.connection.dispose();
});

test(Names.foreground, () => {
  const state = fixture();
  const runtime = state.connection.connect(state.dependencies, {
    getDeviceIdentifier: () => Fixture.spotifyAccount, nextRequestIdentifier: () => Fixture.recordingIdentifier,
  });
  const requests = [];
  runtime.sessions.refreshSession = async (deviceIdentifier, requestIdentifier) => { requests.push({ deviceIdentifier, requestIdentifier }); };
  state.connection.setActive(false); state.connection.setActive(true); state.connection.setActive(true);
  assertion.equal(requests.length, Fixture.singleRefreshCount); assertion.equal(requests[Fixture.firstPosition].deviceIdentifier, Fixture.spotifyAccount);
  state.connection.dispose();
});

test(Names.noDevice, () => {
  const state = fixture(); const runtime = state.connection.connect(state.dependencies);
  runtime.sessions.refreshSession = async () => assertion.fail();
  state.connection.setActive(false); state.connection.setActive(true); state.connection.dispose();
});

test(Names.failedSelection, () => {
  let failures = Fixture.noObserversCount;
  const state = fixture(() => { failures += Fixture.singleRefreshCount; });
  state.connection.connect(state.dependencies, { getDeviceIdentifier() { throw new Error(Fixture.token); },
    nextRequestIdentifier: () => Fixture.recordingIdentifier });
  state.connection.setActive(false); state.connection.setActive(true);
  assertion.equal(failures, Fixture.singleRefreshCount); state.connection.dispose();
});

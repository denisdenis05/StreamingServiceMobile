const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', filesystem: 'node:fs',
  babel: '@babel/core', transform: '@babel/plugin-transform-modules-commonjs', polyfill: 'react-native-url-polyfill',
  polyfillImplementation: 'react-native-url-polyfill/js/URL.js', native: 'react-native',
  controller: '../.build/spotify/SpotifyMobileController', gateway: '../.build/spotify/SpotifyMobileGateway',
  invitation: '../.build/spotify/SpotifyInvitation', policy: '../.build/spotify/SpotifyMobilePolicy',
  invitationResolver: '../.build/spotify/SpotifyInvitationResolver',
  library: 'streaming-service-spotify-jam', entry: 'index.js', application: 'App.tsx',
  polyfillImport: "import 'react-native-url-polyfill/auto';", routeRegistration: 'name={SpotifyJamRoute}' });
const { test } = require(Imports.test);
const assertion = require(Imports.assertion);
const { readFileSync } = require(Imports.filesystem);
const babel = require(Imports.babel);
const TranspilerParameters = Object.freeze({ require: 'require', module: 'module', exports: 'exports' });
const compiledPolyfill = babel.transformFileSync(require.resolve(Imports.polyfillImplementation), {
  babelrc: false, configFile: false, plugins: [Imports.transform],
});
const polyfillModule = { exports: {} };
const evaluatePolyfill = new Function(TranspilerParameters.require, TranspilerParameters.module, TranspilerParameters.exports, compiledPolyfill.code);
evaluatePolyfill(name => { assertion.equal(name, Imports.native); return { NativeModules: {} }; }, polyfillModule, polyfillModule.exports);
require.cache[require.resolve(Imports.polyfill)] = { exports: polyfillModule.exports };
const { SpotifyMobileController, SpotifyMobileOperation } = require(Imports.controller);
const { SpotifyMobileGateway } = require(Imports.gateway);
const { spotifyInvitationToken } = require(Imports.invitation);
const { SpotifyInvitationResolver, FetchSpotifyInvitationReader, SpotifyInvitationPolicy } = require(Imports.invitationResolver);
const { SpotifyMobilePolicy, SpotifyFailureMessages } = require(Imports.policy);
const library = require(Imports.library);

const Fixture = Object.freeze({ applicationAccount: 'application-account', otherAccount: 'other-application-account',
  spotifyAccount: 'spotify-account', stableAccount: 'stable-account', otherSpotifyAccount: 'other-spotify-account',
  token: 'temporary-test-token', otherToken: 'replacement-test-token', displayName: 'Spotify listener',
  otherDisplayName: 'Replacement listener', serviceOrigin: 'https://gew4-spclient.spotify.com', serviceHost: 'gew4-spclient.spotify.com:443',
  sessionIdentifier: 'session-test', joinToken: 'invitation-test', invitationAddress: 'spotify:socialsession:invitation-test',
  deviceIdentifier: 'active-device', otherDeviceIdentifier: 'other-device', deviceName: 'Phone',
  identifierPrefix: 'command-', initialSequence: 0, sequenceIncrement: 1, noCalls: 0, singleCall: 1, successStatus: 200,
  guestIdentifier: 'participant', guestName: 'Friend', rawFailure: 'Sensitive gateway failure with token details',
  unknownOutcome: library.IntegrationFailureCode.UnknownOutcome, sourceEncoding: 'utf8', emptyText: '',
  unsafeLink: 'https://example.com/jam/invitation-test', newlineToken: 'temporary\ntest-token',
  malformedLink: 'https://open.spotify.com/jam/%ZZ', slashTokenLink: 'https://open.spotify.com/jam/invitation%2Ftest',
  fullLink: 'https://open.spotify.com/socialsession/invitation-test?si=tracking#fragment',
  jamLink: 'https://open.spotify.com/jam/invitation-test', bearerToken: 'Bearer temporary-test-token',
  unsafeHost: 'example.com', portHost: 'gew4-spclient.spotify.com:9000', credentialHost: 'user@gew4-spclient.spotify.com',
  singleListenerCalls: 1, expectedIdentityRequests: 2, initialClockMilliseconds: 0, firstPosition: 0, connectionAndRefreshCount: 2,
  shortLink: 'https://spotify.link/short-invitation', branchLink: 'https://spotify.app.link/short-invitation',
  invitationPage: '<a href="https://open.spotify.com/socialsession/invitation-test?si=tracking"></a>',
  ambiguousInvitationPage: '<a href="https://open.spotify.com/socialsession/invitation-test"></a><a href="https://open.spotify.com/socialsession/other-invitation"></a>',
  pagePaddingCharacter: 'x',
});

const Names = Object.freeze({
  bootstrap: 'Spotify navigation is registered and WHATWG URL bootstrap precedes app imports',
  emptyToken: 'Empty and multiline credentials never reach the gateway',
  anonymous: 'Anonymous application account cannot connect Spotify',
  connection: 'Connection validates Spotify identity and snapshots never contain token or invitation values',
  selected: 'Connection selects the active actual Spotify device',
  bootstrapState: 'Connection passively reads existing membership before permitting creation',
  bootstrapFailure: 'Failed initial membership read prevents changes until a successful refresh',
  devicePermission: 'Device permission failure preserves the authenticated connection for session creation',
  lateConnection: 'Logout discards identity inspection that completes late',
  replacement: 'Replacement connection cannot be overwritten by an older inspection',
  create: 'Create publishes the owned Jam and exposes invitation only through explicit access',
  guestCreate: 'Creating while participating as a guest never sends a create mutation',
  busy: 'A second action while create is pending never duplicates the mutation',
  join: 'Joining translates a full invitation and submits control-only membership',
  remote: 'Remote membership supplies the selected actual device identifier',
  invalidJoin: 'Foreign and malformed invitations never send join requests',
  leave: 'Guest leave clears local membership after acknowledgement',
  end: 'Host end clears the session after acknowledgement',
  guestEnd: 'Guest cannot end the host session',
  refresh: 'Refresh uses the passive current-account reader',
  noDevice: 'Refresh works without a selected device or public device discovery',
  selection: 'Device reload preserves selection while it remains available',
  manualSelection: 'Manual device selection rejects whitespace and empty identifiers',
  logout: 'Logout cancels pending creation and never implicitly ends a remote Jam',
  disconnect: 'Disconnect retires credentials and invitation access',
  retiredProvider: 'A retired credential provider cannot return a replacement account token',
  expiry: 'Temporary credential lifetime expires locally and cannot invent renewal',
  sanitized: 'Raw gateway errors are reduced to a typed failure',
  uncertain: 'Unknown mutation outcome blocks another write until a passive refresh succeeds',
  disposal: 'Disposal unsubscribes application observation and prevents connection',
  listeners: 'New listeners are not invoked during the publication that registered them',
  removedListener: 'A listener removed during publication is not invoked later in that publication',
  rawInvitation: 'Raw and Spotify URI invitation forms preserve the token',
  fullInvitation: 'Full invitation links parse through the actual mobile URL implementation',
  unsafeInvitation: 'Invitation parser rejects foreign origins, encoded separators and malformed input',
  identity: 'Gateway verifies the private Spotify profile and sends no bearer credential to endpoint resolution',
  origin: 'Gateway rejects foreign, credential-bearing and nonstandard-port service origins',
  devices: 'Gateway filters restricted and unidentified devices and deduplicates identifiers',
  malformedDevices: 'Gateway rejects malformed device activity flags',
  gatewayFailure: 'Gateway maps authorization, permission and rate-limit responses without response-body leakage',
  cancellation: 'Gateway rejects a response received after cancellation',
  messageCoverage: 'Every typed failure has a user-facing message',
  directResolution: 'Full invitations resolve without a public page request',
  shortResolution: 'Short invitations extract one unique token from public HTML without executing it',
  ambiguousResolution: 'Conflicting or absent invitation candidates are rejected',
  foreignResolution: 'Foreign links and foreign redirect destinations are rejected',
  cancelledResolution: 'Invitation resolution discards a response after cancellation',
  oversizedResolution: 'Oversized invitation pages are rejected',
  publicReader: 'Public invitation fetching omits credentials and sends no bearer headers',
  readerDeadline: 'Public invitation deadline aborts the request and cancels the timer',
  readerCancellation: 'Public invitation cancellation aborts the request and preserves cancellation status',
  invalidRedirect: 'A public invitation redirect to a foreign origin is rejected before body parsing',
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function sessionResponse(owner = true) {
  return { session: { identifier: Fixture.sessionIdentifier, ownedByCurrentAccount: owner, active: true,
    participants: [{ identifier: Fixture.guestIdentifier, displayName: Fixture.guestName }] },
  invitation: { joinToken: Fixture.joinToken, address: Fixture.invitationAddress } };
}

function fixture() {
  const listeners = new Set();
  let applicationAccount = { accountIdentifier: Fixture.applicationAccount, isLoggedIn: true };
  let nowMilliseconds = Fixture.initialClockMilliseconds;
  let sequence = Fixture.initialSequence;
  let connectedSessions = null;
  let provider;
  const calls = [];
  const state = { inspect: async () => ({ accountIdentifier: Fixture.spotifyAccount, displayName: Fixture.displayName, serviceOrigin: Fixture.serviceOrigin }),
    devices: async () => [{ identifier: Fixture.otherDeviceIdentifier, name: Fixture.deviceName, active: false },
      { identifier: Fixture.deviceIdentifier, name: Fixture.deviceName, active: true }],
    create: async () => sessionResponse(), read: async () => null, join: async () => sessionResponse(false),
    end: async () => undefined, leave: async () => undefined };
  const controller = new SpotifyMobileController({
    account: { getSnapshot: () => applicationAccount, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    gateway: { inspect: (...values) => state.inspect(...values), devices: (...values) => state.devices(...values) },
    clock: { nowMilliseconds: () => nowMilliseconds },
    nextIdentifier: () => { sequence += Fixture.sequenceIncrement; return Fixture.identifierPrefix + sequence; },
    connect(identity, credentials) {
      provider = credentials;
      connectedSessions = new library.JamSessionClient(undefined, true);
      connectedSessions.attachAccount(identity.accountIdentifier, {
        createOrActivate: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Creating }); return state.create(...values); },
        readCurrent: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Refreshing, values }); return state.read(...values); },
        readCurrentAccount: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Refreshing, values }); return state.read(...values); },
        join: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Joining, values }); return state.join(...values); },
        end: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Ending, values }); return state.end(...values); },
        leave: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Leaving, values }); return state.leave(...values); },
      });
      return connectedSessions;
    },
    disconnect() { connectedSessions?.detachAccount(); connectedSessions = null; },
  });
  return { controller, state, calls, listeners,
    provider: () => provider, advanceClock: () => { nowMilliseconds += SpotifyMobilePolicy.temporaryConnectionLifetimeMilliseconds; },
    changeAccount(next) { applicationAccount = next; for (const listener of [...listeners]) listener(); } };
}

test(Names.bootstrap, () => {
  assertion.ok(readFileSync(Imports.entry, Fixture.sourceEncoding).startsWith(Imports.polyfillImport));
  assertion.ok(readFileSync(Imports.application, Fixture.sourceEncoding).includes(Imports.routeRegistration));
});
test(Names.emptyToken, async () => {
  const state = fixture(); state.state.inspect = async () => assertion.fail();
  await state.controller.connect(Fixture.emptyText); await state.controller.connect(Fixture.newlineToken);
  assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.InvalidInput); state.controller.dispose();
});
test(Names.anonymous, async () => {
  const state = fixture(); state.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  await state.controller.connect(Fixture.token);
  assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized); state.controller.dispose();
});
test(Names.connection, async () => {
  const state = fixture(); await state.controller.connect(Fixture.bearerToken);
  const snapshot = state.controller.getSnapshot();
  assertion.equal(snapshot.displayName, Fixture.displayName); assertion.ok(snapshot.connected); assertion.ok(Object.isFrozen(snapshot));
  assertion.ok(!JSON.stringify(snapshot).includes(Fixture.token)); assertion.ok(!JSON.stringify(snapshot).includes(Fixture.joinToken));
  assertion.equal((await state.provider().getCredentials(new AbortController().signal)).accessToken, Fixture.token); state.controller.dispose();
});
test(Names.selected, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token);
  assertion.equal(state.controller.getSnapshot().selectedDeviceIdentifier, Fixture.deviceIdentifier); state.controller.dispose();
});
test(Names.bootstrapState, async () => {
  const state = fixture(); state.state.read = async () => sessionResponse(false); await state.controller.connect(Fixture.token);
  assertion.equal(state.controller.getSnapshot().session.session.ownedByCurrentAccount, false);
  await state.controller.createSession();
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Creating).length, Fixture.noCalls); state.controller.dispose();
});
test(Names.bootstrapFailure, async () => {
  const state = fixture(); state.state.read = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Network); };
  await state.controller.connect(Fixture.token); await state.controller.createSession();
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Creating).length, Fixture.noCalls);
  state.state.read = async () => null; await state.controller.refreshSession(); await state.controller.createSession();
  assertion.ok(state.controller.getSnapshot().session.session); state.controller.dispose();
});
test(Names.devicePermission, async () => {
  const state = fixture(); state.state.devices = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Forbidden); };
  await state.controller.connect(Fixture.token); assertion.ok(state.controller.getSnapshot().connected);
  assertion.equal(state.controller.getSnapshot().deviceFailure, library.IntegrationFailureCode.Forbidden);
  assertion.equal(state.controller.getSnapshot().failure, null);
  await state.controller.createSession(); assertion.ok(state.controller.getSnapshot().session.session.ownedByCurrentAccount); state.controller.dispose();
});
test(Names.lateConnection, async () => {
  const state = fixture(); const inspection = deferred(); state.state.inspect = () => inspection.promise;
  const pending = state.controller.connect(Fixture.token); state.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  inspection.resolve({ accountIdentifier: Fixture.spotifyAccount, displayName: Fixture.displayName, serviceOrigin: Fixture.serviceOrigin });
  await pending; assertion.equal(state.controller.getSnapshot().connected, false); state.controller.dispose();
});
test(Names.replacement, async () => {
  const state = fixture(); const inspection = deferred(); state.state.inspect = () => inspection.promise;
  const pending = state.controller.connect(Fixture.token);
  state.state.inspect = async () => ({ accountIdentifier: Fixture.otherSpotifyAccount, displayName: Fixture.otherDisplayName, serviceOrigin: Fixture.serviceOrigin });
  await state.controller.connect(Fixture.otherToken);
  inspection.resolve({ accountIdentifier: Fixture.spotifyAccount, displayName: Fixture.displayName, serviceOrigin: Fixture.serviceOrigin }); await pending;
  assertion.equal(state.controller.getSnapshot().displayName, Fixture.otherDisplayName); state.controller.dispose();
});
test(Names.create, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.createSession();
  assertion.ok(state.controller.getSnapshot().session.session.ownedByCurrentAccount);
  assertion.equal(state.controller.invitationAddress(), Fixture.invitationAddress); state.controller.dispose();
});
test(Names.guestCreate, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.joinSession(Fixture.joinToken, library.JamJoinMode.Control);
  await state.controller.createSession(); assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.Forbidden);
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Creating).length, Fixture.noCalls); state.controller.dispose();
});
test(Names.busy, async () => {
  const state = fixture(); const creation = deferred(); state.state.create = () => creation.promise;
  await state.controller.connect(Fixture.token); const pending = state.controller.createSession(); await Promise.resolve();
  await state.controller.createSession(); assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.Backpressure);
  creation.resolve(sessionResponse()); await pending;
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Creating).length, Fixture.singleCall); state.controller.dispose();
});
test(Names.join, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.joinSession(Fixture.fullLink, library.JamJoinMode.Control);
  const call = state.calls.find(call => call.operation === SpotifyMobileOperation.Joining);
  assertion.equal(call.values[Fixture.firstPosition], Fixture.joinToken);
  assertion.equal(state.controller.getSnapshot().session.session.ownedByCurrentAccount, false); state.controller.dispose();
});
test(Names.remote, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.joinSession(Fixture.joinToken, library.JamJoinMode.Remote);
  const call = state.calls.find(call => call.operation === SpotifyMobileOperation.Joining);
  assertion.ok(call.values.includes(Fixture.deviceIdentifier)); assertion.ok(call.values.includes(library.JamJoinMode.Remote)); state.controller.dispose();
});
test(Names.invalidJoin, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.joinSession(Fixture.unsafeLink, library.JamJoinMode.Control);
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Joining).length, Fixture.noCalls); state.controller.dispose();
});
test(Names.leave, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.joinSession(Fixture.joinToken, library.JamJoinMode.Control);
  await state.controller.leaveSession(); assertion.equal(state.controller.getSnapshot().session.session, null); state.controller.dispose();
});
test(Names.end, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.createSession();
  await state.controller.endSession(); assertion.equal(state.controller.getSnapshot().session.session, null); state.controller.dispose();
});
test(Names.guestEnd, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.joinSession(Fixture.joinToken, library.JamJoinMode.Control);
  await state.controller.endSession(); assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.Forbidden);
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Ending).length, Fixture.noCalls); state.controller.dispose();
});
test(Names.refresh, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.refreshSession();
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Refreshing).length, Fixture.connectionAndRefreshCount); state.controller.dispose();
});
test(Names.noDevice, async () => {
  const state = fixture(); state.state.devices = async () => []; await state.controller.connect(Fixture.token); await state.controller.refreshSession();
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Refreshing).length, Fixture.connectionAndRefreshCount);
  assertion.equal(state.controller.getSnapshot().failure, null); state.controller.dispose();
});
test(Names.selection, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); state.controller.selectDevice(Fixture.otherDeviceIdentifier);
  await state.controller.reloadDevices(); assertion.equal(state.controller.getSnapshot().selectedDeviceIdentifier, Fixture.otherDeviceIdentifier); state.controller.dispose();
});
test(Names.manualSelection, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); state.controller.selectDevice(Fixture.emptyText);
  assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.InvalidInput); state.controller.dispose();
});
test(Names.logout, async () => {
  const state = fixture(); const creation = deferred(); state.state.create = () => creation.promise;
  await state.controller.connect(Fixture.token); const pending = state.controller.createSession(); await Promise.resolve();
  state.changeAccount({ accountIdentifier: null, isLoggedIn: false }); creation.resolve(sessionResponse()); await pending;
  assertion.equal(state.controller.getSnapshot().connected, false);
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Ending).length, Fixture.noCalls); state.controller.dispose();
});
test(Names.disconnect, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); await state.controller.createSession();
  const provider = state.provider(); state.controller.disconnect(); assertion.equal(state.controller.invitationAddress(), null);
  await assertion.rejects(provider.getCredentials(new AbortController().signal), { code: library.IntegrationFailureCode.Superseded }); state.controller.dispose();
});
test(Names.retiredProvider, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); const previous = state.provider();
  await state.controller.connect(Fixture.otherToken);
  await assertion.rejects(previous.getCredentials(new AbortController().signal), { code: library.IntegrationFailureCode.Superseded }); state.controller.dispose();
});
test(Names.expiry, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); state.advanceClock();
  await assertion.rejects(state.provider().getCredentials(new AbortController().signal), { code: library.IntegrationFailureCode.Unauthorized });
  await assertion.rejects(state.provider().renewCredentials(new AbortController().signal), { code: library.IntegrationFailureCode.Unauthorized }); state.controller.dispose();
});
test(Names.sanitized, async () => {
  const state = fixture(); state.state.inspect = async () => { throw new Error(Fixture.rawFailure); }; await state.controller.connect(Fixture.token);
  assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.Network);
  assertion.ok(!JSON.stringify(state.controller.getSnapshot()).includes(Fixture.rawFailure)); state.controller.dispose();
});
test(Names.uncertain, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token);
  state.state.create = async () => { throw new library.IntegrationFailure(Fixture.unknownOutcome); };
  await state.controller.createSession(); await state.controller.createSession();
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Creating).length, Fixture.singleCall);
  state.state.read = async () => null; await state.controller.refreshSession(); state.state.create = async () => sessionResponse();
  await state.controller.createSession(); assertion.ok(state.controller.getSnapshot().session.session); state.controller.dispose();
});
test(Names.disposal, async () => {
  const state = fixture(); state.controller.dispose(); assertion.equal(state.listeners.size, Fixture.noCalls);
  await state.controller.connect(Fixture.token); assertion.equal(state.controller.getSnapshot().connected, false);
});
test(Names.listeners, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); let calls = Fixture.noCalls;
  const added = () => { calls += Fixture.sequenceIncrement; };
  const stop = state.controller.subscribe(() => state.controller.subscribe(added));
  state.controller.selectDevice(Fixture.otherDeviceIdentifier); assertion.equal(calls, Fixture.noCalls);
  stop(); state.controller.selectDevice(Fixture.deviceIdentifier); assertion.equal(calls, Fixture.singleListenerCalls); state.controller.dispose();
});
test(Names.removedListener, async () => {
  const state = fixture(); await state.controller.connect(Fixture.token); let calls = Fixture.noCalls;
  let remove = () => undefined; const first = state.controller.subscribe(() => remove());
  remove = state.controller.subscribe(() => { calls += Fixture.sequenceIncrement; });
  state.controller.selectDevice(Fixture.otherDeviceIdentifier); assertion.equal(calls, Fixture.noCalls); first(); state.controller.dispose();
});
test(Names.rawInvitation, () => {
  assertion.equal(spotifyInvitationToken(Fixture.joinToken), Fixture.joinToken);
  assertion.equal(spotifyInvitationToken(Fixture.invitationAddress), Fixture.joinToken);
});
test(Names.fullInvitation, () => {
  assertion.equal(spotifyInvitationToken(Fixture.fullLink), Fixture.joinToken);
  assertion.equal(spotifyInvitationToken(Fixture.jamLink), Fixture.joinToken);
});
test(Names.unsafeInvitation, () => {
  for (const value of [Fixture.unsafeLink, Fixture.malformedLink, Fixture.slashTokenLink, SpotifyMobilePolicy.dotPath, SpotifyMobilePolicy.parentPath]) {
    assertion.throws(() => spotifyInvitationToken(value), { code: library.IntegrationFailureCode.InvalidInput });
  }
});

function gatewayFixture(profile = { username: Fixture.spotifyAccount, name: Fixture.displayName }) {
  const calls = [];
  const state = { profile, host: Fixture.serviceHost, devices: [], status: Fixture.successStatus };
  const gateway = new SpotifyMobileGateway({ async execute(request) {
    calls.push(request);
    const body = request.address.startsWith(SpotifyMobilePolicy.profileAddress) ? { data: { me: { profile: state.profile } } }
      : request.address === SpotifyMobilePolicy.resolverAddress ? { spclient: [state.host] } : { devices: state.devices };
    return { status: state.status, body };
  } });
  return { gateway, state, calls };
}
test(Names.identity, async () => {
  const state = gatewayFixture(); const identity = await state.gateway.inspect(Fixture.token, new AbortController().signal);
  assertion.equal(identity.accountIdentifier, Fixture.spotifyAccount); assertion.equal(identity.serviceOrigin, Fixture.serviceOrigin);
  assertion.equal(state.calls.length, Fixture.expectedIdentityRequests);
  const resolution = state.calls.find(call => call.address === SpotifyMobilePolicy.resolverAddress);
  assertion.equal(resolution.headers[SpotifyMobilePolicy.authorizationHeader], undefined);
  const profile = state.calls.find(call => call.address.startsWith(SpotifyMobilePolicy.profileAddress));
  const address = new polyfillModule.exports.URL(profile.address);
  assertion.equal(address.searchParams.get(SpotifyMobilePolicy.operationParameter), SpotifyMobilePolicy.profileOperation);
});
test(Names.origin, async () => {
  for (const host of [Fixture.unsafeHost, Fixture.portHost, Fixture.credentialHost]) {
    const state = gatewayFixture(); state.state.host = host;
    await assertion.rejects(state.gateway.inspect(Fixture.token, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidResponse });
  }
});
test(Names.devices, async () => {
  const state = gatewayFixture(); state.state.devices = [
    { id: Fixture.deviceIdentifier, name: Fixture.deviceName, is_active: true },
    { id: Fixture.deviceIdentifier, name: Fixture.deviceName, is_active: true },
    { id: Fixture.otherDeviceIdentifier, is_restricted: true }, { id: null },
  ];
  const devices = await state.gateway.devices(Fixture.token, new AbortController().signal);
  assertion.equal(devices.length, Fixture.singleCall); assertion.ok(Object.isFrozen(devices)); assertion.ok(Object.isFrozen(devices[Fixture.firstPosition]));
});
test(Names.malformedDevices, async () => {
  const state = gatewayFixture(); state.state.devices = [{ id: Fixture.deviceIdentifier }];
  await assertion.rejects(state.gateway.devices(Fixture.token, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidResponse });
});
test(Names.gatewayFailure, async () => {
  const scenarios = [
    { status: SpotifyMobilePolicy.unauthorizedStatus, code: library.IntegrationFailureCode.Unauthorized },
    { status: SpotifyMobilePolicy.forbiddenStatus, code: library.IntegrationFailureCode.Forbidden },
    { status: SpotifyMobilePolicy.rateLimitedStatus, code: library.IntegrationFailureCode.RateLimited },
  ];
  for (const scenario of scenarios) {
    const state = gatewayFixture(); state.state.status = scenario.status;
    await assertion.rejects(state.gateway.inspect(Fixture.token, new AbortController().signal), { code: scenario.code });
  }
});
test(Names.cancellation, async () => {
  const cancellation = new AbortController();
  const gateway = new SpotifyMobileGateway({ async execute() { cancellation.abort(); return { status: Fixture.successStatus, body: {} }; } });
  await assertion.rejects(gateway.inspect(Fixture.token, cancellation.signal), { code: library.IntegrationFailureCode.Canceled });
});
test(Names.messageCoverage, () => {
  for (const code of Object.values(library.IntegrationFailureCode)) assertion.ok(SpotifyFailureMessages[code]);
});

test(Names.directResolution, async () => {
  const resolver = new SpotifyInvitationResolver({ read: async () => assertion.fail() });
  assertion.equal(await resolver.resolve(Fixture.fullLink, new AbortController().signal), Fixture.joinToken);
});
test(Names.shortResolution, async () => {
  const resolver = new SpotifyInvitationResolver({ read: async () => ({ address: Fixture.branchLink, text: Fixture.invitationPage + Fixture.invitationPage }) });
  assertion.equal(await resolver.resolve(Fixture.shortLink, new AbortController().signal), Fixture.joinToken);
});
test(Names.ambiguousResolution, async () => {
  for (const text of [Fixture.ambiguousInvitationPage, Fixture.emptyText]) {
    const resolver = new SpotifyInvitationResolver({ read: async () => ({ address: Fixture.branchLink, text }) });
    await assertion.rejects(resolver.resolve(Fixture.shortLink, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidResponse });
  }
});
test(Names.foreignResolution, async () => {
  const resolver = new SpotifyInvitationResolver({ read: async () => ({ address: Fixture.unsafeLink, text: Fixture.invitationPage }) });
  await assertion.rejects(resolver.resolve(Fixture.unsafeLink, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidInput });
  await assertion.rejects(resolver.resolve(Fixture.shortLink, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidInput });
});
test(Names.cancelledResolution, async () => {
  const cancellation = new AbortController();
  const resolver = new SpotifyInvitationResolver({ read: async () => { cancellation.abort(); return { address: Fixture.branchLink, text: Fixture.invitationPage }; } });
  await assertion.rejects(resolver.resolve(Fixture.shortLink, cancellation.signal), { code: library.IntegrationFailureCode.Canceled });
});
test(Names.oversizedResolution, async () => {
  const resolver = new SpotifyInvitationResolver({ read: async () => ({ address: Fixture.branchLink,
    text: Fixture.pagePaddingCharacter.repeat(SpotifyInvitationPolicy.maximumPageCharacters + Fixture.sequenceIncrement) }) });
  await assertion.rejects(resolver.resolve(Fixture.shortLink, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidResponse });
});
test(Names.publicReader, async () => {
  let requestOptions;
  let deadlineCancelled = false;
  const reader = new FetchSpotifyInvitationReader(async (address, options) => {
    assertion.equal(address, Fixture.shortLink); requestOptions = options;
    return { url: Fixture.branchLink, status: Fixture.successStatus, text: async () => Fixture.invitationPage };
  }, { schedule: () => () => { deadlineCancelled = true; } });
  const page = await reader.read(Fixture.shortLink, new AbortController().signal);
  assertion.equal(page.text, Fixture.invitationPage); assertion.equal(requestOptions.credentials, SpotifyInvitationPolicy.credentials);
  assertion.equal(requestOptions.headers, undefined); assertion.ok(deadlineCancelled);
});
test(Names.readerDeadline, async () => {
  const request = deferred(); let deadline; let requestSignal; let cancelled = false;
  const reader = new FetchSpotifyInvitationReader(async (_address, options) => { requestSignal = options.signal; return request.promise; },
    { schedule(_delay, callback) { deadline = callback; return () => { cancelled = true; }; } });
  const pending = reader.read(Fixture.shortLink, new AbortController().signal);
  deadline(); request.reject(new Error(Fixture.rawFailure));
  await assertion.rejects(pending, { code: library.IntegrationFailureCode.Deadline }); assertion.ok(requestSignal.aborted); assertion.ok(cancelled);
});
test(Names.readerCancellation, async () => {
  const request = deferred(); const cancellation = new AbortController(); let requestSignal;
  const reader = new FetchSpotifyInvitationReader(async (_address, options) => { requestSignal = options.signal; return request.promise; },
    { schedule: () => () => undefined });
  const pending = reader.read(Fixture.shortLink, cancellation.signal); cancellation.abort(); request.reject(new Error(Fixture.rawFailure));
  await assertion.rejects(pending, { code: library.IntegrationFailureCode.Canceled }); assertion.ok(requestSignal.aborted);
});
test(Names.invalidRedirect, async () => {
  const reader = new FetchSpotifyInvitationReader(async () => ({ url: Fixture.unsafeLink, status: Fixture.successStatus, text: async () => assertion.fail() }),
    { schedule: () => () => undefined });
  await assertion.rejects(reader.read(Fixture.shortLink, new AbortController().signal), { code: library.IntegrationFailureCode.InvalidInput });
});

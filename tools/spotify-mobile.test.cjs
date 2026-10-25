const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', filesystem: 'node:fs',
  polyfill: 'react-native-url-polyfill',
  controller: '../.build/spotify/SpotifyMobileController', gateway: '../.build/spotify/SpotifyMobileGateway',
  invitation: '../.build/spotify/SpotifyInvitation', policy: '../.build/spotify/SpotifyMobilePolicy',
  invitationResolver: '../.build/spotify/SpotifyInvitationResolver',
  library: 'streaming-service-spotify-jam', entry: 'index.js', application: 'App.tsx',
  polyfillImport: "import 'react-native-url-polyfill/auto';", routeRegistration: 'name={SpotifyJamRoute}' });
const { test } = require(Imports.test);
const assertion = require(Imports.assertion);
const { readFileSync } = require(Imports.filesystem);
const UrlFixture = './fixtures/spotify-url.cjs';
const polyfillModule = { exports: require(UrlFixture) };
const BrowserReturnModule = '../.build/spotify/SpotifyLoginBrowser';
const { SpotifyAuthorizationReturnStatus } = require(BrowserReturnModule);
const { SpotifyMobileController, SpotifyMobileOperation, SpotifyAuthenticationAction } = require(Imports.controller);
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

function fixture(overrides = {}) {
  const listeners = new Set();
  let applicationAccount = { accountIdentifier: Fixture.applicationAccount, isLoggedIn: true };
  let nowMilliseconds = Fixture.initialClockMilliseconds;
  let sequence = Fixture.initialSequence;
  let connectedSessions = null;
  let provider;
  const calls = [];
  const state = { returnStatus: SpotifyAuthorizationReturnStatus.NotReceived, forgetFailure: null, restores: async () => null, resumes: async () => null, forgottenAccounts: [], membershipRefreshes: Fixture.noCalls, inspect: async () => ({ accountIdentifier: Fixture.spotifyAccount, displayName: Fixture.displayName, serviceOrigin: Fixture.serviceOrigin }),
    devices: async () => [{ identifier: Fixture.otherDeviceIdentifier, name: Fixture.deviceName, active: false },
      { identifier: Fixture.deviceIdentifier, name: Fixture.deviceName, active: true }],
    create: async () => sessionResponse(), read: async () => null, join: async () => sessionResponse(false),
    end: async () => undefined, leave: async () => undefined, queue: async () => undefined,
    openedVerification: [], deviceLogin: () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unsupported); },
    identities: [], librespotLogin: () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unsupported); },
    login: () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unsupported); } };
  const controller = new SpotifyMobileController({
    authorizationReturnStatus: () => state.returnStatus,
    account: { getSnapshot: () => applicationAccount, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    gateway: { inspect: (...values) => state.inspect(...values), devices: (...values) => state.devices(...values) },
    restoreLogin: (...parameters) => state.restores(...parameters),
    resumeLogin: (...parameters) => state.resumes(...parameters),
    forgetSavedLogin: async accountIdentifier => { state.forgottenAccounts.push(accountIdentifier); if (state.forgetFailure !== null) await state.forgetFailure; },
    membershipRefreshed: () => { state.membershipRefreshes += Fixture.sequenceIncrement; },
    createLogin: (...parameters) => state.login(...parameters),
    createLibrespotLogin: (...parameters) => state.librespotLogin(...parameters),
    createDeviceLogin: (...parameters) => state.deviceLogin(...parameters),
    openVerificationPage: async (address, cancellation) => { state.openedVerification.push({ address, cancellation }); },
    clock: { nowMilliseconds: () => nowMilliseconds },
    nextIdentifier: () => { sequence += Fixture.sequenceIncrement; return Fixture.identifierPrefix + sequence; },
    connect(identity, credentials) {
      state.identities.push(identity);
      provider = credentials;
      connectedSessions = new library.JamSessionClient(undefined, true);
      connectedSessions.attachAccount(identity.accountIdentifier, {
        createOrActivate: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Creating }); return state.create(...values); },
        readCurrent: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Refreshing, values }); return state.read(...values); },
        readCurrentAccount: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Refreshing, values }); return state.read(...values); },
        join: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Joining, values }); return state.join(...values); },
        end: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Ending, values }); return state.end(...values); },
        leave: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Leaving, values }); return state.leave(...values); },
      }, { addToQueue: async (...values) => { calls.push({ operation: SpotifyMobileOperation.Queueing, values }); return state.queue(...values); } });
      return connectedSessions;
    },
    disconnect() { connectedSessions?.detachAccount(); connectedSessions = null; },
    ...overrides,
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

const LoginFixture = Object.freeze({ clientIdentifier: '0123456789abcdef0123456789abcdef', redirectAddress: 'streamingservicespotify://callback',
  trackIdentifier: '0123456789abcdefghijkl', trackUri: 'spotify:track:0123456789abcdefghijkl',
  trackAddress: 'https://open.spotify.com/track/0123456789abcdefghijkl?si=share', tokenExpirationMilliseconds: 99999999 });
const LoginNames = Object.freeze({ login: 'Mobile login establishes a library credential provider and reads membership',
  logout: 'Application logout cancels browser login and clears its provider', mismatch: 'Login refuses a different inspected Spotify account',
  late: 'A late browser completion cannot reconnect a logged out application account', queue: 'Mobile host queue normalizes a Spotify track URL and submits once',
  invalid: 'Invalid track input cannot reach the host queue', retired: 'Login provider cannot supply credentials after disconnection',
  rejectedReceipt: 'Clearing a global failure cannot turn a rejected queue command into acceptance',
  acceptedReceipt: 'An unrelated global failure cannot turn an accepted queue command into rejection',
  absentReceipt: 'Clearing a connection failure cannot make an unsent queue command appear accepted' });
function browserLogin() {
  const calls = { logout: Fixture.noCalls, disposed: Fixture.noCalls };
  const credentials = { accountIdentifier: Fixture.spotifyAccount, accessToken: Fixture.token, expiresAtMilliseconds: LoginFixture.tokenExpirationMilliseconds };
  const provider = { login: async () => credentials, restore: async () => credentials, dispose: () => { calls.disposed += Fixture.sequenceIncrement; }, getCredentials: async () => credentials, renewCredentials: async () => credentials,
    logout: () => { calls.logout += Fixture.sequenceIncrement; } };
  return { provider, calls };
}
function loginConfiguration() { return { clientIdentifier: LoginFixture.clientIdentifier, redirectAddress: LoginFixture.redirectAddress, scopes: [] }; }
test(LoginNames.login, async () => { const state = fixture(); const login = browserLogin(); state.state.login = () => login.provider;
  await state.controller.login(loginConfiguration()); assertion.ok(state.controller.getSnapshot().connected);
  assertion.equal((await state.provider().getCredentials(new AbortController().signal)).accessToken, Fixture.token);
  assertion.equal(state.calls[Fixture.firstPosition].operation, SpotifyMobileOperation.Refreshing); state.controller.dispose();
});
test(LoginNames.logout, async () => { const state = fixture(); const login = browserLogin(); state.state.login = () => login.provider;
  await state.controller.login(loginConfiguration()); state.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  assertion.equal(login.calls.logout, Fixture.singleCall); assertion.equal(state.controller.getSnapshot().connected, false); state.controller.dispose();
});
test(LoginNames.mismatch, async () => { const state = fixture(); const login = browserLogin(); state.state.login = () => login.provider;
  state.state.inspect = async () => ({ accountIdentifier: Fixture.otherSpotifyAccount, displayName: Fixture.displayName, serviceOrigin: Fixture.serviceOrigin });
  await state.controller.login(loginConfiguration()); assertion.equal(state.controller.getSnapshot().connected, false);
  assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized); state.controller.dispose();
});
test(LoginNames.late, async () => { const state = fixture(); const login = browserLogin(); const pending = deferred();
  login.provider.login = () => pending.promise; state.state.login = () => login.provider;
  const attempt = state.controller.login(loginConfiguration()); state.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  pending.resolve(await login.provider.getCredentials()); await attempt;
  assertion.equal(state.controller.getSnapshot().connected, false); assertion.equal(login.calls.logout, Fixture.singleCall); state.controller.dispose();
});
test(LoginNames.retired, async () => { const state = fixture(); const login = browserLogin(); state.state.login = () => login.provider;
  await state.controller.login(loginConfiguration()); const provider = state.provider(); state.controller.disconnect();
  await assertion.rejects(provider.getCredentials(new AbortController().signal), { code: library.IntegrationFailureCode.Superseded }); state.controller.dispose();
});
test(LoginNames.queue, async () => { const state = fixture(); state.state.read = async () => {
  const response = sessionResponse(); response.session.hostDeviceIdentifier = Fixture.deviceIdentifier; return response; };
  await state.controller.connect(Fixture.token); assertion.equal(await state.controller.addToQueue(LoginFixture.trackAddress), true);
  const call = state.calls.find(call => call.operation === SpotifyMobileOperation.Queueing);
  assertion.equal(call.values[Fixture.firstPosition], LoginFixture.trackIdentifier); assertion.equal(call.values[Fixture.singleCall], Fixture.deviceIdentifier);
  state.controller.dispose();
});
test(LoginNames.invalid, async () => { const state = fixture(); await state.controller.connect(Fixture.token);
  assertion.equal(await state.controller.addToQueue(Fixture.unsafeLink), false);
  assertion.equal(state.calls.filter(call => call.operation === SpotifyMobileOperation.Queueing).length, Fixture.noCalls); state.controller.dispose();
});

test(LoginNames.rejectedReceipt, async () => {
  const state = fixture(); state.state.read = async () => {
    const response = sessionResponse(); response.session.hostDeviceIdentifier = Fixture.deviceIdentifier; return response;
  };
  await state.controller.connect(Fixture.token);
  state.state.queue = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Forbidden); };
  let cleared = false;
  const stop = state.controller.subscribe(() => {
    const snapshot = state.controller.getSnapshot();
    if (!cleared && snapshot.operation === SpotifyMobileOperation.Idle && snapshot.failure === library.IntegrationFailureCode.Forbidden) {
      cleared = true; state.controller.selectDevice(Fixture.deviceIdentifier);
    }
  });
  assertion.equal(await state.controller.addToQueue(LoginFixture.trackAddress), false);
  assertion.equal(cleared, true); assertion.equal(state.controller.getSnapshot().failure, null); stop(); state.controller.dispose();
});

test(LoginNames.acceptedReceipt, async () => {
  const state = fixture(); state.state.read = async () => {
    const response = sessionResponse(); response.session.hostDeviceIdentifier = Fixture.deviceIdentifier; return response;
  };
  await state.controller.connect(Fixture.token); let changed = false;
  const stop = state.controller.subscribe(() => {
    if (!changed && state.controller.getSnapshot().operation === SpotifyMobileOperation.Idle) {
      changed = true; state.controller.selectDevice(Fixture.emptyText);
    }
  });
  assertion.equal(await state.controller.addToQueue(LoginFixture.trackAddress), true);
  assertion.equal(changed, true); assertion.equal(state.controller.getSnapshot().failure, library.IntegrationFailureCode.InvalidInput);
  stop(); state.controller.dispose();
});

test(LoginNames.absentReceipt, async () => {
  const state = fixture(); let cleared = false;
  const stop = state.controller.subscribe(() => {
    if (!cleared && state.controller.getSnapshot().failure === library.IntegrationFailureCode.Unauthorized) {
      cleared = true; state.controller.selectDevice(Fixture.deviceIdentifier);
    }
  });
  assertion.equal(await state.controller.addToQueue(LoginFixture.trackAddress), false);
  assertion.equal(cleared, true); assertion.equal(state.calls.length, Fixture.noCalls); stop(); state.controller.dispose();
});

const QueueReference = Object.freeze({ implementation: '../.build/spotify/SpotifyQueueTrack',
  valid: 'Spotify track IDs, URIs and share links normalize using the actual mobile URL implementation',
  invalid: 'Foreign origins, credentials, nontrack links and invalid queue references are rejected',
  foreign: 'https://example.com/track/0123456789abcdefghijkl', credentials: 'https://user@open.spotify.com/track/0123456789abcdefghijkl',
  insecure: 'http://open.spotify.com/track/0123456789abcdefghijkl', album: 'https://open.spotify.com/album/0123456789abcdefghijkl',
  port: 'https://open.spotify.com:444/track/0123456789abcdefghijkl', malformed: 'spotify:track:invalid' });
const { spotifyQueueTrackIdentifier } = require(QueueReference.implementation);
test(QueueReference.valid, () => { for (const input of [LoginFixture.trackIdentifier, LoginFixture.trackUri, LoginFixture.trackAddress]) assertion.equal(spotifyQueueTrackIdentifier(input), LoginFixture.trackIdentifier); });
test(QueueReference.invalid, () => { for (const input of [QueueReference.foreign, QueueReference.credentials, QueueReference.insecure, QueueReference.album, QueueReference.port, QueueReference.malformed]) {
  assertion.throws(() => spotifyQueueTrackIdentifier(input), { code: library.IntegrationFailureCode.InvalidInput });
} });

const BrowserProfileFixture = Object.freeze({ name: 'Browser login uses the official profile and prefers stable account identity',
  legacyIdentifier: 'legacy-account', displayName: 'OAuth listener', resolverHost: 'gew4-spclient.spotify.com',
  unauthorizedName: 'Browser login profile failures remain typed and do not become anonymous success' });
test(BrowserProfileFixture.name, async () => {
  const requests = [];
  const gateway = new SpotifyMobileGateway({ execute: async request => {
    requests.push(request);
    return { status: Fixture.successStatus, body: request.address === SpotifyMobilePolicy.oauthProfileAddress
      ? { account_id: Fixture.stableAccount, id: BrowserProfileFixture.legacyIdentifier, display_name: BrowserProfileFixture.displayName }
      : { spclient: [BrowserProfileFixture.resolverHost] } };
  } });
  const identity = await gateway.inspectLogin(Fixture.token, new AbortController().signal);
  assertion.equal(identity.accountIdentifier, Fixture.stableAccount); assertion.equal(identity.displayName, BrowserProfileFixture.displayName);
  const profile = requests.find(request => request.address === SpotifyMobilePolicy.oauthProfileAddress);
  assertion.equal(profile.headers[SpotifyMobilePolicy.authorizationHeader], SpotifyMobilePolicy.bearerPrefix + Fixture.token);
  assertion.equal(identity.serviceOrigin, null); assertion.equal(requests.length, Fixture.singleCall);
  assertion.equal(await gateway.resolveServiceOrigin(new AbortController().signal), Fixture.serviceOrigin);
  const resolver = requests.find(request => request.address === SpotifyMobilePolicy.resolverAddress);
  assertion.equal(resolver.headers[SpotifyMobilePolicy.authorizationHeader], undefined);
});
test(BrowserProfileFixture.unauthorizedName, async () => {
  const gateway = new SpotifyMobileGateway({ execute: async () => ({ status: SpotifyMobilePolicy.unauthorizedStatus, body: {} }) });
  await assertion.rejects(gateway.inspectLogin(Fixture.token, new AbortController().signal), { code: library.IntegrationFailureCode.Unauthorized });
});

const SelectionAccountNames = Object.freeze({ current: 'Recording selections require the current authenticated application account',
  replacement: 'App-account replacement invalidates the old recording selection owner' });
test(SelectionAccountNames.current, async () => { const state = fixture();
  assertion.equal(state.controller.isApplicationAccount(Fixture.applicationAccount), false); await state.controller.connect(Fixture.token);
  assertion.equal(state.controller.isApplicationAccount(Fixture.applicationAccount), true); assertion.equal(state.controller.isApplicationAccount(null), false); state.controller.dispose(); });
test(SelectionAccountNames.replacement, async () => { const state = fixture(); await state.controller.connect(Fixture.token);
  state.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true }); assertion.equal(state.controller.isApplicationAccount(Fixture.applicationAccount), false); state.controller.dispose(); });

const MembershipRecoveryNames = Object.freeze({ confirmed: 'Successful initial and manual membership reads notify queue recovery',
  failed: 'Failed membership reads cannot resume queue observation' });
test(MembershipRecoveryNames.confirmed, async () => { const state = fixture(); await state.controller.connect(Fixture.token);
  assertion.equal(state.state.membershipRefreshes, Fixture.singleCall); await state.controller.refreshSession();
  assertion.equal(state.state.membershipRefreshes, Fixture.connectionAndRefreshCount); state.controller.dispose(); });
test(MembershipRecoveryNames.failed, async () => { const state = fixture(); state.state.read = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unauthorized); };
  await state.controller.connect(Fixture.token); assertion.equal(state.state.membershipRefreshes, Fixture.noCalls); state.controller.dispose(); });

const SavedLoginNames = Object.freeze({ restore: 'Saved login restores its provider and passively loads membership without browser login',
  missing: 'Missing saved login quietly leaves the regular login form available',
  dispose: 'Disposal retires memory credentials without deleting the saved login',
  explicit: 'Explicit disconnection forgets the owning app account saved login',
  late: 'A provider restored after app logout is disposed and cannot reconnect',
  unusedLogout: 'App logout forgets a saved login even when no Spotify connection was opened',
  cleanup: 'Rejected credential cleanup is handled as a storage failure without an unhandled promise' });
test(SavedLoginNames.restore, async () => { const current = fixture(); const login = browserLogin(); current.state.restores = async () => login.provider;
  login.provider.login = async () => assertion.fail(); await current.controller.restore(); assertion.equal(current.controller.getSnapshot().connected, true);
  assertion.equal(current.state.forgottenAccounts.length, Fixture.noCalls); current.controller.dispose(); });
test(SavedLoginNames.missing, async () => { const current = fixture(); await current.controller.restore();
  assertion.equal(current.controller.getSnapshot().connected, false); assertion.equal(current.controller.getSnapshot().failure, null); current.controller.dispose(); });
test(SavedLoginNames.dispose, async () => { const current = fixture(); const login = browserLogin(); current.state.restores = async () => login.provider;
  await current.controller.restore(); current.controller.dispose(); assertion.equal(login.calls.logout, Fixture.noCalls);
  assertion.equal(login.calls.disposed, Fixture.singleCall); assertion.equal(current.state.forgottenAccounts.length, Fixture.noCalls); });
test(SavedLoginNames.explicit, async () => { const current = fixture(); const login = browserLogin(); current.state.restores = async () => login.provider;
  await current.controller.restore(); current.controller.disconnect(); await Promise.resolve(); assertion.equal(login.calls.logout, Fixture.singleCall);
  assertion.deepEqual(current.state.forgottenAccounts, [Fixture.applicationAccount]); current.controller.dispose(); });
test(SavedLoginNames.late, async () => { const current = fixture(); const pending = deferred(); const login = browserLogin(); current.state.restores = () => pending.promise;
  const restoring = current.controller.restore(); current.changeAccount({ accountIdentifier: null, isLoggedIn: false }); pending.resolve(login.provider); await restoring;
  assertion.equal(current.controller.getSnapshot().connected, false); assertion.equal(login.calls.disposed, Fixture.singleCall);
  assertion.deepEqual(current.state.forgottenAccounts, [Fixture.applicationAccount]); current.controller.dispose(); });
test(SavedLoginNames.unusedLogout, async () => { const current = fixture(); current.changeAccount({ accountIdentifier: null, isLoggedIn: false }); await Promise.resolve();
  assertion.deepEqual(current.state.forgottenAccounts, [Fixture.applicationAccount]); current.controller.dispose(); });
test(SavedLoginNames.cleanup, async () => { const current = fixture(); const login = browserLogin(); current.state.restores = async () => login.provider;
  login.provider.logout = async () => { throw new Error(Fixture.rawFailure); }; await current.controller.restore(); current.controller.disconnect();
  await waitForSavedLoginIdle(current.controller);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.CredentialStorage); current.controller.dispose(); });

function waitForSavedLoginIdle(controller) {
  if (controller.getSnapshot().operation === SpotifyMobileOperation.Idle) return Promise.resolve();
  return new Promise(resolve => { const stop = controller.subscribe(() => {
    if (controller.getSnapshot().operation === SpotifyMobileOperation.Idle) { stop(); resolve(); }
  }); });
}
const PendingForgetName = 'Disconnect remains busy until durable credential removal finishes';
test(PendingForgetName, async () => { const current = fixture(); const login = browserLogin(); const pending = deferred();
  current.state.restores = async () => login.provider; await current.controller.restore(); login.provider.logout = () => pending.promise;
  current.controller.disconnect(); assertion.equal(current.controller.getSnapshot().operation, SpotifyMobileOperation.Disconnecting);
  pending.resolve(); await waitForSavedLoginIdle(current.controller); assertion.equal(current.controller.getSnapshot().failure, null); current.controller.dispose(); });

const ColdRestorationName = 'Restoring the application account on cold startup does not erase its saved Spotify login';
test(ColdRestorationName, async () => { let account = { accountIdentifier: null, isLoggedIn: false }; const listeners = new Set(); const forgotten = [];
  const controller = new SpotifyMobileController({ account: { getSnapshot: () => account,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } }, gateway: { inspect: async () => assertion.fail(), devices: async () => [] },
    clock: { nowMilliseconds: () => Fixture.initialClockMilliseconds }, nextIdentifier: () => Fixture.identifierPrefix,
    connect: () => assertion.fail(), disconnect: () => undefined, forgetSavedLogin: async accountIdentifier => { forgotten.push(accountIdentifier); } });
  account = { accountIdentifier: Fixture.applicationAccount, isLoggedIn: true }; for (const listener of [...listeners]) listener();
  assertion.equal(forgotten.length, Fixture.noCalls); account = { accountIdentifier: null, isLoggedIn: false };
  for (const listener of [...listeners]) listener(); await Promise.resolve(); assertion.deepEqual(forgotten, [Fixture.applicationAccount]); controller.dispose(); });

const SavedLoginFailureName = 'Durable cleanup completion does not erase the authentication failure that triggered it';
test(SavedLoginFailureName, async () => { const current = fixture(); const login = browserLogin(); current.state.restores = async () => login.provider;
  login.provider.restore = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Unauthorized); };
  await current.controller.restore(); await waitForSavedLoginIdle(current.controller);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized); current.controller.dispose(); });

const RetiredSavedCleanupName = 'A failed cleanup for a previously unconnected account cannot poison its replacement account';
const SavedAsyncPolicy = Object.freeze({ microtaskTurns: 20, firstTurn: 0, turnIncrement: 1 });
test(RetiredSavedCleanupName, async () => { const current = fixture(); const pending = deferred(); current.state.forgetFailure = pending.promise;
  current.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true });
  pending.reject(new Error(Fixture.rawFailure));
  for (let turn = SavedAsyncPolicy.firstTurn; turn < SavedAsyncPolicy.microtaskTurns; turn += SavedAsyncPolicy.turnIncrement) await Promise.resolve();
  assertion.equal(current.controller.getSnapshot().failure, null); assertion.equal(current.controller.getSnapshot().connected, false); current.controller.dispose(); });

const ReentrantSavedRestoreName = 'An earlier account observer can restore the replacement account without being retired by a later observer';
test(ReentrantSavedRestoreName, async () => { const current = fixture(); const login = browserLogin(); current.state.restores = async () => login.provider;
  const accountCallbacks = [...current.listeners]; current.listeners.clear(); let restoring;
  current.listeners.add(() => { restoring = current.controller.restore(); }); for (const listener of accountCallbacks) current.listeners.add(listener);
  current.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true }); await restoring;
  assertion.equal(current.controller.getSnapshot().connected, true); assertion.equal(current.controller.isApplicationAccount(Fixture.otherAccount), true);
  assertion.deepEqual(current.state.forgottenAccounts, [Fixture.applicationAccount]); current.controller.dispose(); });

const ResumeFixture = Object.freeze({ callback: 'streamingservicespotify://callback?code=artificial-code&state=artificial-state',
  names: Object.freeze({ resume: 'Callback recovery uses the pending provider without opening browser authorization',
    completed: 'A callback already completed before restart restores the saved verified grant',
    missing: 'A cold callback without saved proof or grant is an explicit resume failure',
    invalid: 'An invalid callback cannot erase a pending authorization for another state',
    late: 'A late callback provider cannot replace the next application account',
    progress: 'A failed authorization retains the phase that failed',
    staleProgress: 'A progress callback from a retired login cannot overwrite a new login' }) });
test(ResumeFixture.names.resume, async () => { const current = fixture(); const login = browserLogin(); let resumed = null;
  login.provider.login = async () => assertion.fail(); login.provider.resumeAuthorization = async (address, cancellation) => {
    resumed = address; return login.provider.getCredentials(cancellation);
  }; current.state.resumes = async () => login.provider; await current.controller.resumeAuthorization(ResumeFixture.callback);
  assertion.equal(resumed, ResumeFixture.callback); assertion.equal(current.controller.getSnapshot().connected, true); current.controller.dispose(); });
test(ResumeFixture.names.completed, async () => { const current = fixture(); const login = browserLogin(); login.provider.login = async () => assertion.fail();
  current.state.restores = async () => login.provider; await current.controller.resumeAuthorization(ResumeFixture.callback);
  assertion.equal(current.controller.getSnapshot().connected, true); current.controller.dispose(); });
test(ResumeFixture.names.missing, async () => { const current = fixture(); await current.controller.resumeAuthorization(ResumeFixture.callback);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized);
  assertion.equal(current.controller.getSnapshot().authenticationAction, SpotifyAuthenticationAction.Resume); assertion.equal(current.state.forgottenAccounts.length, Fixture.noCalls); current.controller.dispose(); });
test(ResumeFixture.names.invalid, async () => { const current = fixture(); const login = browserLogin(); login.provider.resumeAuthorization = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.InvalidResponse); };
  current.state.resumes = async () => login.provider; await current.controller.resumeAuthorization(ResumeFixture.callback);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.InvalidResponse); assertion.equal(current.state.forgottenAccounts.length, Fixture.noCalls); current.controller.dispose(); });
test(ResumeFixture.names.late, async () => { const current = fixture(); const pending = deferred(); const login = browserLogin(); current.state.resumes = () => pending.promise;
  const resuming = current.controller.resumeAuthorization(ResumeFixture.callback); current.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true });
  pending.resolve(login.provider); await resuming; assertion.equal(login.calls.disposed, Fixture.singleCall); assertion.equal(current.controller.getSnapshot().connected, false); current.controller.dispose(); });
test(ResumeFixture.names.progress, async () => { const current = fixture(); const login = browserLogin(); let progress;
  current.state.login = (_configuration, observer) => { progress = observer; return login.provider; };
  login.provider.login = async () => { progress(library.SpotifyLoginStage.Exchanging); throw new library.IntegrationFailure(library.IntegrationFailureCode.Network); };
  await current.controller.login(loginConfiguration()); assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.Network);
  assertion.equal(current.controller.getSnapshot().loginStage, library.SpotifyLoginStage.Exchanging); current.controller.dispose(); });
test(ResumeFixture.names.staleProgress, async () => { const current = fixture(); const login = browserLogin(); let previousProgress;
  current.state.login = (_configuration, progress) => { previousProgress = progress; return login.provider; };
  await current.controller.login(loginConfiguration()); const credentials = await login.provider.getCredentials(new AbortController().signal);
  const pending = deferred(); const replacement = browserLogin(); replacement.provider.login = () => pending.promise;
  current.state.login = () => replacement.provider; const signingIn = current.controller.login(loginConfiguration());
  previousProgress(library.SpotifyLoginStage.Exchanging); assertion.equal(current.controller.getSnapshot().loginStage, library.SpotifyLoginStage.Preparing);
  pending.resolve(credentials); await signingIn; current.controller.dispose(); });

const ReturnDiagnosticControllerName = 'Browser cancellation retains its safe return category alongside the failed login phase';
test(ReturnDiagnosticControllerName, async () => { const current = fixture(); const login = browserLogin(); let progress;
  current.state.login = (_configuration, observer) => { progress = observer; return login.provider; };
  current.state.returnStatus = SpotifyAuthorizationReturnStatus.StateMismatch;
  login.provider.login = async () => { progress(library.SpotifyLoginStage.Authorizing); throw new library.IntegrationFailure(library.IntegrationFailureCode.Canceled); };
  await current.controller.login(loginConfiguration());
  assertion.equal(current.controller.getSnapshot().authorizationReturnStatus, SpotifyAuthorizationReturnStatus.StateMismatch);
  assertion.equal(current.controller.getSnapshot().loginStage, library.SpotifyLoginStage.Authorizing); current.controller.dispose(); });

const LibrespotFixture = Object.freeze({ username: 'personal-spotify-account', password: 'artificial-password',
  names: Object.freeze({ login: 'Librespot login establishes canonical identity without public or private profile lookup',
    restore: 'A saved Librespot session restores without developer OAuth profile admission',
    jamFailure: 'A private Jam rejection preserves successful Librespot authentication and connected identity',
    late: 'An old native login completion cannot reconnect after application account replacement',
    failure: 'A rejected native login preserves Librespot phase and typed failure without connecting',
    renewal: 'The connected Jam credential provider renews through the Librespot provider',
    logout: 'Application logout retires Librespot credentials and requests saved-session forgetting' }) });
function librespotLogin() { const login = browserLogin(); login.provider.authenticationMethod = library.SpotifyLoginMethod.Librespot; return login; }
function librespotInput() { return { username: LibrespotFixture.username, password: LibrespotFixture.password }; }
test(LibrespotFixture.names.login, async () => { const current = fixture(); const login = librespotLogin(); let received;
  current.state.inspect = async () => assertion.fail(); current.state.librespotLogin = input => { received = input; return login.provider; };
  await current.controller.loginWithLibrespot(librespotInput()); assertion.deepEqual(received, librespotInput());
  assertion.equal(current.controller.getSnapshot().connected, true);
  assertion.deepEqual(current.state.identities, [{ accountIdentifier: Fixture.spotifyAccount, displayName: Fixture.spotifyAccount, serviceOrigin: null }]);
  assertion.equal(current.controller.getSnapshot().authenticationMethod, library.SpotifyLoginMethod.Librespot); current.controller.dispose(); });
test(LibrespotFixture.names.restore, async () => { const current = fixture(); const login = librespotLogin();
  current.state.inspect = async () => assertion.fail(); current.state.restores = async () => login.provider;
  await current.controller.restore(); assertion.equal(current.controller.getSnapshot().connected, true);
  assertion.equal(current.controller.getSnapshot().authenticationMethod, library.SpotifyLoginMethod.Librespot); current.controller.dispose(); });
test(LibrespotFixture.names.jamFailure, async () => { const current = fixture(); const login = librespotLogin();
  current.state.librespotLogin = () => login.provider; current.state.read = async () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.Forbidden); };
  await current.controller.loginWithLibrespot(librespotInput()); assertion.equal(current.controller.getSnapshot().connected, true);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.Forbidden);
  assertion.equal(login.calls.logout, Fixture.noCalls); current.controller.dispose(); });
test(LibrespotFixture.names.late, async () => { const current = fixture(); const login = librespotLogin(); const pending = deferred();
  login.provider.login = () => pending.promise; current.state.librespotLogin = () => login.provider;
  const authorizing = current.controller.loginWithLibrespot(librespotInput()); current.changeAccount({ accountIdentifier: Fixture.otherAccount, isLoggedIn: true });
  pending.resolve(await login.provider.getCredentials(new AbortController().signal)); await authorizing;
  assertion.equal(current.controller.getSnapshot().connected, false); assertion.equal(login.calls.logout, Fixture.singleCall); current.controller.dispose(); });
test(LibrespotFixture.names.failure, async () => { const current = fixture(); const login = librespotLogin(); let progress;
  current.state.librespotLogin = (_input, observer) => { progress = observer; return login.provider; };
  login.provider.login = async () => { progress(library.SpotifyLoginStage.Authorizing); throw new library.IntegrationFailure(library.IntegrationFailureCode.Unauthorized); };
  await current.controller.loginWithLibrespot(librespotInput()); assertion.equal(current.controller.getSnapshot().connected, false);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized);
  assertion.equal(current.controller.getSnapshot().authenticationMethod, library.SpotifyLoginMethod.Librespot);
  assertion.equal(current.controller.getSnapshot().loginStage, library.SpotifyLoginStage.Authorizing); current.controller.dispose(); });
test(LibrespotFixture.names.renewal, async () => { const current = fixture(); const login = librespotLogin(); let renewals = Fixture.noCalls;
  const credentials = await login.provider.getCredentials(new AbortController().signal);
  login.provider.renewCredentials = async () => { renewals += Fixture.sequenceIncrement; return { ...credentials, accessToken: Fixture.otherToken }; };
  current.state.librespotLogin = () => login.provider; await current.controller.loginWithLibrespot(librespotInput());
  assertion.equal((await current.provider().renewCredentials(new AbortController().signal)).accessToken, Fixture.otherToken);
  assertion.equal(renewals, Fixture.singleCall); current.controller.dispose(); });
test(LibrespotFixture.names.logout, async () => { const current = fixture(); const login = librespotLogin(); current.state.librespotLogin = () => login.provider;
  await current.controller.loginWithLibrespot(librespotInput()); current.changeAccount({ accountIdentifier: null, isLoggedIn: false });
  assertion.equal(current.controller.getSnapshot().connected, false); assertion.equal(login.calls.logout, Fixture.singleCall);
  assertion.ok(current.state.forgottenAccounts.includes(Fixture.applicationAccount)); current.controller.dispose(); });

const DeviceLoginFixture = Object.freeze({ code: 'ABCDEF', verificationAddress: 'https://spotify.com/pair?code=ABCDEF', expirationMilliseconds: 90000,
  flushTurns: 20, names: Object.freeze({ login: 'Device login publishes only public pairing metadata and establishes native identity without profile HTTP',
    cancel: 'Canceling device login erases its pairing view and ignores stale approval or observer completion',
    restore: 'Automatic native session restoration can resume a pending pairing view',
    reopen: 'Reopening pairing uses the current verified public address and current lifetime',
    expired: 'Expired pairing metadata cannot reopen the browser' }) });
function deviceView(overrides = {}) { return { userCode: DeviceLoginFixture.code, verificationAddress: DeviceLoginFixture.verificationAddress,
  expiresAtMilliseconds: DeviceLoginFixture.expirationMilliseconds, ...overrides }; }
async function drainDeviceLogin() { for (let turn = Fixture.noCalls; turn < DeviceLoginFixture.flushTurns; turn += Fixture.sequenceIncrement) await Promise.resolve(); }
test(DeviceLoginFixture.names.login, async () => { const current = fixture(); const login = librespotLogin(); let observer; const pending = deferred();
  current.state.deviceLogin = (_progress, onAuthorization) => { observer = onAuthorization; return login.provider; };
  current.state.inspect = async () => assertion.fail(); login.provider.login = () => pending.promise;
  const signingIn = current.controller.loginWithDeviceAuthorization(); observer(deviceView());
  assertion.deepEqual(current.controller.getSnapshot().deviceAuthorization, deviceView());
  assertion.equal(current.controller.getSnapshot().deviceAuthorizationLogin, true);
  assertion.equal(current.controller.getSnapshot().connected, false);
  pending.resolve(await login.provider.getCredentials(new AbortController().signal)); await signingIn;
  assertion.equal(current.controller.getSnapshot().connected, true); current.controller.dispose(); });
test(DeviceLoginFixture.names.cancel, async () => { const current = fixture(); const login = librespotLogin(); let observer; const pending = deferred();
  current.state.deviceLogin = (_progress, onAuthorization) => { observer = onAuthorization; return login.provider; }; login.provider.login = () => pending.promise;
  const signingIn = current.controller.loginWithDeviceAuthorization(); observer(deviceView()); current.controller.disconnect();
  observer(deviceView()); pending.resolve(await login.provider.getCredentials(new AbortController().signal)); await signingIn;
  assertion.equal(current.controller.getSnapshot().connected, false); assertion.equal(current.controller.getSnapshot().deviceAuthorization, undefined);
  assertion.ok(current.state.forgottenAccounts.includes(Fixture.applicationAccount)); current.controller.dispose(); });
test(DeviceLoginFixture.names.restore, async () => { const current = fixture(); const login = librespotLogin(); let observer; const pending = deferred();
  current.state.restores = async (_accountIdentifier, _cancellation, _progress, onAuthorization) => { observer = onAuthorization; return login.provider; };
  login.provider.restore = () => pending.promise; const restoring = current.controller.restore(); await drainDeviceLogin(); observer(deviceView());
  assertion.deepEqual(current.controller.getSnapshot().deviceAuthorization, deviceView());
  pending.resolve(await login.provider.getCredentials(new AbortController().signal)); await restoring;
  assertion.equal(current.controller.getSnapshot().connected, true); current.controller.dispose(); });
test(DeviceLoginFixture.names.reopen, async () => { const current = fixture(); const login = librespotLogin(); const pending = deferred();
  current.state.deviceLogin = (_progress, observer) => { observer(deviceView()); return login.provider; }; login.provider.login = () => pending.promise;
  const signingIn = current.controller.loginWithDeviceAuthorization(); await current.controller.openDeviceAuthorization();
  assertion.equal(current.state.openedVerification[Fixture.firstPosition].address, DeviceLoginFixture.verificationAddress);
  current.controller.disconnect(); pending.resolve(await login.provider.getCredentials(new AbortController().signal)); await signingIn; current.controller.dispose(); });

const ConnectFixture = Object.freeze({ device: 'registered-native-device', generation: 2, ready: 'ready', connecting: 'connecting',
  names: { lifetime: 'Accepted native login binds the connection to the controller lifetime and logout aborts it',
    failure: 'Native connection setup failure cannot discard a successful Spotify login',
    join: 'Librespot control joining uses the registered app device and cannot submit remote admission early',
    projection: 'Native readiness changes reach the mobile snapshot and observers are released on disposal' } });
test(ConnectFixture.names.lifetime, async () => {
  let native; const current = fixture({ connectNative: (provider, accountIdentifier, cancellation) => { native = { provider, accountIdentifier, cancellation }; } });
  const login = librespotLogin(); current.state.librespotLogin = () => login.provider;
  await current.controller.loginWithLibrespot(librespotInput());
  assertion.equal(native.provider, login.provider); assertion.equal(native.accountIdentifier, Fixture.spotifyAccount);
  assertion.equal(native.cancellation.aborted, false); current.controller.disconnect(); assertion.equal(native.cancellation.aborted, true);
  current.controller.dispose();
});
test(ConnectFixture.names.failure, async () => {
  const current = fixture({ connectNative: () => { throw new Error(Fixture.rawFailure); } });
  const login = librespotLogin(); current.state.librespotLogin = () => login.provider;
  await current.controller.loginWithLibrespot(librespotInput()); assertion.equal(current.controller.getSnapshot().connected, true);
  current.controller.dispose();
});
test(ConnectFixture.names.join, async () => {
  const current = fixture({ nativeDeviceIdentifier: mode => mode === library.JamJoinMode.Control ? ConnectFixture.device : null });
  const login = librespotLogin(); current.state.librespotLogin = () => login.provider;
  await current.controller.loginWithLibrespot(librespotInput());
  assertion.equal(await current.controller.joinSession(Fixture.joinToken, library.JamJoinMode.Remote), false);
  assertion.equal(current.calls.filter(call => call.operation === SpotifyMobileOperation.Joining).length, Fixture.noCalls);
  await current.controller.joinSession(Fixture.joinToken, library.JamJoinMode.Control);
  const joining = current.calls.find(call => call.operation === SpotifyMobileOperation.Joining);
  assertion.equal(joining.values[Fixture.firstPosition + Fixture.sequenceIncrement + Fixture.sequenceIncrement], ConnectFixture.device);
  current.controller.dispose();
});
test(ConnectFixture.names.projection, async () => {
  const observers = new Set(); let native = { status: ConnectFixture.connecting, deviceIdentifier: null, generation: ConnectFixture.generation, failure: null };
  const current = fixture({ nativeConnection: { getSnapshot: () => native, subscribe(listener) { observers.add(listener); return () => observers.delete(listener); } } });
  const login = librespotLogin(); current.state.librespotLogin = () => login.provider;
  await current.controller.loginWithLibrespot(librespotInput()); assertion.equal(current.controller.getSnapshot().nativeConnection, native);
  native = { ...native, status: ConnectFixture.ready, deviceIdentifier: ConnectFixture.device };
  for (const observer of observers) observer(); assertion.equal(current.controller.getSnapshot().nativeConnection.deviceIdentifier, ConnectFixture.device);
  current.controller.disconnect(); assertion.equal(current.controller.getSnapshot().nativeConnection, undefined);
  current.controller.dispose(); assertion.equal(observers.size, Fixture.noCalls);
});
test(DeviceLoginFixture.names.expired, async () => { const current = fixture(); const login = librespotLogin(); const pending = deferred();
  current.state.deviceLogin = (_progress, observer) => { observer(deviceView({ expiresAtMilliseconds: Fixture.initialClockMilliseconds })); return login.provider; }; login.provider.login = () => pending.promise;
  const signingIn = current.controller.loginWithDeviceAuthorization(); await current.controller.openDeviceAuthorization();
  assertion.equal(current.state.openedVerification.length, Fixture.noCalls);
  assertion.equal(current.controller.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized);
  current.controller.disconnect(); pending.resolve(await login.provider.getCredentials(new AbortController().signal)); await signingIn; current.controller.dispose(); });

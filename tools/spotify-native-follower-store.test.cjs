const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  store: '../.build/spotify/SpotifyNativeFollowerStore', protocol: '../.build/spotify/SpotifyJamPlaybackProtocol' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { IntegrationFailureCode, SharedPlaybackStatus } = require(Modules.library);
const { SpotifyNativeFollowerStore } = require(Modules.store);
const { decodeSpotifyJamPlayback } = require(Modules.protocol);
const Fixture = Object.freeze({ appAccount: 'synthetic-app-account', spotifyAccount: 'synthetic-spotify-account',
  otherAccount: 'synthetic-replacement-account', session: 'synthetic-session', host: 'synthetic-host',
  otherHost: 'synthetic-replacement-host', baseAddress: 'https://streaming.example.test/api/', token: 'synthetic.private.token',
  renewedToken: 'synthetic.renewed.token', market: 'RO', invalidMarket: 'invalid', identifierPrefix: 'synthetic-follow-',
  restoredIdentifier: 'synthetic-retained-follow', occurrence: 'synthetic-occurrence', recording: 'synthetic-recording',
  handle: 7, generation: 3, nextGeneration: 4, emptyCount: 0, singleCount: 1, microtaskFlushTurns: 30,
  privateMessage: 'synthetic private native failure', detached: 'Detached', waiting: 'Waiting', following: 'Following',
  suspended: 'Suspended', failed: 'Failed', localSuspended: 'LocalSuspended', buffering: 'Buffering', sourceUnavailable: 'SourceUnavailable',
  engineEpoch: 'synthetic-player-engine', authenticationEpoch: 'synthetic-player-authentication', otherEngineEpoch: 'synthetic-other-player-engine' });
const Names = Object.freeze({ idle: 'Native follower restores only its view and never starts playback eagerly',
  explicit: 'Explicit native following waits for cleanup and player readiness and captures the exact scoped configuration',
  validation: 'Invalid country input retires the old native session without starting a replacement',
  unavailable: 'Missing native playback support fails safely without using another follower',
  background: 'Acknowledged native following continues in the background without another start',
  pending: 'Backgrounding an unacknowledged start retires it and ignores a late acknowledgement',
  noAcknowledgement: 'A start response without actual native handoff cannot enable background continuation',
  identity: 'Foreign identifiers hosts and generations cannot replace the current native view',
  malformed: 'Malformed native observations stop following and expose only a safe failure code',
  replaced: 'Host or generation replacement retires the old follower immediately',
  logout: 'Restored logout retires following and updates the native application account',
  refreshed: 'Same-account token renewal synchronizes native credentials without restarting following',
  account: 'A changed application account retires old following before accepting its credentials',
  accountPending: 'Startup waits for the current native authentication handoff',
  oldAuthentication: 'An older authentication rejection cannot retire a newly synchronized account revision',
  restored: 'React recreation adopts only the same retained account Jam host handle and generation',
  suspended: 'Adopting local suspension never resumes playback and a later explicit start performs cleanup first',
  staleRestore: 'A delayed view restoration cannot overwrite an explicit newer start',
  detached: 'An authoritative detached event clears an acknowledged view without restarting it',
  dispose: 'Disposing the React view removes subscriptions while preserving native session ownership',
  cleanup: 'Failed native cleanup remains a barrier to replacement starts',
  superseded: 'A late superseded start cannot stop or replace a newer follower',
  private: 'Native configuration tokens never enter public follower snapshots',
  decoder: 'The native decoder rejects unsafe addresses unknown statuses malformed fields and contradictory handoff',
  scopedRestore: 'A retained native session belonging to another current host is retired during adoption',
  beforeRestore: 'Authentication restoration cannot be treated as a logged-out account',
  terminal: 'A delayed start acknowledgement cannot revive a newer local suspension or terminal source failure',
  acknowledgementEvent: 'A newer acknowledged native event cannot be overwritten by an older bridge response',
  premature: 'A native observation before handoff remains waiting and cannot bypass the background stop',
  reentrant: 'A stop requested by a view subscriber during native startup prevents late ownership',
  ownership: 'Native following waits for the verified player ownership receipt before acknowledging the handoff',
  ownershipFailure: 'A failed ownership receipt stops the native follower instead of allowing background continuation',
  ownershipRetired: 'Backgrounding during ownership persistence retires the request and prevents a late acknowledgement',
  ownershipLatest: 'The newest native observation survives a delayed ownership receipt and an older start response',
  changedPlayer: 'Another player engine cannot reuse the established native ownership receipt',
  restoreReadiness: 'Restored native events wait for app player readiness and preserve their newest state' });

function deferred() {
  let resolve; let reject;
  const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.microtaskFlushTurns; turn += Fixture.singleCount) await Promise.resolve(); }
function context() { return { streamingServiceAccountIdentifier: Fixture.appAccount, baseAddress: Fixture.baseAddress,
  spotifyAccountIdentifier: Fixture.spotifyAccount, jamSessionIdentifier: Fixture.session, hostDeviceIdentifier: Fixture.host,
  handle: Fixture.handle, generation: Fixture.generation }; }
function account() { return { restored: true, isLoggedIn: true, accountIdentifier: Fixture.appAccount, token: Fixture.token }; }
function wire(identifier = Fixture.restoredIdentifier, overrides = {}) {
  return { ...context(), identifier, market: Fixture.market, status: Fixture.following, nativeHandoff: true,
    playerEngineEpoch: Fixture.engineEpoch, playerAuthenticationEpoch: Fixture.authenticationEpoch,
    occurrenceIdentifier: Fixture.occurrence, recordingIdentifier: Fixture.recording, driftMilliseconds: null, failure: null, ...overrides };
}
function fixture(overrides = {}) {
  const state = { account: account(), context: context(), start: null, stop: null, authentication: null, readiness: null, ownership: null,
    retained: null, inspection: null, supported: true, ...overrides };
  const calls = { starts: [], stops: Fixture.emptyCount, authentication: [], inspections: Fixture.emptyCount, readiness: Fixture.emptyCount, ownership: [] };
  const listeners = { native: new Set(), connection: new Set(), account: new Set() };
  let sequence = Fixture.emptyCount;
  const native = {
    async startFollowing(identifier, serialized) {
      calls.starts.push({ identifier, configuration: JSON.parse(serialized) });
      return state.start ? state.start.promise : JSON.stringify(wire(identifier));
    },
    async stopFollowing() { calls.stops += Fixture.singleCount; if (state.stop) await state.stop.promise; },
    async getSnapshot() {
      calls.inspections += Fixture.singleCount;
      return state.inspection ? state.inspection.promise : JSON.stringify(state.retained ?? { identifier: null, status: Fixture.detached, nativeHandoff: false });
    },
    async updateApplicationAccount(accountIdentifier, accessToken) {
      calls.authentication.push({ accountIdentifier, accessToken });
      if (state.authentication) await state.authentication.promise;
    },
  };
  function observe(selected) { return listener => { selected.add(listener); return () => selected.delete(listener); }; }
  const store = new SpotifyNativeFollowerStore({ native: state.supported ? native : null, observe: observe(listeners.native),
    getContext: () => state.context, subscribeConnection: observe(listeners.connection), getApplicationAccount: () => state.account,
    subscribeApplicationAccount: observe(listeners.account),
    async whenPlayerReady() { calls.readiness += Fixture.singleCount; if (state.readiness) await state.readiness.promise; },
    async acknowledgeOwnership(context, identity, isCurrent) {
      calls.ownership.push({ context, identity, isCurrent });
      if (state.ownership) await state.ownership.promise;
    },
    nextIdentifier: () => Fixture.identifierPrefix + (sequence += Fixture.singleCount),
  });
  return { store, state, calls, listeners,
    send: selected => [...listeners.native].forEach(listener => listener(JSON.stringify(selected))),
    connectionChanged: () => [...listeners.connection].forEach(listener => listener()),
    accountChanged: () => [...listeners.account].forEach(listener => listener()),
  };
}
async function following() { const current = fixture(); await flush(); await current.store.start(Fixture.market); return current; }

test(Names.idle, async () => {
  const current = fixture(); await flush();
  assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  assertion.equal(current.calls.inspections, Fixture.singleCount);
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
  current.store.dispose();
});
test(Names.explicit, async () => {
  const current = fixture(); await flush(); current.state.stop = deferred(); current.state.readiness = deferred();
  const started = current.store.start(Fixture.market); await flush();
  assertion.equal(current.calls.readiness, Fixture.emptyCount); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  current.state.stop.resolve(); await flush(); assertion.equal(current.calls.readiness, Fixture.singleCount);
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); current.state.readiness.resolve(); await started;
  assertion.deepEqual(current.calls.starts[Fixture.emptyCount].configuration, { ...context(), market: Fixture.market, accessToken: Fixture.token });
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.validation, async () => {
  const current = await following(); const stops = current.calls.stops; await current.store.start(Fixture.invalidMarket);
  assertion.ok(current.calls.stops > stops); assertion.equal(current.calls.starts.length, Fixture.singleCount);
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidInput);
});
test(Names.unavailable, async () => {
  const current = fixture({ supported: false }); await current.store.start(Fixture.market);
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Unsupported);
  assertion.equal(current.calls.starts.length, Fixture.emptyCount);
});
test(Names.background, async () => {
  const current = await following(); const stops = current.calls.stops;
  current.store.setActive(false); current.store.setActive(true); await flush();
  assertion.equal(current.calls.stops, stops); assertion.equal(current.calls.starts.length, Fixture.singleCount);
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.pending, async () => {
  const current = fixture(); await flush(); current.state.start = deferred();
  const started = current.store.start(Fixture.market); await flush(); current.store.setActive(false);
  current.state.start.resolve(JSON.stringify(wire(current.calls.starts[Fixture.emptyCount].identifier))); await started; await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
  assertion.equal(current.calls.starts.length, Fixture.singleCount);
});
test(Names.noAcknowledgement, async () => {
  const current = fixture(); await flush(); current.state.start = deferred(); const started = current.store.start(Fixture.market); await flush();
  current.state.start.resolve(JSON.stringify(wire(current.calls.starts[Fixture.emptyCount].identifier, { nativeHandoff: false, status: Fixture.waiting })));
  await started; assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
});
test(Names.identity, async () => {
  const current = await following(); const snapshot = current.store.getSnapshot();
  current.send(wire()); current.send(wire(current.calls.starts[Fixture.emptyCount].identifier, { hostDeviceIdentifier: Fixture.otherHost }));
  current.send(wire(current.calls.starts[Fixture.emptyCount].identifier, { generation: Fixture.nextGeneration }));
  assertion.equal(current.store.getSnapshot(), snapshot);
});
test(Names.malformed, async () => {
  const current = await following(); current.send({ privateMessage: Fixture.privateMessage }); await flush();
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
  assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.privateMessage), false);
});
test(Names.replaced, async () => {
  for (const change of [{ hostDeviceIdentifier: Fixture.otherHost }, { generation: Fixture.nextGeneration }]) {
    const current = await following(); current.state.context = { ...context(), ...change }; current.connectionChanged(); await flush();
    assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
  }
});
test(Names.logout, async () => {
  const current = await following(); current.state.account = { restored: true, isLoggedIn: false, accountIdentifier: null, token: null };
  current.state.context = null; current.accountChanged(); await flush();
  assertion.deepEqual(current.calls.authentication.at(-Fixture.singleCount), { accountIdentifier: null, accessToken: null });
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
});
test(Names.refreshed, async () => {
  const current = await following(); const stops = current.calls.stops; current.state.account = { ...account(), token: Fixture.renewedToken };
  current.accountChanged(); await flush();
  assertion.deepEqual(current.calls.authentication.at(-Fixture.singleCount), { accountIdentifier: Fixture.appAccount, accessToken: Fixture.renewedToken });
  assertion.equal(current.calls.starts.length, Fixture.singleCount); assertion.equal(current.calls.stops, stops);
});
test(Names.account, async () => {
  const current = await following(); current.state.account = { ...account(), accountIdentifier: Fixture.otherAccount };
  current.state.context = null; current.accountChanged(); await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
  assertion.equal(current.calls.authentication.at(-Fixture.singleCount).accountIdentifier, Fixture.otherAccount);
});
test(Names.accountPending, async () => {
  const authentication = deferred(); const current = fixture({ authentication });
  const started = current.store.start(Fixture.market); await flush(); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  authentication.resolve(); await started; assertion.equal(current.calls.starts.length, Fixture.singleCount);
});
test(Names.oldAuthentication, async () => {
  const current = await following(); const staleAuthentication = deferred(); current.state.authentication = staleAuthentication;
  current.accountChanged(); current.state.authentication = null; current.state.account = { ...account(), token: Fixture.renewedToken };
  current.accountChanged(); await flush(); const stops = current.calls.stops;
  staleAuthentication.reject(new Error(Fixture.privateMessage)); await flush();
  assertion.equal(current.calls.stops, stops); assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.restored, async () => {
  const current = fixture({ retained: wire() }); await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); assertion.equal(current.calls.stops, Fixture.emptyCount);
});
test(Names.suspended, async () => {
  const current = fixture({ retained: wire(Fixture.restoredIdentifier, { status: Fixture.suspended, nativeHandoff: false, failure: Fixture.localSuspended }) });
  await flush(); assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
  assertion.equal(current.calls.readiness, Fixture.emptyCount);
  current.store.setActive(true); await flush(); assertion.equal(current.calls.starts.length, Fixture.emptyCount);
  await current.store.start(Fixture.market); assertion.equal(current.calls.stops, Fixture.singleCount);
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.staleRestore, async () => {
  const inspection = deferred(); const current = fixture({ inspection }); await flush();
  await current.store.start(Fixture.market); const snapshot = current.store.getSnapshot();
  inspection.resolve(JSON.stringify(wire(Fixture.restoredIdentifier, { status: Fixture.failed, nativeHandoff: false })));
  await flush(); assertion.equal(current.store.getSnapshot(), snapshot);
});
test(Names.detached, async () => {
  const current = await following(); current.send({ identifier: null, status: Fixture.detached, nativeHandoff: false }); await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
  assertion.equal(current.calls.starts.length, Fixture.singleCount);
});
test(Names.dispose, async () => {
  const current = await following(); const stops = current.calls.stops; current.store.dispose();
  assertion.equal(current.calls.stops, stops);
  for (const selected of Object.values(current.listeners)) assertion.equal(selected.size, Fixture.emptyCount);
});
test(Names.cleanup, async () => {
  const current = await following(); current.state.stop = deferred(); const stopped = current.store.stop();
  current.state.stop.reject(new Error(Fixture.privateMessage)); await assertion.rejects(stopped);
  current.state.stop = null; await current.store.start(Fixture.market);
  assertion.equal(current.calls.starts.length, Fixture.singleCount); assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
});
test(Names.superseded, async () => {
  const current = fixture(); await flush(); const firstStart = deferred(); current.state.start = firstStart;
  const started = current.store.start(Fixture.market); await flush(); const firstIdentifier = current.calls.starts[Fixture.emptyCount].identifier;
  current.state.start = null; await current.store.start(Fixture.market); const stops = current.calls.stops;
  firstStart.resolve(JSON.stringify(wire(firstIdentifier))); await started; await flush();
  assertion.equal(current.calls.stops, stops); assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.private, async () => {
  const current = await following(); assertion.equal(JSON.stringify(current.store.getSnapshot()).includes(Fixture.token), false);
  assertion.deepEqual(current.store.getSnapshot().identity, { accountIdentifier: Fixture.spotifyAccount,
    sessionIdentifier: Fixture.session, authorityIdentifier: Fixture.host });
});
test(Names.decoder, () => {
  const malformed = [null, Fixture.privateMessage, JSON.stringify(wire(Fixture.restoredIdentifier, { status: Fixture.privateMessage })),
    JSON.stringify(wire(Fixture.restoredIdentifier, { nativeHandoff: true, status: Fixture.suspended })),
    JSON.stringify(wire(Fixture.restoredIdentifier, { baseAddress: Fixture.privateMessage })),
    JSON.stringify(wire(Fixture.restoredIdentifier, { failure: Fixture.privateMessage })),
    JSON.stringify(wire(Fixture.restoredIdentifier, { generation: Fixture.emptyCount }))];
  for (const selected of malformed) assertion.throws(() => decodeSpotifyJamPlayback(selected), { code: IntegrationFailureCode.InvalidResponse });
});
test(Names.scopedRestore, async () => {
  const current = fixture({ retained: wire(Fixture.restoredIdentifier, { hostDeviceIdentifier: Fixture.otherHost }) }); await flush();
  assertion.equal(current.calls.stops, Fixture.singleCount); assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
});
test(Names.beforeRestore, async () => {
  const current = fixture({ account: { restored: false, isLoggedIn: false, accountIdentifier: null, token: null }, context: null }); await flush();
  assertion.equal(current.calls.authentication.length, Fixture.emptyCount); assertion.equal(current.calls.inspections, Fixture.emptyCount);
});
test(Names.terminal, async () => {
  for (const terminal of [{ status: Fixture.suspended, failure: Fixture.localSuspended }, { status: Fixture.failed, failure: Fixture.sourceUnavailable }]) {
    const current = fixture(); await flush(); current.state.start = deferred(); const started = current.store.start(Fixture.market); await flush();
    const identifier = current.calls.starts[Fixture.emptyCount].identifier;
    current.send(wire(identifier, { ...terminal, nativeHandoff: false })); const snapshot = current.store.getSnapshot();
    current.state.start.resolve(JSON.stringify(wire(identifier))); await started;
    assertion.equal(current.store.getSnapshot(), snapshot);
  }
});
test(Names.acknowledgementEvent, async () => {
  const current = fixture(); await flush(); current.state.start = deferred(); const started = current.store.start(Fixture.market); await flush();
  const identifier = current.calls.starts[Fixture.emptyCount].identifier;
  current.send(wire(identifier, { status: Fixture.buffering }));
  current.state.start.resolve(JSON.stringify(wire(identifier))); await started;
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Buffering);
});
test(Names.premature, async () => {
  const current = fixture(); await flush(); current.state.start = deferred(); const started = current.store.start(Fixture.market); await flush();
  const identifier = current.calls.starts[Fixture.emptyCount].identifier;
  current.send(wire(identifier, { nativeHandoff: false })); assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Waiting);
  current.store.setActive(false); current.state.start.resolve(JSON.stringify(wire(identifier))); await started; await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
});
test(Names.reentrant, async () => {
  const current = fixture(); await flush(); let stopped = false;
  current.store.subscribe(() => {
    if (!stopped && current.store.getSnapshot().status === SharedPlaybackStatus.Waiting) { stopped = true; void current.store.stop(); }
  });
  await current.store.start(Fixture.market); await flush();
  assertion.equal(current.calls.starts.length, Fixture.emptyCount); assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
});
test(Names.ownership, async () => {
  const current = fixture(); await flush(); current.state.ownership = deferred();
  const started = current.store.start(Fixture.market); await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Waiting);
  assertion.deepEqual(current.calls.ownership[Fixture.emptyCount].identity, { engineEpoch: Fixture.engineEpoch, authenticationEpoch: Fixture.authenticationEpoch });
  assertion.equal(current.calls.ownership[Fixture.emptyCount].isCurrent(), true);
  current.state.ownership.resolve(); await started;
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Following);
});
test(Names.ownershipFailure, async () => {
  const current = fixture(); await flush(); current.state.ownership = deferred();
  const started = current.store.start(Fixture.market); await flush(); current.state.ownership.reject(new Error(Fixture.privateMessage)); await started;
  assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.Network);
});
test(Names.ownershipRetired, async () => {
  const current = fixture(); await flush(); current.state.ownership = deferred();
  const started = current.store.start(Fixture.market); await flush(); current.store.setActive(false);
  assertion.equal(current.calls.ownership[Fixture.emptyCount].isCurrent(), false);
  current.state.ownership.resolve(); await started; await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Detached);
});
test(Names.ownershipLatest, async () => {
  const current = fixture(); await flush(); current.state.start = deferred(); current.state.ownership = deferred();
  const started = current.store.start(Fixture.market); await flush(); const identifier = current.calls.starts[Fixture.emptyCount].identifier;
  current.send(wire(identifier, { status: Fixture.buffering })); await flush();
  current.state.start.resolve(JSON.stringify(wire(identifier))); await flush(); current.state.ownership.resolve(); await started; await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Buffering);
});
test(Names.changedPlayer, async () => {
  const current = await following(); current.send(wire(current.calls.starts[Fixture.emptyCount].identifier, { playerEngineEpoch: Fixture.otherEngineEpoch }));
  await flush(); assertion.equal(current.store.getSnapshot().failure, IntegrationFailureCode.InvalidResponse);
  assertion.equal(current.calls.ownership.length, Fixture.singleCount);
});
test(Names.restoreReadiness, async () => {
  const readiness = deferred(); const current = fixture({ retained: wire(), readiness }); await flush();
  assertion.equal(current.calls.ownership.length, Fixture.emptyCount);
  current.send(wire(Fixture.restoredIdentifier, { status: Fixture.buffering })); await flush();
  assertion.equal(current.calls.ownership.length, Fixture.emptyCount);
  readiness.resolve(); await flush();
  assertion.equal(current.store.getSnapshot().status, SharedPlaybackStatus.Buffering);
  assertion.equal(current.calls.ownership.length, Fixture.singleCount);
});

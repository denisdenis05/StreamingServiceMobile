const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict',
  coordinator: '../.build/audio-migration/PlaybackAuthenticationCoordinator' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { PlaybackAuthenticationCoordinator } = require(Modules.coordinator);
const Fixture = Object.freeze({ account: 'synthetic-app-account', otherAccount: 'synthetic-other-account',
  address: 'https://streaming.example.test/api/', otherAddress: 'https://other.example.test/', token: 'synthetic-token',
  renewedToken: 'synthetic-renewed-token', initialEngine: 'synthetic-original-engine', initialAuthentication: 'synthetic-original-authentication',
  engine: 'synthetic-native-engine', authentication: 'synthetic-native-authentication', authority: 'synthetic-native-authority',
  emptyCount: 0, singleCount: 1, microtaskFlushTurns: 25, privateMessage: 'synthetic-private-storage-failure' });
const Names = Object.freeze({ adopted: 'A verified native ownership receipt preserves the new player epochs for subsequent app commands',
  scopes: 'Foreign account server engine and authentication identities cannot become app ownership receipts',
  authority: 'Missing paused and expired native authority cannot complete the player ownership handoff',
  logout: 'Logout waits for pending receipt persistence and erases the old native ownership last',
  refresh: 'Same-account token refresh during ownership persistence preserves the accepted native epoch',
  retired: 'A retired native handoff cannot persist ownership or update the app playback binding',
  storage: 'Failed native ownership persistence remains observable and cannot replace the previous receipt',
  replacement: 'A native player epoch change during persistence prevents adoption of the old receipt',
  recreation: 'A fresh app authentication coordinator reattaches the verified native handoff without clearing its player session' });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.microtaskFlushTurns; turn += Fixture.singleCount) await Promise.resolve(); }
function receipt(overrides = {}) { return { accountIdentifier: Fixture.account, serverAddress: Fixture.address,
  engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication, ...overrides }; }
function fixture() {
  const state = { snapshot: { cursor: { engineEpoch: Fixture.initialEngine, authenticationEpoch: Fixture.initialAuthentication },
    externalAuthorityIdentifier: null, externalAuthoritySuspended: false, externalAuthorityExpired: false }, receipt: null, writing: null, current: true };
  const calls = { clears: Fixture.emptyCount, snapshots: Fixture.emptyCount, writes: [], credentials: [] };
  const ownership = { async read() { return state.receipt; }, async write(selected) {
    calls.writes.push(selected); if (state.writing) await state.writing.promise; state.receipt = { ...selected };
  }, async clear() { state.receipt = null; } };
  const credentials = {
    async configureMediaServer(address, token) { calls.credentials.push({ address, token }); },
  };
  const dispatcher = {
    async initialize() {}, invalidateSession() {}, async clearSession() { calls.clears += Fixture.singleCount; state.snapshot.externalAuthorityIdentifier = null; },
    async getSnapshot() { calls.snapshots += Fixture.singleCount; return { ...state.snapshot, cursor: { ...state.snapshot.cursor } }; },
  };
  const create = () => new PlaybackAuthenticationCoordinator(Fixture.address, credentials, dispatcher,
    { invalidateSession() {} }, { suspend() {}, connect() {}, async refresh() {}, resume() {} }, ownership);
  const coordinator = create();
  return { state, calls, ownership, coordinator, create,
    ready: () => coordinator.update({ restored: true, accountIdentifier: Fixture.account, accessToken: Fixture.token }),
    activate() { state.snapshot = { ...state.snapshot, cursor: { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.authentication },
      externalAuthorityIdentifier: Fixture.authority }; },
    adopt: (selected = receipt()) => coordinator.adoptNativeSession(selected, () => state.current),
  };
}
test(Names.adopted, async () => {
  const current = fixture(); await current.ready(); current.activate(); const clears = current.calls.clears;
  await current.adopt(); await current.coordinator.whenReady();
  assertion.deepEqual(current.state.receipt, receipt()); assertion.equal(current.calls.clears, clears);
  assertion.equal(JSON.stringify(current.state.receipt).includes(Fixture.token), false);
});
test(Names.scopes, async () => {
  for (const changed of [{ accountIdentifier: Fixture.otherAccount }, { serverAddress: Fixture.otherAddress },
    { engineEpoch: Fixture.initialEngine }, { authenticationEpoch: Fixture.initialAuthentication }]) {
    const current = fixture(); await current.ready(); current.activate(); const writes = current.calls.writes.length;
    await assertion.rejects(current.adopt(receipt(changed))); assertion.equal(current.calls.writes.length, writes);
  }
});
test(Names.authority, async () => {
  for (const changed of [{ externalAuthorityIdentifier: null }, { externalAuthoritySuspended: true }, { externalAuthorityExpired: true }]) {
    const current = fixture(); await current.ready(); current.activate(); Object.assign(current.state.snapshot, changed);
    const writes = current.calls.writes.length; await assertion.rejects(current.adopt()); assertion.equal(current.calls.writes.length, writes);
  }
});
test(Names.logout, async () => {
  const current = fixture(); await current.ready(); current.activate(); current.state.writing = deferred();
  const adoption = current.adopt(); await flush(); current.state.current = false;
  const logout = current.coordinator.update({ restored: true, accountIdentifier: null, accessToken: null });
  current.state.writing.resolve(); await assertion.rejects(adoption); await logout;
  assertion.equal(current.state.receipt, null); assertion.equal(current.state.snapshot.externalAuthorityIdentifier, null);
});
test(Names.refresh, async () => {
  const current = fixture(); await current.ready(); current.activate(); const clears = current.calls.clears; current.state.writing = deferred();
  const adoption = current.adopt(); await flush();
  const refresh = current.coordinator.update({ restored: true, accountIdentifier: Fixture.account, accessToken: Fixture.renewedToken });
  current.state.writing.resolve(); await adoption; await refresh; await current.coordinator.whenReady();
  assertion.equal(current.calls.clears, clears); assertion.deepEqual(current.state.receipt, receipt());
  assertion.equal(current.calls.credentials.at(-Fixture.singleCount).token, Fixture.renewedToken);
});
test(Names.retired, async () => {
  const current = fixture(); await current.ready(); current.activate(); const writes = current.calls.writes.length;
  current.state.current = false; await assertion.rejects(current.adopt()); assertion.equal(current.calls.writes.length, writes);
});
test(Names.storage, async () => {
  const current = fixture(); await current.ready(); const previous = current.state.receipt; current.activate(); current.state.writing = deferred();
  const adoption = current.adopt(); await flush(); current.state.writing.reject(new Error(Fixture.privateMessage));
  await assertion.rejects(adoption); assertion.equal(current.state.receipt, previous);
});
test(Names.replacement, async () => {
  const current = fixture(); await current.ready(); current.activate(); current.state.writing = deferred();
  const adoption = current.adopt(); await flush(); current.state.snapshot.cursor = { engineEpoch: Fixture.initialEngine, authenticationEpoch: Fixture.initialAuthentication };
  current.state.writing.resolve(); await assertion.rejects(adoption);
});
test(Names.recreation, async () => {
  const current = fixture(); await current.ready(); current.activate(); await current.adopt(); const clears = current.calls.clears;
  current.coordinator.dispose(); const replacement = current.create();
  await replacement.update({ restored: true, accountIdentifier: Fixture.account, accessToken: Fixture.token });
  await replacement.whenReady(); assertion.equal(current.calls.clears, clears);
  assertion.equal(current.state.snapshot.externalAuthorityIdentifier, Fixture.authority);
});

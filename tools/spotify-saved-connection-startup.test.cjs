const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', startup: '../.build/spotify/SpotifySavedConnectionStartup',
  urlFixture: './fixtures/spotify-url.cjs', controller: '../.build/spotify/SpotifyMobileController', library: 'streaming-service-spotify-jam' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
require(Imports.urlFixture);
const { SpotifySavedConnectionStartup } = require(Imports.startup);
const { SpotifyMobileOperation } = require(Imports.controller);
const { IntegrationFailureCode } = require(Imports.library);
const Fixture = Object.freeze({ account: 'synthetic-startup-account', replacement: 'synthetic-startup-replacement', initial: 0, single: 1,
  flushTurns: 12, failure: 'synthetic-storage-failure' });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.initial; turn < Fixture.flushTurns; turn += Fixture.single) await Promise.resolve(); }
function fixture() {
  const accountListeners = new Set(); const controllerListeners = new Set(); const authorizationListeners = new Set();
  const state = { account: { restored: true, isLoggedIn: true, accountIdentifier: Fixture.account },
    controller: { connected: false, operation: SpotifyMobileOperation.Idle, failure: null }, ready: true, pending: null, calls: [] };
  function source(listeners, getSnapshot) { return { getSnapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } }; }
  const startup = new SpotifySavedConnectionStartup({ account: source(accountListeners, () => state.account),
    controller: { ...source(controllerListeners, () => state.controller), async restore() { state.calls.push(state.account.accountIdentifier); if (state.pending) await state.pending(); } },
    authorizationReady: source(authorizationListeners, () => state.ready) });
  const notify = listeners => { for (const listener of listeners) listener(); };
  return { startup, state, accountListeners, controllerListeners, authorizationListeners,
    notifyAccount: () => notify(accountListeners), notifyController: () => notify(controllerListeners), notifyAuthorization: () => notify(authorizationListeners) };
}
test('Saved Spotify connection starts once after the application account is restored', async () => {
  const current = fixture(); current.state.account.restored = false; current.startup.start();
  assertion.deepEqual(current.state.calls, []); current.state.account.restored = true; current.notifyAccount(); await flush();
  current.startup.start(); current.notifyController(); assertion.deepEqual(current.state.calls, [Fixture.account]);
});
test('Logged out and missing account identities cannot start restoration', () => {
  const current = fixture(); current.state.account.isLoggedIn = false; current.startup.start(); assertion.deepEqual(current.state.calls, []);
  current.state.account.isLoggedIn = true; current.state.account.accountIdentifier = null; current.notifyAccount(); assertion.deepEqual(current.state.calls, []);
});
test('Authorization readiness prevents saved restore from competing with a pending redirect', async () => {
  const current = fixture(); current.state.ready = false; current.startup.start(); assertion.deepEqual(current.state.calls, []);
  current.state.ready = true; current.notifyAuthorization(); await flush(); assertion.deepEqual(current.state.calls, [Fixture.account]);
});
test('An observed manual connection attempt prevents later automatic restore after disconnect', async () => {
  const current = fixture(); current.state.controller.operation = SpotifyMobileOperation.Connecting; current.startup.start();
  current.state.controller.operation = SpotifyMobileOperation.Idle; current.notifyController(); await flush(); assertion.deepEqual(current.state.calls, []);
});
test('A restored connection remains explicitly disconnected for the rest of the account run', async () => {
  const current = fixture(); current.state.controller.connected = true; current.startup.start();
  current.state.controller.connected = false; current.notifyController(); await flush(); assertion.deepEqual(current.state.calls, []);
});
test('Storage restoration failure is not retried by idle observations', async () => {
  const current = fixture(); current.state.pending = async () => { throw new Error(Fixture.failure); }; current.startup.start(); await flush();
  current.notifyController(); current.notifyAccount(); current.notifyAuthorization(); await flush(); assertion.deepEqual(current.state.calls, [Fixture.account]);
});
test('Existing interrupted authentication is retained without an automatic retry', () => {
  const current = fixture(); current.state.controller.failure = IntegrationFailureCode.Network; current.startup.start(); assertion.deepEqual(current.state.calls, []);
});
test('Account replacement during pending restoration waits for its own idle scope and starts once', async () => {
  const pending = deferred(); const current = fixture(); current.state.pending = () => pending.promise; current.startup.start();
  current.state.controller.operation = SpotifyMobileOperation.Connecting; current.state.account.accountIdentifier = Fixture.replacement; current.notifyAccount();
  assertion.deepEqual(current.state.calls, [Fixture.account]); current.state.pending = null; pending.resolve(); await flush();
  current.state.controller.operation = SpotifyMobileOperation.Idle; current.notifyController(); await flush(); assertion.deepEqual(current.state.calls, [Fixture.account, Fixture.replacement]);
  current.state.account.accountIdentifier = Fixture.account; current.notifyAccount(); assertion.deepEqual(current.state.calls, [Fixture.account, Fixture.replacement]);
});
test('Disposal removes subscriptions and fences delayed completion and later start', async () => {
  const pending = deferred(); const current = fixture(); current.state.pending = () => pending.promise; current.startup.start(); current.startup.dispose();
  current.state.account.accountIdentifier = Fixture.replacement; pending.resolve(); await flush(); current.startup.start();
  assertion.deepEqual(current.state.calls, [Fixture.account]); assertion.equal(current.accountListeners.size, Fixture.initial);
  assertion.equal(current.controllerListeners.size, Fixture.initial); assertion.equal(current.authorizationListeners.size, Fixture.initial);
});

test('Account replacement waits for retirement of an earlier manual connection before restoring the next account', async () => {
  const current = fixture(); current.state.controller.connected = true; current.startup.start();
  current.state.account.accountIdentifier = Fixture.replacement; current.state.controller.connected = false;
  current.state.controller.operation = SpotifyMobileOperation.Disconnecting; current.notifyAccount(); assertion.deepEqual(current.state.calls, []);
  current.state.controller.operation = SpotifyMobileOperation.Idle; current.notifyController(); await flush();
  assertion.deepEqual(current.state.calls, [Fixture.replacement]);
});

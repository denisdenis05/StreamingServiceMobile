const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  browser: '../.build/spotify/SpotifyLoginBrowser', startup: '../.build/spotify/SpotifyAuthorizationStartup',
  controller: '../.build/spotify/SpotifyMobileController', navigation: '../.build/spotify/SpotifyAuthorizationNavigation' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const library = require(Imports.library);
const UrlFixture = './fixtures/spotify-url.cjs';
require(UrlFixture);
const { SpotifyLoginBrowserAdapter, SpotifyBrowserPolicy, SpotifyAuthorizationReturnStatus } = require(Imports.browser);
const { SpotifyAuthorizationStartup } = require(Imports.startup);
const { SpotifyAuthenticationAction, SpotifyMobileOperation } = require(Imports.controller);
const { SpotifyAuthorizationNavigation } = require(Imports.navigation);
const Fixture = Object.freeze({ authorize: 'https://accounts.spotify.com/authorize?state=active-state',
  redirect: 'streamingservicespotify://callback', callback: 'streamingservicespotify://callback?code=artificial-code&state=active-state',
  rootRedirect: 'streamingservicespotify://callback/', rootCallback: 'streamingservicespotify://callback/?code=artificial-code&state=active-state',
  wrongHost: 'streamingservicespotify://other?code=artificial-code&state=active-state',
  nonrootCallback: 'streamingservicespotify://callback/other?code=artificial-code&state=active-state',
  rootStale: 'streamingservicespotify://callback/?code=artificial-old-code&state=old-state',
  rootDuplicate: 'streamingservicespotify://callback/?code=artificial-code&state=active-state&state=other-state',
  rootFragment: 'streamingservicespotify://callback/?code=artificial-code&state=active-state#unexpected',
  rootCredentials: 'streamingservicespotify://unexpected@callback/?code=artificial-code&state=active-state',
  stale: 'streamingservicespotify://callback?code=artificial-old-code&state=old-state',
  invalidAddress: 'invalid-return-address', unsafe: 'streamingservicespotify://callback?state=active-state#unexpected',
  duplicate: 'streamingservicespotify://callback?code=artificial-code&state=active-state&state=other-state',
  foreign: 'streamingservice://lastfm/callback?token=artificial-token', malformed: 'streamingservicespotify://callback?code=artificial-code',
  cancel: 'cancel', success: 'success', privateFailure: 'Sensitive browser detail', account: 'application-account',
  zero: 0, one: 1, two: 2, now: 1000, flushCount: 60,
  names: Object.freeze({ callbackFirst: 'Owned callback capture is installed before the Android browser opens',
    dismissFirst: 'A callback delivered after browser cancellation still completes the current authorization',
    initial: 'A matching current Activity intent recovers a missed warm callback event',
    rootEvent: 'A root slash callback completes the same custom scheme authorization in either direction',
    rootInitial: 'A root slash callback recovered from the native intent completes authorization',
    rootSecurity: 'Root slash equivalence preserves exact state and unsafe address checks',
    rootStartup: 'Cold callback recovery accepts equivalent custom scheme empty and root paths',
    rejectedStartupBase: 'Cold callback recovery rejects different scheme host and nonroot paths',
    updatedIntent: 'Updated Activity intent is probed during the bounded redirect grace period',
    delayedRead: 'A matching native callback probe completing after the grace deadline still finishes authorization',
    diagnostics: 'Rejected callback diagnostics distinguish return failures without exposing address code or state',
    diagnosticPriority: 'An older initial intent cannot hide the reason the actual callback event was rejected',
    canceledProbe: 'Canceling while the final native return probe is pending prevents late login and removes capture',
    canceledPreparation: 'Canceling pending native preparation cannot open the browser after its acknowledgement',
    stale: 'Old and duplicated state callbacks cannot authenticate a new browser flow',
    deadline: 'Genuine dismissal without a matching callback reports cancellation and removes subscriptions',
    abort: 'Account cancellation closes browser capture promptly without waiting for a redirect',
    exclusive: 'Concurrent browser sessions are rejected until the earlier native browser acknowledges closure',
    browserError: 'Native browser errors remain sanitized',
    cleanup: 'Callback success survives a native browser close failure',
    cold: 'Cold callback recovery waits for the application account to finish restoration',
    warm: 'Warm callbacks remain owned by the running browser authorization',
    restoreBusy: 'A cold callback waits for automatic saved-login restoration to finish',
    authorizingBusy: 'A callback for a running sign-in cannot trigger a second code exchange',
    duplicateStartup: 'Initial and event delivery of one callback starts recovery once',
    unrelated: 'Other application deep links cannot start Spotify recovery',
    invalidStartup: 'Malformed Spotify callback return is surfaced instead of silently showing an empty form',
    disposal: 'Disposed startup recovery ignores a late initial callback and removes listeners',
    navigation: 'Recovered authorization is shown once after navigation and app account become ready',
    navigationRetry: 'A failed navigation can retry without losing the recovery request' }) });

function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushCount; turn += Fixture.one) await Promise.resolve(); }
function failure(code) { return value => value instanceof library.IntegrationFailure && value.code === code; }
function browserFixture() {
  const pending = deferred(); const listeners = new Set(); const jobs = new Set();
  const state = { now: Fixture.now, opened: Fixture.zero, closed: Fixture.zero, initial: null, open: null, failClose: false };
  const platform = { isAvailable: async () => true, observeRedirects(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    readInitialAddress: async () => state.initial,
    openAuthorization: (...parameters) => { state.opened += Fixture.one; return state.open ? state.open(...parameters) : pending.promise; },
    closeAuthorization() { state.closed += Fixture.one; if (state.failClose) throw new Error(Fixture.privateFailure); pending.resolve({ type: Fixture.cancel }); } };
  const scheduler = { schedule(delay, callback) { const job = { due: state.now + delay, callback }; jobs.add(job); return () => jobs.delete(job); } };
  const browser = new SpotifyLoginBrowserAdapter(platform, scheduler);
  return { state, pending, listeners, jobs, platform, browser, signal: new AbortController(),
    emit(address) { for (const listener of [...listeners]) listener(address); },
    async advance(delay) { state.now += delay; const due = [...jobs].filter(job => job.due <= state.now).sort((left, right) => left.due - right.due);
      for (const job of due) { if (jobs.delete(job)) job.callback(); await flush(); } } };
}
function authorize(current, redirectAddress = Fixture.redirect) { return current.browser.authorize(Fixture.authorize, redirectAddress, current.signal.signal); }

test(Fixture.names.callbackFirst, async () => { const current = browserFixture(); current.state.open = async () => { assert.equal(current.listeners.size, Fixture.one); current.emit(Fixture.callback); return { type: Fixture.cancel }; };
  assert.equal(await authorize(current), Fixture.callback); assert.equal(current.listeners.size, Fixture.zero); assert.equal(current.state.closed, Fixture.one); });
test(Fixture.names.dismissFirst, async () => { const current = browserFixture(); const authorizing = authorize(current); await flush(); current.pending.resolve({ type: Fixture.cancel }); await flush();
  current.emit(Fixture.callback); assert.equal(await authorizing, Fixture.callback); assert.equal(current.jobs.size, Fixture.zero); });
test(Fixture.names.initial, async () => { const current = browserFixture(); current.state.initial = Fixture.callback; current.pending.resolve({ type: Fixture.cancel });
  assert.equal(await authorize(current), Fixture.callback); });
test(Fixture.names.rootEvent, async () => {
  for (const [redirectAddress, callbackAddress] of [[Fixture.redirect, Fixture.rootCallback], [Fixture.rootRedirect, Fixture.callback]]) {
    const current = browserFixture(); const authorizing = authorize(current, redirectAddress); await flush(); current.emit(callbackAddress);
    assert.equal(await authorizing, callbackAddress); assert.equal(current.browser.getReturnStatus(), SpotifyAuthorizationReturnStatus.Accepted);
  }
});
test(Fixture.names.rootInitial, async () => { const current = browserFixture(); current.state.initial = Fixture.rootCallback;
  current.pending.resolve({ type: Fixture.cancel }); assert.equal(await authorize(current), Fixture.rootCallback);
  assert.equal(current.browser.getReturnStatus(), SpotifyAuthorizationReturnStatus.Accepted); });
test(Fixture.names.rootSecurity, async () => {
  const scenarios = [[Fixture.rootStale, SpotifyAuthorizationReturnStatus.StateMismatch],
    [Fixture.rootDuplicate, SpotifyAuthorizationReturnStatus.DuplicateState], [Fixture.rootFragment, SpotifyAuthorizationReturnStatus.UnsafeAddress],
    [Fixture.rootCredentials, SpotifyAuthorizationReturnStatus.UnsafeAddress]];
  for (const [address, status] of scenarios) {
    const current = browserFixture(); const authorizing = authorize(current); let completed = false;
    void authorizing.then(() => { completed = true; }); await flush(); current.emit(address); await flush();
    assert.equal(completed, false); assert.equal(current.browser.getReturnStatus(), status);
    current.emit(Fixture.rootCallback); assert.equal(await authorizing, Fixture.rootCallback);
  }
});
test(Fixture.names.updatedIntent, async () => { const current = browserFixture(); const authorizing = authorize(current); await flush(); current.pending.resolve({ type: Fixture.cancel }); await flush();
  current.state.initial = Fixture.callback; await current.advance(SpotifyBrowserPolicy.redirectProbeMilliseconds); assert.equal(await authorizing, Fixture.callback); });
test(Fixture.names.delayedRead, async () => { const current = browserFixture(); const initial = deferred(); current.state.initial = initial.promise;
  const authorizing = authorize(current); let completed = false; void authorizing.then(() => { completed = true; }, () => { completed = true; });
  await flush(); current.pending.resolve({ type: Fixture.cancel }); await flush();
  await current.advance(SpotifyBrowserPolicy.redirectGraceMilliseconds); assert.equal(completed, false);
  initial.resolve(Fixture.callback); assert.equal(await authorizing, Fixture.callback);
  assert.equal(current.browser.getReturnStatus(), SpotifyAuthorizationReturnStatus.Accepted); assert.equal(current.jobs.size, Fixture.zero); });
test(Fixture.names.diagnostics, async () => { const scenarios = [
  [null, SpotifyAuthorizationReturnStatus.NotReceived], [Fixture.invalidAddress, SpotifyAuthorizationReturnStatus.InvalidAddress],
  [Fixture.foreign, SpotifyAuthorizationReturnStatus.SchemeMismatch], [Fixture.wrongHost, SpotifyAuthorizationReturnStatus.HostMismatch],
  [Fixture.nonrootCallback, SpotifyAuthorizationReturnStatus.PathMismatch], [Fixture.malformed, SpotifyAuthorizationReturnStatus.MissingState],
  [Fixture.duplicate, SpotifyAuthorizationReturnStatus.DuplicateState], [Fixture.stale, SpotifyAuthorizationReturnStatus.StateMismatch],
  [Fixture.unsafe, SpotifyAuthorizationReturnStatus.UnsafeAddress],
];
  for (const [address, expected] of scenarios) { const current = browserFixture(); const authorizing = authorize(current);
    const canceled = assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled)); await flush();
    if (address !== null) current.emit(address); current.pending.resolve({ type: Fixture.cancel }); await flush();
    await current.advance(SpotifyBrowserPolicy.redirectGraceMilliseconds); await canceled;
    assert.equal(current.browser.getReturnStatus(), expected); }
});
test(Fixture.names.diagnosticPriority, async () => { const current = browserFixture(); current.state.initial = Fixture.foreign;
  const authorizing = authorize(current); const canceled = assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled));
  await flush(); current.emit(Fixture.stale); current.pending.resolve({ type: Fixture.cancel }); await flush();
  await current.advance(SpotifyBrowserPolicy.redirectGraceMilliseconds); await canceled;
  assert.equal(current.browser.getReturnStatus(), SpotifyAuthorizationReturnStatus.StateMismatch); });
test(Fixture.names.canceledProbe, async () => { const current = browserFixture(); const initial = deferred(); current.state.initial = initial.promise;
  const authorizing = authorize(current); const canceled = assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled));
  await flush(); current.pending.resolve({ type: Fixture.cancel }); await flush(); await current.advance(SpotifyBrowserPolicy.redirectGraceMilliseconds);
  current.signal.abort(); await canceled; initial.resolve(Fixture.callback); await flush();
  assert.equal(current.browser.getReturnStatus(), SpotifyAuthorizationReturnStatus.NotReceived);
  assert.equal(current.jobs.size, Fixture.zero); assert.equal(current.listeners.size, Fixture.zero); });
test(Fixture.names.canceledPreparation, async () => { const current = browserFixture(); const preparation = deferred();
  current.platform.prepareAuthorization = () => preparation.promise; const authorizing = authorize(current);
  const canceled = assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled)); await flush(); current.signal.abort();
  preparation.resolve(); await canceled; assert.equal(current.state.opened, Fixture.zero); assert.equal(current.listeners.size, Fixture.zero); });
test(Fixture.names.stale, async () => { const current = browserFixture(); const authorizing = authorize(current); let completed = false; void authorizing.then(() => { completed = true; });
  await flush(); current.emit(Fixture.stale); current.emit(Fixture.duplicate); await flush(); assert.equal(completed, false); current.emit(Fixture.callback); await authorizing; });
test(Fixture.names.deadline, async () => { const current = browserFixture(); const authorizing = authorize(current); const canceled = assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled));
  await flush(); current.state.initial = Fixture.stale; current.pending.resolve({ type: Fixture.cancel }); await flush(); await current.advance(SpotifyBrowserPolicy.redirectGraceMilliseconds);
  await canceled; assert.equal(current.jobs.size, Fixture.zero); assert.equal(current.listeners.size, Fixture.zero); });
test(Fixture.names.abort, async () => { const current = browserFixture(); const authorizing = authorize(current); const canceled = assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled));
  await flush(); current.signal.abort(); await canceled; assert.equal(current.state.closed, Fixture.one); assert.equal(current.listeners.size, Fixture.zero); });
test(Fixture.names.exclusive, async () => { const current = browserFixture(); const authorizing = authorize(current); await flush();
  await assert.rejects(authorize(current), failure(library.IntegrationFailureCode.Backpressure)); current.emit(Fixture.callback); await authorizing; await flush(); assert.equal(current.browser.isAuthorizing(), false); });
test(Fixture.names.browserError, async () => { const current = browserFixture(); current.state.open = async () => { throw new Error(Fixture.privateFailure); };
  await assert.rejects(authorize(current), value => value.code === library.IntegrationFailureCode.Network && !value.message.includes(Fixture.privateFailure)); });
test(Fixture.names.cleanup, async () => { const current = browserFixture(); current.state.failClose = true; const authorizing = authorize(current); await flush(); current.emit(Fixture.callback);
  assert.equal(await authorizing, Fixture.callback); current.pending.resolve({ type: Fixture.cancel }); await flush(); });

function startupFixture(redirectAddress = Fixture.redirect) {
  const accountListeners = new Set(); const controllerListeners = new Set(); const redirectListeners = new Set();
  const state = { account: { restored: true, isLoggedIn: true, accountIdentifier: Fixture.account },
    snapshot: { connected: false, operation: SpotifyMobileOperation.Idle }, browserActive: false,
    initial: null, resumed: [], failures: [] };
  const startup = new SpotifyAuthorizationStartup({ account: { getSnapshot: () => state.account, subscribe(listener) { accountListeners.add(listener); return () => accountListeners.delete(listener); } },
    controller: { getSnapshot: () => state.snapshot, subscribe(listener) { controllerListeners.add(listener); return () => controllerListeners.delete(listener); },
      resumeAuthorization: async address => { state.resumed.push(address); }, authorizationInterrupted: code => { state.failures.push(code); } },
    redirects: { readInitialAddress: async () => await state.initial, observe(listener) { redirectListeners.add(listener); return () => redirectListeners.delete(listener); } },
    isAuthorizing: () => state.browserActive, redirectAddress });
  return { state, startup, accountListeners, controllerListeners, redirectListeners,
    emit(address) { for (const listener of redirectListeners) listener(address); },
    notifyAccount() { for (const listener of accountListeners) listener(); }, notifyController() { for (const listener of controllerListeners) listener(); } };
}
test(Fixture.names.cold, async () => { const current = startupFixture(); current.state.account = { ...current.state.account, restored: false }; current.state.initial = Fixture.callback;
  current.startup.start(); await flush(); assert.equal(current.state.resumed.length, Fixture.zero); current.state.account = { ...current.state.account, restored: true };
  current.notifyAccount(); await flush(); assert.deepEqual(current.state.resumed, [Fixture.callback]); current.startup.dispose(); });
test(Fixture.names.rootStartup, async () => {
  for (const [redirectAddress, callbackAddress] of [[Fixture.redirect, Fixture.rootCallback], [Fixture.rootRedirect, Fixture.callback]]) {
    const current = startupFixture(redirectAddress); current.state.initial = callbackAddress; current.startup.start(); await flush();
    assert.deepEqual(current.state.resumed, [callbackAddress]); assert.equal(current.state.failures.length, Fixture.zero); current.startup.dispose();
  }
});
test(Fixture.names.rejectedStartupBase, async () => {
  for (const address of [Fixture.foreign, Fixture.wrongHost, Fixture.nonrootCallback]) {
    const current = startupFixture(); current.state.initial = address; current.startup.start(); await flush();
    assert.equal(current.state.resumed.length, Fixture.zero); assert.equal(current.state.failures.length, Fixture.zero); current.startup.dispose();
  }
});
test(Fixture.names.warm, async () => { const current = startupFixture(); current.state.browserActive = true; current.startup.start(); current.emit(Fixture.callback); await flush();
  assert.equal(current.state.resumed.length, Fixture.zero); current.startup.dispose(); });
test(Fixture.names.restoreBusy, async () => { const current = startupFixture(); current.state.snapshot = { connected: false, operation: SpotifyMobileOperation.Connecting, authenticationAction: SpotifyAuthenticationAction.Restore };
  current.state.initial = Fixture.callback; current.startup.start(); await flush(); assert.equal(current.state.resumed.length, Fixture.zero);
  current.state.snapshot = { connected: false, operation: SpotifyMobileOperation.Idle }; current.notifyController(); await flush(); assert.equal(current.state.resumed.length, Fixture.one); current.startup.dispose(); });
test(Fixture.names.authorizingBusy, async () => { const current = startupFixture(); current.state.snapshot = { connected: false, operation: SpotifyMobileOperation.Connecting, authenticationAction: SpotifyAuthenticationAction.Login };
  current.state.initial = Fixture.callback; current.startup.start(); await flush(); current.state.snapshot = { connected: false, operation: SpotifyMobileOperation.Idle };
  current.notifyController(); assert.equal(current.state.resumed.length, Fixture.zero); current.startup.dispose(); });
test(Fixture.names.duplicateStartup, async () => { const current = startupFixture(); current.state.initial = Fixture.callback; current.startup.start(); current.emit(Fixture.callback); await flush();
  assert.equal(current.state.resumed.length, Fixture.one); current.startup.dispose(); });
test(Fixture.names.unrelated, async () => { const current = startupFixture(); current.state.initial = Fixture.foreign; current.startup.start(); await flush();
  assert.equal(current.state.resumed.length, Fixture.zero); assert.equal(current.state.failures.length, Fixture.zero); current.startup.dispose(); });
test(Fixture.names.invalidStartup, async () => { const current = startupFixture(); current.state.initial = Fixture.malformed; current.startup.start(); await flush();
  assert.deepEqual(current.state.failures, [library.IntegrationFailureCode.InvalidResponse]); current.startup.dispose(); });
test(Fixture.names.disposal, async () => { const current = startupFixture(); const initial = deferred(); current.state.initial = initial.promise; current.startup.start(); current.startup.dispose(); initial.resolve(Fixture.callback); await flush();
  assert.equal(current.state.resumed.length, Fixture.zero); assert.equal(current.accountListeners.size + current.controllerListeners.size + current.redirectListeners.size, Fixture.zero); });
test(Fixture.names.navigation, () => { let calls = Fixture.zero; const navigation = new SpotifyAuthorizationNavigation(() => { calls += Fixture.one; });
  navigation.update(SpotifyAuthenticationAction.Resume, false, true); navigation.update(SpotifyAuthenticationAction.Resume, true, false); assert.equal(calls, Fixture.zero);
  navigation.update(SpotifyAuthenticationAction.Resume, true, true); navigation.update(SpotifyAuthenticationAction.Resume, true, true); assert.equal(calls, Fixture.one);
  navigation.update(SpotifyAuthenticationAction.Login, true, true); navigation.update(SpotifyAuthenticationAction.Resume, true, true); assert.equal(calls, Fixture.two); });
test(Fixture.names.navigationRetry, () => { let fails = true; let calls = Fixture.zero; const navigation = new SpotifyAuthorizationNavigation(() => { if (fails) throw new Error(Fixture.privateFailure); calls += Fixture.one; });
  navigation.update(SpotifyAuthenticationAction.Resume, true, true); fails = false; navigation.update(SpotifyAuthenticationAction.Resume, true, true); assert.equal(calls, Fixture.one); });

const ReadinessNames = Object.freeze({ initial: 'Saved restoration readiness waits for initial redirect inspection',
  pending: 'Saved restoration readiness remains blocked by a pending account callback',
  resume: 'Readiness publication observes resumed authorization already connecting',
  disposal: 'Disposed authorization readiness cannot permit saved restoration' });
test(ReadinessNames.initial, async () => {
  const current = startupFixture(); const pending = deferred(); current.state.initial = pending.promise;
  current.startup.start(); assert.equal(current.startup.getSnapshot(), false);
  const readiness = []; current.startup.subscribe(() => readiness.push(current.startup.getSnapshot()));
  pending.resolve(null); await flush(); assert.equal(current.startup.getSnapshot(), true); assert.ok(readiness.includes(true)); current.startup.dispose();
});
test(ReadinessNames.pending, async () => {
  const current = startupFixture(); current.state.initial = Fixture.callback; current.state.account.restored = false;
  current.startup.start(); await flush(); assert.equal(current.startup.getSnapshot(), false);
  current.state.account.restored = true; current.notifyAccount(); await flush(); assert.equal(current.startup.getSnapshot(), true);
  current.startup.dispose();
});
test(ReadinessNames.resume, async () => {
  const accountListeners = new Set(); const controllerListeners = new Set(); const pending = deferred();
  const snapshot = { connected: false, operation: SpotifyMobileOperation.Idle }; const readiness = [];
  const startup = new SpotifyAuthorizationStartup({ account: { getSnapshot: () => ({ restored: true, isLoggedIn: true, accountIdentifier: Fixture.account }),
    subscribe(listener) { accountListeners.add(listener); return () => accountListeners.delete(listener); } },
    controller: { getSnapshot: () => snapshot, subscribe(listener) { controllerListeners.add(listener); return () => controllerListeners.delete(listener); },
      async resumeAuthorization() { snapshot.operation = SpotifyMobileOperation.Connecting; for (const listener of controllerListeners) listener(); }, authorizationInterrupted: () => undefined },
    redirects: { readInitialAddress: () => pending.promise, observe: () => () => undefined }, isAuthorizing: () => false, redirectAddress: Fixture.redirect });
  startup.subscribe(() => { if (startup.getSnapshot()) readiness.push(snapshot.operation); }); startup.start();
  pending.resolve(Fixture.callback); await flush(); assert.deepEqual(readiness, [SpotifyMobileOperation.Connecting]); startup.dispose();
});
test(ReadinessNames.disposal, async () => {
  const current = startupFixture(); const pending = deferred(); current.state.initial = pending.promise;
  current.startup.start(); current.startup.dispose(); pending.resolve(null); await flush(); assert.equal(current.startup.getSnapshot(), false);
});

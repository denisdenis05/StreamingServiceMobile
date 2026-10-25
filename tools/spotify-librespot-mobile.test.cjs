const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict',
  adapter: '../.build/spotify/SpotifyLibrespotAuthentication', library: 'streaming-service-spotify-jam' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const { SpotifyLibrespotAuthentication } = require(Imports.adapter);
const library = require(Imports.library);
const Fixture = Object.freeze({ username: 'test-listener', password: 'artificial-login-password', account: 'canonical-account',
  token: 'artificial-access-token', storedCredential: 'opaque-native-session', requestPrefix: 'session-request-',
  expiryMilliseconds: 1000000, zero: 0, one: 1, two: 2, firstPosition: 0, secondPosition: 1, flushCount: 15,
  emptyIdentifier: '', invalidIdentifier: 'request with spaces', oversizedIdentifier: 'x', oversizedCharacters: 129,
  privateMessage: 'Sensitive native authentication details', privateCode: 'native-internal-failure',
  names: Object.freeze({ login: 'Librespot login forwards credentials only to the injected native request',
    restore: 'Librespot restoration forwards the opaque session without requesting a password',
    unavailable: 'Missing native Librespot support reports unsupported before dispatch',
    preCanceled: 'A pre-canceled request does not resolve or call the native module',
    cancellation: 'Canceling an in-flight Librespot login rejects promptly and cancels only its request',
    cancelRestore: 'Canceling restoration invokes scoped native cancellation',
    beforeDispatch: 'Cancellation before native dispatch never starts or cancels an unrelated request',
    lateFailure: 'A native failure after cancellation cannot change the canceled result',
    typedFailure: 'Known native failure codes survive without sensitive native messages',
    unknownFailure: 'Unknown and primitive native errors expose only a sanitized network failure',
    failedCancel: 'Native cancellation failure cannot prevent local cancellation',
    concurrency: 'Concurrent callers receive distinct request identities and cancel independently',
    invalidIdentifier: 'Invalid request identifiers cannot dispatch native authentication',
    missingResponse: 'An absent native response is rejected before reaching a provider',
    lookupFailure: 'Native module lookup failure is sanitized as unsupported' }) });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushCount; turn += Fixture.one) await Promise.resolve(); }
function input() { return { username: Fixture.username, password: Fixture.password }; }
function grant() { return { accountIdentifier: Fixture.account, accessToken: Fixture.token,
  expiresAtMilliseconds: Fixture.expiryMilliseconds, storedCredential: Fixture.storedCredential }; }
function failure(code) { return value => value instanceof library.IntegrationFailure && value.code === code && !value.message.includes(Fixture.privateMessage); }
function fixture() {
  let sequence = Fixture.zero;
  const state = { nativeAvailable: true, lookupFailure: false, pending: null, cancelFailure: false, identifier: null };
  const calls = { login: [], restore: [], canceled: [], lookups: Fixture.zero };
  const native = { login: async (...parameters) => { calls.login.push(parameters); return state.pending ? state.pending.promise : grant(); },
    restore: async (...parameters) => { calls.restore.push(parameters); return state.pending ? state.pending.promise : grant(); },
    cancel: identifier => { calls.canceled.push(identifier); if (state.cancelFailure) throw new Error(Fixture.privateMessage); } };
  const authentication = new SpotifyLibrespotAuthentication({ native: () => { calls.lookups += Fixture.one;
    if (state.lookupFailure) throw new Error(Fixture.privateMessage); return state.nativeAvailable ? native : null; },
    nextRequestIdentifier: () => state.identifier ?? Fixture.requestPrefix + (sequence += Fixture.one) });
  return { state, calls, authentication, cancellation: new AbortController() };
}
test(Fixture.names.login, async () => { const current = fixture(); assert.deepEqual(await current.authentication.login(input(), current.cancellation.signal), grant());
  assert.deepEqual(current.calls.login, [[Fixture.requestPrefix + Fixture.one, Fixture.username, Fixture.password]]); assert.equal(current.calls.restore.length, Fixture.zero); });
test(Fixture.names.restore, async () => { const current = fixture(); assert.deepEqual(await current.authentication.restore(Fixture.storedCredential, current.cancellation.signal), grant());
  assert.deepEqual(current.calls.restore, [[Fixture.requestPrefix + Fixture.one, Fixture.storedCredential]]); assert.equal(current.calls.login.length, Fixture.zero); });
test(Fixture.names.unavailable, async () => { const current = fixture(); current.state.nativeAvailable = false;
  await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(library.IntegrationFailureCode.Unsupported)); assert.equal(current.calls.login.length, Fixture.zero); });
test(Fixture.names.preCanceled, async () => { const current = fixture(); current.cancellation.abort();
  await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(library.IntegrationFailureCode.Canceled)); assert.equal(current.calls.lookups, Fixture.zero); });
test(Fixture.names.cancellation, async () => { const current = fixture(); current.state.pending = deferred();
  const authorizing = current.authentication.login(input(), current.cancellation.signal); await flush(); current.cancellation.abort();
  await assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled));
  assert.deepEqual(current.calls.canceled, [Fixture.requestPrefix + Fixture.one]); current.state.pending.resolve(grant()); await flush(); });
test(Fixture.names.cancelRestore, async () => { const current = fixture(); current.state.pending = deferred();
  const restoring = current.authentication.restore(Fixture.storedCredential, current.cancellation.signal); await flush(); current.cancellation.abort();
  await assert.rejects(restoring, failure(library.IntegrationFailureCode.Canceled)); assert.deepEqual(current.calls.canceled, [Fixture.requestPrefix + Fixture.one]); current.state.pending.resolve(grant()); });
test(Fixture.names.beforeDispatch, async () => { const current = fixture(); const authorizing = current.authentication.login(input(), current.cancellation.signal); current.cancellation.abort();
  await assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled)); assert.equal(current.calls.login.length, Fixture.zero); assert.equal(current.calls.canceled.length, Fixture.zero); });
test(Fixture.names.lateFailure, async () => { const current = fixture(); current.state.pending = deferred(); const authorizing = current.authentication.login(input(), current.cancellation.signal);
  await flush(); current.cancellation.abort(); await assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled)); current.state.pending.reject(new Error(Fixture.privateMessage)); await flush(); });
test(Fixture.names.typedFailure, async () => { for (const code of [library.IntegrationFailureCode.Unauthorized, library.IntegrationFailureCode.Unsupported, library.IntegrationFailureCode.Deadline]) {
  const current = fixture(); current.state.pending = deferred(); current.state.pending.reject({ code, message: Fixture.privateMessage });
  await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(code)); } });
test(Fixture.names.unknownFailure, async () => { for (const rejection of [new Error(Fixture.privateMessage), Fixture.privateMessage, null, { code: Fixture.privateCode }]) {
  const current = fixture(); current.state.pending = deferred(); current.state.pending.reject(rejection);
  await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(library.IntegrationFailureCode.Network)); } });
test(Fixture.names.failedCancel, async () => { const current = fixture(); current.state.pending = deferred(); current.state.cancelFailure = true;
  const authorizing = current.authentication.login(input(), current.cancellation.signal); await flush(); current.cancellation.abort();
  await assert.rejects(authorizing, failure(library.IntegrationFailureCode.Canceled)); current.state.pending.resolve(grant()); });
test(Fixture.names.concurrency, async () => { const current = fixture(); current.state.pending = deferred(); const otherCancellation = new AbortController();
  const first = current.authentication.login(input(), current.cancellation.signal); const second = current.authentication.login(input(), otherCancellation.signal); await flush(); current.cancellation.abort();
  await assert.rejects(first, failure(library.IntegrationFailureCode.Canceled)); current.state.pending.resolve(grant()); assert.deepEqual(await second, grant());
  assert.notEqual(current.calls.login[Fixture.firstPosition][Fixture.firstPosition], current.calls.login[Fixture.secondPosition][Fixture.firstPosition]);
  assert.deepEqual(current.calls.canceled, [Fixture.requestPrefix + Fixture.one]); });
test(Fixture.names.invalidIdentifier, async () => { for (const identifier of [Fixture.emptyIdentifier, Fixture.invalidIdentifier, Fixture.oversizedIdentifier.repeat(Fixture.oversizedCharacters)]) {
  const current = fixture(); current.state.identifier = identifier; await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(library.IntegrationFailureCode.InvalidInput));
  assert.equal(current.calls.login.length, Fixture.zero); } });
test(Fixture.names.missingResponse, async () => { const current = fixture(); current.state.pending = deferred(); current.state.pending.resolve(undefined);
  await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(library.IntegrationFailureCode.InvalidResponse)); });
test(Fixture.names.lookupFailure, async () => { const current = fixture(); current.state.lookupFailure = true;
  await assert.rejects(current.authentication.login(input(), current.cancellation.signal), failure(library.IntegrationFailureCode.Unsupported)); });

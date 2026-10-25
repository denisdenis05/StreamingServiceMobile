const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  providers: '../.build/spotify/SpotifyLoginProviders' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyLoginProviders } = require(Imports.providers);
const Fixture = Object.freeze({ account: 'application-account', spotifyAccount: 'spotify-account', stored: 'opaque-native-session',
  token: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token', client: '0123456789abcdef0123456789abcdef',
  redirect: 'streamingservicespotify://callback', scope: 'user-read-private', deviceClient: '65b708073fc0480ea92a077233ca87bd', deviceCode: 'private-device-code', userCode: 'ABCDEF',
  verificationAddress: 'https://spotify.com/pair?code=ABCDEF', pollingIntervalMilliseconds: 5000, schema: 1, now: 1000, expiration: 90000,
  proofCharacter: 'x', proofLength: 64, challengeLength: 43, zero: 0, one: 1, malformed: 'invalid-json',
  username: 'synthetic-username', password: 'synthetic-password', privateFailure: 'Sensitive store failure',
  names: Object.freeze({ create: 'Librespot creation binds the application account store and keeps OAuth unused',
    preferred: 'Saved Librespot session restoration takes precedence over a saved OAuth grant',
    fallback: 'Missing Librespot session selects the existing saved OAuth provider',
    missing: 'Missing records return no provider without launching authentication',
    malformed: 'Malformed Librespot record cannot silently select another saved OAuth identity',
    forget: 'Forgetting the application account attempts all namespaces despite synchronous failure',
    resume: 'Browser callback resume selects only its pending OAuth store',
    canceled: 'Pre-canceled provider restoration never starts native or OAuth authentication' }) });
function fixture() {
  const configuration = { clientIdentifier: Fixture.client, redirectAddress: Fixture.redirect, scopes: [Fixture.scope] };
  const state = { native: null, oauth: null, authorization: null, deviceAuthorization: null };
  const calls = { acquired: [], forgotten: [], oauth: [], native: [], device: [] };
  const failingOwners = new Set();
  function owner(namespace) { return {
    acquire(accountIdentifier) { calls.acquired.push({ namespace, accountIdentifier }); return {
      read: async () => state[namespace], write: async serialized => { state[namespace] = serialized; }, clear: async () => { state[namespace] = null; },
    }; },
    forget(accountIdentifier) { calls.forgotten.push({ namespace, accountIdentifier });
      if (failingOwners.has(namespace)) throw new Error(Fixture.privateFailure); state[namespace] = null; return Promise.resolve(); },
  }; }
  const Namespace = Object.freeze({ native: 'native', oauth: 'oauth', authorization: 'authorization', deviceAuthorization: 'deviceAuthorization' });
  const grant = { accountIdentifier: Fixture.spotifyAccount, accessToken: Fixture.token, expiresAtMilliseconds: Fixture.expiration, storedCredential: Fixture.stored };
  const oauthProvider = {};
  const providers = new SpotifyLoginProviders({ librespot: owner(Namespace.native), oauth: owner(Namespace.oauth), authorization: owner(Namespace.authorization),
    deviceAuthorization: owner(Namespace.deviceAuthorization),
    createDeviceAuthorization(accountIdentifier, observer) { calls.device.push(accountIdentifier); return {
      authorize: async () => { observer?.({ userCode: Fixture.userCode, verificationAddress: Fixture.verificationAddress, expiresAtMilliseconds: Fixture.expiration }); return grant; },
      resume: async () => { observer?.({ userCode: Fixture.userCode, verificationAddress: Fixture.verificationAddress, expiresAtMilliseconds: Fixture.expiration }); return grant; },
    }; },
    authentication: { login: async input => { calls.native.push(input); return grant; }, restore: async input => { calls.native.push(input); return grant; } },
    clock: { nowMilliseconds: () => Fixture.now }, createBrowserLogin: (...parameters) => { calls.oauth.push(parameters); return oauthProvider; } });
  return { providers, state, calls, failingOwners, configuration, oauthProvider, Namespace,
    saveDevice() { state.deviceAuthorization = JSON.stringify({ schemaVersion: Fixture.schema, clientIdentifier: Fixture.deviceClient,
      deviceCode: Fixture.deviceCode, userCode: Fixture.userCode, verificationAddress: Fixture.verificationAddress,
      createdAtMilliseconds: Fixture.now, expiresAtMilliseconds: Fixture.expiration, pollingIntervalMilliseconds: Fixture.pollingIntervalMilliseconds }); },
    saveNative() { state.native = JSON.stringify({ schemaVersion: Fixture.schema, accountIdentifier: Fixture.spotifyAccount, storedCredential: Fixture.stored }); },
    saveBrowserLogin() { state.oauth = JSON.stringify({ schemaVersion: Fixture.schema, configuration, accountIdentifier: Fixture.spotifyAccount, refreshToken: Fixture.refreshToken }); },
    savePending() { state.authorization = JSON.stringify({ schemaVersion: Fixture.schema, configuration,
      proof: { state: Fixture.proofCharacter.repeat(Fixture.proofLength), verifier: Fixture.proofCharacter.repeat(Fixture.proofLength),
        challenge: Fixture.proofCharacter.repeat(Fixture.challengeLength) }, createdAtMilliseconds: Fixture.now }); },
  };
}
function signal() { return new AbortController().signal; }
function failure(code) { return value => value instanceof library.IntegrationFailure && value.code === code; }
test(Fixture.names.create, async () => { const current = fixture(); const provider = current.providers.createLibrespot(Fixture.account,
  { username: Fixture.username, password: Fixture.password });
  assert.equal(provider.authenticationMethod, library.SpotifyLoginMethod.Librespot); await provider.login(signal());
  assert.deepEqual(current.calls.acquired, [{ namespace: current.Namespace.native, accountIdentifier: Fixture.account }]);
  assert.equal(current.calls.oauth.length, Fixture.zero); provider.dispose(); });
test(Fixture.names.preferred, async () => { const current = fixture(); current.saveNative(); current.saveBrowserLogin();
  const provider = await current.providers.restore(Fixture.account, signal()); assert.equal(provider.authenticationMethod, library.SpotifyLoginMethod.Librespot);
  await provider.restore(signal()); assert.equal(current.calls.oauth.length, Fixture.zero); assert.deepEqual(current.calls.native, [Fixture.stored]); provider.dispose(); });
test(Fixture.names.fallback, async () => { const current = fixture(); current.saveBrowserLogin();
  assert.equal(await current.providers.restore(Fixture.account, signal()), current.oauthProvider); assert.deepEqual(current.calls.oauth[Fixture.zero][Fixture.zero], current.configuration); });
test(Fixture.names.missing, async () => { const current = fixture(); assert.equal(await current.providers.restore(Fixture.account, signal()), null);
  assert.equal(current.calls.native.length + current.calls.oauth.length, Fixture.zero); });
test(Fixture.names.malformed, async () => { const current = fixture(); current.state.native = Fixture.malformed; current.saveBrowserLogin();
  await assert.rejects(current.providers.restore(Fixture.account, signal()), failure(library.IntegrationFailureCode.InvalidResponse));
  assert.equal(current.calls.oauth.length + current.calls.native.length, Fixture.zero); });
test(Fixture.names.forget, async () => { const current = fixture(); current.saveNative(); current.saveBrowserLogin(); current.savePending(); current.saveDevice();
  current.failingOwners.add(current.Namespace.native); await assert.rejects(current.providers.forget(Fixture.account), failure(library.IntegrationFailureCode.CredentialStorage));
  assert.deepEqual(current.calls.forgotten, Object.values(current.Namespace).map(namespace => ({ namespace, accountIdentifier: Fixture.account })));
  assert.equal(current.state.oauth, null); assert.equal(current.state.authorization, null); });
test(Fixture.names.resume, async () => { const current = fixture(); current.saveNative(); current.savePending();
  assert.equal(await current.providers.resume(Fixture.account, signal()), current.oauthProvider);
  assert.equal(current.calls.native.length, Fixture.zero); assert.equal(current.calls.oauth.length, Fixture.one); });
test(Fixture.names.canceled, async () => { const current = fixture(); current.saveNative(); const cancellation = new AbortController(); cancellation.abort();
  await assert.rejects(current.providers.restore(Fixture.account, cancellation.signal), failure(library.IntegrationFailureCode.Canceled));
  assert.equal(current.calls.native.length + current.calls.oauth.length, Fixture.zero); });

const DeviceProviderNames = Object.freeze({ create: 'Device login needs no password and binds the application account native store',
  pending: 'Pending device pairing resumes before saved developer OAuth without reopening the browser',
  invalid: 'Malformed pending device authorization cannot silently switch to saved OAuth',
  nativeFirst: 'A valid native session remains preferred over a pending device transaction' });
test(DeviceProviderNames.create, async () => { const current = fixture(); const views = [];
  const provider = current.providers.createDeviceLogin(Fixture.account, undefined, view => views.push(view)); await provider.login(signal());
  assert.deepEqual(current.calls.device, [Fixture.account]); assert.equal(current.calls.native.length + current.calls.oauth.length, Fixture.zero);
  assert.equal(views[Fixture.zero].userCode, Fixture.userCode); provider.dispose(); });
test(DeviceProviderNames.pending, async () => { const current = fixture(); current.saveDevice(); current.saveBrowserLogin(); const views = [];
  const provider = await current.providers.restore(Fixture.account, signal(), undefined, view => views.push(view));
  await provider.restore(signal()); assert.deepEqual(current.calls.device, [Fixture.account]); assert.equal(current.calls.oauth.length, Fixture.zero);
  assert.equal(views[Fixture.zero].verificationAddress, Fixture.verificationAddress); provider.dispose(); });
test(DeviceProviderNames.invalid, async () => { const current = fixture(); current.state.deviceAuthorization = Fixture.malformed; current.saveBrowserLogin();
  await assert.rejects(current.providers.restore(Fixture.account, signal()), failure(library.IntegrationFailureCode.InvalidResponse));
  assert.equal(current.calls.oauth.length + current.calls.device.length, Fixture.zero); });
test(DeviceProviderNames.nativeFirst, async () => { const current = fixture(); current.saveNative(); current.saveDevice();
  const provider = await current.providers.restore(Fixture.account, signal()); await provider.restore(signal());
  assert.equal(current.calls.device.length, Fixture.zero); provider.dispose(); });

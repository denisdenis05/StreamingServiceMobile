const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const axios = require('axios');
const { ApplicationAuthenticationSession } = require('../.build/audio-migration/ApplicationAuthenticationSession');
const { deferred } = require('./fixtures/queue-rewrite.cjs');
const Fixture = Object.freeze({ filename: '../src/services/ApplicationNetworkClient.ts', encoding: 'utf8', axiosModule: 'axios',
  cookiesModule: '@react-native-cookies/cookies', nativeModule: 'react-native', placeholdersModule: '../constants/placeholders',
  authenticationModule: './AuthenticationService', platform: 'android', server: 'https://network.example.invalid/', route: 'lastfm/session',
  loginRoute: 'authentication/login', oldToken: 'old', newToken: 'new', account: 'account-one', otherAccount: 'account-two',
  base64: 'base64url', tokenHeader: 'header', tokenSignature: 'signature', separator: '.', header: 'Authorization', bearer: 'Bearer ',
  unauthorized: 401, success: 200, status: 'fixture', timeoutMilliseconds: 15000, initialCount: 0, oneCall: 1, twoCalls: 2,
  firstIndex: 0, secondIndex: 1, unauthorizedCode: 'ERR_BAD_REQUEST' });
const token = (subject, nonce) => [Fixture.tokenHeader, Buffer.from(JSON.stringify({ sub: subject, nonce })).toString(Fixture.base64), Fixture.tokenSignature].join(Fixture.separator);
const compiled = typescript.transpileModule(readFileSync(resolve(__dirname, Fixture.filename), Fixture.encoding), {
  compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
function environment() {
  let refresh = async () => token(Fixture.account, Fixture.newToken); let refreshCalls = Fixture.initialCount;
  const session = new ApplicationAuthenticationSession({ read: async () => ({ isLoggedIn: false, token: null }), async write() {} },
    () => { refreshCalls += Fixture.oneCall; return refresh(); }, () => undefined);
  const module = { exports: {} };
  runInNewContext(compiled, { exports: module.exports, module, require(name) {
    if (name === Fixture.axiosModule) return axios;
    if (name === Fixture.cookiesModule) return { async flush() {} };
    if (name === Fixture.nativeModule) return { Platform: { OS: Fixture.platform } };
    if (name === Fixture.placeholdersModule) return { TEMPORARY_API_URL: Fixture.server };
    if (name === Fixture.authenticationModule) return { authenticationSession: session, AuthenticationStoragePolicy: {
      timeoutMilliseconds: Fixture.timeoutMilliseconds, authorizationHeader: Fixture.header, bearerPrefix: Fixture.bearer } };
    throw new Error(name);
  } });
  return { session, create: module.exports.createApplicationNetworkClient,
    setRefresh(operation) { refresh = operation; }, get refreshCalls() { return refreshCalls; } };
}
function response(configuration, data = {}) {
  return { config: configuration, data, headers: {}, status: Fixture.success, statusText: Fixture.status };
}
function unauthorized(configuration) {
  return new axios.AxiosError(Fixture.status, Fixture.unauthorizedCode, configuration, undefined,
    { ...response(configuration), status: Fixture.unauthorized });
}
test('application requests await restoration and attach the current bearer token', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account, Fixture.oldToken));
  const client = scenario.create(); client.defaults.adapter = async configuration => {
    assertion.equal(configuration.headers.get(Fixture.header), Fixture.bearer + token(Fixture.account, Fixture.oldToken));
    assertion.equal(configuration.timeout, Fixture.timeoutMilliseconds); return response(configuration);
  };
  await client.get(Fixture.route);
});
test('independent clients share one token refresh for simultaneous unauthorized responses', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account, Fixture.oldToken));
  const pending = deferred(); const started = deferred(); scenario.setRefresh(() => { started.resolve(); return pending.promise; });
  const clients = [scenario.create(), scenario.create()];
  for (const client of clients) client.defaults.adapter = async configuration => {
    if (configuration.headers.get(Fixture.header) === Fixture.bearer + token(Fixture.account, Fixture.oldToken)) throw unauthorized(configuration);
    return response(configuration);
  };
  const requests = clients.map(client => client.get(Fixture.route)); await started.promise;
  pending.resolve(token(Fixture.account, Fixture.newToken)); await Promise.all(requests);
  assertion.equal(scenario.refreshCalls, Fixture.oneCall);
});
test('an unauthorized replay is attempted once and then rejected', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account, Fixture.oldToken)); let calls = Fixture.initialCount;
  const client = scenario.create(); client.defaults.adapter = async configuration => { calls += Fixture.oneCall; throw unauthorized(configuration); };
  await assertion.rejects(client.get(Fixture.route)); assertion.equal(calls, Fixture.twoCalls); assertion.equal(scenario.refreshCalls, Fixture.oneCall);
});
test('authentication endpoints do not recursively request refresh', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account, Fixture.oldToken));
  const client = scenario.create(); client.defaults.adapter = async configuration => { throw unauthorized(configuration); };
  await assertion.rejects(client.post(Fixture.loginRoute)); assertion.equal(scenario.refreshCalls, Fixture.initialCount);
});
test('old account reports keep their captured token and cannot refresh the new account', async () => {
  const scenario = environment(); const captured = token(Fixture.account, Fixture.oldToken); await scenario.session.login(captured);
  const client = scenario.create({ accountIdentifier: Fixture.account, token: captured });
  await scenario.session.login(token(Fixture.otherAccount, Fixture.newToken));
  client.defaults.adapter = async configuration => {
    assertion.equal(configuration.headers.get(Fixture.header), Fixture.bearer + captured); throw unauthorized(configuration);
  };
  await assertion.rejects(client.post(Fixture.route)); assertion.equal(scenario.refreshCalls, Fixture.initialCount);
  assertion.equal(scenario.session.getSnapshot().accountIdentifier, Fixture.otherAccount);
});
test('a delayed unauthorized response cannot replay under a different account', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account, Fixture.oldToken));
  const client = scenario.create(); const pending = deferred(); const started = deferred(); let calls = Fixture.initialCount;
  client.defaults.adapter = async configuration => { calls += Fixture.oneCall; started.resolve(); await pending.promise; throw unauthorized(configuration); };
  const rejected = assertion.rejects(client.get(Fixture.route)); await started.promise;
  await scenario.session.login(token(Fixture.otherAccount, Fixture.newToken)); pending.resolve(); await rejected;
  assertion.equal(calls, Fixture.oneCall); assertion.equal(scenario.refreshCalls, Fixture.initialCount);
});
test('a late login response cannot replace a more recently selected account', async () => {
  const scenario = environment(); const client = scenario.create(); const pending = deferred(); const started = deferred();
  client.defaults.adapter = async configuration => { started.resolve(); await pending.promise;
    return response(configuration, { token: token(Fixture.account, Fixture.oldToken) }); };
  const login = client.post(Fixture.loginRoute); await started.promise;
  await scenario.session.login(token(Fixture.otherAccount, Fixture.newToken)); pending.resolve(); await login;
  assertion.equal(scenario.session.getSnapshot().accountIdentifier, Fixture.otherAccount);
});

const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { ApplicationAuthenticationSession } = require('../.build/audio-migration/ApplicationAuthenticationSession');
const { deferred } = require('./fixtures/queue-rewrite.cjs');
const Fixture = Object.freeze({ account: 'account-one', otherAccount: 'account-two', firstToken: 'first', refreshedToken: 'refreshed',
  emptyCount: 0, oneCall: 1, firstIndex: 0, secondIndex: 1, encoding: 'base64url', separator: '.', header: 'header', signature: 'signature', failure: 'storage failure' });
function token(subject, nonce = Fixture.firstToken) {
  return [Fixture.header, Buffer.from(JSON.stringify({ sub: subject, nonce })).toString(Fixture.encoding), Fixture.signature].join(Fixture.separator);
}
function environment() {
  const writes = []; const failures = []; let read = async () => ({ token: null, isLoggedIn: false });
  let refresh = async () => token(Fixture.account, Fixture.refreshedToken); let refreshCalls = Fixture.emptyCount;
  const session = new ApplicationAuthenticationSession({ read: () => read(), write: async state => { writes.push(state); } },
    capturedToken => { refreshCalls += Fixture.oneCall; return refresh(capturedToken); }, failure => failures.push(failure));
  return { session, writes, failures, setRead(operation) { read = operation; }, setRefresh(operation) { refresh = operation; },
    get refreshCalls() { return refreshCalls; } };
}
test('restoration shares one storage read and exposes the stored account', async () => {
  const scenario = environment(); const pending = deferred(); let calls = Fixture.emptyCount;
  scenario.setRead(() => { calls += Fixture.oneCall; return pending.promise; });
  const first = scenario.session.restore(); assertion.equal(first, scenario.session.restore());
  pending.resolve({ token: token(Fixture.account), isLoggedIn: true }); await first;
  assertion.equal(calls, Fixture.oneCall); assertion.equal(scenario.session.getSnapshot().accountIdentifier, Fixture.account);
  assertion.equal(scenario.session.getSnapshot().restored, true);
});
test('delayed restoration cannot overwrite a newly logged in account', async () => {
  const scenario = environment(); const pending = deferred(); scenario.setRead(() => pending.promise);
  const restoring = scenario.session.restore(); await scenario.session.login(token(Fixture.otherAccount));
  pending.resolve({ token: token(Fixture.account), isLoggedIn: true }); await restoring;
  assertion.equal(scenario.session.getSnapshot().accountIdentifier, Fixture.otherAccount);
});
test('delayed restoration cannot undo logout', async () => {
  const scenario = environment(); const pending = deferred(); scenario.setRead(() => pending.promise);
  const restoring = scenario.session.restore(); await scenario.session.logout();
  pending.resolve({ token: token(Fixture.account), isLoggedIn: true }); await restoring;
  assertion.equal(scenario.session.getSnapshot().isLoggedIn, false);
});
test('concurrent unauthorized requests share token refresh and persist the rotation', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account));
  const pending = deferred(); scenario.setRefresh(() => pending.promise);
  const first = scenario.session.refresh(); assertion.equal(first, scenario.session.refresh());
  pending.resolve(token(Fixture.account, Fixture.refreshedToken)); await first;
  assertion.equal(scenario.refreshCalls, Fixture.oneCall);
  assertion.equal(await scenario.session.getToken(), token(Fixture.account, Fixture.refreshedToken));
});
test('a late refresh success cannot replace another account', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account)); const pending = deferred();
  scenario.setRefresh(() => pending.promise); const refreshing = scenario.session.refresh();
  await scenario.session.login(token(Fixture.otherAccount)); pending.resolve(token(Fixture.account, Fixture.refreshedToken));
  assertion.equal(await refreshing, null); assertion.equal(scenario.session.getSnapshot().accountIdentifier, Fixture.otherAccount);
});
test('a late refresh failure cannot log out another account', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account)); const pending = deferred();
  scenario.setRefresh(() => pending.promise); const rejected = assertion.rejects(scenario.session.refresh());
  await scenario.session.login(token(Fixture.otherAccount)); pending.reject(new Error(Fixture.failure)); await rejected;
  assertion.equal(scenario.session.getSnapshot().accountIdentifier, Fixture.otherAccount);
});
test('a token refreshed for another subject logs out the original account', async () => {
  const scenario = environment(); await scenario.session.login(token(Fixture.account));
  scenario.setRefresh(async () => token(Fixture.otherAccount)); await assertion.rejects(scenario.session.refresh());
  assertion.equal(scenario.session.getSnapshot().isLoggedIn, false);
});
test('storage failures are reported while the published login remains usable', async () => {
  const failures = []; const session = new ApplicationAuthenticationSession({ read: async () => { throw new Error(Fixture.failure); },
    write: async () => { throw new Error(Fixture.failure); } }, async () => null, failure => failures.push(failure));
  await session.restore(); await session.login(token(Fixture.account));
  assertion.equal(session.getSnapshot().accountIdentifier, Fixture.account); assertion.ok(failures.length > Fixture.emptyCount);
});
test('authentication persistence writes retain login then logout order', async () => {
  const scenario = environment(); const login = scenario.session.login(token(Fixture.account)); const logout = scenario.session.logout();
  await Promise.all([login, logout]); assertion.equal(scenario.writes[Fixture.firstIndex].isLoggedIn, true);
  assertion.equal(scenario.writes[Fixture.secondIndex].isLoggedIn, false);
});
module.exports = { token };

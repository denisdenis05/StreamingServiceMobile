const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  task: '../.build/spotify/SpotifyBackgroundAuthenticationTask' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { IntegrationFailureCode } = require(Modules.library);
const { SpotifyBackgroundAuthenticationTask } = require(Modules.task);
const Fixture = Object.freeze({ request: 'synthetic-authentication-request', account: 'synthetic-app-account', otherAccount: 'synthetic-other-account',
  spotifyAccount: 'synthetic-spotify-account', session: 'synthetic-jam', host: 'synthetic-host', baseAddress: 'https://media.example.test/api/',
  otherAddress: 'https://other.example.test/api/', token: 'synthetic-private-token', renewedToken: 'synthetic-renewed-private-token',
  handle: 7, generation: 3, emptyCount: 0, singleCount: 1, flushTurns: 20, invalidIdentifier: 'unsafe request', failure: 'synthetic private error',
  names: { completed: 'Background authentication refreshes the captured app account and completes only its pending native job',
    empty: 'An unclaimed background authentication job performs no account restoration',
    input: 'Malformed scope and server replacement fail before account refresh',
    identifier: 'Unsafe request identifiers fail before native claim',
    restored: 'A restored logout or foreign account cannot refresh the old native owner',
    changed: 'Account replacement while refreshing prevents native credential mutation',
    timeout: 'Background refresh timeout retires the native request and ignores late renewal',
    cancellation: 'Cancellation during refresh cannot complete the native request later',
    retired: 'Retired native scope after refresh cannot receive the token',
    failure: 'Refresh and native completion failures retire only the claimed native job',
    capture: 'Native authentication scope is copied before asynchronous account work' } });
const FailureCases = Object.freeze({ refresh: 'refreshFailure', completion: 'completionFailure' });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.emptyCount; turn < Fixture.flushTurns; turn += Fixture.singleCount) await Promise.resolve(); }
function job() { return { requestIdentifier: Fixture.request, streamingServiceAccountIdentifier: Fixture.account,
  spotifyAccountIdentifier: Fixture.spotifyAccount, jamSessionIdentifier: Fixture.session, hostDeviceIdentifier: Fixture.host,
  handle: Fixture.handle, generation: Fixture.generation, baseAddress: Fixture.baseAddress }; }
function fixture() {
  const state = { job: job(), account: { accountIdentifier: Fixture.account, token: Fixture.token, isLoggedIn: true },
    pending: true, refresh: null, refreshFailure: false, completionFailure: false, afterRefresh: () => undefined };
  const calls = { restored: Fixture.emptyCount, refreshed: Fixture.emptyCount, completed: [], failed: [], timers: [] };
  const task = new SpotifyBackgroundAuthenticationTask({ baseAddress: Fixture.baseAddress,
    async claim() { return state.job; }, async isPending() { return state.pending; },
    async complete(selected, token) { if (state.completionFailure) throw new Error(Fixture.failure); calls.completed.push({ job: selected, token }); },
    async fail(identifier) { calls.failed.push(identifier); },
    async restoreAccount() { calls.restored += Fixture.singleCount; },
    async refreshAccount() {
      calls.refreshed += Fixture.singleCount;
      if (state.refreshFailure) throw new Error(Fixture.failure);
      if (state.refresh) await state.refresh.promise;
      state.account = { ...state.account, token: Fixture.renewedToken }; state.afterRefresh();
    }, currentAccount: () => state.account,
    scheduler: { schedule(delay, action) { const timer = { delay, action, canceled: false }; calls.timers.push(timer); return () => { timer.canceled = true; }; } },
  });
  return { state, calls, task };
}
test(Fixture.names.completed, async () => {
  const current = fixture(); await current.task.execute(Fixture.request);
  assertion.equal(current.calls.restored, Fixture.singleCount); assertion.equal(current.calls.refreshed, Fixture.singleCount);
  assertion.deepEqual(current.calls.completed, [{ job: job(), token: Fixture.renewedToken }]);
  assertion.deepEqual(current.calls.failed, []); assertion.equal(current.calls.timers[Fixture.emptyCount].canceled, true);
});
test(Fixture.names.empty, async () => {
  const current = fixture(); current.state.job = null; await current.task.execute(Fixture.request);
  assertion.equal(current.calls.restored, Fixture.emptyCount); assertion.equal(current.calls.refreshed, Fixture.emptyCount);
});
test(Fixture.names.input, async () => {
  for (const overrides of [{ handle: Fixture.emptyCount }, { baseAddress: Fixture.otherAddress }, { hostDeviceIdentifier: Fixture.invalidIdentifier }]) {
    const current = fixture(); current.state.job = { ...job(), ...overrides }; await current.task.execute(Fixture.request);
    assertion.equal(current.calls.restored, Fixture.emptyCount); assertion.equal(current.calls.refreshed, Fixture.emptyCount);
    assertion.deepEqual(current.calls.failed, [Fixture.request]);
  }
});
test(Fixture.names.identifier, async () => {
  const current = fixture(); await assertion.rejects(current.task.execute(Fixture.invalidIdentifier), { code: IntegrationFailureCode.InvalidInput });
  assertion.equal(current.calls.restored, Fixture.emptyCount);
});
test(Fixture.names.restored, async () => {
  for (const overrides of [{ isLoggedIn: false }, { accountIdentifier: Fixture.otherAccount }]) {
    const current = fixture(); current.state.account = { ...current.state.account, ...overrides };
    await current.task.execute(Fixture.request); assertion.equal(current.calls.refreshed, Fixture.emptyCount);
    assertion.deepEqual(current.calls.completed, []); assertion.deepEqual(current.calls.failed, [Fixture.request]);
  }
});
test(Fixture.names.changed, async () => {
  const current = fixture(); current.state.refresh = deferred(); const running = current.task.execute(Fixture.request); await flush();
  current.state.account = { ...current.state.account, accountIdentifier: Fixture.otherAccount };
  current.state.refresh.resolve(); await running;
  assertion.deepEqual(current.calls.completed, []); assertion.deepEqual(current.calls.failed, [Fixture.request]);
});
test(Fixture.names.timeout, async () => {
  const current = fixture(); current.state.refresh = deferred(); const running = current.task.execute(Fixture.request); await flush();
  current.calls.timers[Fixture.emptyCount].action(); await running;
  current.state.refresh.resolve(); await flush(); assertion.deepEqual(current.calls.completed, []);
  assertion.deepEqual(current.calls.failed, [Fixture.request]);
});
test(Fixture.names.cancellation, async () => {
  const current = fixture(); current.state.refresh = deferred(); const cancellation = new AbortController();
  const running = current.task.execute(Fixture.request, cancellation.signal); await flush(); cancellation.abort(); await running;
  current.state.refresh.resolve(); await flush(); assertion.deepEqual(current.calls.completed, []);
});
test(Fixture.names.retired, async () => {
  const current = fixture(); current.state.afterRefresh = () => { current.state.pending = false; };
  await current.task.execute(Fixture.request); assertion.deepEqual(current.calls.completed, []);
});
test(Fixture.names.failure, async () => {
  for (const selected of Object.values(FailureCases)) {
    const current = fixture(); current.state[selected] = true; await current.task.execute(Fixture.request);
    assertion.deepEqual(current.calls.completed, []); assertion.deepEqual(current.calls.failed, [Fixture.request]);
  }
});
test(Fixture.names.capture, async () => {
  const current = fixture(); current.state.refresh = deferred(); const running = current.task.execute(Fixture.request); await flush();
  current.state.job.streamingServiceAccountIdentifier = Fixture.otherAccount;
  current.state.refresh.resolve(); await running;
  assertion.deepEqual(current.calls.completed, [{ job: job(), token: Fixture.renewedToken }]);
  assertion.equal(Object.isFrozen(current.calls.completed[Fixture.emptyCount].job), true);
});

const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { QueueIntentScheduler, QueueIntentCancellation, QueueIntentKind, QueueIntentSupersededError } = require('../.build/audio-migration/QueueIntentScheduler');
const { Fixture, deferred, settleUntil } = require('./fixtures/queue-rewrite.cjs');

const IntentFixture = Object.freeze({ firstResult: 'first-result', secondResult: 'second-result' });
const TestNames = Object.freeze({
  order: 'intent slots reserve invocation order before asynchronous work begins',
  failure: 'an intent failure does not poison the next reserved slot',
  cancelAll: 'canceling all intents rejects running and queued waiters promptly',
  cancelOwner: 'canceling one owner preserves queued intents for a different owner',
  cancelPreparation: 'canceling prepared intents preserves an independent edit slot',
  queuedCancel: 'canceling a queued slot cannot let a later slot overtake an uncanceled predecessor',
  lateFailure: 'a rejected late worker after cancellation is consumed without poisoning later slots',
  lateSuccess: 'a successful late worker cannot fulfill a canceled intent',
  cancellation: 'cancellation is idempotent and its identity predicate changes synchronously',
  immediateCancel: 'an operation that cancels its own lease rejects without an unhandled worker rejection',
  requirements: 'a canceled lease rejects its synchronous current requirement',
});
test(TestNames.order, async () => {
  const scheduler = new QueueIntentScheduler(); const owner = {}; const pending = deferred(); const calls = [];
  const first = scheduler.enqueue(owner, QueueIntentKind.PreparedAppend, async () => { calls.push(IntentFixture.firstResult); await pending.promise; return IntentFixture.firstResult; });
  const second = scheduler.enqueue(owner, QueueIntentKind.Edit, async () => { calls.push(IntentFixture.secondResult); return IntentFixture.secondResult; });
  await settleUntil(() => calls.length === Fixture.singleCount); assertion.deepEqual(calls, [IntentFixture.firstResult]);
  pending.resolve(); assertion.equal(await first, IntentFixture.firstResult); assertion.equal(await second, IntentFixture.secondResult);
  assertion.deepEqual(calls, [IntentFixture.firstResult, IntentFixture.secondResult]);
});
test(TestNames.failure, async () => {
  const scheduler = new QueueIntentScheduler(); const owner = {};
  const first = scheduler.enqueue(owner, QueueIntentKind.Edit, async () => { throw new Error(Fixture.failure); }); const rejected = assertion.rejects(first);
  const second = scheduler.enqueue(owner, QueueIntentKind.Edit, async () => IntentFixture.secondResult); await rejected;
  assertion.equal(await second, IntentFixture.secondResult);
});
test(TestNames.cancelAll, async () => {
  const scheduler = new QueueIntentScheduler(); const owner = {}; const pending = deferred(); const started = deferred();
  const first = scheduler.enqueue(owner, QueueIntentKind.PreparedAppend, async () => { started.resolve(); return pending.promise; });
  const rejectedFirst = assertion.rejects(first, QueueIntentSupersededError); await started.promise; let called = false;
  const second = scheduler.enqueue(owner, QueueIntentKind.Edit, async () => { called = true; }); const rejectedSecond = assertion.rejects(second, QueueIntentSupersededError);
  scheduler.cancelAll(); scheduler.cancelAll(); await rejectedFirst; await rejectedSecond;
  assertion.equal(called, false); pending.resolve();
});
test(TestNames.cancelOwner, async () => {
  const scheduler = new QueueIntentScheduler(); const firstOwner = {}; const secondOwner = {}; const pending = deferred(); const started = deferred();
  const first = scheduler.enqueue(firstOwner, QueueIntentKind.Replacement, async () => { started.resolve(); return pending.promise; });
  const rejected = assertion.rejects(first); await started.promise;
  const second = scheduler.enqueue(secondOwner, QueueIntentKind.Edit, async () => IntentFixture.secondResult);
  scheduler.cancelOwner(firstOwner); await rejected; assertion.equal(await second, IntentFixture.secondResult); pending.resolve();
});
test(TestNames.cancelPreparation, async () => {
  const scheduler = new QueueIntentScheduler(); const owner = {}; const pending = deferred(); const started = deferred();
  const preparation = scheduler.enqueue(owner, QueueIntentKind.PreparedAppend, async () => { started.resolve(); return pending.promise; });
  const rejected = assertion.rejects(preparation); await started.promise;
  const edit = scheduler.enqueue(owner, QueueIntentKind.Edit, async () => IntentFixture.secondResult);
  scheduler.cancelPreparation(); await rejected; assertion.equal(await edit, IntentFixture.secondResult); pending.resolve();
});
test(TestNames.queuedCancel, async () => {
  const scheduler = new QueueIntentScheduler(); const firstOwner = {}; const canceledOwner = {}; const pending = deferred(); const started = deferred();
  const first = scheduler.enqueue(firstOwner, QueueIntentKind.Edit, async () => { started.resolve(); return pending.promise; }); await started.promise;
  const second = scheduler.enqueue(canceledOwner, QueueIntentKind.Edit, async () => {}); const rejectedSecond = assertion.rejects(second);
  let thirdStarted = false;
  const third = scheduler.enqueue(firstOwner, QueueIntentKind.Edit, async () => { thirdStarted = true; });
  scheduler.cancelOwner(canceledOwner); await rejectedSecond; assertion.equal(thirdStarted, false);
  pending.resolve(); await first; await third; assertion.equal(thirdStarted, true);
});
test(TestNames.lateFailure, async () => {
  const scheduler = new QueueIntentScheduler(); const owner = {}; const pending = deferred(); const started = deferred();
  const first = scheduler.enqueue(owner, QueueIntentKind.Replacement, async () => { started.resolve(); return pending.promise; });
  const rejected = assertion.rejects(first); await started.promise; scheduler.cancelOwner(owner); await rejected;
  pending.reject(new Error(Fixture.failure));
  assertion.equal(await scheduler.enqueue({}, QueueIntentKind.Edit, async () => IntentFixture.secondResult), IntentFixture.secondResult);
});
test(TestNames.lateSuccess, async () => {
  const scheduler = new QueueIntentScheduler(); const owner = {}; const pending = deferred(); const started = deferred();
  const first = scheduler.enqueue(owner, QueueIntentKind.Replacement, async () => { started.resolve(); return pending.promise; });
  const rejected = assertion.rejects(first, QueueIntentSupersededError); await started.promise; scheduler.cancelAll(); pending.resolve(IntentFixture.firstResult); await rejected;
});
test(TestNames.cancellation, async () => {
  const cancellation = new QueueIntentCancellation(); assertion.equal(cancellation.isCurrent(), true);
  cancellation.cancel(); cancellation.cancel(); assertion.equal(cancellation.isCurrent(), false);
  await assertion.rejects(cancellation.waitFor(Promise.resolve(IntentFixture.firstResult)), QueueIntentSupersededError);
});
test(TestNames.immediateCancel, async () => {
  const scheduler = new QueueIntentScheduler();
  await assertion.rejects(scheduler.enqueue({}, QueueIntentKind.Edit, async cancellation => {
    cancellation.cancel(); throw new Error(Fixture.failure);
  }));
});
test(TestNames.requirements, () => {
  const cancellation = new QueueIntentCancellation(); cancellation.requireCurrent(); cancellation.cancel();
  assertion.throws(() => cancellation.requireCurrent(), QueueIntentSupersededError);
});

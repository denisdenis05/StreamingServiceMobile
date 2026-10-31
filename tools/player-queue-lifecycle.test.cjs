const test = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackQueueChangeLifecycleRegistry, PlaybackQueueChangeKind } = require('../.build/audio-migration/PlaybackQueueChangeLifecycle');
const { QueueIntentSupersededError } = require('../.build/audio-migration/QueueIntentScheduler');
const Fixture = Object.freeze({ initial: 0, single: 1 });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
function request() { return { kind: PlaybackQueueChangeKind.Replace, tracks: [], isCurrent: () => true }; }
test('Local queue changes work when no integration is attached', async () => {
  const registry = new PlaybackQueueChangeLifecycleRegistry(); const receipt = await registry.prepare(request()); await receipt.committed();
});
test('An attached integration receives preparation and only commits after the actual caller receipt', async () => {
  const registry = new PlaybackQueueChangeLifecycleRegistry(); let commits = Fixture.initial; const prepared = [];
  registry.attach({ async prepare(value) { prepared.push(value.kind); return { async committed() { commits += Fixture.single; } }; } });
  const receipt = await registry.prepare(request()); assertion.equal(commits, Fixture.initial); await receipt.committed();
  assertion.deepEqual(prepared, [PlaybackQueueChangeKind.Replace]); assertion.equal(commits, Fixture.single);
});
test('Replacing an integration during preparation rejects the stale queue intent', async () => {
  const registry = new PlaybackQueueChangeLifecycleRegistry(); const delayed = deferred();
  registry.attach({ async prepare() { return delayed.promise; } }); const preparing = registry.prepare(request());
  const rejected = assertion.rejects(preparing, QueueIntentSupersededError);
  registry.attach({ async prepare() { return { async committed() {} }; } }); delayed.resolve({ async committed() {} }); await rejected;
});
test('Retirement after preparation prevents stale publication and old detach cannot clear a new owner', async () => {
  const registry = new PlaybackQueueChangeLifecycleRegistry(); let commits = Fixture.initial;
  const detach = registry.attach({ async prepare() { return { async committed() { commits += Fixture.single; } }; } });
  const receipt = await registry.prepare(request()); registry.attach({ async prepare() { return { async committed() { commits += Fixture.single; } }; } });
  detach(); await receipt.committed(); assertion.equal(commits, Fixture.initial);
  await (await registry.prepare(request())).committed(); assertion.equal(commits, Fixture.single);
});
test('A newer user cursor predicate prevents committing prepared mappings', async () => {
  const registry = new PlaybackQueueChangeLifecycleRegistry(); let commits = Fixture.initial; let current = true;
  registry.attach({ async prepare() { return { async committed() { commits += Fixture.single; } }; } });
  const receipt = await registry.prepare({ ...request(), isCurrent: () => current }); current = false; await receipt.committed(); assertion.equal(commits, Fixture.initial);
});

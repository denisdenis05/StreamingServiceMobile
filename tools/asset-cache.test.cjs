const { test } = require('node:test');
const assertion = require('node:assert/strict');
const crypto = require('node:crypto');
const { AssetCache, AssetCachePolicy } = require('../.build/assets/AssetCache');
const { assetIdentity } = require('../.build/assets/AssetIdentity');
const Fixture = Object.freeze({ directory: '/cache', address: 'https://images.invalid/cover.jpg', changed: 'https://images.invalid/changed.jpg',
  scope: 'account-one', otherScope: 'account-two', zero: 0, one: 1, bytes: 32, now: 1000,
  budget: 100000, age: 100000, checksum: 'sha256', microtasks: 40, failure: 'fixture failure' });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let index = Fixture.zero; index < Fixture.microtasks; index += Fixture.one) await Promise.resolve(); }
function environment(changes = {}) {
  const files = new Map(); const downloads = []; const events = []; let now = Fixture.now; let sequence = Fixture.zero;
  const filesystem = {
    async ensureDirectory() {}, async information(path) { const value = files.get(path); return value === undefined ? null
      : { path, size: value.length, modifiedMilliseconds: now, isFile: true }; },
    async list(path) { return [...files.keys()].filter(filename => filename.startsWith(path)).map(filename =>
      ({ path: filename, size: files.get(filename).length, modifiedMilliseconds: now, isFile: true })); },
    async read(path) { if (!files.has(path)) throw new Error(Fixture.failure); return files.get(path).toString(); },
    async write(path, value) { files.set(path, Buffer.from(value)); },
    async move(source, destination) { if (!files.has(source)) throw new Error(Fixture.failure); files.set(destination, files.get(source)); files.delete(source); },
    async remove(path) { for (const filename of [...files.keys()]) if (filename === path || filename.startsWith(path + '/')) files.delete(filename); },
    async checksum(path) { return crypto.createHash(Fixture.checksum).update(files.get(path)).digest('hex'); },
  };
  const dependencies = { filesystem, nowMilliseconds: () => now, nextIdentifier: () => String(sequence += Fixture.one), report: event => events.push(event),
    delay() { return { result: Promise.resolve(), cancel() {} }; },
    async validate() {}, download(request, path) {
      const pending = deferred(); const operation = { request, path, pending, canceled: false,
        complete(response = {}) { files.set(path, Buffer.alloc(Fixture.bytes, Fixture.one));
          pending.resolve({ status: AssetCachePolicy.successStatus, bytes: Fixture.bytes, expectedBytes: Fixture.bytes,
            contentType: 'image/jpeg', ...response }); } };
      downloads.push(operation); return { result: pending.promise, cancel() { operation.canceled = true; } };
    } };
  const cache = new AssetCache(dependencies, { directory: Fixture.directory, maximumBytes: Fixture.budget,
    byteBudget: Fixture.budget, maximumAgeMilliseconds: Fixture.age, maximumParallelDownloads: Fixture.one,
    verifyChecksum: true, ...changes });
  const request = { address: Fixture.address, scope: Fixture.scope };
  return { files, downloads, dependencies, cache, request, events, setNow(value) { now = value; },
    async complete(index = Fixture.zero, response) { await flush(); downloads[index].complete(response); await flush(); } };
}
test('cache identities match SHA256 for empty, ASCII, Unicode and multiple-block inputs', () => {
  for (const value of ['', 'abc', '😀é', 'a'.repeat(10000)]) assertion.equal(assetIdentity(value), crypto.createHash(Fixture.checksum).update(value).digest('hex'));
});
test('different URLs, servers and accounts never share a cache identity', () => {
  const { cache, request } = environment(); const identity = cache.identity(request);
  assertion.notEqual(cache.identity({ ...request, address: Fixture.changed }), identity);
  assertion.notEqual(cache.identity({ ...request, scope: Fixture.otherScope }), identity);
});
test('only a validated file with an atomically published completion record is reused', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete();
  const address = await lease.result; lease.cancel(); assertion.equal(await scenario.cache.find(scenario.request), address);
  const second = scenario.cache.acquire(scenario.request); assertion.equal(await second.result, address);
  assertion.equal(scenario.downloads.length, Fixture.one); second.cancel();
});
test('a nonempty partial file without a completion record is not cached', async () => {
  const scenario = environment(); scenario.files.set(scenario.cache.path(scenario.request), Buffer.alloc(Fixture.bytes));
  assertion.equal(await scenario.cache.find(scenario.request), null);
});
test('deleted files are redownloaded despite previous completion metadata', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await lease.result; lease.cancel();
  scenario.files.delete(scenario.cache.path(scenario.request));
  const retry = scenario.cache.acquire(scenario.request); await scenario.complete(Fixture.one); await retry.result;
  assertion.equal(scenario.downloads.length, Fixture.one + Fixture.one); retry.cancel();
});
test('checksum mismatch prevents a corrupted audio file from being reused', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await lease.result; lease.cancel();
  scenario.files.set(scenario.cache.path(scenario.request), Buffer.alloc(Fixture.bytes));
  assertion.equal(await scenario.cache.find(scenario.request), null);
});
test('expired completion records cannot authorize a cache hit', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await lease.result; lease.cancel();
  scenario.setNow(Fixture.now + Fixture.age + Fixture.one); assertion.equal(await scenario.cache.find(scenario.request), null);
});
for (const response of [{ status: 206 }, { status: 404 }, { bytes: 0 }, { expectedBytes: 100 }]) {
  test(`invalid HTTP/length result is rejected: ${JSON.stringify(response)}`, async () => {
    const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete(Fixture.zero, response);
    await assertion.rejects(lease.result); assertion.equal(await scenario.cache.find(scenario.request), null); lease.cancel();
  });
}
test('zero-byte filesystem results are rejected', async () => {
  const scenario = environment(); scenario.dependencies.filesystem.information = async path => ({ path, size: Fixture.zero, isFile: true });
  const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await assertion.rejects(lease.result); lease.cancel();
});
test('image decoder rejection cannot publish a completion manifest', async () => {
  const scenario = environment(); scenario.dependencies.validate = async () => { throw new Error(Fixture.failure); };
  const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await assertion.rejects(lease.result);
  assertion.equal(await scenario.cache.find(scenario.request), null); lease.cancel();
});
test('failed manifest publication leaves no readable completed asset', async () => {
  const scenario = environment(); scenario.dependencies.filesystem.write = async () => { throw new Error(Fixture.failure); };
  const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await assertion.rejects(lease.result);
  assertion.equal(await scenario.cache.find(scenario.request), null);
  assertion.equal(scenario.files.has(scenario.cache.path(scenario.request)), false); lease.cancel();
});
test('shared image requests use one download and cancellation preserves remaining consumers', async () => {
  const scenario = environment(); const first = scenario.cache.acquire(scenario.request); const second = scenario.cache.acquire(scenario.request);
  await flush(); first.cancel(); await assertion.rejects(first.result); assertion.equal(scenario.downloads[Fixture.zero].canceled, false);
  await scenario.complete(); await second.result; assertion.equal(scenario.downloads.length, Fixture.one); second.cancel();
});
test('final consumer cancellation stops native work and fences late completion', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await flush(); lease.cancel();
  await assertion.rejects(lease.result); assertion.equal(scenario.downloads[Fixture.zero].canceled, true);
  await scenario.complete(); assertion.equal(await scenario.cache.find(scenario.request), null);
});
test('cache clear invalidates in-flight work and does not erase unrelated scopes', async () => {
  const scenario = environment(); scenario.files.set('/unrelated/recording-list', Buffer.alloc(Fixture.bytes));
  const lease = scenario.cache.acquire(scenario.request); await flush(); await scenario.cache.clear();
  await assertion.rejects(lease.result); await scenario.complete(); assertion.equal(await scenario.cache.find(scenario.request), null);
  assertion.equal(scenario.files.has('/unrelated/recording-list'), true);
});
test('a changed source cannot share or overwrite the previous source download', async () => {
  const scenario = environment(); const first = scenario.cache.acquire(scenario.request);
  const changed = { ...scenario.request, address: Fixture.changed }; const second = scenario.cache.acquire(changed);
  await scenario.complete(); await first.result; await scenario.complete(Fixture.one); await second.result;
  assertion.notEqual(scenario.cache.path(changed), scenario.cache.path(scenario.request)); first.cancel(); second.cancel();
});
test('visible requests run before queued prefetch while respecting the concurrency bound', async () => {
  const scenario = environment(); const first = scenario.cache.acquire(scenario.request);
  const prefetch = scenario.cache.acquire({ ...scenario.request, address: Fixture.changed }, AssetCachePolicy.prefetchPriority);
  const visibleAddress = Fixture.changed + '/visible';
  const visible = scenario.cache.acquire({ ...scenario.request, address: visibleAddress });
  await flush(); assertion.equal(scenario.downloads.length, Fixture.one);
  await scenario.complete(); await first.result; await flush(); assertion.equal(scenario.downloads[Fixture.one].request.address, visibleAddress);
  await scenario.complete(Fixture.one); await visible.result; await scenario.complete(Fixture.one + Fixture.one); await prefetch.result;
  first.cancel(); prefetch.cancel(); visible.cancel();
});
test('byte budget evicts unpinned assets and preserves the currently displayed asset', async () => {
  const scenario = environment({ byteBudget: Fixture.one }); const first = scenario.cache.acquire(scenario.request);
  await scenario.complete(); await first.result; first.cancel();
  const changed = { ...scenario.request, address: Fixture.changed }; const second = scenario.cache.acquire(changed);
  await scenario.complete(Fixture.one); await second.result;
  assertion.equal(await scenario.cache.find(scenario.request), null); assertion.notEqual(await scenario.cache.find(changed), null); second.cancel();
});
test('invalidation removes both completion metadata and optimistic preview', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await lease.result; lease.cancel();
  await scenario.cache.invalidate(scenario.request); assertion.equal(await scenario.cache.find(scenario.request), null);
  assertion.equal(scenario.cache.peek(scenario.request), null);
});
test('telemetry records cache hits and downloads without exposing source URLs or headers', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request); await scenario.complete(); await lease.result; lease.cancel();
  const second = scenario.cache.acquire(scenario.request); await second.result; second.cancel();
  assertion.equal(scenario.events.some(event => event.kind === 'hit'), true);
  assertion.equal(JSON.stringify(scenario.events).includes(Fixture.address), false);
});
test('transient failures retry once after an injected delay', async () => {
  const scenario = environment(); const delays = [];
  scenario.dependencies.delay = milliseconds => { delays.push(milliseconds); return { result: Promise.resolve(), cancel() {} }; };
  const lease = scenario.cache.acquire(scenario.request);
  await scenario.complete(Fixture.zero, { status: 503 }); await flush();
  assertion.deepEqual(delays, [AssetCachePolicy.retryDelayMilliseconds]);
  await scenario.complete(Fixture.one); await lease.result; lease.cancel();
});
test('missing images are not retried or handed back for a second network owner', async () => {
  const scenario = environment(); const lease = scenario.cache.acquire(scenario.request);
  await scenario.complete(Fixture.zero, { status: 404 }); await assertion.rejects(lease.result);
  assertion.equal(scenario.downloads.length, Fixture.one); lease.cancel();
});
test('last consumer cancellation also cancels pending backoff', async () => {
  const scenario = environment(); const pending = deferred(); let canceled = false;
  scenario.dependencies.delay = () => ({ result: pending.promise, cancel() { canceled = true; pending.reject(new Error(Fixture.failure)); } });
  const lease = scenario.cache.acquire(scenario.request); await scenario.complete(Fixture.zero, { status: 503 });
  lease.cancel(); await assertion.rejects(lease.result); await flush(); assertion.equal(canceled, true);
  assertion.equal(scenario.downloads.length, Fixture.one);
});
test('queued transfers capture authentication headers before caller mutation', async () => {
  const scenario = environment(); const headers = { Authorization: 'first-account' };
  const lease = scenario.cache.acquire({ ...scenario.request, headers }); headers.Authorization = 'second-account';
  await flush(); assertion.equal(scenario.downloads[Fixture.zero].request.headers.Authorization, 'first-account');
  await scenario.complete(); await lease.result; lease.cancel();
});
test('audio quota rejects a new download instead of deleting files a native queue may still reference', async () => {
  const scenario = environment({ byteBudget: Fixture.bytes, evictExisting: false });
  const first = scenario.cache.acquire(scenario.request); await scenario.complete(); await first.result; first.cancel();
  const changed = { ...scenario.request, address: Fixture.changed }; const second = scenario.cache.acquire(changed);
  await scenario.complete(Fixture.one); await assertion.rejects(second.result);
  assertion.notEqual(await scenario.cache.find(scenario.request), null); assertion.equal(await scenario.cache.find(changed), null); second.cancel();
});

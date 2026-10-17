const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
const { AssetCachePolicy } = require('../.build/assets/AssetCache');
const { assetIdentity } = require('../.build/assets/AssetIdentity');
const Fixture = Object.freeze({ service: '../src/services/cache/ImageDownloadService.ts', component: '../src/components/CachedImage.tsx',
  audio: '../src/services/cache/AudioCacheService.ts', native: '../src/services/cache/assets/NativeAssetCache.ts', encoding: 'utf8',
  address: 'https://images.invalid/full.jpg', thumbnail: 'https://images.invalid/tiny.jpg', changed: 'https://images.invalid/new.jpg',
  placeholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ZkAAAAASUVORK5CYII=', release: 'first', next: 'second', tier: 'small', fullTier: 'full', local: 'file:///cache/image.asset',
  newLocal: 'file:///cache/new.asset', image: 'image', zero: 0, one: 1 });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function compile(filename, dependencies) {
  const module = { exports: {} };
  const compiled = typescript.transpileModule(readFileSync(resolve(__dirname, filename), Fixture.encoding), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, jsx: typescript.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  runInNewContext(compiled, { exports: module.exports, module, require(name) { assertion.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports;
}
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
function serviceEnvironment(filename = Fixture.service) {
  const caches = []; const removed = []; const events = [];
  const service = compile(filename, { 'react-native-fs': { CachesDirectoryPath: '/cache', async unlink(path) { removed.push(path); } },
    '../../constants/placeholders': { PLACEHOLDER_ALBUM_COVER: Fixture.placeholder },
    './assets/AssetCache': { AssetCachePolicy }, './assets/AssetIdentity': { assetIdentity },
    './assets/NativeAssetCache': { recordAssetCacheEvent(event) { events.push(event); }, createNativeAssetCache(configuration) {
      const requests = []; const cache = { configuration, requests, peek: () => null, identity: request => assetIdentity(JSON.stringify(request)), path: request => configuration.directory + '/' + assetIdentity(JSON.stringify(request)),
        find: async () => null, async clear() { cache.cleared = true; }, async invalidate() {},
        acquire(request) { requests.push(request); return { result: Promise.resolve(Fixture.local), cancel() {} }; } }; caches.push(cache); return cache;
    } }, './CacheDatabase': { clearImageEntries() {} } });
  return { service, caches, removed, events };
}
test('requested image tiers fall back to available URLs, including cover-only playlists', () => {
  const { service } = serviceEnvironment();
  assertion.equal(service.imageAddress(Fixture.tier, { cover: Fixture.address }), Fixture.address);
  assertion.equal(service.imageAddress(Fixture.fullTier, { verySmallCover: Fixture.thumbnail }), Fixture.thumbnail);
  assertion.equal(service.imageAddress(Fixture.tier, {}), null);
});
test('image storage identity follows source and headers instead of release and requested size', async () => {
  const { service, caches } = serviceEnvironment();
  await service.getOrDownloadForTier(Fixture.release, Fixture.tier, { cover: Fixture.address });
  await service.getOrDownloadForTier(Fixture.next, Fixture.fullTier, { cover: Fixture.address });
  assertion.deepEqual(JSON.parse(JSON.stringify(caches[Fixture.zero].requests[Fixture.zero])), JSON.parse(JSON.stringify(caches[Fixture.zero].requests[Fixture.one])));
  assertion.notEqual(service.imageRequest(Fixture.address, { Authorization: 'one' }).scope,
    service.imageRequest(Fixture.address, { Authorization: 'two' }).scope);
});
test('audio download scopes separate accounts and full URLs without query identifiers', () => {
  const { service } = serviceEnvironment(Fixture.audio);
  const scope = { accountIdentifier: Fixture.release, serverAddress: Fixture.address };
  assertion.notEqual(service.getCacheFilePath(Fixture.address, scope), service.getCacheFilePath(Fixture.changed, scope));
  assertion.notEqual(service.getCacheFilePath(Fixture.address, scope), service.getCacheFilePath(Fixture.address, { ...scope, accountIdentifier: Fixture.next }));
});
test('audio refuses range downloads and absent account identity', () => {
  const { service } = serviceEnvironment(Fixture.audio);
  assertion.throws(() => service.requestTrackDownload(Fixture.address, { Range: 'bytes=0-1' }, { accountIdentifier: Fixture.release, serverAddress: Fixture.address }));
  assertion.throws(() => service.getCacheFilePath(Fixture.address, { accountIdentifier: '', serverAddress: Fixture.address }));
});
test('audio reads require validated records and scoped cleanup targets only that account', async () => {
  const { service, caches } = serviceEnvironment(Fixture.audio); const scope = { accountIdentifier: Fixture.release, serverAddress: Fixture.address };
  assertion.equal(await service.findCachedTrackAddress(Fixture.address, scope), null);
  service.getCacheFilePath(Fixture.address, { ...scope, accountIdentifier: Fixture.next });
  await service.clearAccountAudioCache(scope);
  assertion.equal(caches[Fixture.zero].cleared, true); assertion.equal(caches[Fixture.one].cleared, undefined);
});
function componentEnvironment() {
  const requests = []; const invalidations = [];
  const exports = compile(Fixture.component, { react: React, 'react-native': { Image: Fixture.image },
    '../constants/placeholders': { PLACEHOLDER_ALBUM_COVER: Fixture.placeholder },
    '../services/cache/ImageDownloadService': { getLocalPathForTier: () => null, getBestAvailableLocalPath: () => null,
      imageAddress: (tier, urls) => tier === 'full' ? urls.cover ?? urls.smallCover ?? urls.verySmallCover ?? null
        : urls.verySmallCover ?? urls.smallCover ?? urls.cover ?? null,
      imageDisplayed() {}, async invalidateImage(address) { invalidations.push(address); },
      requestImage(release, tier, urls, headers) {
        const pending = deferred(); const operation = { release, tier, urls, headers, pending, canceled: false };
        requests.push(operation); return { result: pending.promise, cancel() { operation.canceled = true; } };
      } } });
  return { component: exports.default, requests, invalidations };
}
async function mount(scenario, properties = {}) {
  let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(scenario.component, properties)); }); return tree;
}
test('plain URL views use the shared image cache and preserve request headers', async () => {
  const scenario = componentEnvironment(); const headers = { Authorization: 'fixture-only' };
  const tree = await mount(scenario, { source: { uri: Fixture.address, headers } });
  assertion.equal(scenario.requests.length, Fixture.one); assertion.equal(scenario.requests[Fixture.zero].headers, headers);
  await renderer.act(async () => scenario.requests[Fixture.zero].pending.resolve(Fixture.local));
  assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.local);
  await renderer.act(async () => tree.unmount()); assertion.equal(scenario.requests[Fixture.zero].canceled, true);
});
test('recycled image rows never retain the previous release image during a new download', async () => {
  const scenario = componentEnvironment(); const tree = await mount(scenario, { releaseId: Fixture.release, cover: Fixture.address });
  await renderer.act(async () => scenario.requests[Fixture.zero].pending.resolve(Fixture.local));
  await renderer.act(async () => tree.update(React.createElement(scenario.component, { releaseId: Fixture.next, cover: Fixture.changed })));
  assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.placeholder);
  assertion.equal(scenario.requests[Fixture.zero].canceled, true);
  await renderer.act(async () => scenario.requests[Fixture.one].pending.resolve(Fixture.newLocal));
  assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.newLocal); await renderer.act(async () => tree.unmount());
});
test('old download completion cannot replace the currently selected release', async () => {
  const scenario = componentEnvironment(); const tree = await mount(scenario, { cover: Fixture.address });
  await renderer.act(async () => tree.update(React.createElement(scenario.component, { cover: Fixture.changed })));
  await renderer.act(async () => scenario.requests[Fixture.one].pending.resolve(Fixture.newLocal));
  await renderer.act(async () => scenario.requests[Fixture.zero].pending.resolve(Fixture.local));
  assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.newLocal); await renderer.act(async () => tree.unmount());
});
test('a thumbnail appears before full artwork and cannot downgrade a completed full image', async () => {
  const scenario = componentEnvironment(); const tree = await mount(scenario, { cover: Fixture.address, verySmallCover: Fixture.thumbnail, tier: Fixture.fullTier });
  await renderer.act(async () => scenario.requests[Fixture.one].pending.resolve(Fixture.local));
  assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.local);
  await renderer.act(async () => scenario.requests[Fixture.zero].pending.resolve(Fixture.newLocal));
  assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.newLocal); assertion.equal(scenario.requests[Fixture.one].canceled, true);
  await renderer.act(async () => tree.unmount());
});
test('local decoding errors invoke the caller and retry through invalidation once', async () => {
  const scenario = componentEnvironment(); let errors = Fixture.zero;
  const tree = await mount(scenario, { cover: Fixture.address, onError: () => { errors += Fixture.one; } });
  await renderer.act(async () => scenario.requests[Fixture.zero].pending.resolve(Fixture.local));
  await renderer.act(async () => tree.root.findByType(Fixture.image).props.onError({}));
  assertion.equal(errors, Fixture.one); assertion.equal(scenario.invalidations.length, Fixture.one);
  assertion.equal(scenario.requests.length, Fixture.one + Fixture.one);
  await renderer.act(async () => scenario.requests[Fixture.one].pending.resolve(Fixture.newLocal));
  await renderer.act(async () => tree.root.findByType(Fixture.image).props.onError({}));
  assertion.equal(scenario.invalidations.length, Fixture.one); await renderer.act(async () => tree.unmount());
});
test('unchanged source objects do not restart a download on rerender', async () => {
  const scenario = componentEnvironment(); const tree = await mount(scenario, { source: { uri: Fixture.address } });
  await renderer.act(async () => tree.update(React.createElement(scenario.component, { source: { uri: Fixture.address } })));
  assertion.equal(scenario.requests.length, Fixture.one); await renderer.act(async () => tree.unmount());
});
test('bundled and explicitly local images avoid network cache work', async () => {
  const scenario = componentEnvironment(); const tree = await mount(scenario, { source: { uri: Fixture.local } });
  assertion.equal(scenario.requests.length, Fixture.zero); assertion.equal(tree.root.findByType(Fixture.image).props.source.uri, Fixture.local);
  await renderer.act(async () => tree.unmount());
});
test('removing all cover URLs cannot reuse a previous release request', async () => {
  const { service } = serviceEnvironment(); await service.getOrDownloadForTier(Fixture.release, Fixture.tier, { cover: Fixture.address });
  assertion.equal(service.getLocalPathForTier(Fixture.release, Fixture.tier, {}), null);
});
test('recent release lookups are bounded instead of retaining every visited album', () => {
  const { service, caches } = serviceEnvironment(); const requests = 1002;
  caches[Fixture.zero].peek = request => request.address;
  for (let index = Fixture.zero; index < requests; index += Fixture.one) {
    service.requestImage('release-' + index, Fixture.tier, { cover: Fixture.address + '/' + index }).cancel();
  }
  assertion.equal(service.getLocalPathForTier('release-0', Fixture.tier), null);
  assertion.equal(service.getLocalPathForTier('release-1001', Fixture.tier), Fixture.address + '/1001');
});
test('retiring legacy caches removes unverified files without clearing current assets', async () => {
  const images = serviceEnvironment(); await images.service.retireLegacyImageCache();
  assertion.deepEqual(images.removed, ['/cache/image-cache']); assertion.equal(images.caches[Fixture.zero].cleared, undefined);
  const audio = serviceEnvironment(Fixture.audio); await audio.service.retireLegacyAudioCache();
  assertion.deepEqual(audio.removed, ['/cache/audio-cache']);
});
test('image display telemetry uses the path index without scanning and rehashing other requests', () => {
  const scenario = serviceEnvironment();
  scenario.service.requestImage('album', Fixture.tier, { cover: Fixture.address });
  const cache = scenario.caches[0]; const path = AssetCachePolicy.filePrefix + cache.path(cache.requests[0]);
  let pathLookups = 0; const original = cache.path;
  cache.path = request => { pathLookups += 1; return original(request); };
  scenario.service.imageDisplayed(Fixture.address, 100, undefined, path);
  assertion.equal(pathLookups, 0); assertion.equal(scenario.events[0].kind, 'displayed');
});

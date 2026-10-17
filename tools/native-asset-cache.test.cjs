const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const { AssetCachePolicy } = require('../.build/assets/AssetCache');
const { imageHeaderDimensions } = require('../.build/assets/ImageHeaderDimensions');
function fixture(image = true) {
  let dependencies; let options; let complete; let dimensions = [100, 100]; let decoderCalls = 0; const stopped = [];
  const filesystem = { CachesDirectoryPath: '/cache', async unlink() {}, async moveFile() {},
    downloadFile(value) { options = value; return { jobId: 7, promise: new Promise(resolve => { complete = resolve; }) }; },
    stopDownload(identifier) { stopped.push(identifier); }, async read(path, length, position, encoding) {
      if (encoding !== 'base64') return 'ID3-valid-audio';
      const header = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(header); header.write('IHDR',12);
      header.writeUInt32BE(100,16); header.writeUInt32BE(100,20); return header.toString('base64');
    } };
  const module = { exports: {} };
  const compiled = typescript.transpileModule(readFileSync(require.resolve('../src/services/cache/assets/NativeAssetCache.ts'), 'utf8'), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  runInNewContext(compiled, { exports: module.exports, module, setTimeout, clearTimeout, require(name) {
    if (name === 'react-native-fs') return filesystem;
    if (name === 'react-native') return { Image: { getSize(address, success) { decoderCalls += 1; success(...dimensions); } } };
    if (name === './AssetTransferDeadline') return require('../.build/assets/AssetTransferDeadline');
    if (name === './ImageHeaderDimensions') return { imageHeaderDimensions };
    if (name === './AssetCache') return { AssetCachePolicy, AssetCache: class { constructor(value) { dependencies = value; } } };
    throw new Error(name);
  } });
  module.exports.createNativeAssetCache({ directory: '/cache' }, image);
  return { get decoderCalls() { return decoderCalls; }, get dependencies() { return dependencies; }, get options() { return options; }, stopped,
    complete: value => complete(value), setDimensions: value => { dimensions = value; }, filesystem };
}
test('native downloads preserve headers and response lengths with case-insensitive header lookup', async () => {
  const scenario = fixture(); const headers = { Authorization: 'fixture' };
  const operation = scenario.dependencies.download({ address: 'https://images.invalid/image', headers }, '/cache/temporary', 1000);
  scenario.options.begin({ headers: { 'Content-Length': '123', 'Content-Type': 'image/jpeg' }, contentLength: 123 });
  scenario.complete({ statusCode: 200, bytesWritten: 123 }); const result = await operation.result;
  assertion.equal(result.expectedBytes, 123); assertion.equal(result.contentType, 'image/jpeg');
  assertion.equal(scenario.options.headers.Authorization, headers.Authorization);
});
test('native download size bounds stop transfers before accepting their result', async () => {
  const scenario = fixture(); const operation = scenario.dependencies.download({ address: 'https://images.invalid/image' }, '/cache/temporary', 100);
  scenario.options.begin({ headers: {}, contentLength: 1000 }); scenario.complete({ statusCode: 200, bytesWritten: 1000 });
  await assertion.rejects(operation.result); assertion.deepEqual(scenario.stopped, [7]);
});
test('native progress enforces size bounds when a response has no declared length', async () => {
  const scenario = fixture(); const operation = scenario.dependencies.download({ address: 'https://images.invalid/image' }, '/cache/temporary', 100);
  scenario.options.progress({ bytesWritten: 1000 }); scenario.complete({ statusCode: 200, bytesWritten: 1000 });
  await assertion.rejects(operation.result); assertion.deepEqual(scenario.stopped, [7]);
});
test('native image validation rejects nonimage responses and excessive decoded dimensions', async () => {
  const scenario = fixture();
  await assertion.rejects(scenario.dependencies.validate('/cache/image', { contentType: 'text/html' }));
  scenario.setDimensions([100000, 100000]);
  await assertion.rejects(scenario.dependencies.validate('/cache/image', { contentType: 'image/png' }));
});
test('native audio validation rejects HTML and JSON instead of creating a completed track', async () => {
  const scenario = fixture(false);
  await assertion.rejects(scenario.dependencies.validate('/cache/audio', { contentType: 'text/html' }));
  scenario.filesystem.read = async () => '<!doctype html>';
  await assertion.rejects(scenario.dependencies.validate('/cache/audio', { contentType: 'application/octet-stream' }));
});
test('native audio validation accepts supported audio responses', async () => {
  const scenario = fixture(false); await scenario.dependencies.validate('/cache/audio', { contentType: 'audio/mpeg' });
});
test('publication supports iOS move semantics by removing a previous destination first', async () => {
  const scenario = fixture(); const operations = [];
  scenario.filesystem.unlink = async destination => { operations.push({ remove: destination }); };
  scenario.filesystem.moveFile = async (source, destination) => { operations.push({ source, destination }); };
  await scenario.dependencies.filesystem.move('/cache/completed.partial', '/cache/previous.asset');
  assertion.deepEqual(operations, [{ remove: '/cache/previous.asset' }, { source: '/cache/completed.partial', destination: '/cache/previous.asset' }]);
});
test('legacy image metadata cleanup yields between batches and preserves recording lists', async () => {
  const storage = new Map(Array.from({ length: 250 }, (_value, index) => ['image:' + index, 'fixture']));
  storage.set('recordings:album:fixture', 'preserved'); let yields = 0;
  const module = { exports: {} };
  const compiled = typescript.transpileModule(readFileSync(require.resolve('../src/services/cache/CacheDatabase.ts'), 'utf8'), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020 },
  }).outputText;
  runInNewContext(compiled, { exports: module.exports, module, setTimeout(callback) { yields += 1; callback(); },
    require() { return { createMMKV: () => ({ getAllKeys: () => [...storage.keys()], remove: key => storage.delete(key) }) }; } });
  await module.exports.clearImageEntries(); assertion.equal(storage.size, 1);
  assertion.equal(storage.has('recordings:album:fixture'), true); assertion.equal(yields, 2);
});
test('oversized encoded dimensions are rejected before the native decoder is called', async () => {
  const scenario = fixture();
  const oversized = Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(oversized);oversized.write('IHDR',12);
  oversized.writeUInt32BE(100000,16);oversized.writeUInt32BE(100000,20);
  scenario.filesystem.read = async () => oversized.toString('base64');
  scenario.setDimensions([100000,100000]);
  const original = scenario.dependencies.validate;
  await assertion.rejects(original('/cache/large', {contentType:'image/png'}));
  assertion.equal(scenario.decoderCalls, 0);
});
test('native filesystem cleanup reports permission failures instead of pretending files were removed', async () => {
  const scenario = fixture(); scenario.filesystem.unlink = async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
  await assertion.rejects(scenario.dependencies.filesystem.remove('/cache/image'));
  scenario.filesystem.unlink = async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
  await scenario.dependencies.filesystem.remove('/cache/missing');
});
test('a canceled native attempt cannot overwrite a later retry through delayed writes', async () => {
  const scenario = fixture(); const files = new Map(); const attempts = [];
  scenario.filesystem.unlink = async path => { files.delete(path); };
  scenario.filesystem.moveFile = async (source, destination) => { files.set(destination, files.get(source)); files.delete(source); };
  scenario.filesystem.downloadFile = options => {
    let resolve; const promise = new Promise(complete => { resolve = complete; });
    attempts.push({ options, resolve }); return { jobId: attempts.length, promise };
  };
  const request = { address: 'https://images.invalid/late-writer' };
  const first = scenario.dependencies.download(request, '/cache/retry', 1000);
  first.cancel(); await assertion.rejects(first.result);
  const second = scenario.dependencies.download(request, '/cache/retry', 1000);
  assertion.notEqual(attempts[0].options.toFile, attempts[1].options.toFile);
  files.set(attempts[1].options.toFile, 'current'); attempts[1].resolve({ statusCode: 200, bytesWritten: 7 }); await second.result;
  files.set(attempts[0].options.toFile, 'retired'); attempts[0].resolve({ statusCode: 200, bytesWritten: 7 });
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  assertion.equal(files.get('/cache/retry'), 'current'); assertion.equal(files.has(attempts[0].options.toFile), false);
});

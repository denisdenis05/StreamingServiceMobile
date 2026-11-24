const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const babel = require('@babel/core');
const Fixture = Object.freeze({ source: 'https://images.invalid/cover', destination: '/cache/cover.partial',
  transfers: 100, listenersPerTransfer: 2, emptyCount: 0, expectedStatus: 200, expectedBytes: 100 });
function wrapperFixture(failure) {
  const listeners = new Set();
  const native = { downloadFile: async () => {
    if (failure) throw new Error('fixture transfer failed');
    return { statusCode: Fixture.expectedStatus, bytesWritten: Fixture.expectedBytes };
  } };
  const module = { exports: {} };
  const source = babel.transformSync(readFileSync(require.resolve('react-native-fs/FS.common.js'), 'utf8'), {
    babelrc: false, configFile: false, presets: ['module:@react-native/babel-preset'],
  }).code;
  runInNewContext(source, { module, exports: module.exports, require(name) {
    if (name === 'react-native') return { NativeModules: { RNFSManager: native }, Platform: { OS: 'android' },
      NativeEventEmitter: class { addListener(name, callback) {
        const subscription = { name, callback }; listeners.add(subscription);
        return { remove() { listeners.delete(subscription); } };
      } } };
    return require(name);
  } });
  return { cache: module.exports, listeners };
}
for (const failure of [false, true]) test(`RNFS ${failure ? 'failed' : 'successful'} transfers release every JavaScript listener`, async () => {
  const scenario = wrapperFixture(failure);
  for (let transfer = Fixture.emptyCount; transfer < Fixture.transfers; transfer += 1) {
    const operation = scenario.cache.downloadFile({ fromUrl: Fixture.source, toFile: Fixture.destination, begin() {}, progress() {} });
    assertion.equal(scenario.listeners.size, Fixture.listenersPerTransfer);
    if (failure) await assertion.rejects(operation.promise); else await operation.promise;
    assertion.equal(scenario.listeners.size, Fixture.emptyCount);
  }
});
test('native RNFS patch registers before execution and removes completed Android jobs', () => {
  const source = readFileSync(require.resolve('react-native-fs/android/src/main/java/com/rnfs/RNFSManager.java'), 'utf8');
  assertion.match(source, /ConcurrentHashMap<Integer, Downloader>/);
  assertion.ok(source.indexOf('this.downloaders.put(jobId, downloader)') < source.indexOf('downloader.execute(params)'));
  const completion = source.slice(source.indexOf('public void onTaskCompleted(DownloadResult res)'), source.indexOf('if (hasBeginCallback)'));
  assertion.match(completion, /downloaders.remove\(jobId\)/);
});
test('native RNFS patch has a terminal iOS cancellation path without resumable ownership', () => {
  const source = readFileSync(require.resolve('react-native-fs/Downloader.m'), 'utf8');
  const cancellation = source.slice(source.indexOf('- (void)stopDownload'), source.indexOf('- (void)resumeDownload'));
  assertion.match(cancellation, /if \(!_params.resumableCallback\)/);
  assertion.match(cancellation, /\[self finishWithError:failure\]/);
  const terminal = source.slice(source.indexOf('- (void)finishWithError'), source.indexOf('- (void)stopDownload'));
  assertion.match(terminal, /claimCompletion/); assertion.match(terminal, /invalidateAndCancel/);
  const manager = readFileSync(require.resolve('react-native-fs/RNFSManager.m'), 'utf8');
  assertion.equal((manager.match(/\[self.downloaders removeObjectForKey:\[jobId stringValue\]\]/g) ?? []).length, Fixture.listenersPerTransfer);
});
const { boundAssetTransfer } = require('../.build/assets/AssetTransferDeadline');
function deadlineFixture() {
  let resolve; let reject; let scheduled; let stopped = Fixture.emptyCount; let canceledTimers = Fixture.emptyCount;
  const native = new Promise((complete, fail) => { resolve = complete; reject = fail; });
  const operation = boundAssetTransfer({ result: native, cancel() { stopped += 1; } }, Fixture.expectedBytes,
    { schedule(callback) { scheduled = callback; return () => { canceledTimers += 1; }; } });
  return { operation, resolve, reject, expire: () => scheduled(), get stopped() { return stopped; }, get canceledTimers() { return canceledTimers; } };
}
test('transfer deadline rejects a native operation that never settles and ignores late success', async () => {
  const scenario = deadlineFixture(); scenario.expire(); await assertion.rejects(scenario.operation.result);
  scenario.resolve({ status: Fixture.expectedStatus }); assertion.equal(scenario.stopped, 1); assertion.equal(scenario.canceledTimers, 1);
});
test('transfer cancellation releases its result even when native cancellation never settles', async () => {
  const scenario = deadlineFixture(); scenario.operation.cancel(); scenario.operation.cancel();
  await assertion.rejects(scenario.operation.result); assertion.equal(scenario.stopped, 1);
  scenario.reject(new Error('late native failure')); await Promise.resolve();
});
test('successful transfer cancels its deadline and cannot be stopped by a stale timer', async () => {
  const scenario = deadlineFixture(); const response = { status: Fixture.expectedStatus }; scenario.resolve(response);
  assertion.equal(await scenario.operation.result, response); scenario.expire(); scenario.operation.cancel();
  assertion.equal(scenario.stopped, Fixture.emptyCount); assertion.equal(scenario.canceledTimers, 1);
});
test('a throwing native cancel cannot escape a transfer deadline or prevent rejection', async () => {
  let expire;
  const operation = boundAssetTransfer({ result: new Promise(() => {}), cancel() { throw new Error('retired native bridge'); } }, Fixture.expectedBytes,
    { schedule(callback) { expire = callback; return () => {}; } });
  assertion.doesNotThrow(() => expire()); await assertion.rejects(operation.result);
});

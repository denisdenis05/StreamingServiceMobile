const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const Fixture = Object.freeze({ transportFilename: '../src/services/ReactNativePlaybackTransport.ts', nativePackage: 'react-native',
  moduleName: 'StreamingPlayer', eventName: 'StreamingPlayerStateChanged', encoding: 'utf8', manifest: '../package.json',
  lockfile: '../package-lock.json', oldPackage: 'react-native-track-player', noArguments: Object.freeze(['initialize', 'clearSession', 'getSnapshot']),
  oldInstalledPackage: 'node_modules/react-native-track-player', registration: '../index.js', oldService: '../playbackService.js',
  oldEmitter: '../src/services/QueueEventEmitter.ts', eventPayload: 'event-fixture', moduleResult: 'module-result',
  address: 'https://player.example.invalid', token: 'private-fixture-token', payload: 'private-payload', identifier: 'private-identifier',
  initialCount: 0, oneCall: 1, twoArguments: 2, firstIndex: 0 });
const Methods = Object.freeze(['initialize', 'configureMediaServer', 'clearSession', 'registerMediaSource', 'releaseMediaSource',
  'registerMediaCredential', 'updateMediaCredential', 'releaseMediaCredential', 'executeCommand', 'getSnapshot']);
function environment() {
  const calls = []; let nativeListener; let removals = Fixture.initialCount;
  const native = Object.fromEntries(Methods.map(method => [method, async (...argumentsList) => {
    calls.push({ method, argumentsList }); return Fixture.moduleResult;
  }]));
  const compiled = typescript.transpileModule(readFileSync(resolve(__dirname, Fixture.transportFilename), Fixture.encoding), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(compiled, { exports: module.exports, module, require(packageName) {
    assertion.equal(packageName, Fixture.nativePackage);
    return { TurboModuleRegistry: { getEnforcing(name) { assertion.equal(name, Fixture.moduleName); return native; } },
      NativeEventEmitter: class {
        constructor(nativeModule) { assertion.equal(nativeModule, native); }
        addListener(eventName, listener) { assertion.equal(eventName, Fixture.eventName); nativeListener = listener;
          return { remove() { removals += Fixture.oneCall; nativeListener = null; } }; }
      } };
  } });
  return { transport: module.exports.reactNativePlaybackTransport, calls, emit: payload => nativeListener?.(payload),
    get removals() { return removals; } };
}
for (const method of Methods) {
  test(`the app transport forwards ${method} to its selected native module`, async () => {
    const scenario = environment();
    const argumentsList = method === 'configureMediaServer' ? [Fixture.address, Fixture.token]
      : method === 'updateMediaCredential' ? [Fixture.identifier, Fixture.payload]
      : Fixture.noArguments.includes(method) ? [] : [Fixture.payload];
    assertion.equal(await scenario.transport[method](...argumentsList), Fixture.moduleResult);
    assertion.equal(scenario.calls[Fixture.firstIndex].method, method);
    assertion.deepEqual([...scenario.calls[Fixture.firstIndex].argumentsList], argumentsList);
  });
}
test('the app transport subscribes to native events and detaches its listener', () => {
  const scenario = environment(); const received = []; const unsubscribe = scenario.transport.subscribe(payload => received.push(payload));
  scenario.emit(Fixture.eventPayload); unsubscribe(); scenario.emit(Fixture.eventPayload);
  assertion.deepEqual(received, [Fixture.eventPayload]); assertion.equal(scenario.removals, Fixture.oneCall);
});
test('the app manifest and lockfile contain no legacy player dependency', () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, Fixture.manifest), Fixture.encoding));
  const lockfile = JSON.parse(readFileSync(resolve(__dirname, Fixture.lockfile), Fixture.encoding));
  assertion.equal(manifest.dependencies[Fixture.oldPackage], undefined);
  assertion.equal(lockfile.packages[Fixture.oldInstalledPackage], undefined);
  assertion.equal(lockfile.packages[Object.keys(lockfile.packages)[Fixture.firstIndex]].dependencies[Fixture.oldPackage], undefined);
});
test('app startup contains no legacy playback registration or queue event module', () => {
  const startup = readFileSync(resolve(__dirname, Fixture.registration), Fixture.encoding);
  assertion.equal(startup.includes(Fixture.oldPackage), false);
  assertion.equal(existsSync(resolve(__dirname, Fixture.oldService)), false);
  assertion.equal(existsSync(resolve(__dirname, Fixture.oldEmitter)), false);
});

const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
const { PlayerProgressStore, PlaybackState, PlaybackIntent } = require('streaming-service-player');
const Fixture = Object.freeze({ service: '../src/services/AudioPlayerService.ts', component: '../src/components/AudioProgressBar/AudioProgressBar.render.tsx',
  encoding: 'utf8', zero: 0, one: 1, frame: 16, second: 1000, halfSecond: 500, duration: 60000,
  position: 3000, nextPosition: 10000, width: 300, screenWidth: 360, seekLocation: 150,
  entry: 'progress-entry', epoch: 'progress-epoch', account: 'progress-account', active: 'active', background: 'background',
  label: 'progress-label', renderProgress: 'Progress', renderTime: 'TimeText', layoutTrack: 'Track', touchArea: 'TouchArea',
  expectedSeekSeconds: 30, seekLabel: '0:30', actualLabel: '0:03' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function compile(filename, dependencies) {
  const module = { exports: {} };
  const compiled = typescript.transpileModule(readFileSync(resolve(__dirname, filename), Fixture.encoding), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020,
      jsx: typescript.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  runInNewContext(compiled, { exports: module.exports, module, console, require(name) {
    assertion.ok(name in dependencies, name); return dependencies[name];
  } });
  return module.exports;
}
function environment() {
  let now = Fixture.zero; let refreshes = Fixture.zero; const frames = new Set(); const observers = new Set();
  const snapshot = { cursor: { engineEpoch: Fixture.epoch, authenticationEpoch: Fixture.account, eventSequence: Fixture.one },
    currentEntry: { entryIdentifier: Fixture.entry }, state: PlaybackState.Playing, playbackIntent: PlaybackIntent.Play,
    positionMilliseconds: Fixture.position, durationMilliseconds: Fixture.duration, bufferedAheadMilliseconds: Fixture.zero,
    playbackRate: Fixture.one, sampledAtMonotonicMilliseconds: Fixture.zero };
  const identifier = {};
  const source = { getSnapshot: () => snapshot, getProgressTimelineIdentifier: () => identifier,
    subscribe(listener) { observers.add(listener); return () => observers.delete(listener); },
    async refresh() { refreshes += Fixture.one; } };
  const store = new PlayerProgressStore(source, { nowMilliseconds: () => now,
    requestFrame(callback) { frames.add(callback); return () => frames.delete(callback); } });
  const lifecycleListeners = new Set();
  const applicationState = { currentState: Fixture.active,
    addEventListener(eventName, listener) {
      lifecycleListeners.add(listener); return { remove: () => lifecycleListeners.delete(listener) };
    } };
  const service = compile(Fixture.service, { react: React, 'react-native': { AppState: applicationState },
    'react-native-toast-message': {}, 'streaming-service-player': {},
    './NativeAudioRuntime': { playbackProgressStore: store, audioRuntime: { state: source,
      dispatcher: { getSnapshot: async () => snapshot } }, AudioRuntimePolicy: { millisecondsPerSecond: Fixture.second } },
    './AuthenticationService': {}, './player/QueueIntentScheduler': {}, './ApplicationNetworkClient': {},
    './player/PlaybackCollectionLoader': { PlaybackCollectionLoader: class {} }, '../constants/types': {}, './PlaybackTracker': {} });
  return { service, store, frames, observers, lifecycleListeners,
    advance(time) { now = time; const pending = [...frames]; frames.clear(); for (const callback of pending) callback(); },
    changeState(state) { applicationState.currentState = state; for (const listener of [...lifecycleListeners]) listener(state); },
    update(changes) { Object.assign(snapshot, changes); snapshot.cursor.eventSequence += Fixture.one;
      snapshot.sampledAtMonotonicMilliseconds = now; for (const observer of observers) observer(); },
    get refreshes() { return refreshes; } };
}
async function mount(scenario) {
  let progress;
  function Label() { progress = scenario.service.usePlaybackProgress(); return React.createElement(Fixture.label); }
  let tree; await renderer.act(async () => { tree = renderer.create(React.createElement(Label)); });
  return { tree, get progress() { return progress; } };
}
test('the mobile progress hook renders fractional frames while getPosition keeps native truth', async () => {
  const scenario = environment(); const view = await mount(scenario);
  await renderer.act(async () => scenario.advance(Fixture.frame));
  assertion.equal(view.progress.position, (Fixture.position + Fixture.frame) / Fixture.second);
  assertion.equal(await scenario.service.getPosition(), Fixture.position / Fixture.second);
  await renderer.act(async () => view.tree.unmount());
  assertion.equal(scenario.frames.size, Fixture.zero); assertion.equal(scenario.observers.size, Fixture.zero);
  assertion.equal(scenario.lifecycleListeners.size, Fixture.zero);
});
test('backgrounding cancels frames and foregrounding refreshes and resumes from native position', async () => {
  const scenario = environment(); const view = await mount(scenario); const refreshes = scenario.refreshes;
  await renderer.act(async () => { scenario.changeState(Fixture.background); scenario.advance(Fixture.nextPosition);
    scenario.update({ positionMilliseconds: Fixture.nextPosition }); });
  assertion.equal(scenario.frames.size, Fixture.zero);
  await renderer.act(async () => scenario.changeState(Fixture.active));
  assertion.equal(view.progress.position, Fixture.nextPosition / Fixture.second);
  assertion.equal(scenario.refreshes, refreshes + Fixture.one);
  assertion.equal(scenario.frames.size, Fixture.one);
  await renderer.act(async () => view.tree.unmount());
});
test('a buffering snapshot freezes the rendered mobile position', async () => {
  const scenario = environment(); const view = await mount(scenario);
  await renderer.act(async () => { scenario.advance(Fixture.halfSecond); scenario.update({ state: PlaybackState.Buffering }); });
  const before = view.progress.position;
  await renderer.act(async () => scenario.advance(Fixture.second));
  assertion.equal(view.progress.position, before); assertion.equal(scenario.frames.size, Fixture.zero);
  await renderer.act(async () => view.tree.unmount());
});
function componentEnvironment() {
  let handlers; let progress = { position: Fixture.position / Fixture.second, duration: Fixture.duration / Fixture.second };
  const names = ['MainContainer', 'ProgressContainer', 'Track', 'Progress', 'LoadingIndicator', 'Thumb', 'TouchArea', 'TimeContainer', 'TimeText'];
  const styles = Object.fromEntries(names.map(name => [name, name]));
  const component = compile(Fixture.component, { react: React, 'react-native': {
    Dimensions: { get: () => ({ width: Fixture.screenWidth }) },
    PanResponder: { create(callbacks) { handlers = callbacks; return { panHandlers: callbacks }; } } },
    '../../services/AudioPlayerService': { usePlaybackProgress: () => progress },
    '../../constants/styling.tsx': { colors: {} }, './AudioProgressBar.style.tsx': styles }).default;
  return { component, get handlers() { return handlers; }, setProgress(value) { progress = value; } };
}
test('the seek bar renders fractional widths supplied by the progress hook', async () => {
  const scenario = componentEnvironment(); let tree;
  await renderer.act(async () => { tree = renderer.create(React.createElement(scenario.component, { isLoading: false })); });
  const initial = tree.root.findByType(Fixture.renderProgress).props.style.width;
  scenario.setProgress({ position: (Fixture.position + Fixture.frame) / Fixture.second, duration: Fixture.duration / Fixture.second });
  await renderer.act(async () => tree.update(React.createElement(scenario.component, { isLoading: false })));
  assertion.notEqual(tree.root.findByType(Fixture.renderProgress).props.style.width, initial);
  await renderer.act(async () => tree.unmount());
});
test('an immediate seek gesture reads its latest location and cannot leave a stale optimistic time label', async () => {
  const scenario = componentEnvironment(); let tree; let seek;
  const properties = { isLoading: false, onSeek: position => { seek = position; } };
  await renderer.act(async () => { tree = renderer.create(React.createElement(scenario.component, properties)); });
  await renderer.act(async () => {
    scenario.handlers.onPanResponderGrant({ nativeEvent: { locationX: Fixture.seekLocation } });
    scenario.handlers.onPanResponderRelease();
  });
  assertion.equal(seek, Fixture.expectedSeekSeconds);
  assertion.equal(tree.root.findAllByType(Fixture.renderTime)[Fixture.zero].props.children, Fixture.actualLabel);
  await renderer.act(async () => tree.unmount());
});

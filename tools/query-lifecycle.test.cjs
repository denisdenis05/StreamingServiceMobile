const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const typescript = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(filename, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = typescript.transpileModule(readFileSync(resolve(__dirname, '../src/services', filename), 'utf8'), {
    fileName: filename, compilerOptions: { jsx: typescript.JsxEmit.React, module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, { exports: module.exports, module, AbortController, Date, Error, console, ...globals,
    require(name) { if (name in dependencies) return dependencies[name]; throw new Error(name); } });
  return module.exports;
}
const { AccountQueryStore } = load('data/AccountQueryStore.ts');
const { LatestRequestScope } = load('data/LatestRequestScope.ts');
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
const settle = () => new Promise(resolve => setImmediate(resolve));
function environment(limit = 2) {
  let now = 0;
  const store = new AccountQueryStore(() => now, limit, 100);
  store.setAccount('first');
  return { store, advance() { now += 101; }, observe(key, fetcher, initial) {
    return store.observe(key, store.getScope(), () => undefined, fetcher, initial);
  } };
}
test('concurrent observers share one request and cancellation waits for the last observer', async () => {
  const { store, observe } = environment(); const operation = deferred(); let calls = 0; let signal;
  const fetcher = captured => { calls += 1; signal = captured; return operation.promise; };
  const first = observe('library', fetcher); const second = observe('library', fetcher); await settle();
  assertion.equal(calls, 1); first(); assertion.equal(signal.aborted, false); second(); assertion.equal(signal.aborted, true);
  operation.resolve('old'); await settle(); assertion.equal(store.read('library').data, null);
});
test('invalidation aborts an old request and only publishes its replacement', async () => {
  const { store, observe } = environment(); const old = deferred(); const current = deferred(); let calls = 0; let signal;
  const release = observe('library', captured => { calls += 1; if (calls === 1) signal = captured; return calls === 1 ? old.promise : current.promise; });
  await settle(); store.invalidate('library'); await settle(); assertion.equal(signal.aborted, true);
  old.resolve('old'); await settle(); assertion.equal(store.read('library').data, null);
  current.resolve('new'); await settle(); assertion.equal(store.read('library').data, 'new'); release();
});
test('an optimistic update supersedes a pending response and preserves false values', async () => {
  const { store, observe } = environment(); const operation = deferred();
  const release = observe('like', () => operation.promise); await settle(); store.update('like', store.getScope(), false);
  operation.resolve(true); await settle(); assertion.equal(store.read('like').data, false); assertion.equal(store.read('like').loading, false); release();
});
test('account changes abort work, clear data and reject stale updater scopes', async () => {
  const { store, observe } = environment(); const operation = deferred(); let signal;
  const oldScope = store.getScope(); const release = observe('library', captured => { signal = captured; return operation.promise; });
  await settle(); store.setAccount('second'); assertion.equal(signal.aborted, true); assertion.equal(store.read('library').data, null);
  const second = observe('library', undefined, 'second'); store.update('library', oldScope, 'first'); operation.resolve('old');
  await settle(); assertion.equal(store.read('library').data, 'second'); release(); second();
});
test('same-account token refresh preserves query scope and cached data', () => {
  const { store, observe } = environment(); const scope = store.getScope(); const release = observe('library', undefined, 'value');
  store.setAccount('first'); assertion.equal(store.getScope(), scope); assertion.equal(store.read('library').data, 'value'); release();
});
test('logout and logging back into the same account do not reuse personal data', () => {
  const { store, observe } = environment(); const release = observe('library', undefined, 'private');
  store.setAccount(null); store.setAccount('first'); assertion.equal(store.read('library').data, null); release();
});
test('inactive cached entries have a fixed retention limit while active entries survive', () => {
  const { store, observe } = environment(); const active = observe('active', undefined, 'kept');
  for (let index = 0; index < 10; index += 1) observe(String(index), undefined, index)();
  assertion.equal(store.retainedEntries, 3); assertion.equal(store.read('0').data, null); assertion.equal(store.read('9').data, 9);
  assertion.equal(store.read('active').data, 'kept'); active(); assertion.equal(store.retainedEntries, 2);
});
test('stale inactive data expires and is refetched on observation', async () => {
  const { store, observe, advance } = environment(); observe('library', undefined, 'old')(); advance();
  assertion.equal(store.read('library').data, null); let calls = 0; const release = observe('library', async () => { calls += 1; return 'fresh'; });
  await settle(); assertion.equal(calls, 1); assertion.equal(store.read('library').data, 'fresh'); release();
});
test('errors settle loading and an explicit invalidation retries', async () => {
  const { store, observe } = environment(); let calls = 0;
  const release = observe('library', async () => { calls += 1; if (calls === 1) throw new Error('offline'); return 'online'; });
  await settle(); assertion.equal(store.read('library').loading, false); assertion.equal(store.read('library').error.message, 'offline');
  store.invalidate('library'); await settle(); assertion.equal(store.read('library').data, 'online'); assertion.equal(store.read('library').error, null); release();
});
test('an old observer cleanup cannot cancel the new account request', async () => {
  const { store, observe } = environment(); const oldRelease = observe('library', undefined, 'old'); store.setAccount('second');
  const operation = deferred(); let signal; const release = observe('library', captured => { signal = captured; return operation.promise; });
  await settle(); oldRelease(); assertion.equal(signal.aborted, false); operation.resolve('new'); await settle(); assertion.equal(store.read('library').data, 'new'); release();
});
test('clearing a search invalidates its operation even when its text is later repeated', () => {
  const scope = new LatestRequestScope(); const first = scope.replace(); const second = scope.replace(); const repeated = scope.replace();
  assertion.equal(first.signal.aborted, true); assertion.equal(first.isCurrent(), false); assertion.equal(second.isCurrent(), false);
  assertion.equal(repeated.isCurrent(), true); scope.cancel(); assertion.equal(repeated.signal.aborted, true); assertion.equal(repeated.isCurrent(), false);
});
function hookEnvironment() {
  let accountIdentifier = 'first'; const listeners = new Set();
  const session = { getSnapshot: () => ({ accountIdentifier }), subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
  const hooks = load('DataProvider.tsx', { react: React, './AuthenticationService': { authenticationSession: session },
    './data/AccountQueryStore': { AccountQueryStore } });
  return { hooks, account(value) { accountIdentifier = value; for (const listener of listeners) listener(); } };
}
test('useData resets on key and account changes without exposing the previous response', async () => {
  const environment = hookEnvironment(); const renders = []; let view;
  function Component({ query }) { const result = environment.hooks.useData(query, undefined, query); renders.push(result.data); return null; }
  await renderer.act(async () => { view = renderer.create(React.createElement(Component, { query: 'one' })); });
  renders.length = 0; await renderer.act(async () => { view.update(React.createElement(Component, { query: 'two' })); });
  assertion.equal(renders.includes('one'), false); assertion.equal(renders.at(-1), 'two');
  renders.length = 0; await renderer.act(async () => { environment.account('second'); });
  assertion.equal(renders[0], null); await renderer.act(async () => view.unmount());
});
test('useData unmount aborts its request and ignores a late completion', async () => {
  const environment = hookEnvironment(); const operation = deferred(); let signal; let view; let latest;
  function Component() { latest = environment.hooks.useData('library', captured => { signal = captured; return operation.promise; }); return null; }
  await renderer.act(async () => { view = renderer.create(React.createElement(Component)); await settle(); });
  await renderer.act(async () => view.unmount()); assertion.equal(signal.aborted, true);
  operation.resolve('late'); await settle(); assertion.equal(latest.data, null);
});
function searchEnvironment() {
  let query = ''; let scope = {}; let view; const timers = new Map(); const calls = [];
  const api = { get(address, configuration) { const operation = deferred(); calls.push({ address, configuration, ...operation }); return operation.promise; } };
  const generic = new Proxy({ __esModule: true, default: 'Fixture', colors: {}, menuOptions: [] }, { get(target, key) { return key in target ? target[key] : String(key); } });
  const dependencies = new Proxy({ react: React, 'react-native': { FlatList: 'FlatList', View: 'View', ActivityIndicator: 'ActivityIndicator' },
    '../../hooks/useApi.ts': { useApi: () => api }, '../../../MusicProvider.tsx': { useMusicQueue: () => ({ playTracks() {} }) },
    '../../services/DataProvider.tsx': { useData: () => ({ data: { query }, updateData() {} }), useDataScope: () => scope },
    '../../services/data/LatestRequestScope': { LatestRequestScope } }, {
    has() { return true; }, get(target, key) { return key in target ? target[key] : generic; }
  });
  dependencies['../../components/ContextMenu/ContextMenu.render'] = { __esModule: true, default: 'ContextMenu' };
  const Search = load('../pages/Search/Search.render.tsx', dependencies, {
    setTimeout(callback) { const identifier = {}; timers.set(identifier, callback); return identifier; },
    clearTimeout(identifier) { timers.delete(identifier); }
  }).default;
  return { calls, async render(value, accountChange = false) {
    query = value; if (accountChange) scope = {};
    await renderer.act(async () => { const component = React.createElement(Search, { navigation: {}, route: {} });
      if (view) view.update(component); else view = renderer.create(component); });
  }, async start() { await renderer.act(async () => { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) void callback(); await settle(); }); },
    async reply(index, data) { await renderer.act(async () => { calls[index].resolve({ data }); await settle(); }); },
    async more() { await renderer.act(async () => { void view.root.findByType('FlatList').props.onEndReached(); await settle(); }); },
    rows() { return view.root.findByType('FlatList').props.data; },
    async menu() { await renderer.act(async () => { const list = view.root.findByType('FlatList');
      list.props.renderItem({ item: list.props.data[0] }).props.onMorePress({ nativeEvent: { pageX: 0, pageY: 0 } }); }); },
    menuCount() { return view.root.findAllByType('ContextMenu').length; },
    async unmount() { await renderer.act(async () => view.unmount()); }
  };
}
const searchResult = (title, hasMoreTracks = true) => ({ tracks: [{ id: title, title, artistName: 'artist' }], hasMoreTracks });
test('Search clears and cancels in-flight results without issuing their external follow-up', async () => {
  const environment = searchEnvironment(); await environment.render('alpha'); await environment.start();
  assertion.equal(environment.calls.length, 1); await environment.render(''); assertion.equal(environment.calls[0].configuration.signal.aborted, true);
  await environment.reply(0, searchResult('old')); assertion.equal(environment.rows().length, 0); assertion.equal(environment.calls.length, 1); await environment.unmount();
});
test('Search ignores the first A response after A to B to A', async () => {
  const environment = searchEnvironment(); await environment.render('alpha'); await environment.start(); await environment.render('beta'); await environment.start();
  await environment.render('alpha'); await environment.start(); await environment.reply(0, searchResult('stale'));
  assertion.equal(environment.rows().length, 0); await environment.reply(2, searchResult('current')); assertion.equal(environment.rows()[0].data.id, 'current'); await environment.unmount();
});
test('Search cannot paginate using the previous query page during debounce or initial load', async () => {
  const environment = searchEnvironment(); await environment.render('alpha'); await environment.start(); await environment.reply(0, searchResult('alpha'));
  await environment.more(); assertion.equal(environment.calls.at(-1).configuration.params.page, 2);
  await environment.render('beta'); const before = environment.calls.length; await environment.more(); assertion.equal(environment.calls.length, before);
  await environment.start(); await environment.more(); assertion.equal(environment.calls.length, before + 1); assertion.equal(environment.calls.at(-1).configuration.params.page, 1); await environment.unmount();
});
test('Search account changes hide rows and abort both lookup requests', async () => {
  const environment = searchEnvironment(); await environment.render('alpha'); await environment.start(); await environment.reply(0, searchResult('private'));
  assertion.equal(environment.calls.length, 2); await environment.render('alpha', true);
  assertion.equal(environment.rows().length, 0); assertion.equal(environment.calls[1].configuration.signal.aborted, true);
  await environment.reply(1, { tracks: [{ id: 'old', title: 'old' }] }); assertion.equal(environment.rows().length, 0); await environment.unmount();
});
test('Search paging keeps database precedence when an external track later appears locally', async () => {
  const environment = searchEnvironment(); await environment.render('alpha'); await environment.start(); await environment.reply(0, searchResult('first'));
  await environment.reply(1, { tracks: [{ id: 'later', title: 'later', artistName: 'artist' }] }); assertion.equal(environment.rows().length, 2);
  await environment.more(); await environment.reply(2, searchResult('later', false));
  assertion.equal(environment.rows().length, 2); assertion.equal(environment.rows().filter(item => item.data.id === 'later').length, 1); await environment.unmount();
});
test('Search closes track actions when the account scope changes', async () => {
  const environment = searchEnvironment(); await environment.render('alpha'); await environment.start(); await environment.reply(0, searchResult('private'));
  await environment.menu(); assertion.equal(environment.menuCount(), 1); await environment.render('alpha', true);
  assertion.equal(environment.menuCount(), 0); await environment.unmount();
});
test('explicit cache disposal clears anonymous data and aborts in-flight work', async () => {
  const store = new AccountQueryStore(() => 0); const operation = deferred(); let signal;
  const release = store.observe('anonymous', store.getScope(), () => undefined, captured => { signal = captured; return operation.promise; });
  await settle(); store.clear(); assertion.equal(signal.aborted, true); operation.resolve('late'); await settle();
  assertion.equal(store.retainedEntries, 0); release();
});

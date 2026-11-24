const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  store: '../.build/spotify/SpotifyHostedQueueStore' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyHostedQueueStore } = require(Imports.store);
const Fixture = Object.freeze({ initialCount: 0, oneObserver: 1, firstPosition: 0, lastPosition: -1 });
const Names = Object.freeze({ idle: 'Constructing the queue view store does not start observation',
  visible: 'A focused queue view starts observation and releases it when closed',
  multiple: 'Closing one of two queue views preserves the remaining observation',
  replacement: 'Replacing accounts retires old queue observation and binds the current view',
  refresh: 'Manual queue refresh addresses only the current observer',
  disposal: 'Disposal releases connection and queue subscriptions and stops observation' });
function snapshot() { return { enabled: true, status: library.HostedQueueStatus.Idle, sessionIdentifier: null, hostDeviceIdentifier: null,
  currentlyPlaying: null, entries: [], observedAtMilliseconds: null, failure: null }; }
function observer() { const listeners = new Set(); const calls = { observation: [], refreshes: Fixture.initialCount }; let state = snapshot();
  return { calls, listeners, getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setObserving: value => { calls.observation.push(value); }, refresh: async () => { calls.refreshes += Fixture.oneObserver; },
    publish(value) { state = value; for (const listener of [...listeners]) listener(); } }; }
function fixture() { const listeners = new Set(); let current = null;
  const store = new SpotifyHostedQueueStore({ getObserver: () => current,
    subscribeConnection(listener) { listeners.add(listener); return () => listeners.delete(listener); } });
  return { store, listeners, change(next) { current = next; for (const listener of [...listeners]) listener(); } }; }
test(Names.idle, () => { const current = fixture(); const target = observer(); current.change(target);
  assertion.equal(target.calls.observation.at(Fixture.lastPosition), false); assertion.equal(target.calls.refreshes, Fixture.initialCount); current.store.dispose(); });
test(Names.visible, () => { const current = fixture(); const target = observer(); current.change(target);
  const close = current.store.observe(); assertion.equal(target.calls.observation.at(Fixture.lastPosition), true);
  close(); assertion.equal(target.calls.observation.at(Fixture.lastPosition), false); current.store.dispose(); });
test(Names.multiple, () => { const current = fixture(); const target = observer(); current.change(target);
  const first = current.store.observe(); const second = current.store.observe(); first();
  assertion.equal(target.calls.observation.at(Fixture.lastPosition), true); second(); assertion.equal(target.calls.observation.at(Fixture.lastPosition), false); current.store.dispose(); });
test(Names.replacement, () => { const current = fixture(); const previous = observer(); const next = observer(); current.change(previous); const close = current.store.observe();
  current.change(next); assertion.equal(previous.calls.observation.at(Fixture.lastPosition), false); assertion.equal(previous.listeners.size, Fixture.initialCount);
  assertion.equal(next.calls.observation.at(Fixture.lastPosition), true); previous.publish({ ...snapshot(), status: library.HostedQueueStatus.Failed });
  assertion.equal(current.store.getSnapshot().status, library.HostedQueueStatus.Idle); close(); current.store.dispose(); });
test(Names.refresh, async () => { const current = fixture(); const previous = observer(); const next = observer(); current.change(previous); current.change(next);
  await current.store.refresh(); assertion.equal(previous.calls.refreshes, Fixture.initialCount); assertion.equal(next.calls.refreshes, Fixture.oneObserver); current.store.dispose(); });
test(Names.disposal, async () => { const current = fixture(); const target = observer(); current.change(target); current.store.observe(); current.store.dispose();
  assertion.equal(current.listeners.size, Fixture.initialCount); assertion.equal(target.listeners.size, Fixture.initialCount);
  assertion.equal(target.calls.observation.at(Fixture.lastPosition), false); await current.store.refresh();
  assertion.equal(target.calls.refreshes, Fixture.initialCount); current.store.observe(); assertion.equal(current.store.getSnapshot().enabled, false); });

const ReentrantReplacementName = 'A subscriber replacing the observer cannot reactivate the retired observer';
test(ReentrantReplacementName, () => { const current = fixture(); const previous = observer(); const next = observer(); current.store.observe();
  current.store.subscribe(() => { if (current.store.getSnapshot() === previous.getSnapshot()) current.change(next); });
  current.change(previous); assertion.ok(previous.calls.observation.every(value => value === false));
  assertion.equal(next.calls.observation.at(Fixture.lastPosition), true); current.store.dispose(); });

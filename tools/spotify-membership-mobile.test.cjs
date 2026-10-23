const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  store: '../.build/spotify/SpotifyMembershipStore' });
const test = require(Imports.test);
const assertion = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyMembershipStore } = require(Imports.store);
const Fixture = Object.freeze({ initialCount: 0, singleCount: 1, observedAtMilliseconds: 1000 });
const Names = Object.freeze({ disabled: 'A disconnected membership store is disabled and sends no refresh',
  active: 'Visible membership projection observes the connected coordinator and forwards manual refresh',
  retired: 'Account replacement retires prior membership snapshots and leases' });
function snapshot() { return { enabled: true, status: library.MembershipObservationStatus.Idle, observedAtMilliseconds: null, failure: null }; }
function fixture() { const connections = new Set(); let coordinator = null;
  const store = new SpotifyMembershipStore({ getObserver: () => coordinator,
    subscribeConnection(listener) { connections.add(listener); return () => connections.delete(listener); } });
  return { store, change(next) { coordinator = next; for (const listener of [...connections]) listener(); } }; }
function observer() { const listeners = new Set(); let state = snapshot(); const calls = { refreshes: Fixture.initialCount, observing: false };
  return { listeners, calls, getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setObserving: value => { calls.observing = value; }, refresh: async () => { calls.refreshes += Fixture.singleCount; },
    publish(next) { state = next; for (const listener of [...listeners]) listener(); } }; }
test(Names.disabled, async () => { const current = fixture(); assertion.equal(current.store.getSnapshot().enabled, false);
  await current.store.refresh(); current.store.dispose(); });
test(Names.active, async () => { const current = fixture(); const coordinator = observer(); current.change(coordinator); const close = current.store.observe();
  assertion.equal(coordinator.calls.observing, true); await current.store.refresh(); assertion.equal(coordinator.calls.refreshes, Fixture.singleCount);
  coordinator.publish({ ...snapshot(), status: library.MembershipObservationStatus.Ready, observedAtMilliseconds: Fixture.observedAtMilliseconds });
  assertion.equal(current.store.getSnapshot().status, library.MembershipObservationStatus.Ready); close(); assertion.equal(coordinator.calls.observing, false); current.store.dispose(); });
test(Names.retired, () => { const current = fixture(); const previous = observer(); const next = observer(); current.change(previous); const close = current.store.observe();
  current.change(next); assertion.equal(previous.calls.observing, false); assertion.equal(previous.listeners.size, Fixture.initialCount);
  previous.publish({ ...snapshot(), status: library.MembershipObservationStatus.Failed }); assertion.equal(current.store.getSnapshot().status, library.MembershipObservationStatus.Idle);
  assertion.equal(next.calls.observing, true); close(); current.store.dispose(); });

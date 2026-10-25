const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam',
  commands: '../.build/spotify/SpotifyPlaybackCommandStore' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const library = require(Imports.library);
const { SpotifyPlaybackCommandStore } = require(Imports.commands);

const Fixture = Object.freeze({ account: 'spotify-account', session: 'owned-session', host: 'owned-host', otherHost: 'replacement-host',
  request: 'playback-request', track: 'aaaaaaaaaaaaaaaaaaaaaa', seconds: '12.345', positionMilliseconds: 12345,
  invalidSeconds: '1e3', roundingSeconds: '1.001', roundedMilliseconds: 1001, zero: 0, one: 1, flushCount: 12,
  firstListener: 'first-listener', secondListener: 'second-listener', addedListener: 'added-listener',
  names: Object.freeze({ idle: 'Playback controls wait for explicit input and require an owned active host',
    execute: 'Playback controls send one intent with a fresh request identifier',
    seek: 'Seeking binds converted milliseconds to a freshly read Spotify track',
    invalid: 'Malformed seek text never reads or mutates playback',
    duplicate: 'Busy controls ignore duplicate taps until the receipt settles',
    uncertain: 'An uncertain playback receipt disables controls until reconnection',
    connection: 'Account runtime replacement ignores late playback receipts',
    membership: 'Host replacement aborts seek preparation and preserves the replacement state',
    dispose: 'Disposed controls cannot send commands or accept late results',
    failure: 'Typed playback failures remain visible without clearing the Spotify login',
    observation: 'Reentrant observer changes cannot invoke a removed or newly added listener in the same publication',
    rounding: 'Decimal seek input is converted without floating point rejection of valid milliseconds' }) });
function deferred() { let resolve; const promise = new Promise(complete => { resolve = complete; }); return { promise, resolve }; }
async function flush() { for (let turn = Fixture.zero; turn < Fixture.flushCount; turn += Fixture.one) await Promise.resolve(); }
function fixture() {
  const listeners = new Set(); const membershipListeners = new Set();
  const state = { execute: null, read: null, membership: { accountIdentifier: Fixture.account, status: library.JamConnectionStatus.Ready,
    session: { identifier: Fixture.session, hostDeviceIdentifier: Fixture.host, ownedByCurrentAccount: true, active: true } } };
  const calls = { commands: [], reads: [], identifiers: Fixture.zero };
  const runtime = { sessions: { capabilities: { playbackControl: true }, getSnapshot: () => state.membership,
    subscribe: listener => { membershipListeners.add(listener); return () => membershipListeners.delete(listener); },
    executeHostedPlayback: async (...parameters) => { calls.commands.push(parameters); return state.execute
      ? state.execute(...parameters) : { applied: true, failure: null }; } },
    readHostedPlayback: async signal => { calls.reads.push(signal); return state.read ? state.read(signal) : { spotifyTrackIdentifier: Fixture.track }; } };
  let currentRuntime = runtime;
  const store = new SpotifyPlaybackCommandStore({ getRuntime: () => currentRuntime,
    subscribeConnection: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    nextIdentifier: () => { calls.identifiers += Fixture.one; return Fixture.request; } });
  return { store, runtime, state, calls,
    replace(value = null) { currentRuntime = value; for (const listener of listeners) listener(); },
    membership() { for (const listener of membershipListeners) listener(); } };
}
test(Fixture.names.idle, () => { const current = fixture(); assert.equal(current.store.getSnapshot().available, true);
  assert.equal(current.calls.commands.length, Fixture.zero); current.state.membership.session.ownedByCurrentAccount = false; current.membership();
  assert.equal(current.store.getSnapshot().available, false); current.store.dispose(); });
test(Fixture.names.execute, async () => { const current = fixture(); await current.store.execute(library.HostedPlaybackCommandKind.Pause);
  assert.deepEqual(current.calls.commands, [[{ kind: library.HostedPlaybackCommandKind.Pause }, Fixture.request]]);
  assert.equal(current.store.getSnapshot().pending, false); current.store.dispose(); });
test(Fixture.names.seek, async () => { const current = fixture(); await current.store.seek(Fixture.seconds);
  assert.deepEqual(current.calls.commands, [[{ kind: library.HostedPlaybackCommandKind.Seek,
    positionMilliseconds: Fixture.positionMilliseconds, expectedSpotifyTrackIdentifier: Fixture.track }, Fixture.request]]);
  assert.equal(current.calls.reads.length, Fixture.one); current.store.dispose(); });
test(Fixture.names.invalid, async () => { const current = fixture(); await current.store.seek(Fixture.invalidSeconds);
  assert.equal(current.calls.reads.length + current.calls.commands.length, Fixture.zero);
  assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.InvalidInput); current.store.dispose(); });
test(Fixture.names.duplicate, async () => { const current = fixture(); const pending = deferred(); current.state.execute = () => pending.promise;
  const first = current.store.execute(library.HostedPlaybackCommandKind.Next); await flush();
  await current.store.execute(library.HostedPlaybackCommandKind.Next); assert.equal(current.calls.commands.length, Fixture.one);
  assert.equal(current.store.getSnapshot().pending, true); pending.resolve({ applied: true, failure: null }); await first; current.store.dispose(); });
test(Fixture.names.uncertain, async () => { const current = fixture(); current.state.execute = async () => ({ applied: false, failure: library.IntegrationFailureCode.UnknownOutcome });
  await current.store.execute(library.HostedPlaybackCommandKind.Next); current.membership(); await current.store.execute(library.HostedPlaybackCommandKind.Play);
  assert.equal(current.calls.commands.length, Fixture.one); assert.equal(current.store.getSnapshot().uncertain, true);
  current.replace(); current.replace(current.runtime); assert.equal(current.store.getSnapshot().uncertain, false); current.store.dispose(); });
test(Fixture.names.connection, async () => { const current = fixture(); const pending = deferred(); current.state.execute = () => pending.promise;
  const submitting = current.store.execute(library.HostedPlaybackCommandKind.Play); await flush(); current.replace();
  pending.resolve({ applied: false, failure: library.IntegrationFailureCode.Forbidden }); await submitting;
  assert.equal(current.store.getSnapshot().failure, null); assert.equal(current.store.getSnapshot().available, false); current.store.dispose(); });
test(Fixture.names.membership, async () => { const current = fixture(); const pending = deferred(); current.state.read = () => pending.promise;
  const seeking = current.store.seek(Fixture.seconds); await flush(); current.state.membership.session.hostDeviceIdentifier = Fixture.otherHost; current.membership();
  assert.equal(current.calls.reads[Fixture.zero].aborted, true); pending.resolve({ spotifyTrackIdentifier: Fixture.track }); await seeking;
  assert.equal(current.calls.commands.length, Fixture.zero); assert.equal(current.store.getSnapshot().failure, null); current.store.dispose(); });
test(Fixture.names.dispose, async () => { const current = fixture(); const pending = deferred(); current.state.execute = () => pending.promise;
  const submitting = current.store.execute(library.HostedPlaybackCommandKind.Play); await flush(); current.store.dispose();
  pending.resolve({ applied: false, failure: library.IntegrationFailureCode.Forbidden }); await submitting;
  await current.store.execute(library.HostedPlaybackCommandKind.Next); assert.equal(current.calls.commands.length, Fixture.one); });
test(Fixture.names.failure, async () => { const current = fixture(); current.state.execute = async () => ({ applied: false, failure: library.IntegrationFailureCode.Forbidden });
  await current.store.execute(library.HostedPlaybackCommandKind.Play); assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.Forbidden);
  assert.equal(current.store.getSnapshot().available, true); current.store.dispose(); });
test(Fixture.names.observation, async () => { const current = fixture(); const events = [];
  const added = () => events.push(Fixture.addedListener);
  let removeSecond = () => undefined;
  current.store.subscribe(() => { events.push(Fixture.firstListener); removeSecond(); current.store.subscribe(added); });
  removeSecond = current.store.subscribe(() => events.push(Fixture.secondListener));
  const submitting = current.store.execute(library.HostedPlaybackCommandKind.Play);
  assert.deepEqual(events, [Fixture.firstListener]); await submitting; current.store.dispose();
});
test(Fixture.names.rounding, async () => { const current = fixture(); await current.store.seek(Fixture.roundingSeconds);
  assert.equal(current.calls.commands[Fixture.zero][Fixture.zero].positionMilliseconds, Fixture.roundedMilliseconds); current.store.dispose();
});

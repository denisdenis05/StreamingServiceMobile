const Imports = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', library: 'streaming-service-spotify-jam', player: 'streaming-service-player' });
const test = require(Imports.test);
const assert = require(Imports.assertion);
const library = require(Imports.library);
const player = require(Imports.player);
const OutputModule = '../.build/spotify/SpotifyNativePlaybackOutput';
const StoreModule = '../.build/spotify/SpotifyPlaybackFollowerStore';
const { SpotifyNativePlaybackOutput } = require(OutputModule);
const { SpotifyPlaybackFollowerStore } = require(StoreModule);

const Fixture = Object.freeze({ account: 'spotify-account', session: 'hosted-session', host: 'host-device', otherHost: 'replacement-host',
  engine: 'native-engine', authentication: 'app-authentication', replacementAuthentication: 'replacement-app-authentication',
  recording: 'local-recording', otherRecording: 'another-recording', track: 'aaaaaaaaaaaaaaaaaaaaaa', otherTrack: 'bbbbbbbbbbbbbbbbbbbbbb',
  occurrence: 'execution-occurrence', title: 'Test song', author: 'Test artist', market: 'RO', invalidMarket: 'invalid',
  identifierPrefix: 'shared-command-', now: 100000, nativeTime: 1234, duration: 200000, position: 12000,
  zero: 0, one: 1, two: 2, delay: 2000, retrySeconds: 30, flushCount: 150,
  privateFailure: 'Unexported native credential detail', otherOwner: 'unrelated-native-owner',
  malformedCapability: 'true',
  names: Object.freeze({ claim: 'Native output acquires one exclusive capability checked authority lease',
    unsupported: 'A native binary without authority support is never given playback commands',
    paused: 'Preparing a local recording replaces the native queue paused with one occurrence',
    missing: 'Missing or mismatched local recordings never enter the native queue',
    clocks: 'Native samples are mapped through JavaScript request timing without subtracting native clock origins',
    slow: 'Slow native snapshot delivery cannot produce a trusted timing sample',
    suspended: 'A user suspended native authority rejects further playback samples',
    retired: 'Native engine or authentication replacement retires old playback execution',
    release: 'Release clears only the owned native authority and is idempotent',
    foreignRelease: 'Late release cannot clear another native authority',
    lookupCancel: 'Release cancels an uncooperative recording lookup before native preparation',
    canceledClaim: 'A canceled in flight native claim is rolled back after acknowledgement',
    immutable: 'Playback execution captures its occurrence and position before waiting',
    outcome: 'Native conflict becomes an uncertain outcome without replay',
    sanitized: 'Native error details cannot escape the playback adapter',
    storeIdle: 'Follower composition starts no polling or native playback automatically',
    follow: 'Starting host following maps a Spotify song and follows through the real synchronization core and native adapter',
    explicit: 'Following requires an explicit start and a valid country',
    poll: 'Host polling reuses matching for the current track and observes remote pause',
    change: 'A changed Spotify track resolves a new local execution occurrence',
    ambiguous: 'Ambiguous matching holds audio and caches the decision while waiting for a different song',
    connection: 'Replacing the Spotify connection cancels polling and releases native authority',
    membership: 'Ending or replacing Jam membership stops local following immediately',
    pendingRelease: 'Replacement following waits for prior native release acknowledgement',
    rateLimit: 'Rate limited following stops audio and enforces retry guidance before a new start',
    lateRead: 'Stopped following discards an uncooperative late playback read',
    invalidReplacement: 'Invalid replacement country input retires existing playback before showing failure',
    userPause: 'A native user pause stops the follower instead of restarting local audio',
    recovery: 'A new follower can reclaim a natively expired lease after JavaScript restart',
    pendingStop: 'Stopping remains pending until native release is acknowledged',
    freshDuringLookup: 'Host polling continues during recording lookup and applies the latest pause after preparation',
    cleanupRecovery: 'Explicit restart after failed cleanup respects active ownership and can reclaim a later expired lease',
    reentrantStart: 'A replacement started during stopping supersedes the outer start without leaking subscriptions',
    reentrantDisposal: 'Disposal during stopping prevents pending replacement installation',
    staleCleanupFailure: 'An older cleanup failure cannot replace a newer rejected start',
    disposal: 'Disposal removes connection and membership observations and cancels all timers' }) });
const identity = Object.freeze({ accountIdentifier: Fixture.account, sessionIdentifier: Fixture.session, authorityIdentifier: Fixture.host });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let iteration = Fixture.zero; iteration < Fixture.flushCount; iteration += Fixture.one) await Promise.resolve(); }
function failure(code) { return value => value instanceof library.IntegrationFailure && value.code === code; }
function environment() {
  const state = { now: Fixture.now, sequence: Fixture.zero, owner: null, suspended: false, expired: false, currentEntry: null, position: Fixture.zero,
    playing: false, authentication: Fixture.authentication, calls: [], supported: true, readHook: null, claimHook: null, releaseHook: null,
    recording: { identifier: Fixture.recording, title: Fixture.title, author: Fixture.author }, lookup: null, nativeResult: player.CommandResultStatus.Applied };
  const snapshot = () => ({ cursor: { engineEpoch: Fixture.engine, authenticationEpoch: state.authentication,
    queueRevision: Fixture.one, queueIdentifier: Fixture.session, playbackControlRevision: Fixture.one },
    externalAuthorityIdentifier: state.owner, externalAuthoritySuspended: state.suspended, externalAuthorityExpired: state.expired, currentEntry: state.currentEntry,
    sampledAtMonotonicMilliseconds: Fixture.nativeTime, positionMilliseconds: state.position, durationMilliseconds: Fixture.duration,
    state: state.playing ? player.PlaybackState.Playing : player.PlaybackState.Paused, interruption: player.PlaybackInterruption.None, canSeek: true });
  const receipt = context => ({ status: state.nativeResult, requestIdentifier: context.requestIdentifier, cursor: snapshot().cursor });
  const native = {
    async initialize() { return { supportsExternalAuthority: state.supported }; },
    async getSnapshot() { if (state.readHook) await state.readHook(); return snapshot(); },
    async setExternalAuthority(context, owner) { state.calls.push({ operation: player.NativePlayerOperation.SetExternalAuthority, context, owner });
      if (owner !== null && state.claimHook) await state.claimHook();
      if (owner === null && state.releaseHook) await state.releaseHook();
      state.owner = owner; state.currentEntry = null; state.playing = false; state.suspended = false; state.expired = false; return receipt(context); },
    async renewExternalAuthority(context) { return receipt(context); },
    async replaceQueueAndSelect(context, entries, occurrence, playing) { state.calls.push({ operation: player.NativePlayerOperation.Replace, entries, occurrence, playing, context });
      state.currentEntry = entries[Fixture.zero]; state.playing = playing; state.position = Fixture.zero; return receipt(context); },
    async seek(context, occurrence, position) { state.calls.push({ operation: player.NativePlayerOperation.Seek, occurrence, position, context }); state.position = position; return receipt(context); },
    async play(context) { state.playing = true; return receipt(context); }, async pause(context) { state.playing = false; return receipt(context); },
  };
  const output = new SpotifyNativePlaybackOutput({ native, clock: { nowMonotonicMilliseconds: () => state.now },
    nextIdentifier: () => Fixture.identifierPrefix + ++state.sequence, whenReady: async () => undefined,
    resolveRecording: async (...parameters) => state.lookup ? state.lookup(...parameters) : state.recording });
  return { state, native, output, snapshot, async prepared() { const lease = await output.acquire(identity, new AbortController().signal);
    await lease.prepare(Fixture.recording, Fixture.occurrence, new AbortController().signal); return lease; } };
}
function storeEnvironment() {
  const current = environment(); const connectionListeners = new Set(); const sessionListeners = new Set(); const timers = new Set();
  const state = { runtime: null, track: Fixture.track, playing: true, read: null, reads: Fixture.zero, matches: Fixture.zero,
    session: { accountIdentifier: Fixture.account, session: { identifier: Fixture.session, active: true, hostDeviceIdentifier: Fixture.host } },
    matchStatus: library.MatchStatus.Matched };
  const runtime = { sessions: { getSnapshot: () => state.session, subscribe(listener) { sessionListeners.add(listener); return () => sessionListeners.delete(listener); } },
    async readHostedPlayback() { state.reads += Fixture.one; if (state.read) return state.read(); return { ...identity, spotifyTrackIdentifier: state.track,
      positionMilliseconds: Fixture.position, durationMilliseconds: Fixture.duration, playing: state.playing,
      anchorMonotonicMilliseconds: current.state.now, observedMonotonicMilliseconds: current.state.now, uncertaintyMilliseconds: Fixture.zero, stateChangedAtUnixMilliseconds: Fixture.one }; },
    async translateToRecording() { state.matches += Fixture.one; return { status: state.matchStatus, selected: state.matchStatus === library.MatchStatus.Matched
      ? current.state.recording : null, candidates: [], failure: null }; } };
  state.runtime = runtime;
  const store = new SpotifyPlaybackFollowerStore({ getRuntime: () => state.runtime, subscribeConnection(listener) { connectionListeners.add(listener); return () => connectionListeners.delete(listener); },
    output: current.output, clock: { nowMonotonicMilliseconds: () => current.state.now }, nextIdentifier: () => Fixture.identifierPrefix + ++current.state.sequence,
    scheduler: { schedule(delay, callback) { const timer = { due: current.state.now + delay, callback }; timers.add(timer); return () => timers.delete(timer); } } });
  return { ...current, storeState: state, store, timers, connectionListeners, sessionListeners,
    async tick() { current.state.now += Fixture.delay; const due = [...timers].filter(timer => timer.due <= current.state.now);
      for (const timer of due) { timers.delete(timer); timer.callback(); } await flush(); } };
}

test(Fixture.names.claim, async () => { const current = environment(); const lease = await current.output.acquire(identity, new AbortController().signal);
  assert.ok(current.state.owner); await assert.rejects(current.output.acquire(identity, new AbortController().signal), failure(library.IntegrationFailureCode.Backpressure)); await lease.release(); });
test(Fixture.names.unsupported, async () => { for (const supported of [false, Fixture.malformedCapability]) { const current = environment(); current.state.supported = supported; await assert.rejects(current.output.acquire(identity, new AbortController().signal), failure(library.IntegrationFailureCode.Unsupported)); assert.equal(current.state.calls.length, Fixture.zero); } });
test(Fixture.names.paused, async () => { const current = environment(); const lease = await current.prepared(); const replacement = current.state.calls.find(call => call.entries);
  assert.equal(replacement.entries.length, Fixture.one); assert.equal(replacement.playing, false); assert.equal(replacement.entries[Fixture.zero].recordingIdentifier, Fixture.recording); await lease.release(); });
test(Fixture.names.missing, async () => { for (const recording of [null, { identifier: Fixture.otherRecording }]) { const current = environment(); current.state.recording = recording;
  const lease = await current.output.acquire(identity, new AbortController().signal); await assert.rejects(lease.prepare(Fixture.recording, Fixture.occurrence, new AbortController().signal), failure(library.IntegrationFailureCode.NotFound)); await lease.release(); } });
test(Fixture.names.clocks, async () => { const current = environment(); const lease = await current.prepared(); const sample = await lease.sample(new AbortController().signal);
  assert.equal(sample.sampledMonotonicMilliseconds, Fixture.now); assert.equal(sample.uncertaintyMilliseconds, Fixture.zero); await lease.release(); });
test(Fixture.names.slow, async () => { const current = environment(); const lease = await current.prepared(); current.state.readHook = () => { current.state.now += Fixture.delay; };
  await assert.rejects(lease.sample(new AbortController().signal), failure(library.IntegrationFailureCode.Deadline)); await lease.release(); });
test(Fixture.names.suspended, async () => { const current = environment(); const lease = await current.prepared(); current.state.suspended = true;
  await assert.rejects(lease.sample(new AbortController().signal), failure(library.IntegrationFailureCode.Canceled)); await lease.release(); });
test(Fixture.names.retired, async () => { const current = environment(); const lease = await current.prepared(); current.state.authentication = Fixture.replacementAuthentication;
  await assert.rejects(lease.sample(new AbortController().signal), failure(library.IntegrationFailureCode.Superseded)); await lease.release(); });
test(Fixture.names.release, async () => { const current = environment(); const lease = await current.prepared(); await lease.release(); await lease.release(); assert.equal(current.state.owner, null);
  assert.equal(current.state.calls.filter(call => call.owner === null).length, Fixture.one); });
test(Fixture.names.foreignRelease, async () => { const current = environment(); const lease = await current.prepared(); current.state.owner = Fixture.otherOwner; await lease.release(); assert.equal(current.state.owner, Fixture.otherOwner); });
test(Fixture.names.lookupCancel, async () => { const current = environment(); const pending = deferred(); current.state.lookup = () => pending.promise;
  const lease = await current.output.acquire(identity, new AbortController().signal); const preparing = lease.prepare(Fixture.recording, Fixture.occurrence, new AbortController().signal);
  const rejected = assert.rejects(preparing, failure(library.IntegrationFailureCode.Canceled)); await flush(); await lease.release(); pending.resolve(current.state.recording); await rejected;
  assert.equal(current.state.currentEntry, null); });
test(Fixture.names.canceledClaim, async () => { const current = environment(); const pending = deferred(); current.state.claimHook = () => pending.promise; const cancellation = new AbortController();
  const acquiring = current.output.acquire(identity, cancellation.signal); const rejected = assert.rejects(acquiring, failure(library.IntegrationFailureCode.Canceled)); await flush(); cancellation.abort(); pending.resolve(); await rejected; assert.equal(current.state.owner, null); });
test(Fixture.names.immutable, async () => { const current = environment(); const lease = await current.prepared(); const execution = { occurrenceIdentifier: Fixture.occurrence, positionMilliseconds: Fixture.position, seek: true, playing: true };
  const applying = lease.apply(execution, new AbortController().signal); execution.positionMilliseconds = Fixture.zero; await applying; assert.equal(current.state.position, Fixture.position); await lease.release(); });
test(Fixture.names.outcome, async () => { const current = environment(); const lease = await current.prepared(); current.state.nativeResult = player.CommandResultStatus.Conflict;
  await assert.rejects(lease.apply({ occurrenceIdentifier: Fixture.occurrence, positionMilliseconds: Fixture.position, seek: true, playing: true }, new AbortController().signal), failure(library.IntegrationFailureCode.UnknownOutcome)); current.state.nativeResult = player.CommandResultStatus.Applied; await lease.release(); });
test(Fixture.names.sanitized, async () => { const current = environment(); current.native.initialize = async () => { throw new Error(Fixture.privateFailure); };
  await assert.rejects(current.output.acquire(identity, new AbortController().signal), value => value instanceof library.IntegrationFailure && !value.message.includes(Fixture.privateFailure)); });
test(Fixture.names.storeIdle, async () => { const current = storeEnvironment(); assert.equal(current.storeState.reads, Fixture.zero); assert.equal(current.state.calls.length, Fixture.zero); await current.store.dispose(); });
test(Fixture.names.follow, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Following);
  assert.equal(current.state.playing, true); assert.equal(current.state.position, Fixture.position); await current.store.dispose(); });
test(Fixture.names.explicit, async () => { const current = storeEnvironment(); await current.store.start(Fixture.invalidMarket); assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.InvalidInput);
  assert.equal(current.storeState.reads, Fixture.zero); await current.store.dispose(); });
test(Fixture.names.poll, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); current.storeState.playing = false; await current.tick();
  assert.equal(current.state.playing, false); assert.equal(current.storeState.matches, Fixture.one); await current.store.dispose(); });
test(Fixture.names.change, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); const occurrence = current.state.currentEntry.entryIdentifier; current.storeState.track = Fixture.otherTrack;
  await current.tick(); assert.notEqual(current.state.currentEntry.entryIdentifier, occurrence); assert.equal(current.storeState.matches, Fixture.two); await current.store.dispose(); });
test(Fixture.names.ambiguous, async () => { const current = storeEnvironment(); current.storeState.matchStatus = library.MatchStatus.Ambiguous; await current.store.start(Fixture.market); await current.tick();
  assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Unavailable); assert.equal(current.state.playing, false); assert.equal(current.storeState.matches, Fixture.one); await current.store.dispose(); });
test(Fixture.names.connection, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); current.storeState.runtime = null;
  for (const listener of current.connectionListeners) listener(); await flush(); assert.equal(current.state.owner, null); assert.equal(current.timers.size, Fixture.zero); await current.store.dispose(); });
test(Fixture.names.membership, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); current.storeState.session = { accountIdentifier: Fixture.account, session: null };
  for (const listener of [...current.sessionListeners]) listener(); await flush(); assert.equal(current.state.playing, false); assert.equal(current.state.owner, null); await current.store.dispose(); });
test(Fixture.names.pendingRelease, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); const pending = deferred(); current.state.releaseHook = () => pending.promise;
  const replacing = current.store.start(Fixture.market); await flush(); assert.equal(current.state.calls.filter(call => call.owner).length, Fixture.one); pending.resolve(); await replacing;
  assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Following); await current.store.dispose(); });
test(Fixture.names.rateLimit, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); current.storeState.read = () => { throw new library.IntegrationFailure(library.IntegrationFailureCode.RateLimited, Fixture.retrySeconds); };
  await current.tick(); const reads = current.storeState.reads; await current.store.start(Fixture.market); assert.equal(current.storeState.reads, reads); assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.RateLimited);
  assert.equal(current.state.playing, false); await current.store.dispose(); });
test(Fixture.names.lateRead, async () => { const current = storeEnvironment(); const pending = deferred(); current.storeState.read = () => pending.promise; const starting = current.store.start(Fixture.market);
  await flush(); await current.store.stop(); pending.resolve({ ...identity }); await starting; assert.equal(current.state.calls.length, Fixture.zero); await current.store.dispose(); });
test(Fixture.names.invalidReplacement, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); await current.store.start(Fixture.invalidMarket);
  assert.equal(current.state.playing, false); assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.InvalidInput); await current.store.dispose(); });
test(Fixture.names.userPause, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); current.state.suspended = true; current.state.playing = false;
  await current.tick(); assert.equal(current.state.playing, false); assert.equal(current.state.owner, null); assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Detached); await current.store.dispose(); });
test(Fixture.names.disposal, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); await current.store.dispose(); assert.equal(current.connectionListeners.size, Fixture.zero);
  assert.equal(current.sessionListeners.size, Fixture.zero); assert.equal(current.timers.size, Fixture.zero); });
test(Fixture.names.recovery, async () => { const current = environment(); current.state.owner = Fixture.otherOwner; current.state.expired = true;
  const lease = await current.output.acquire(identity, new AbortController().signal); assert.notEqual(current.state.owner, Fixture.otherOwner);
  assert.equal(current.state.calls[Fixture.zero].context.externalAuthorityIdentifier, Fixture.otherOwner); await lease.release(); });
test(Fixture.names.pendingStop, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); const pending = deferred(); current.state.releaseHook = () => pending.promise;
  const stopping = current.store.stop(); await flush(); assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Stopping);
  pending.resolve(); await stopping; assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Detached); await current.store.dispose(); });
test(Fixture.names.freshDuringLookup, async () => { const current = storeEnvironment(); const pending = deferred(); current.storeState.runtime.translateToRecording = () => pending.promise;
  const starting = current.store.start(Fixture.market); await flush(); current.storeState.playing = false; await current.tick();
  assert.equal(current.storeState.reads, Fixture.two); pending.resolve({ status: library.MatchStatus.Matched, selected: current.state.recording, candidates: [], failure: null });
  await starting; assert.equal(current.state.playing, false); await current.store.dispose(); });
test(Fixture.names.cleanupRecovery, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market);
  current.state.releaseHook = async () => { throw new Error(Fixture.privateFailure); };
  await assert.rejects(current.store.stop()); assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.UnknownOutcome);
  current.state.releaseHook = null; await current.store.start(Fixture.market);
  assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.Backpressure);
  current.state.expired = true; await current.store.start(Fixture.market);
  assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Following); await current.store.dispose(); });
test(Fixture.names.reentrantStart, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); let triggered = false; let replacement = null;
  current.store.subscribe(() => { if (!triggered && current.store.getSnapshot().status === library.SharedPlaybackStatus.Stopping) {
    triggered = true; replacement = current.store.start(Fixture.market);
  } });
  await current.store.start(Fixture.market); await replacement; assert.equal(current.sessionListeners.size, Fixture.one);
  await current.store.dispose(); assert.equal(current.sessionListeners.size, Fixture.zero); });
test(Fixture.names.reentrantDisposal, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); let disposing = null;
  current.store.subscribe(() => { if (current.store.getSnapshot().status === library.SharedPlaybackStatus.Stopping && !disposing) disposing = current.store.dispose(); });
  await current.store.start(Fixture.market); await disposing; assert.equal(current.sessionListeners.size, Fixture.zero); assert.equal(current.state.owner, null); });
test(Fixture.names.staleCleanupFailure, async () => { const current = storeEnvironment(); await current.store.start(Fixture.market); const pending = deferred(); current.state.releaseHook = () => pending.promise;
  let triggered = false; let replacement = null;
  current.store.subscribe(() => { if (!triggered && current.store.getSnapshot().status === library.SharedPlaybackStatus.Stopping) {
    triggered = true; current.storeState.runtime = null; replacement = current.store.start(Fixture.market);
  } });
  const stopping = assert.rejects(current.store.stop()); await flush(); pending.reject(new Error(Fixture.privateFailure));
  await stopping; await replacement; assert.equal(current.store.getSnapshot().failure, library.IntegrationFailureCode.Unauthorized); await current.store.dispose(); });

const ConnectFixture = Object.freeze({ nextOccurrence: 'next-remote-occurrence',
  names: { occurrence: 'Repeated Spotify tracks with a new remote occurrence prepare a distinct local playback execution',
    buffering: 'Native source buffering holds local playback rather than discarding the source buffering state' } });
function connectSample(current, occurrenceIdentifier, buffering = false) { return { ...identity,
  spotifyTrackIdentifier: Fixture.track, occurrenceIdentifier, buffering,
  positionMilliseconds: Fixture.position, durationMilliseconds: Fixture.duration, playing: !buffering,
  anchorMonotonicMilliseconds: current.state.now, observedMonotonicMilliseconds: current.state.now,
  uncertaintyMilliseconds: Fixture.zero, stateChangedAtUnixMilliseconds: Fixture.one }; }
test(ConnectFixture.names.occurrence, async () => {
  const current = storeEnvironment(); let occurrenceIdentifier = Fixture.occurrence;
  current.storeState.read = () => connectSample(current, occurrenceIdentifier);
  await current.store.start(Fixture.market); const firstOccurrence = current.state.currentEntry.entryIdentifier;
  occurrenceIdentifier = ConnectFixture.nextOccurrence; await current.tick();
  assert.notEqual(current.state.currentEntry.entryIdentifier, firstOccurrence);
  assert.equal(current.store.getSnapshot().occurrenceIdentifier, ConnectFixture.nextOccurrence);
  assert.equal(current.storeState.matches, Fixture.one);
  await current.store.dispose();
});
test(ConnectFixture.names.buffering, async () => {
  const current = storeEnvironment(); current.storeState.read = () => connectSample(current, Fixture.occurrence, true);
  await current.store.start(Fixture.market); assert.equal(current.state.playing, false);
  assert.equal(current.store.getSnapshot().status, library.SharedPlaybackStatus.Buffering);
  await current.store.dispose();
});

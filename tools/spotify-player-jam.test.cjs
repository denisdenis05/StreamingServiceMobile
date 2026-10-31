const test = require('node:test');
const assertion = require('node:assert/strict');
const { HostedPlaybackCommandKind, IntegrationFailure, IntegrationFailureCode, SharedPlaybackStatus } = require('streaming-service-spotify-jam');
const { SpotifyHostingStatus } = require('../.build/spotify/SpotifyHostingStore');
const { SpotifyPlayerJamController, SpotifyPlayerJamMode } = require('../.build/spotify/SpotifyPlayerJamController');
const Fixture = Object.freeze({ scope: 'synthetic-jam-scope', replacement: 'synthetic-replacement-scope', recording: 'synthetic-recording',
  otherRecording: 'synthetic-other-recording', market: 'ro', normalizedMarket: 'RO', invalidMarket: 'x', privateFailure: 'synthetic-private-error',
  initial: 0, single: 1, second: 2, flushTurns: 20, seconds: 12.34567, normalizedSeconds: '12.346', negativeSeconds: -1,
  maximumQueue: 80, tooManyOffset: 1 });
function deferred() { let resolve; let reject; const promise = new Promise((complete, fail) => { resolve = complete; reject = fail; }); return { promise, resolve, reject }; }
async function flush() { for (let turn = Fixture.initial; turn < Fixture.flushTurns; turn += Fixture.single) await Promise.resolve(); }
function fixture(additionalDependencies = {}) {
  const state = { connection: { scopeIdentifier: Fixture.scope, owned: true, native: true, admitted: true, hasHost: true },
    hosting: { status: SpotifyHostingStatus.Stopped, failure: null }, following: { status: SharedPlaybackStatus.Detached, failure: null },
    remoteAllowed: true, prepare: null, mutation: null, publishFailure: null, startFailure: null };
  const calls = { host: [], follow: [], prepare: [], remote: [], seek: [], publications: Fixture.initial, local: Fixture.initial,
    stopHost: Fixture.initial, stopFollow: Fixture.initial };
  let changed;
  const controller = new SpotifyPlayerJamController({ getConnection: () => state.connection, getHosting: () => state.hosting,
    getFollowing: () => state.following, remoteControlsAvailable: () => state.remoteAllowed,
    subscribe(listener) { changed = listener; return () => undefined; },
    async startHosting(market) { calls.host.push(market); if (state.startFailure) throw state.startFailure; state.hosting.status = SpotifyHostingStatus.Hosting; },
    async startFollowing(market) { calls.follow.push(market); state.following.status = SharedPlaybackStatus.Following; },
    async stopHosting() { calls.stopHost += Fixture.single; state.hosting.status = SpotifyHostingStatus.Stopped; },
    async stopFollowing() { calls.stopFollow += Fixture.single; if (state.mutation) await state.mutation.promise; state.following.status = SharedPlaybackStatus.Detached; },
    async prepareRecordings(identifiers) { calls.prepare.push(identifiers); if (state.prepare) await state.prepare.promise; },
    async publishLocalChanges() { calls.publications += Fixture.single; if (state.publishFailure) throw state.publishFailure; },
    async remoteControl(kind) { calls.remote.push(kind); }, async remoteSeek(seconds) { calls.seek.push(seconds); }, ...additionalDependencies });
  const local = async () => { calls.local += Fixture.single; if (state.mutation) await state.mutation.promise; };
  return { state, calls, controller, local, changed: () => changed() };
}
test('Player Jam does not start sharing on view subscription and normalizes explicit host country', async () => {
  const current = fixture(); assertion.equal(current.calls.host.length, Fixture.initial);
  current.controller.setMarket(Fixture.market); await current.controller.startHosting();
  assertion.deepEqual(current.calls.host, [Fixture.normalizedMarket]); assertion.equal(current.controller.getSnapshot().mode, SpotifyPlayerJamMode.Hosting);
});
test('Guest and browser connections cannot activate app-led hosting', async () => {
  const current = fixture(); current.controller.setMarket(Fixture.market); current.state.connection.owned = false; current.changed();
  await current.controller.startHosting(); assertion.equal(current.calls.host.length, Fixture.initial);
  current.state.connection.owned = true; current.state.connection.native = false; current.changed(); await current.controller.startHosting();
  assertion.equal(current.calls.host.length, Fixture.initial);
});
test('An admitted native guest may explicitly follow while a browser guest cannot', async () => {
  const current = fixture(); current.controller.setMarket(Fixture.market); current.state.connection.owned = false; current.changed();
  await current.controller.startFollowing(); assertion.equal(current.calls.follow.length, Fixture.single);
  current.state.following.status = SharedPlaybackStatus.Detached; current.state.connection.native = false; current.changed();
  await current.controller.startFollowing(); assertion.equal(current.calls.follow.length, Fixture.single);
});
test('Invalid country and failed native start never report acknowledged hosting', async () => {
  const current = fixture(); current.controller.setMarket(Fixture.invalidMarket); await current.controller.startHosting();
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.InvalidInput);
  current.controller.setMarket(Fixture.market); current.state.startFailure = { code: IntegrationFailureCode.Backpressure, message: Fixture.privateFailure };
  await current.controller.startHosting(); assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Backpressure);
  assertion.equal(JSON.stringify(current.controller.getSnapshot()).includes(Fixture.privateFailure), false);
});
test('Active hosting prepares unique recordings before local mutation and publishes only after receipt', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed(); current.state.prepare = deferred();
  const preparation = current.controller.prepareQueueChange([Fixture.recording, Fixture.recording, Fixture.otherRecording], () => true, false);
  assertion.equal(current.calls.publications, Fixture.initial); current.state.prepare.resolve(); const committed = await preparation;
  assertion.deepEqual(current.calls.prepare, [[Fixture.recording, Fixture.otherRecording]]); await current.local(); await committed();
  assertion.equal(current.calls.local, Fixture.single); assertion.equal(current.calls.publications, Fixture.single);
});
test('Read-only following rejects arbitrary local replacement without changing the remote host', async () => {
  const current = fixture(); current.state.following.status = SharedPlaybackStatus.Following; current.changed();
  await assertion.rejects(current.controller.prepareQueueChange([Fixture.recording], () => true, false), { code: IntegrationFailureCode.Unsupported });
  assertion.equal(current.calls.prepare.length, Fixture.initial); assertion.equal(current.calls.stopFollow, Fixture.initial);
});
test('A newer user intent retires a pending recording preparation before queue replacement', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed(); current.state.prepare = deferred();
  const first = current.controller.prepareQueueChange([Fixture.recording], () => true, false); const rejected = assertion.rejects(first, { code: IntegrationFailureCode.Superseded });
  await current.controller.control(HostedPlaybackCommandKind.Pause, current.local); current.state.prepare.resolve(); await rejected;
  assertion.equal(current.calls.local, Fixture.single); assertion.equal(current.controller.getSnapshot().pending, false);
});
test('Account or Jam replacement retires prepared mappings and cannot publish into a new scope', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed();
  const committed = await current.controller.prepareQueueChange([Fixture.recording], () => true, false);
  current.state.connection.scopeIdentifier = Fixture.replacement; current.changed(); await committed(); assertion.equal(current.calls.publications, Fixture.initial);
});
test('A changed native cursor predicate rejects prepared selection and releases pending UI', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed(); current.state.prepare = deferred();
  let wanted = true; const preparing = current.controller.prepareQueueChange([Fixture.recording], () => wanted, false);
  const rejected = assertion.rejects(preparing, { code: IntegrationFailureCode.Superseded }); wanted = false; current.state.prepare.resolve(); await rejected;
  assertion.equal(current.controller.getSnapshot().pending, false);
});
test('Empty or oversized recording mappings do not reach native preparation', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed();
  await assertion.rejects(current.controller.prepareQueueChange([undefined], () => true, false), { code: IntegrationFailureCode.Unsupported });
  await assertion.rejects(current.controller.prepareQueueChange(Array(Fixture.maximumQueue + Fixture.tooManyOffset).fill(Fixture.recording), () => true, false));
  assertion.equal(current.calls.prepare.length, Fixture.initial);
});
test('Normal local playback requires no matching, publication or Spotify account', async () => {
  const current = fixture(); current.state.connection = null; current.changed();
  const committed = await current.controller.prepareQueueChange([undefined], () => true, false); await current.local(); await committed();
  assertion.equal(current.calls.local, Fixture.single); assertion.equal(current.calls.prepare.length, Fixture.initial); assertion.equal(current.calls.publications, Fixture.initial);
});
test('Clearing an active local queue withdraws sharing after the actual receipt without publishing an empty queue', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed();
  const committed = await current.controller.prepareQueueChange([], () => true, true); assertion.equal(current.calls.stopHost, Fixture.initial); await current.local(); await committed();
  assertion.equal(current.calls.stopHost, Fixture.single); assertion.equal(current.calls.publications, Fixture.initial);
});
for (const kind of [HostedPlaybackCommandKind.Play, HostedPlaybackCommandKind.Pause, HostedPlaybackCommandKind.Next, HostedPlaybackCommandKind.Previous]) {
  test(`Player ${kind} follows the actual remote command path without mutating local playback`, async () => {
    const current = fixture(); current.state.following.status = SharedPlaybackStatus.Following; current.changed();
    await current.controller.control(kind, current.local); assertion.deepEqual(current.calls.remote, [kind]); assertion.equal(current.calls.local, Fixture.initial);
  });
}
test('Denied guest controls never mutate local audio or submit remote requests', async () => {
  const current = fixture(); current.state.following.status = SharedPlaybackStatus.Following; current.state.remoteAllowed = false; current.changed();
  await current.controller.control(HostedPlaybackCommandKind.Play, current.local);
  assertion.equal(current.calls.local, Fixture.initial); assertion.equal(current.calls.remote.length, Fixture.initial);
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Forbidden);
});
test('Remote seek uses bounded millisecond precision and invalid positions cannot dispatch', async () => {
  const current = fixture(); current.state.following.status = SharedPlaybackStatus.Following; current.changed();
  await current.controller.seek(Fixture.seconds, current.local); assertion.deepEqual(current.calls.seek, [Fixture.normalizedSeconds]);
  await current.controller.seek(Fixture.negativeSeconds, current.local); assertion.equal(current.calls.seek.length, Fixture.single);
});
test('Hosting controls publish after local application, and a later scope cannot receive old publication', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed(); current.state.mutation = deferred();
  const changing = current.controller.control(HostedPlaybackCommandKind.Pause, current.local); await flush();
  assertion.equal(current.calls.publications, Fixture.initial); current.state.connection.scopeIdentifier = Fixture.replacement; current.changed();
  current.state.mutation.resolve(); await changing; assertion.equal(current.calls.publications, Fixture.initial);
});
test('A prepared publication failure reports its safe code and never replays the player mutation', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed();
  const committed = await current.controller.prepareQueueChange([Fixture.recording], () => true, false);
  current.state.publishFailure = new IntegrationFailure(IntegrationFailureCode.UnknownOutcome); await current.local(); await assertion.rejects(committed());
  assertion.equal(current.calls.local, Fixture.single); assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.UnknownOutcome);
});
test('Shuffle and repeat remain disabled under shared authority and work locally', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed(); await current.controller.localOptions(current.local);
  assertion.equal(current.calls.local, Fixture.initial); current.state.hosting.status = SpotifyHostingStatus.Stopped; current.changed();
  await current.controller.localOptions(current.local); assertion.equal(current.calls.local, Fixture.single);
});
test('A late Stop following completion cannot withdraw a newer Jam host', async () => {
  const current = fixture(); current.state.mutation = deferred(); const stopping = current.controller.stop();
  current.state.connection.scopeIdentifier = Fixture.replacement; current.changed(); current.state.mutation.resolve(); await stopping;
  assertion.equal(current.calls.stopHost, Fixture.initial);
});
test('Disposal retires pending preparation without stopping retained native ownership', async () => {
  const current = fixture(); current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed(); current.state.prepare = deferred();
  const preparing = current.controller.prepareQueueChange([Fixture.recording], () => true, false); const rejected = assertion.rejects(preparing);
  current.controller.dispose(); current.state.prepare.resolve(); await rejected;
  assertion.equal(current.calls.stopHost, Fixture.initial);
});
test('Ordinary local playback errors return to the player without becoming a Jam failure', async () => {
  const current = fixture(); current.state.connection = null; current.changed();
  await assertion.rejects(current.controller.control(HostedPlaybackCommandKind.Play, async () => { throw new Error(Fixture.privateFailure); }));
  assertion.equal(current.controller.getSnapshot().failure, null);
});

test('Start sharing creates membership then waits for acknowledged hosting with remembered country', async () => {
  let current;
  const transitions = [];
  current = fixture({ getIdentity: () => Fixture.scope, getCanCreate: () => true,
    listeningCountry: { getSnapshot: () => Fixture.normalizedMarket, set: () => undefined },
    async createJam() { transitions.push(Fixture.scope); current.state.connection = { scopeIdentifier: Fixture.replacement, owned: true, native: true, admitted: true, hasHost: false }; current.changed(); } });
  current.state.connection = null; current.changed();
  await current.controller.startSharing();
  assertion.deepEqual(transitions, [Fixture.scope]); assertion.deepEqual(current.calls.host, [Fixture.normalizedMarket]);
  assertion.equal(current.controller.getSnapshot().mode, SpotifyPlayerJamMode.Hosting);
});
test('Join and listen does not report sharing after membership succeeds but following fails', async () => {
  let current;
  current = fixture({ getIdentity: () => Fixture.scope, getCanJoin: () => true,
    async joinJam() { current.state.connection.owned = false; current.changed(); },
    async startFollowing() { throw new IntegrationFailure(IntegrationFailureCode.Network); } });
  current.controller.setMarket(Fixture.market); await current.controller.joinAndListen(Fixture.scope);
  assertion.equal(current.controller.getSnapshot().mode, SpotifyPlayerJamMode.Failed);
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Network);
  assertion.equal(current.calls.follow.length, Fixture.initial);
});
test('Account replacement during creation cannot start hosting in the replacement account', async () => {
  const pending = deferred(); let identity = Fixture.scope;
  const current = fixture({ getIdentity: () => identity, getCanCreate: () => true, createJam: () => pending.promise });
  current.controller.setMarket(Fixture.market); current.state.connection = null; current.changed();
  const starting = current.controller.startSharing(); identity = Fixture.replacement; current.changed();
  pending.resolve(); await starting;
  assertion.equal(current.calls.host.length, Fixture.initial); assertion.equal(current.controller.getSnapshot().pending, false);
});
test('Duplicate start sharing is ignored while membership creation is pending', async () => {
  const pending = deferred(); const creations = [];
  const current = fixture({ getCanCreate: () => true, createJam: () => { creations.push(Fixture.scope); return pending.promise; } });
  current.controller.setMarket(Fixture.market); current.state.connection = null; current.changed();
  const starting = current.controller.startSharing(); await current.controller.startSharing();
  assertion.deepEqual(creations, [Fixture.scope]); pending.resolve(); await starting;
  assertion.equal(current.calls.host.length, Fixture.initial);
});
test('Failed membership creation cannot start hosting and preserves its known failure', async () => {
  const current = fixture({ getCanCreate: () => true, async createJam() { throw new IntegrationFailure(IntegrationFailureCode.Backpressure); } });
  current.controller.setMarket(Fixture.market); current.state.connection = null; current.changed(); await current.controller.startSharing();
  assertion.equal(current.calls.host.length, Fixture.initial);
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Backpressure);
});
test('Join and listen waits for actual admitted membership before following', async () => {
  let current;
  current = fixture({ getIdentity: () => Fixture.scope, getCanJoin: () => true,
    async joinJam() { current.state.connection = { scopeIdentifier: Fixture.replacement, owned: false, native: true, admitted: true, hasHost: true }; current.changed(); } });
  current.controller.setMarket(Fixture.market); current.state.connection = null; current.changed();
  await current.controller.joinAndListen(Fixture.scope);
  assertion.deepEqual(current.calls.follow, [Fixture.normalizedMarket]);
  assertion.equal(current.controller.getSnapshot().mode, SpotifyPlayerJamMode.Following);
});
test('Stop during membership creation prevents delayed playback startup', async () => {
  const pending = deferred(); let current;
  current = fixture({ getCanCreate: () => true, async createJam() { await pending.promise;
    current.state.connection = { scopeIdentifier: Fixture.replacement, owned: true, native: true, admitted: true, hasHost: true }; current.changed(); } });
  current.controller.setMarket(Fixture.market); current.state.connection = null; current.changed();
  const starting = current.controller.startSharing(); await current.controller.stop(); pending.resolve(); await starting;
  assertion.deepEqual(current.calls.host, []);
});
test('A complete invalid country is rejected without truncating into a different country', async () => {
  const current = fixture(); current.controller.setMarket(Fixture.normalizedMarket + Fixture.invalidMarket);
  await current.controller.startHosting(); assertion.deepEqual(current.calls.host, []);
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.InvalidInput);
});

test('Future queue matching and partial misses remain separate from current following failure', () => {
  const current = fixture(); current.state.following = { status: SharedPlaybackStatus.Following, failure: null,
    upcomingQueuePending: true, upcomingQueueFailure: IntegrationFailureCode.NotFound, unavailableUpcomingCount: Fixture.single };
  current.changed(); const snapshot = current.controller.getSnapshot();
  assertion.equal(snapshot.mode, SpotifyPlayerJamMode.Following); assertion.equal(snapshot.failure, null);
  assertion.equal(snapshot.pending, false); assertion.equal(snapshot.upcomingQueuePending, true);
  assertion.equal(snapshot.upcomingQueueFailure, IntegrationFailureCode.NotFound);
  assertion.equal(snapshot.unavailableUpcomingCount, Fixture.single);
  current.state.following.status = SharedPlaybackStatus.Detached; current.changed();
  assertion.equal(current.controller.getSnapshot().upcomingQueuePending, false);
  assertion.equal(current.controller.getSnapshot().upcomingQueueFailure, null);
  assertion.equal(current.controller.getSnapshot().unavailableUpcomingCount, Fixture.initial);
});

const { SpotifyHostingQueueIssue } = require('../.build/spotify/SpotifyHostingQueue');
for (const queueIssue of Object.values(SpotifyHostingQueueIssue)) {
  test(`Player preserves specific hosting queue issue ${queueIssue}`, () => {
    const current = fixture(); current.state.hosting = { status: SpotifyHostingStatus.Failed, failure: IntegrationFailureCode.Unsupported, queueIssue };
    current.changed(); assertion.equal(current.controller.getSnapshot().queueIssue, queueIssue);
  });
}

for (const clearQueue of [false, true]) {
  test(`A delayed ${clearQueue ? 'withdrawal' : 'publication'} rejection cannot report failure in a replacement Jam`, async () => {
    const pending = deferred();
    const operation = () => pending.promise;
    const current = fixture(clearQueue ? { stopHosting: operation } : { publishLocalChanges: operation });
    current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed();
    const committed = await current.controller.prepareQueueChange([Fixture.recording], () => true, clearQueue);
    const completion = committed();
    const rejected = assertion.rejects(completion, { code: IntegrationFailureCode.UnknownOutcome });
    current.state.connection.scopeIdentifier = Fixture.replacement; current.changed();
    pending.reject(new IntegrationFailure(IntegrationFailureCode.UnknownOutcome)); await rejected;
    assertion.equal(current.controller.getSnapshot().failure, null);
  });
}

test('A delayed publication rejection cannot overwrite a newer player action failure', async () => {
  const pending = deferred();
  const current = fixture({ publishLocalChanges: () => pending.promise });
  current.state.hosting.status = SpotifyHostingStatus.Hosting; current.changed();
  const committed = await current.controller.prepareQueueChange([Fixture.recording], () => true, false);
  const completion = committed(); const rejected = assertion.rejects(completion);
  await current.controller.control(HostedPlaybackCommandKind.Pause, async () => {
    throw new IntegrationFailure(IntegrationFailureCode.Forbidden);
  });
  pending.reject(new IntegrationFailure(IntegrationFailureCode.UnknownOutcome)); await rejected;
  assertion.equal(current.controller.getSnapshot().failure, IntegrationFailureCode.Forbidden);
});

const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { PlaybackMetadataRegistry } = require('../.build/audio-migration/PlaybackMetadataRegistry');
const { NativeQueueController } = require('../.build/audio-migration/NativeQueueController');
const { NativePlayerCommandDispatcher } = require('../.build/audio-migration/NativePlayerCommandDispatcher');
const { NativeQueueSourcePreparation } = require('../.build/audio-migration/NativeQueueSourcePreparation');
const { NativeQueueProjection } = require('../.build/audio-migration/NativeQueueProjection');
const { PlaybackTrackMapper } = require('../.build/audio-migration/PlaybackTrackMapper');
const { SharedNativePlayerObservation } = require('../.build/audio-migration/SharedNativePlayerObservation');
const { NativePlaybackViewStore } = require('../.build/audio-migration/NativePlaybackViewStore');
const { NativePlaybackReporting } = require('../.build/audio-migration/NativePlaybackReporting');
const { CommandResultStatus, QueuePageStatus, PlayerEventType, PlaybackState, PlaybackIntent,
  PlaybackInterruption, RepeatMode, MediaSourceKind, PlayerStateStore, QueueReferenceModel, DefaultQueuePolicy,
  QueueEntryValidator, PlayerErrorCode } = require('streaming-service-player');

const Fixture = Object.freeze({
  server: 'https://catalog.example.invalid/', recording: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  anotherRecording: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', album: 'album-identity', playlist: 'playlist-identity',
  title: 'Fixture song', artist: 'Fixture artist', changedTitle: 'Changed title', entry: 'fixture-entry',
  otherEntry: 'other-entry', source: 'opaque-source', identifierPrefix: 'identifier-',
  localAddress: 'file:///cache/fixture.mp3', address: 'https://media.example.invalid/audio',
  header: 'Authorization', headerValue: 'private-value', changedHeaderValue: 'mutated-value',
  engine: 'native-engine', authentication: 'native-account', otherAuthentication: 'other-account',
  failure: 'fixture failure', streamRoute: 'Stream?id=', firstIndex: 0, secondIndex: 1, emptyCount: 0,
  increment: 1, singleCount: 1, twoCount: 2, invalidIndex: -1, positionSeconds: 12.25,
  positionMilliseconds: 12250, initialTime: 0, durationMilliseconds: 180000, rate: 1, volume: 1,
  maximumMicrotasks: 80, replacementOperation: 'replace', appendOperation: 'append',
  selectOperation: 'select', removeOperation: 'remove', repeatOperation: 'repeat', shuffleOperation: 'shuffle',
  clearOperation: 'clear', playOperation: 'play', pauseOperation: 'pause', stopOperation: 'stop',
  nextOperation: 'next', previousOperation: 'previous', seekOperation: 'seek', emptyText: '',
});
const TestNames = Object.freeze({
  metadataCapture: 'staged metadata is copied and available before the queue command responds',
  duplicate: 'duplicate metadata occurrences reject without changing existing metadata',
  rollback: 'failed metadata stages remove unobserved occurrences',
  observed: 'an observed occurrence keeps its metadata after an uncertain receipt',
  pruning: 'native queue reconciliation prunes retired metadata and preserves active staging',
  metadataClear: 'clearing metadata invalidates outstanding stage completion',
  fallback: 'restored native entries expose public metadata without inventing catalog identifiers',
  metadataUpdate: 'native metadata updates retain catalog and cache associations',
  shared: 'reporting and state consumers share exactly one native event subscription',
  listenerFailure: 'one event consumer failure does not prevent another consumer receiving the event',
  duplicateListener: 'separate subscriptions of the same callback have separate lifetimes',
  subscribeRetry: 'a failed native subscription can be retried',
  replace: 'queue composition replaces and selects atomically with metadata ready before native events',
  selectedIndex: 'queue composition preserves the requested occurrence selection',
  invalidIndex: 'invalid candidate selection rejects before touching the native queue',
  capture: 'queue composition captures request fields before asynchronous snapshot reads',
  latest: 'a newer selection supersedes an earlier pending cache lookup',
  pause: 'pause completes while private source registration remains pending and cancels candidate playback',
  account: 'prepared private sources cannot be committed into another native authentication epoch',
  rejection: 'rejected native queue commands release staged sources and metadata',
  retry: 'queue conflicts return without replaying an edit against changed native state',
  append: 'queue append preserves the current native occurrence',
  wanted: 'an obsolete append predicate prevents source registration and queue mutation',
  repeat: 'repeat-one Next delegates to the native reducer and restarts the same occurrence',
  remove: 'removing the active occurrence uses the native next surviving occurrence',
  shuffle: 'shuffle uses native playback order and retains the active occurrence',
  controls: 'playback controls and seek use current native command contexts',
  clear: 'queue clear uses the native queue command',
  projection: 'view composition observes native order and preserves catalog metadata for cached sources',
  progress: 'progress events do not notify queue controls or reread the native queue',
  active: 'active native entry changes update controls and listening sessions',
  suspension: 'suspended views cannot restart listening or expose an old account queue',
  dispose: 'disposing view composition detaches the sole native subscription',
});
function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
async function settleUntil(predicate) {
  for (let count = Fixture.emptyCount; count < Fixture.maximumMicrotasks; count += Fixture.increment) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assertion.ok(predicate());
}
function publicView(entryIdentifier = Fixture.entry) {
  return { entryIdentifier, title: Fixture.title, artist: Fixture.artist,
    recordingIdentifier: Fixture.recording, albumIdentifier: Fixture.album, isLocalCached: true };
}
function track(recordingIdentifier = Fixture.recording) {
  return { recordingIdentifier, mediaAddress: Fixture.server + Fixture.streamRoute + recordingIdentifier,
    title: Fixture.title, artist: Fixture.artist, albumIdentifier: Fixture.album, playlistIdentifier: Fixture.playlist };
}
function environment() {
  const model = new QueueReferenceModel(DefaultQueuePolicy, new QueueEntryValidator(DefaultQueuePolicy), {
    shuffle(identifiers) { return [...identifiers].reverse(); },
  });
  let queueState = model.createEmptyState();
  let sequence = Fixture.emptyCount;
  let identifierSequence = Fixture.emptyCount;
  let authenticationEpoch = Fixture.authentication;
  let positionMilliseconds = Fixture.initialTime;
  let listener = null;
  let subscribeCount = Fixture.emptyCount;
  let unsubscribeCount = Fixture.emptyCount;
  let pageCount = Fixture.emptyCount;
  let cacheOperation = async () => null;
  let snapshotOperation = null;
  let registrationOperation = null;
  let commandOverride = null;
  let receiptObserver = null;
  const operations = [];
  const registrations = [];
  const releases = [];
  const failures = [];
  const metadata = new PlaybackMetadataRegistry();
  const cursor = () => ({ engineEpoch: Fixture.engine, authenticationEpoch,
    eventSequence: sequence, queueRevision: queueState.revision });
  const snapshot = () => ({ cursor: cursor(), currentEntry: queueState.canonicalEntries.find(entry => entry.entryIdentifier === queueState.activeEntryIdentifier) ?? null,
    queueLength: queueState.playbackOrder.length, repeatMode: queueState.repeatMode, shuffled: queueState.shuffled,
    playbackIntent: queueState.playbackIntent, state: queueState.playbackIntent === PlaybackIntent.Play ? PlaybackState.Playing : PlaybackState.Paused,
    positionMilliseconds, durationMilliseconds: Fixture.durationMilliseconds, bufferedAheadMilliseconds: Fixture.initialTime,
    sampledAtMonotonicMilliseconds: sequence, canSeek: true, canNext: true, canPrevious: true,
    interruption: PlaybackInterruption.None, error: null, playbackRate: Fixture.rate, volume: Fixture.volume });
  const emitState = () => { sequence += Fixture.increment; listener?.({ type: PlayerEventType.State, snapshot: snapshot() }); };
  async function queueCommand(operationName, context, transition) {
    operations.push({ name: operationName, context, views: queueState.canonicalEntries.map(entry => metadata.viewFor(entry)) });
    if (commandOverride !== null) {
      const override = commandOverride(operationName, context);
      if (override !== null) return override;
    }
    const result = transition();
    queueState = result.state;
    const receipt = { status: result.status, requestIdentifier: context.requestIdentifier, cursor: cursor() };
    receiptObserver?.(queueState.canonicalEntries);
    emitState();
    return receipt;
  }
  async function playbackCommand(operationName, context, transition) {
    operations.push({ name: operationName, context });
    transition();
    emitState();
    return { status: CommandResultStatus.Applied, requestIdentifier: context.requestIdentifier, cursor: cursor() };
  }
  const native = {
    async initialize() {},
    async getSnapshot() { if (snapshotOperation !== null) await snapshotOperation(); return snapshot(); },
    async clearSession() { authenticationEpoch = Fixture.otherAuthentication; queueState = model.createEmptyState(); emitState(); },
    subscribe(observer) { subscribeCount += Fixture.increment; listener = observer; return () => { listener = null; unsubscribeCount += Fixture.increment; }; },
    async getQueuePage(offset, limit, expectedRevision) {
      pageCount += Fixture.increment;
      if (expectedRevision !== queueState.revision) return { status: QueuePageStatus.Conflict, cursor: cursor() };
      const page = model.getPage(queueState, offset, limit);
      return { status: QueuePageStatus.Success, page: { ...page, cursor: cursor() } };
    },
    async registerMediaSource(context, source, ownership) {
      if (registrationOperation !== null) await registrationOperation();
      registrations.push({ context, source, ownership }); return Fixture.source + registrations.length;
    },
    async releaseMediaSource(identifier) { releases.push(identifier); },
    replaceQueueAndSelect(context, entries, identifier, playing) { return queueCommand(Fixture.replacementOperation, context,
      () => model.replace(queueState, context.expectedQueueRevision, entries, identifier, playing)); },
    append(context, entries) { return queueCommand(Fixture.appendOperation, context, () => model.append(queueState, context.expectedQueueRevision, entries)); },
    select(context, identifier, playing) { return queueCommand(Fixture.selectOperation, context, () => model.select(queueState, context.expectedQueueRevision, identifier, playing)); },
    remove(context, identifiers) { return queueCommand(Fixture.removeOperation, context, () => model.remove(queueState, context.expectedQueueRevision, identifiers)); },
    setRepeat(context, repeatMode) { return queueCommand(Fixture.repeatOperation, context, () => model.setRepeat(queueState, context.expectedQueueRevision, repeatMode)); },
    setShuffle(context, enabled) { return queueCommand(Fixture.shuffleOperation, context, () => model.setShuffle(queueState, context.expectedQueueRevision, enabled)); },
    clear(context) { return queueCommand(Fixture.clearOperation, context, () => model.clear(queueState, context.expectedQueueRevision)); },
    play(context) { return playbackCommand(Fixture.playOperation, context, () => { queueState = { ...queueState, playbackIntent: PlaybackIntent.Play }; }); },
    pause(context) { return playbackCommand(Fixture.pauseOperation, context, () => { queueState = { ...queueState, playbackIntent: PlaybackIntent.Pause }; }); },
    stop(context) { return playbackCommand(Fixture.stopOperation, context, () => { queueState = { ...queueState, playbackIntent: PlaybackIntent.Stop }; }); },
    next(context) { return playbackCommand(Fixture.nextOperation, context, () => { queueState = model.advance(queueState); }); },
    previous(context) { return playbackCommand(Fixture.previousOperation, context, () => { queueState = model.previous(queueState, positionMilliseconds); }); },
    seek(context, identifier, position) { return playbackCommand(Fixture.seekOperation, context, () => {
      assertion.equal(identifier, queueState.activeEntryIdentifier); positionMilliseconds = position;
    }); },
  };
  const identifiers = { nextIdentifier() { identifierSequence += Fixture.increment; return Fixture.identifierPrefix + identifierSequence; } };
  const dispatcher = new NativePlayerCommandDispatcher(native, identifiers);
  const mapper = new PlaybackTrackMapper(Fixture.server, { findReadableCachedAddress(address) { return cacheOperation(address); } });
  const preparation = new NativeQueueSourcePreparation(native, failure => failures.push(failure));
  const controller = new NativeQueueController(native, dispatcher, mapper, preparation, metadata, identifiers);
  const observation = new SharedNativePlayerObservation(native, () => dispatcher.getSnapshot(), failure => failures.push(failure));
  const state = new PlayerStateStore(observation);
  const sessions = [];
  const reporting = new NativePlaybackReporting({ create(current) {
    const session = { view: metadata.viewFor(current.currentEntry), startCount: Fixture.emptyCount, stopCount: Fixture.emptyCount,
      start() { this.startCount += Fixture.increment; }, async pause() {}, async resume() {}, async seek() {},
      async stop() { this.stopCount += Fixture.increment; } };
    sessions.push(session); return session;
  } }, failure => failures.push(failure));
  const views = new NativePlaybackViewStore(state, observation, new NativeQueueProjection(native, metadata), metadata, reporting,
    failure => failures.push(failure));
  return { native, metadata, dispatcher, controller, observation, state, views, sessions, operations, registrations, releases, failures, snapshot,
    setCacheOperation(operation) { cacheOperation = operation; }, setSnapshotOperation(operation) { snapshotOperation = operation; },
    setRegistrationOperation(operation) { registrationOperation = operation; }, setCommandOverride(operation) { commandOverride = operation; },
    setReceiptObserver(observer) { receiptObserver = observer; }, setAccount() { authenticationEpoch = Fixture.otherAuthentication; },
    get subscribeCount() { return subscribeCount; }, get unsubscribeCount() { return unsubscribeCount; }, get pageCount() { return pageCount; },
    emitState, emit(event) { listener?.(event); },
    emitProgress() { sequence += Fixture.increment; positionMilliseconds += Fixture.increment; listener?.({ type: PlayerEventType.Progress,
      cursor: cursor(), entryIdentifier: queueState.activeEntryIdentifier, positionMilliseconds,
      durationMilliseconds: Fixture.durationMilliseconds, bufferedAheadMilliseconds: Fixture.initialTime, sampledAtMonotonicMilliseconds: sequence }); },
  };
}

test(TestNames.metadataCapture, () => {
  const metadata = new PlaybackMetadataRegistry(); const view = publicView(); metadata.stage([view]); view.title = Fixture.changedTitle;
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.entry }).title, Fixture.title);
});
test(TestNames.duplicate, () => {
  const metadata = new PlaybackMetadataRegistry(); metadata.stage([publicView()]);
  assertion.throws(() => metadata.stage([publicView()]));
  assertion.throws(() => new PlaybackMetadataRegistry().stage([publicView(), publicView()]));
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.entry }).recordingIdentifier, Fixture.recording);
});
test(TestNames.rollback, () => {
  const metadata = new PlaybackMetadataRegistry(); metadata.stage([publicView()]).settle(false);
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.entry }).recordingIdentifier, undefined);
});
test(TestNames.observed, () => {
  const metadata = new PlaybackMetadataRegistry(); const stage = metadata.stage([publicView()]);
  metadata.observeCurrentEntry({ entryIdentifier: Fixture.entry }); stage.settle(false);
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.entry }).albumIdentifier, Fixture.album);
});
test(TestNames.pruning, () => {
  const metadata = new PlaybackMetadataRegistry(); metadata.stage([publicView()]).settle(true);
  metadata.stage([publicView(Fixture.otherEntry)]); metadata.observe([], null);
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.entry }).recordingIdentifier, undefined);
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.otherEntry }).recordingIdentifier, Fixture.recording);
});
test(TestNames.metadataClear, () => {
  const metadata = new PlaybackMetadataRegistry(); const firstStage = metadata.stage([publicView()]); metadata.clear();
  metadata.stage([publicView()]); firstStage.settle(false);
  assertion.equal(metadata.viewFor({ entryIdentifier: Fixture.entry }).recordingIdentifier, Fixture.recording);
});
test(TestNames.fallback, () => {
  const view = new PlaybackMetadataRegistry().viewFor({ entryIdentifier: Fixture.entry, sourceIdentifier: Fixture.source, title: Fixture.title });
  assertion.equal(view.title, Fixture.title); assertion.equal(view.recordingIdentifier, undefined); assertion.equal(view.sourceIdentifier, undefined);
});
test(TestNames.metadataUpdate, () => {
  const metadata = new PlaybackMetadataRegistry(); metadata.stage([publicView()]);
  const view = metadata.viewFor({ entryIdentifier: Fixture.entry, title: Fixture.changedTitle });
  assertion.equal(view.title, Fixture.changedTitle); assertion.equal(view.recordingIdentifier, Fixture.recording); assertion.equal(view.isLocalCached, true);
});
test(TestNames.shared, () => {
  const scenario = environment(); const first = scenario.observation.subscribe(() => {}); const second = scenario.observation.subscribe(() => {});
  assertion.equal(scenario.subscribeCount, Fixture.singleCount); first(); first(); assertion.equal(scenario.unsubscribeCount, Fixture.emptyCount);
  second(); assertion.equal(scenario.unsubscribeCount, Fixture.singleCount);
});
test(TestNames.listenerFailure, () => {
  const scenario = environment(); let received = false;
  const first = scenario.observation.subscribe(() => { throw new Error(Fixture.failure); });
  const second = scenario.observation.subscribe(() => { received = true; }); scenario.emitState();
  assertion.equal(received, true); assertion.equal(scenario.failures.length, Fixture.singleCount); first(); second();
});
test(TestNames.duplicateListener, () => {
  const scenario = environment(); let received = Fixture.emptyCount; const listener = () => { received += Fixture.increment; };
  const first = scenario.observation.subscribe(listener); const second = scenario.observation.subscribe(listener); first(); scenario.emitState();
  assertion.equal(received, Fixture.singleCount); second();
});
test(TestNames.subscribeRetry, () => {
  let failed = true; const observation = new SharedNativePlayerObservation({ subscribe() { if (failed) throw new Error(Fixture.failure); return () => {}; } },
    async () => environment().snapshot(), () => {});
  assertion.throws(() => observation.subscribe(() => {})); failed = false; observation.subscribe(() => {})();
});
test(TestNames.replace, async () => {
  const scenario = environment(); scenario.setReceiptObserver(entries => {
    assertion.equal(scenario.metadata.viewFor(entries[Fixture.firstIndex]).albumIdentifier, Fixture.album);
  });
  await scenario.controller.playTracks([track()], Fixture.firstIndex);
  assertion.deepEqual(scenario.operations.map(operation => operation.name), [Fixture.replacementOperation]);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Play);
});
test(TestNames.selectedIndex, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.secondIndex);
  assertion.equal(scenario.snapshot().currentEntry.recordingIdentifier, Fixture.anotherRecording);
});
test(TestNames.invalidIndex, async () => {
  const scenario = environment(); await assertion.rejects(scenario.controller.playTracks([track()], Fixture.invalidIndex));
  await assertion.rejects(scenario.controller.playTracks([], Fixture.firstIndex)); assertion.deepEqual(scenario.operations, []);
});
test(TestNames.capture, async () => {
  const scenario = environment(); const pendingSnapshot = deferred(); scenario.setSnapshotOperation(() => pendingSnapshot.promise);
  const request = { headers: [{ name: Fixture.header, value: Fixture.headerValue }] };
  const candidate = { ...track(), mediaAddress: Fixture.address, mediaRequest: request };
  const execution = scenario.controller.playTracks([candidate], Fixture.firstIndex);
  candidate.title = Fixture.changedTitle; request.headers[Fixture.firstIndex].value = Fixture.changedHeaderValue;
  pendingSnapshot.resolve(); await execution;
  assertion.equal(scenario.registrations[Fixture.firstIndex].source.request.headers[Fixture.firstIndex].value, Fixture.headerValue);
  assertion.equal(scenario.snapshot().currentEntry.title, Fixture.title);
});
test(TestNames.latest, async () => {
  const scenario = environment(); const pendingCache = deferred(); const started = deferred(); let first = true;
  scenario.setCacheOperation(() => { if (first) { first = false; started.resolve(); return pendingCache.promise; } return Promise.resolve(null); });
  const earlier = scenario.controller.playTracks([track()], Fixture.firstIndex); const rejected = assertion.rejects(earlier); await started.promise;
  await scenario.controller.playTracks([track(Fixture.anotherRecording)], Fixture.firstIndex); pendingCache.resolve(null); await rejected;
  assertion.equal(scenario.snapshot().currentEntry.recordingIdentifier, Fixture.anotherRecording);
});
test(TestNames.pause, async () => {
  const scenario = environment(); const pendingRegistration = deferred(); const started = deferred();
  scenario.setRegistrationOperation(() => { started.resolve(); return pendingRegistration.promise; });
  const execution = scenario.controller.playTracks([{ ...track(), mediaSource: { kind: MediaSourceKind.Local, address: Fixture.localAddress } }], Fixture.firstIndex);
  const rejected = assertion.rejects(execution); await started.promise; await scenario.controller.pause();
  assertion.deepEqual(scenario.operations.map(operation => operation.name), [Fixture.pauseOperation]);
  pendingRegistration.resolve(); await rejected;
  await settleUntil(() => scenario.releases.length === Fixture.singleCount);
});
test(TestNames.account, async () => {
  const scenario = environment(); const pendingRegistration = deferred(); const started = deferred();
  scenario.setRegistrationOperation(() => { started.resolve(); return pendingRegistration.promise; });
  const execution = scenario.controller.playTracks([{ ...track(), mediaAddress: Fixture.address }], Fixture.firstIndex);
  const rejected = assertion.rejects(execution); await started.promise; scenario.setAccount(); pendingRegistration.resolve(); await rejected;
  assertion.deepEqual(scenario.operations, []); assertion.equal(scenario.releases.length, Fixture.singleCount);
});
test(TestNames.rejection, async () => {
  const scenario = environment(); scenario.setCommandOverride(() => ({ status: CommandResultStatus.Rejected,
    error: { code: PlayerErrorCode.InvalidCommand, message: Fixture.failure, retryable: false } }));
  let stagedIdentifier = null;
  const stageMetadata = scenario.metadata.stage.bind(scenario.metadata);
  scenario.metadata.stage = views => {
    stagedIdentifier = views[Fixture.firstIndex].entryIdentifier;
    return stageMetadata(views);
  };
  await assertion.rejects(scenario.controller.playTracks([{ ...track(), mediaAddress: Fixture.address }], Fixture.firstIndex));
  assertion.equal(scenario.releases.length, Fixture.singleCount);
  assertion.notEqual(stagedIdentifier, null);
  assertion.equal(scenario.metadata.viewFor({ entryIdentifier: stagedIdentifier }).recordingIdentifier, undefined);
});
test(TestNames.retry, async () => {
  const scenario = environment(); let first = true; scenario.setCommandOverride(() => {
    if (!first) return null; first = false; return { status: CommandResultStatus.Conflict, cursor: scenario.snapshot().cursor };
  });
  await assertion.rejects(scenario.controller.playTracks([{ ...track(), mediaAddress: Fixture.address }], Fixture.firstIndex));
  await settleUntil(() => scenario.releases.length === Fixture.singleCount);
  assertion.equal(scenario.registrations.length, Fixture.singleCount); assertion.equal(scenario.operations.length, Fixture.singleCount);
  assertion.equal(scenario.snapshot().queueLength, Fixture.emptyCount);
});
test(TestNames.append, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  const entry = scenario.snapshot().currentEntry.entryIdentifier; await scenario.controller.append([track(Fixture.anotherRecording)]);
  assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, entry); assertion.equal(scenario.snapshot().queueLength, Fixture.twoCount);
});
test(TestNames.wanted, async () => {
  const scenario = environment(); await assertion.rejects(scenario.controller.append([track()], () => false));
  assertion.deepEqual(scenario.operations, []); assertion.deepEqual(scenario.registrations, []);
});
test(TestNames.repeat, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  await scenario.controller.setRepeat(RepeatMode.One); const previous = scenario.snapshot(); await scenario.controller.next();
  assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, previous.currentEntry.entryIdentifier);
  assertion.ok(scenario.snapshot().cursor.queueRevision > previous.cursor.queueRevision);
});
test(TestNames.remove, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.firstIndex);
  await scenario.controller.remove(scenario.snapshot().currentEntry.entryIdentifier);
  assertion.equal(scenario.snapshot().currentEntry.recordingIdentifier, Fixture.anotherRecording);
});
test(TestNames.shuffle, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.firstIndex);
  const entry = scenario.snapshot().currentEntry.entryIdentifier; await scenario.controller.setShuffle(true);
  assertion.equal(scenario.snapshot().shuffled, true); assertion.equal(scenario.snapshot().currentEntry.entryIdentifier, entry);
});
test(TestNames.controls, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.firstIndex);
  await scenario.controller.pause(); await scenario.controller.play(); await scenario.controller.next(); await scenario.controller.previous();
  await scenario.controller.seek(scenario.snapshot().currentEntry.entryIdentifier, Fixture.positionSeconds); await scenario.controller.stop();
  assertion.equal(scenario.snapshot().positionMilliseconds, Fixture.positionMilliseconds);
  assertion.equal(scenario.snapshot().playbackIntent, PlaybackIntent.Stop);
  for (const operation of scenario.operations) assertion.equal(operation.context.authenticationEpoch, Fixture.authentication);
});
test(TestNames.clear, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track()], Fixture.firstIndex); await scenario.controller.clearQueue();
  assertion.equal(scenario.snapshot().queueLength, Fixture.emptyCount);
});
test(TestNames.projection, async () => {
  const scenario = environment(); scenario.setCacheOperation(async () => Fixture.localAddress); scenario.views.connect();
  await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.secondIndex);
  await settleUntil(() => !scenario.views.getSnapshot().isQueueLoading && scenario.views.getSnapshot().queue.length === Fixture.twoCount);
  const view = scenario.views.getSnapshot(); assertion.equal(view.currentIndex, Fixture.secondIndex);
  assertion.equal(view.currentTrack.recordingIdentifier, Fixture.anotherRecording); assertion.equal(view.currentTrack.isLocalCached, true);
  assertion.equal(scenario.sessions[Fixture.firstIndex].view.albumIdentifier, Fixture.album); scenario.views.dispose();
});
test(TestNames.progress, async () => {
  const scenario = environment(); scenario.views.connect(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  await settleUntil(() => !scenario.views.getSnapshot().isQueueLoading && scenario.views.getSnapshot().queue.length === Fixture.singleCount);
  const before = scenario.views.getSnapshot(); const pageCount = scenario.pageCount; let notifications = Fixture.emptyCount;
  const unsubscribe = scenario.views.subscribe(() => { notifications += Fixture.increment; }); scenario.emitProgress();
  assertion.equal(scenario.views.getSnapshot(), before); assertion.equal(notifications, Fixture.emptyCount); assertion.equal(scenario.pageCount, pageCount);
  unsubscribe(); scenario.views.dispose();
});
test(TestNames.active, async () => {
  const scenario = environment(); scenario.views.connect(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.firstIndex);
  await settleUntil(() => scenario.sessions.length === Fixture.singleCount); await scenario.controller.next();
  assertion.equal(scenario.views.getSnapshot().currentTrack.recordingIdentifier, Fixture.anotherRecording);
  assertion.equal(scenario.sessions.length, Fixture.twoCount); assertion.equal(scenario.sessions[Fixture.firstIndex].stopCount, Fixture.singleCount);
  scenario.views.dispose();
});
test(TestNames.suspension, async () => {
  const scenario = environment(); scenario.views.connect(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  await settleUntil(() => scenario.sessions.length === Fixture.singleCount); scenario.views.suspend(); scenario.emitState();
  assertion.equal(scenario.views.getSnapshot().queueLength, Fixture.emptyCount); assertion.equal(scenario.sessions.length, Fixture.singleCount);
  scenario.views.dispose();
});
test(TestNames.dispose, async () => {
  const scenario = environment(); scenario.views.connect(); await settleUntil(() => scenario.state.getSnapshot() !== null);
  assertion.equal(scenario.subscribeCount, Fixture.singleCount); scenario.views.dispose(); scenario.views.dispose();
  assertion.equal(scenario.unsubscribeCount, Fixture.singleCount);
});
const AdditionalTestNames = Object.freeze({
  select: 'selecting a projected occurrence uses its native identifier',
  play: 'Play sends the native play command',
  pause: 'Pause sends the native pause command',
  stop: 'Stop sends the native stop command',
  next: 'Next sends the native next command',
  previous: 'Previous sends the native previous command',
  seek: 'Seek converts seconds to milliseconds for the captured occurrence',
  repeat: 'repeat configuration sends the requested native repeat mode',
  shuffleRestore: 'disabling shuffle restores the native canonical order',
  clearPending: 'clearing views discards an already pending queue page read',
  epoch: 'a new authentication epoch removes cached queue metadata and ends the old listening session',
});
for (const [name, method, operationName] of [
  [AdditionalTestNames.play, Fixture.playOperation, Fixture.playOperation],
  [AdditionalTestNames.pause, Fixture.pauseOperation, Fixture.pauseOperation],
  [AdditionalTestNames.stop, Fixture.stopOperation, Fixture.stopOperation],
  [AdditionalTestNames.next, Fixture.nextOperation, Fixture.nextOperation],
  [AdditionalTestNames.previous, Fixture.previousOperation, Fixture.previousOperation],
]) {
  test(name, async () => {
    const scenario = environment(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
    await scenario.controller[method](); assertion.equal(scenario.operations[Fixture.secondIndex].name, operationName);
  });
}
test(AdditionalTestNames.select, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.firstIndex);
  const page = await scenario.native.getQueuePage(Fixture.firstIndex, Fixture.twoCount, scenario.snapshot().cursor.queueRevision);
  await scenario.controller.select(page.page.entries[Fixture.secondIndex].entryIdentifier);
  assertion.equal(scenario.snapshot().currentEntry.recordingIdentifier, Fixture.anotherRecording);
});
test(AdditionalTestNames.seek, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  await scenario.controller.seek(scenario.snapshot().currentEntry.entryIdentifier, Fixture.positionSeconds);
  assertion.equal(scenario.snapshot().positionMilliseconds, Fixture.positionMilliseconds);
});
test(AdditionalTestNames.repeat, async () => {
  const scenario = environment(); await scenario.controller.setRepeat(RepeatMode.All);
  assertion.equal(scenario.snapshot().repeatMode, RepeatMode.All);
});
test(AdditionalTestNames.shuffleRestore, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.anotherRecording)], Fixture.firstIndex);
  await scenario.controller.setShuffle(true); await scenario.controller.setShuffle(false);
  const page = await scenario.native.getQueuePage(Fixture.firstIndex, Fixture.twoCount, scenario.snapshot().cursor.queueRevision);
  assertion.equal(page.page.entries[Fixture.firstIndex].recordingIdentifier, Fixture.recording);
  assertion.equal(scenario.snapshot().shuffled, false);
});
test(AdditionalTestNames.clearPending, async () => {
  const scenario = environment(); const pendingPage = deferred(); let pageStarted = false;
  const originalRead = scenario.native.getQueuePage;
  scenario.native.getQueuePage = async (...arguments_) => { pageStarted = true; await pendingPage.promise; return originalRead(...arguments_); };
  scenario.views.connect(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  await settleUntil(() => pageStarted); scenario.views.suspend(); pendingPage.resolve();
  await settleUntil(() => scenario.pageCount > Fixture.emptyCount);
  assertion.equal(scenario.views.getSnapshot().queue.length, Fixture.emptyCount); scenario.views.dispose();
});
test(AdditionalTestNames.epoch, async () => {
  const scenario = environment(); scenario.views.connect(); await scenario.controller.playTracks([track()], Fixture.firstIndex);
  await settleUntil(() => !scenario.views.getSnapshot().isQueueLoading && scenario.sessions.length === Fixture.singleCount);
  await scenario.native.clearSession(); await scenario.views.refresh();
  await settleUntil(() => !scenario.views.getSnapshot().isQueueLoading);
  assertion.equal(scenario.views.getSnapshot().queue.length, Fixture.emptyCount);
  assertion.equal(scenario.sessions[Fixture.firstIndex].stopCount, Fixture.singleCount); scenario.views.dispose();
});
const MetadataCapacityTestNames = Object.freeze({
  boundary: 'metadata admits one current and one staged maximum logical queue',
  excess: 'metadata rejects excess staged occurrences without discarding existing associations',
});
const MetadataCapacityFixture = Object.freeze({ prefix: 'metadata-occurrence-' });
const { MetadataRetentionPolicy } = require('../.build/audio-migration/PlaybackMetadataRegistry');
function maximumMetadataViews() {
  return Array.from({ length: DefaultQueuePolicy.maximumEntries * MetadataRetentionPolicy.concurrentQueueGenerations },
    (unusedValue, occurrenceIndex) => publicView(MetadataCapacityFixture.prefix + occurrenceIndex));
}
test(MetadataCapacityTestNames.boundary, () => {
  const metadata = new PlaybackMetadataRegistry(); const views = maximumMetadataViews(); metadata.stage(views);
  assertion.equal(metadata.viewFor({ entryIdentifier: views[Fixture.firstIndex].entryIdentifier }).recordingIdentifier, Fixture.recording);
});
test(MetadataCapacityTestNames.excess, () => {
  const metadata = new PlaybackMetadataRegistry(); const views = maximumMetadataViews(); metadata.stage(views);
  assertion.throws(() => metadata.stage([publicView()]), { message: MetadataRetentionPolicy.capacityMessage });
  assertion.equal(metadata.viewFor({ entryIdentifier: views[Fixture.firstIndex].entryIdentifier }).recordingIdentifier, Fixture.recording);
});

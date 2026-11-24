const { NativeQueueController } = require('../../.build/audio-migration/NativeQueueController');
const { NativePlayerCommandDispatcher } = require('../../.build/audio-migration/NativePlayerCommandDispatcher');
const { NativeQueueSourcePreparation } = require('../../.build/audio-migration/NativeQueueSourcePreparation');
const { PlaybackMetadataRegistry } = require('../../.build/audio-migration/PlaybackMetadataRegistry');
const { PlaybackTrackMapper } = require('../../.build/audio-migration/PlaybackTrackMapper');
const { CommandResultStatus, QueueReferenceModel, QueueEntryValidator, DefaultQueuePolicy,
  PlaybackIntent, PlayerErrorCode } = require('streaming-service-player');

const Fixture = Object.freeze({
  server: 'https://queue.example.invalid/', streamRoute: 'Stream?id=',
  firstRecording: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', secondRecording: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  thirdRecording: 'cccccccc-cccc-cccc-cccc-cccccccccccc', fourthRecording: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  title: 'Queue fixture', artist: 'Queue artist', identifierPrefix: 'queue-occurrence-', sourcePrefix: 'queue-source-',
  localAddress: 'file:///queue/cache/fixture.mp3', engine: 'queue-engine', account: 'queue-account', otherAccount: 'other-account',
  invalidEntry: 'missing-occurrence', privateMessage: 'private-native-details', failure: 'queue fixture failure',
  initialCount: 0, increment: 1, firstIndex: 0, secondIndex: 1, thirdIndex: 2, lastOffset: 1,
  singleCount: 1, twoCount: 2, threeCount: 3, fourCount: 4, maximumMicrotasks: 300,
  zeroPositionMilliseconds: 0, seekPositionSeconds: 12.25, seekPositionMilliseconds: 12250,
  emptyIdentifier: '', whitespaceIdentifier: ' ', invalidPositionSeconds: -1,
});
const Operation = Object.freeze({
  replace: 'replace', append: 'append', remove: 'remove', move: 'move', clear: 'clear', select: 'select',
  shuffle: 'shuffle', repeat: 'repeat', play: 'play', pause: 'pause', stop: 'stop', next: 'next', previous: 'previous', seek: 'seek',
});
function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
async function settleUntil(predicate) {
  for (let count = Fixture.initialCount; count < Fixture.maximumMicrotasks; count += Fixture.increment) {
    if (predicate()) return;
    await Promise.resolve();
  }
  if (!predicate()) throw new Error(Fixture.failure);
}
function track(recordingIdentifier = Fixture.firstRecording) {
  return { recordingIdentifier, mediaAddress: Fixture.server + Fixture.streamRoute + recordingIdentifier,
    title: Fixture.title, artist: Fixture.artist };
}
function environment() {
  const model = new QueueReferenceModel(DefaultQueuePolicy, new QueueEntryValidator(DefaultQueuePolicy), {
    shuffle(identifiers) { return [...identifiers].reverse(); },
  });
  let state = model.createEmptyState();
  let identifierSequence = Fixture.initialCount;
  let authenticationEpoch = Fixture.account;
  let cacheOperation = async () => null;
  let registrationOperation = null;
  let beforeQueueCommand = null;
  let receiptOperation = null;
  let positionMilliseconds = Fixture.zeroPositionMilliseconds;
  const operations = [];
  const sourceRegistrations = [];
  const sourceReleases = [];
  const failures = [];
  const metadata = new PlaybackMetadataRegistry();
  const cursor = () => ({ engineEpoch: Fixture.engine, authenticationEpoch,
    queueRevision: state.revision, eventSequence: state.revision });
  function receipt(context, status = CommandResultStatus.Applied) {
    return { status, requestIdentifier: context.requestIdentifier, cursor: cursor() };
  }
  async function queueCommand(name, context, fields, transition) {
    operations.push({ name, context: { ...context }, ...fields });
    if (beforeQueueCommand !== null) {
      const override = await beforeQueueCommand(name, context);
      if (override !== null) return override;
    }
    if (context.engineEpoch !== Fixture.engine || context.authenticationEpoch !== authenticationEpoch) {
      return receipt(context, CommandResultStatus.Superseded);
    }
    if (context.expectedQueueRevision !== state.revision) return receipt(context, CommandResultStatus.Conflict);
    try { state = transition().state; }
    catch {
      return { status: CommandResultStatus.Rejected, requestIdentifier: context.requestIdentifier,
        error: { code: PlayerErrorCode.InvalidCommand, message: Fixture.privateMessage, retryable: false } };
    }
    const result = receipt(context);
    if (receiptOperation !== null) await receiptOperation(name, result);
    return result;
  }
  async function playbackCommand(name, context, transition) {
    operations.push({ name, context: { ...context } }); transition(); return receipt(context);
  }
  const native = {
    async initialize() {},
    async getSnapshot() { return { cursor: cursor(), playbackIntent: state.playbackIntent, currentEntry: state.canonicalEntries.find(entry => entry.entryIdentifier === state.activeEntryIdentifier) ?? null }; },
    async clearSession() { authenticationEpoch = Fixture.otherAccount; state = model.createEmptyState(); },
    async registerMediaSource(context, source, ownership) {
      const registration = { context, source, ownership, identifier: Fixture.sourcePrefix + sourceRegistrations.length };
      sourceRegistrations.push(registration);
      if (registrationOperation !== null) await registrationOperation(registration);
      return registration.identifier;
    },
    async releaseMediaSource(identifier) { sourceReleases.push(identifier); },
    replaceQueueAndSelect(context, entries, identifier, playWhenReady) {
      return queueCommand(Operation.replace, context, { entries }, () => model.replace(state, state.revision, entries, identifier, playWhenReady));
    },
    append(context, entries) { return queueCommand(Operation.append, context, { entries }, () => model.append(state, state.revision, entries)); },
    remove(context, identifiers) { return queueCommand(Operation.remove, context, { identifiers: [...identifiers] }, () => model.remove(state, state.revision, identifiers)); },
    move(context, identifier, beforeIdentifier) { return queueCommand(Operation.move, context, { identifier, beforeIdentifier }, () => model.move(state, state.revision, identifier, beforeIdentifier)); },
    clear(context) { return queueCommand(Operation.clear, context, {}, () => model.clear(state, state.revision)); },
    select(context, identifier, playing) { return queueCommand(Operation.select, context, { identifier }, () => model.select(state, state.revision, identifier, playing)); },
    setShuffle(context, enabled) { return queueCommand(Operation.shuffle, context, { enabled }, () => model.setShuffle(state, state.revision, enabled)); },
    setRepeat(context, repeatMode) { return queueCommand(Operation.repeat, context, { repeatMode }, () => model.setRepeat(state, state.revision, repeatMode)); },
    play(context) { return playbackCommand(Operation.play, context, () => { state = { ...state, playbackIntent: PlaybackIntent.Play }; }); },
    pause(context) { return playbackCommand(Operation.pause, context, () => { state = { ...state, playbackIntent: PlaybackIntent.Pause }; }); },
    stop(context) { return playbackCommand(Operation.stop, context, () => { state = { ...state, playbackIntent: PlaybackIntent.Stop }; }); },
    next(context) { return playbackCommand(Operation.next, context, () => { state = model.advance(state); positionMilliseconds = Fixture.zeroPositionMilliseconds; }); },
    previous(context) { return playbackCommand(Operation.previous, context, () => { state = model.previous(state, positionMilliseconds); }); },
    seek(context, identifier, position) { return playbackCommand(Operation.seek, context, () => {
      if (identifier === state.activeEntryIdentifier) positionMilliseconds = position;
    }); },
  };
  const identifiers = { nextIdentifier() { identifierSequence += Fixture.increment; return Fixture.identifierPrefix + identifierSequence; } };
  const dispatcher = new NativePlayerCommandDispatcher(native, identifiers);
  const mapper = new PlaybackTrackMapper(Fixture.server, { findReadableCachedAddress(address) { return cacheOperation(address); } });
  const preparation = new NativeQueueSourcePreparation(native, failure => failures.push(failure));
  const controller = new NativeQueueController(native, dispatcher, mapper, preparation, metadata, identifiers);
  return { controller, dispatcher, native, metadata, operations, sourceRegistrations, sourceReleases, failures,
    get state() { return state; }, get positionMilliseconds() { return positionMilliseconds; },
    entries() { const entries = new Map(state.canonicalEntries.map(entry => [entry.entryIdentifier, entry]));
      return state.playbackOrder.map(identifier => entries.get(identifier)); },
    recordings() { return this.entries().map(entry => metadata.viewFor(entry).recordingIdentifier); },
    currentEntry() { return state.canonicalEntries.find(entry => entry.entryIdentifier === state.activeEntryIdentifier); },
    setCacheOperation(operation) { cacheOperation = operation; },
    setRegistrationOperation(operation) { registrationOperation = operation; },
    setBeforeQueueCommand(operation) { beforeQueueCommand = operation; },
    setReceiptOperation(operation) { receiptOperation = operation; },
    changeNativeRevision() { state = model.setRepeat(state, state.revision, state.repeatMode).state;
      state = { ...state, revision: state.revision + Fixture.increment }; },
    changeAccount() { authenticationEpoch = Fixture.otherAccount; },
  };
}
module.exports = { Fixture, Operation, deferred, settleUntil, track, environment };

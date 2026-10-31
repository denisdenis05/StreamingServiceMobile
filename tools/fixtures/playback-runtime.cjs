const { PlaybackRuntime } = require('../../.build/audio-migration/PlaybackRuntime');
const { QueueReferenceModel, QueueEntryValidator, DefaultQueuePolicy, CommandResultStatus, QueuePageStatus,
  PlayerEventType, PlaybackIntent, PlaybackState, PlaybackInterruption, EntryChangeReason } = require('streaming-service-player');
const { Fixture, track, deferred, settleUntil } = require('./queue-rewrite.cjs');
const RuntimeFixture = Object.freeze({ token: 'fixture-access-token', nextToken: 'rotated-access-token', queuePrefix: 'runtime-queue-',
  initial: 0, increment: 1, durationMilliseconds: 180000, normalRate: 1, normalVolume: 1, changedQueue: 'foreign-queue',
  stateName: 'state', replaceName: 'replace', appendName: 'append', appendSelectName: 'appendAndSelect', selectName: 'select',
  removeName: 'remove', moveName: 'move', clearName: 'clear', repeatName: 'repeat', shuffleName: 'shuffle', pauseName: 'pause',
  playName: 'play', stopName: 'stop', nextName: 'next', previousName: 'previous', seekName: 'seek' });
function environment(queueChanges) {
  const model = new QueueReferenceModel(DefaultQueuePolicy, new QueueEntryValidator(DefaultQueuePolicy), { shuffle: entries => [...entries].reverse() });
  let playbackError = null;
  let state = model.createEmptyState(); let sequence = RuntimeFixture.initial; let content = RuntimeFixture.initial;
  let control = RuntimeFixture.initial; let queueIdentity = RuntimeFixture.initial; let authentication = Fixture.account;
  let engine = Fixture.engine; let identifier = RuntimeFixture.initial; let suggestionCalls = RuntimeFixture.initial;
  let cacheOperation = async () => null; let suggestions = async () => [track(Fixture.thirdRecording)];
  let configureOperation = async () => undefined; let reportingOperation = async () => undefined;
  const listeners = new Set(); const failures = []; const operations = []; const reports = []; const credentials = [];
  const cursor = () => ({ engineEpoch: engine, authenticationEpoch: authentication, eventSequence: sequence,
    queueRevision: state.revision, queueIdentifier: RuntimeFixture.queuePrefix + queueIdentity,
    queueContentRevision: content, playbackControlRevision: control });
  const snapshot = () => ({ cursor: cursor(), queueLength: state.playbackOrder.length, currentEntry:
    state.canonicalEntries.find(entry => entry.entryIdentifier === state.activeEntryIdentifier) ?? null,
    repeatMode: state.repeatMode, shuffled: state.shuffled, playbackIntent: state.playbackIntent,
    state: playbackError !== null ? PlaybackState.Failed : state.playbackIntent === PlaybackIntent.Play ? PlaybackState.Playing : PlaybackState.Paused,
    positionMilliseconds: RuntimeFixture.initial, durationMilliseconds: RuntimeFixture.durationMilliseconds,
    bufferedAheadMilliseconds: RuntimeFixture.initial, sampledAtMonotonicMilliseconds: sequence,
    canSeek: true, canNext: true, canPrevious: true, interruption: PlaybackInterruption.None, error: playbackError,
    playbackRate: RuntimeFixture.normalRate, volume: RuntimeFixture.normalVolume });
  const emit = event => { for (const listener of [...listeners]) listener(event); };
  const publish = () => { sequence += RuntimeFixture.increment; emit({ type: PlayerEventType.State, snapshot: snapshot() }); };
  const receipt = (context, status = CommandResultStatus.Applied) => ({ status, requestIdentifier: context.requestIdentifier, cursor: cursor() });
  async function mutation(name, context, transition, changesContent = false, changesControl = false, replaces = false) {
    operations.push(name);
    if (context.engineEpoch !== engine || context.authenticationEpoch !== authentication) return receipt(context, CommandResultStatus.Superseded);
    if ((context.expectedQueueRevision !== undefined && context.expectedQueueRevision !== state.revision)
      || (context.expectedQueueIdentifier !== undefined && context.expectedQueueIdentifier !== cursor().queueIdentifier)
      || (context.expectedPlaybackControlRevision !== undefined && context.expectedPlaybackControlRevision !== control)) return receipt(context, CommandResultStatus.Conflict);
    const previousEntry = state.activeEntryIdentifier; state = transition();
    if (changesContent) content += RuntimeFixture.increment;
    if (changesControl) control += RuntimeFixture.increment;
    if (replaces) queueIdentity += RuntimeFixture.increment;
    if (previousEntry !== null && state.activeEntryIdentifier === null) {
      sequence += RuntimeFixture.increment; emit({ type: PlayerEventType.EntryChanged, cursor: cursor(), entry: null, reason: EntryChangeReason.Next });
    }
    publish(); return receipt(context);
  }
  const native = {
    async initialize() {}, async getSnapshot() { return snapshot(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async clearSession() { state = model.createEmptyState(); queueIdentity += RuntimeFixture.increment; authentication += RuntimeFixture.token; publish(); },
    async configureMediaServer(address, token) { credentials.push({ address, token }); await configureOperation(); },
    async getQueuePage(offset, limit) {
      const entries = new Map(state.canonicalEntries.map(entry => [entry.entryIdentifier, entry]));
      return { status: QueuePageStatus.Success, page: { cursor: cursor(), offset, totalEntries: state.playbackOrder.length,
        entries: state.playbackOrder.slice(offset, offset + limit).map(entryIdentifier => entries.get(entryIdentifier)) } };
    },
    async registerMediaSource() { identifier += RuntimeFixture.increment; return Fixture.sourcePrefix + identifier; }, async releaseMediaSource() {},
    replaceQueueAndSelect(context, entries, entryIdentifier, playing) { return mutation(RuntimeFixture.replaceName, context,
      () => model.replace(state, state.revision, entries, entryIdentifier, playing).state, true, true, true); },
    append(context, entries) { return mutation(RuntimeFixture.appendName, context, () => model.append(state, state.revision, entries).state, true); },
    appendAndSelect(context, entries, entryIdentifier, playing) { return mutation(RuntimeFixture.appendSelectName, context, () => {
      const appended = model.append(state, state.revision, entries).state;
      return model.select(appended, appended.revision, entryIdentifier, playing).state;
    }, true, true); },
    select(context, entryIdentifier, playing) { return mutation(RuntimeFixture.selectName, context,
      () => model.select(state, state.revision, entryIdentifier, playing).state, false, true); },
    remove(context, entries) { return mutation(RuntimeFixture.removeName, context, () => model.remove(state, state.revision, entries).state, true); },
    move(context, entryIdentifier, beforeIdentifier) { return mutation(RuntimeFixture.moveName, context,
      () => model.move(state, state.revision, entryIdentifier, beforeIdentifier).state, true); },
    clear(context) { return mutation(RuntimeFixture.clearName, context, () => model.clear(state, state.revision).state, true, true, true); },
    setRepeat(context, mode) { return mutation(RuntimeFixture.repeatName, context, () => model.setRepeat(state, state.revision, mode).state, false, true); },
    setShuffle(context, enabled) { return mutation(RuntimeFixture.shuffleName, context, () => model.setShuffle(state, state.revision, enabled).state, true, true); },
    play(context) { return mutation(RuntimeFixture.playName, context, () => ({ ...state, playbackIntent: PlaybackIntent.Play }), false, true); },
    pause(context) { return mutation(RuntimeFixture.pauseName, context, () => ({ ...state, playbackIntent: PlaybackIntent.Pause }), false, true); },
    stop(context) { return mutation(RuntimeFixture.stopName, context, () => ({ ...state, playbackIntent: PlaybackIntent.Stop }), false, true); },
    next(context) { return mutation(RuntimeFixture.nextName, context, () => model.advance(state), false, true); },
    previous(context) { return mutation(RuntimeFixture.previousName, context, () => model.previous(state, RuntimeFixture.initial), false, true); },
    seek(context) { return mutation(RuntimeFixture.seekName, context, () => state, false, true); },
  };
  const runtime = new PlaybackRuntime({ native, ...(queueChanges === undefined ? {} : { queueChanges }), mediaServerAddress: Fixture.server,
    identifiers: { nextIdentifier() { identifier += RuntimeFixture.increment; return Fixture.identifierPrefix + identifier; } },
    cache: { findReadableCachedAddress: address => cacheOperation(address) },
    fetchSuggestions: () => { suggestionCalls += RuntimeFixture.increment; return suggestions(); },
    reportFailure: failure => failures.push(failure), listening: () => ({ create(observed) {
      const record = { entryIdentifier: observed.currentEntry.entryIdentifier }; reports.push(record);
      return { start() {}, pause: () => reportingOperation(), resume: () => reportingOperation(),
        stop: () => reportingOperation(), seek: () => reportingOperation() };
    } }),
  });
  return { runtime, native, operations, reports, failures, credentials, snapshot, publish,
    login: () => runtime.updateAuthentication({ restored: true, accountIdentifier: Fixture.account, accessToken: RuntimeFixture.token }),
    nativeFailure(failure) { playbackError = failure; publish(); },
    setCache(operation) { cacheOperation = operation; }, setSuggestions(operation) { suggestions = operation; },
    setConfigure(operation) { configureOperation = operation; }, setReporting(operation) { reportingOperation = operation; },
    get suggestionCalls() { return suggestionCalls; }, get listenerCount() { return listeners.size; },
    restart() { engine += RuntimeFixture.token; state = model.createEmptyState(); publish(); },
    nativePause() { control += RuntimeFixture.increment; state = { ...state, playbackIntent: PlaybackIntent.Pause }; publish(); },
    replaceOutsideApplication() { queueIdentity += RuntimeFixture.increment; publish(); },
  };
}
module.exports = { environment, RuntimeFixture, Fixture, track, deferred, settleUntil };

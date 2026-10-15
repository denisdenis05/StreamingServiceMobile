const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { CommandResultStatus, RepeatMode, PlaybackIntent, PlayerErrorCode, MediaSourceKind } = require('streaming-service-player');
const { QueueCommandFailure, QueueCommandFailurePolicy } = require('../.build/audio-migration/QueueCommandFailure');
const { QueueIntentSupersededError } = require('../.build/audio-migration/QueueIntentScheduler');
const { Fixture, Operation, deferred, settleUntil, track, environment } = require('./fixtures/queue-rewrite.cjs');

const TestNames = Object.freeze({
  appendOrder: 'slow then fast appends preserve invocation order',
  replaceAppend: 'an append accepted during replacement belongs to its successful candidate queue',
  replaceModes: 'mode edits accepted during replacement apply after that replacement',
  replaceRemove: 'removal after a pending replacement cannot be undone by a late replacement commit',
  failedDependency: 'a rejected replacement prevents its dependent append from modifying the old queue',
  failedModes: 'a rejected replacement prevents its dependent mode edit from changing the old queue',
  appendFailure: 'a failed append does not poison a later append on the committed queue',
  latestReplacement: 'a newer replacement rejects earlier preparation promptly without waiting for its cache lookup',
  replacementCancelsEdits: 'replacement supersedes edits belonging to its predecessor queue',
  pause: 'Pause cancels an uncommitted replacement without waiting for source lookup',
  stop: 'Stop cancels an uncommitted replacement without waiting for source lookup',
  next: 'Next cancels an uncommitted replacement and advances the committed queue',
  previous: 'Previous cancels an uncommitted replacement and controls the committed queue',
  play: 'Play cancels an uncommitted replacement and resumes the committed queue',
  seek: 'Seek cancels an uncommitted replacement and targets the captured occurrence',
  select: 'selection cancels a pending replacement and targets an existing native occurrence',
  appendPause: 'Pause preserves an ordinary append on the committed queue',
  clear: 'Clear bypasses a pending candidate and cancels its dependent edits',
  clearIdentity: 'Clear creates a new queue identity even when the native queue was empty',
  queueIdentity: 'selection and ordinary edits preserve the committed queue identity',
  failedIdentity: 'a failed replacement restores the committed queue identity',
  duplicates: 'duplicate recordings have different occurrence identities and remove independently',
  batch: 'batch removal delegates one atomic native command',
  batchCapture: 'batch removal captures caller-owned identifiers before waiting behind preparation',
  batchDuplicate: 'duplicate removal identifiers reject before a native edit',
  identifiers: 'empty and whitespace occurrence identifiers reject before a native edit',
  move: 'move changes native order by stable anchor and retains the active occurrence',
  missingAnchor: 'a missing move anchor fails instead of moving against another row',
  shuffleEdits: 'shuffle restoration preserves appended entries and keeps removed entries absent',
  repeat: 'Repeat Song Next restarts the same occurrence after source-independent queue edits',
  removal: 'active removal chooses the next survivor and retains pause intent',
  conflict: 'a native queue conflict is returned once without replaying the mutation',
  preparationConflict: 'a queue revision change during preparation rejects before committing private sources',
  account: 'a changed native account cannot receive an earlier prepared queue',
  session: 'session invalidation promptly supersedes preparation and queued edits',
  cleanup: 'late source registration is released after candidate cancellation',
  appliedReceipt: 'an already applied replacement remains authoritative when its receipt arrives after Pause',
  copy: 'source definitions are captured when an append is accepted rather than when its slot starts',
  invalidSeek: 'invalid seek positions reject without native commands',
  redaction: 'queue command failures retain typed status and code without exposing native messages',
});
function pendingCache(scenario) {
  const pending = deferred(); const started = deferred();
  scenario.setCacheOperation(address => {
    if (address.endsWith(Fixture.secondRecording)) { started.resolve(); return pending.promise; }
    return Promise.resolve(null);
  });
  return { pending, started };
}
async function initialized() {
  const scenario = environment(); await scenario.controller.playTracks([track(), track(Fixture.thirdRecording)], Fixture.firstIndex);
  return scenario;
}
test(TestNames.appendOrder, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const first = scenario.controller.append([track(Fixture.secondRecording)]); await cache.started.promise;
  const second = scenario.controller.append([track(Fixture.fourthRecording)]);
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording]);
  cache.pending.resolve(null); await first; await second;
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording, Fixture.secondRecording, Fixture.fourthRecording]);
});
test(TestNames.replaceAppend, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); await cache.started.promise;
  const append = scenario.controller.append([track(Fixture.fourthRecording)]); cache.pending.resolve(null); await replacement; await append;
  assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording, Fixture.fourthRecording]);
});
test(TestNames.replaceModes, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); await cache.started.promise;
  const shuffle = scenario.controller.setShuffle(true); const repeat = scenario.controller.setRepeat(RepeatMode.One);
  cache.pending.resolve(null); await replacement; await shuffle; await repeat;
  assertion.equal(scenario.state.shuffled, true); assertion.equal(scenario.state.repeatMode, RepeatMode.One);
});
test(TestNames.replaceRemove, async () => {
  const scenario = await initialized(); const oldIdentifier = scenario.entries()[Fixture.firstIndex].entryIdentifier;
  const cache = pendingCache(scenario); const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  await cache.started.promise; const removal = scenario.controller.remove(oldIdentifier); const rejected = assertion.rejects(removal, QueueCommandFailure);
  cache.pending.resolve(null); await replacement; await rejected;
  assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording]);
});
for (const [name, dependency] of [
  [TestNames.failedDependency, controller => controller.append([track(Fixture.fourthRecording)])],
  [TestNames.failedModes, controller => controller.setShuffle(true)],
]) {
  test(name, async () => {
    const scenario = await initialized(); const cache = pendingCache(scenario);
    scenario.setBeforeQueueCommand(async (operation, context) => operation === Operation.replace
      ? { status: CommandResultStatus.Rejected, requestIdentifier: context.requestIdentifier,
        error: { code: PlayerErrorCode.InvalidCommand, message: Fixture.privateMessage, retryable: false } } : null);
    const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
    const rejectedReplacement = assertion.rejects(replacement); await cache.started.promise;
    const dependent = dependency(scenario.controller); const rejectedDependent = assertion.rejects(dependent);
    cache.pending.resolve(null); await rejectedReplacement; await rejectedDependent;
    assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording]); assertion.equal(scenario.state.shuffled, false);
  });
}
test(TestNames.appendFailure, async () => {
  const scenario = await initialized(); let fail = true;
  scenario.setCacheOperation(async () => { if (fail) { fail = false; throw new Error(Fixture.failure); } return null; });
  const invalid = { ...track(Fixture.secondRecording), durationSeconds: Number.NaN };
  const first = scenario.controller.append([invalid]); const rejected = assertion.rejects(first);
  const second = scenario.controller.append([track(Fixture.fourthRecording)]); await rejected; await second;
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording, Fixture.fourthRecording]);
});
test(TestNames.latestReplacement, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const first = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(first, QueueIntentSupersededError); await cache.started.promise;
  await scenario.controller.playTracks([track(Fixture.fourthRecording)], Fixture.firstIndex); await rejected;
  assertion.deepEqual(scenario.recordings(), [Fixture.fourthRecording]); cache.pending.resolve(null);
});
test(TestNames.replacementCancelsEdits, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); const rejectedAppend = assertion.rejects(append); await cache.started.promise;
  const shuffle = scenario.controller.setShuffle(true); const rejectedShuffle = assertion.rejects(shuffle);
  await scenario.controller.playTracks([track(Fixture.fourthRecording)], Fixture.firstIndex); await rejectedAppend; await rejectedShuffle;
  assertion.deepEqual(scenario.recordings(), [Fixture.fourthRecording]); assertion.equal(scenario.state.shuffled, false); cache.pending.resolve(null);
});
for (const [name, operationName] of [[TestNames.pause, Operation.pause], [TestNames.stop, Operation.stop],
  [TestNames.next, Operation.next], [TestNames.previous, Operation.previous], [TestNames.play, Operation.play]]) {
  test(name, async () => {
    const scenario = await initialized(); const cache = pendingCache(scenario);
    const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
    const rejected = assertion.rejects(replacement, QueueIntentSupersededError); await cache.started.promise;
    await scenario.controller[operationName](); await rejected;
    assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording]);
    assertion.equal(scenario.operations[scenario.operations.length - Fixture.lastOffset].name, operationName); cache.pending.resolve(null);
  });
}
test(TestNames.seek, async () => {
  const scenario = await initialized(); const identifier = scenario.currentEntry().entryIdentifier; const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(replacement); await cache.started.promise;
  await scenario.controller.seek(identifier, Fixture.seekPositionSeconds); await rejected;
  assertion.equal(scenario.positionMilliseconds, Fixture.seekPositionMilliseconds); cache.pending.resolve(null);
});
test(TestNames.select, async () => {
  const scenario = await initialized(); const identifier = scenario.entries()[Fixture.secondIndex].entryIdentifier; const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(replacement); await cache.started.promise; await scenario.controller.select(identifier); await rejected;
  assertion.equal(scenario.currentEntry().recordingIdentifier, Fixture.thirdRecording); cache.pending.resolve(null);
});
test(TestNames.appendPause, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); await cache.started.promise; await scenario.controller.pause();
  cache.pending.resolve(null); await append;
  assertion.equal(scenario.state.playbackIntent, PlaybackIntent.Pause);
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording, Fixture.secondRecording]);
});
test(TestNames.clear, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); const rejected = assertion.rejects(replacement);
  await cache.started.promise; const append = scenario.controller.append([track(Fixture.fourthRecording)]); const rejectedAppend = assertion.rejects(append);
  await scenario.controller.clearQueue(); await rejected; await rejectedAppend;
  assertion.deepEqual(scenario.recordings(), []); cache.pending.resolve(null);
});
test(TestNames.clearIdentity, async () => {
  const scenario = environment(); const before = scenario.controller.getDesiredQueueIdentifier(); await scenario.controller.clearQueue();
  assertion.notEqual(scenario.controller.getDesiredQueueIdentifier(), before);
});
test(TestNames.queueIdentity, async () => {
  const scenario = await initialized(); const before = scenario.controller.getDesiredQueueIdentifier();
  await scenario.controller.select(scenario.entries()[Fixture.secondIndex].entryIdentifier);
  await scenario.controller.setRepeat(RepeatMode.All); await scenario.controller.setShuffle(true);
  assertion.equal(scenario.controller.getDesiredQueueIdentifier(), before);
});
test(TestNames.failedIdentity, async () => {
  const scenario = await initialized(); const before = scenario.controller.getDesiredQueueIdentifier();
  await assertion.rejects(scenario.controller.playTracks([{ ...track(), durationSeconds: Number.NaN }], Fixture.firstIndex));
  assertion.equal(scenario.controller.getDesiredQueueIdentifier(), before);
});
test(TestNames.duplicates, async () => {
  const scenario = environment(); await scenario.controller.playTracks([track(), track()], Fixture.firstIndex);
  const entries = scenario.entries(); assertion.notEqual(entries[Fixture.firstIndex].entryIdentifier, entries[Fixture.secondIndex].entryIdentifier);
  await scenario.controller.remove(entries[Fixture.firstIndex].entryIdentifier);
  assertion.equal(scenario.currentEntry().entryIdentifier, entries[Fixture.secondIndex].entryIdentifier);
});
test(TestNames.batch, async () => {
  const scenario = await initialized(); await scenario.controller.append([track(Fixture.secondRecording)]);
  const identifiers = [scenario.entries()[Fixture.firstIndex].entryIdentifier, scenario.entries()[Fixture.thirdIndex].entryIdentifier];
  await scenario.controller.removeMany(identifiers);
  assertion.deepEqual(scenario.recordings(), [Fixture.thirdRecording]);
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.remove).length, Fixture.singleCount);
});
test(TestNames.batchCapture, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); await cache.started.promise;
  const identifiers = [scenario.entries()[Fixture.firstIndex].entryIdentifier]; const captured = [...identifiers];
  const removal = scenario.controller.removeMany(identifiers); identifiers[Fixture.firstIndex] = Fixture.invalidEntry;
  cache.pending.resolve(null); await append; await removal;
  assertion.deepEqual(scenario.operations.find(operation => operation.name === Operation.remove).identifiers, captured);
});
test(TestNames.batchDuplicate, async () => {
  const scenario = await initialized(); const identifier = scenario.currentEntry().entryIdentifier;
  await assertion.rejects(scenario.controller.removeMany([identifier, identifier]));
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.remove).length, Fixture.initialCount);
});
test(TestNames.identifiers, async () => {
  const scenario = environment();
  for (const identifier of [Fixture.emptyIdentifier, Fixture.whitespaceIdentifier]) {
    await assertion.rejects(scenario.controller.select(identifier)); await assertion.rejects(scenario.controller.remove(identifier));
    await assertion.rejects(scenario.controller.move(identifier, null));
  }
  assertion.deepEqual(scenario.operations, []);
});
test(TestNames.move, async () => {
  const scenario = await initialized(); await scenario.controller.append([track(Fixture.secondRecording)]);
  const entries = scenario.entries(); const active = scenario.currentEntry().entryIdentifier;
  await scenario.controller.move(entries[Fixture.thirdIndex].entryIdentifier, entries[Fixture.firstIndex].entryIdentifier);
  assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording, Fixture.firstRecording, Fixture.thirdRecording]);
  assertion.equal(scenario.currentEntry().entryIdentifier, active);
});
test(TestNames.missingAnchor, async () => {
  const scenario = await initialized(); await assertion.rejects(scenario.controller.move(scenario.currentEntry().entryIdentifier, Fixture.invalidEntry), QueueCommandFailure);
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording]);
});
test(TestNames.shuffleEdits, async () => {
  const scenario = await initialized(); await scenario.controller.append([track(Fixture.secondRecording)]);
  const removedIdentifier = scenario.entries()[Fixture.secondIndex].entryIdentifier; const active = scenario.currentEntry().entryIdentifier;
  await scenario.controller.setShuffle(true); await scenario.controller.append([track(Fixture.fourthRecording)]);
  await scenario.controller.remove(removedIdentifier); await scenario.controller.setShuffle(false);
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.secondRecording, Fixture.fourthRecording]);
  assertion.equal(scenario.currentEntry().entryIdentifier, active);
});
test(TestNames.repeat, async () => {
  const scenario = await initialized(); const active = scenario.currentEntry().entryIdentifier;
  await scenario.controller.setRepeat(RepeatMode.One); await scenario.controller.next();
  assertion.equal(scenario.currentEntry().entryIdentifier, active);
});
test(TestNames.removal, async () => {
  const scenario = await initialized(); await scenario.controller.pause(); await scenario.controller.remove(scenario.currentEntry().entryIdentifier);
  assertion.equal(scenario.currentEntry().recordingIdentifier, Fixture.thirdRecording); assertion.equal(scenario.state.playbackIntent, PlaybackIntent.Pause);
});
test(TestNames.conflict, async () => {
  const scenario = await initialized(); scenario.setBeforeQueueCommand(async (name, context) =>
    ({ status: CommandResultStatus.Conflict, requestIdentifier: context.requestIdentifier, cursor: { engineEpoch: Fixture.engine, authenticationEpoch: Fixture.account } }));
  await assertion.rejects(scenario.controller.append([track(Fixture.secondRecording)]), failure => failure instanceof QueueCommandFailure
    && failure.status === CommandResultStatus.Conflict);
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.append).length, Fixture.singleCount);
});
test(TestNames.preparationConflict, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); const rejected = assertion.rejects(append, { message: QueueCommandFailurePolicy.conflictMessage });
  await cache.started.promise; scenario.changeNativeRevision(); cache.pending.resolve(Fixture.localAddress); await rejected;
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.append).length, Fixture.initialCount);
  assertion.equal(scenario.sourceReleases.length, Fixture.singleCount);
});
test(TestNames.account, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); const rejected = assertion.rejects(append); await cache.started.promise;
  scenario.changeAccount(); cache.pending.resolve(Fixture.localAddress); await rejected;
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.append).length, Fixture.initialCount);
});
test(TestNames.session, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); const rejected = assertion.rejects(append); await cache.started.promise;
  const shuffle = scenario.controller.setShuffle(true); const rejectedShuffle = assertion.rejects(shuffle);
  const identity = scenario.controller.getDesiredQueueIdentifier(); scenario.controller.invalidateSession(); await rejected; await rejectedShuffle;
  assertion.notEqual(scenario.controller.getDesiredQueueIdentifier(), identity); cache.pending.resolve(null);
});
test(TestNames.cleanup, async () => {
  const scenario = await initialized(); const pending = deferred(); const started = deferred();
  scenario.setRegistrationOperation(() => { started.resolve(); return pending.promise; });
  const replacement = scenario.controller.playTracks([{ ...track(Fixture.secondRecording), mediaSource: { kind: MediaSourceKind.Local,
    address: Fixture.localAddress } }], Fixture.firstIndex); const rejected = assertion.rejects(replacement);
  await started.promise; await scenario.controller.pause(); await rejected; assertion.deepEqual(scenario.sourceReleases, []);
  pending.resolve(); await settleUntil(() => scenario.sourceReleases.length === Fixture.singleCount);
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.replace).length, Fixture.singleCount);
});
test(TestNames.appliedReceipt, async () => {
  const scenario = await initialized(); const pending = deferred(); const applied = deferred();
  scenario.setReceiptOperation(name => { if (name === Operation.replace) { applied.resolve(); return pending.promise; } return Promise.resolve(); });
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); const rejected = assertion.rejects(replacement);
  await applied.promise; const pause = scenario.controller.pause(); await rejected; pending.resolve(); await pause;
  assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording]); assertion.equal(scenario.state.playbackIntent, PlaybackIntent.Pause);
  await scenario.controller.append([track(Fixture.fourthRecording)]);
  assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording, Fixture.fourthRecording]);
});
test(TestNames.copy, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const first = scenario.controller.append([track(Fixture.secondRecording)]); await cache.started.promise;
  const source = { kind: MediaSourceKind.Local, address: Fixture.localAddress };
  const candidate = { ...track(Fixture.fourthRecording), mediaSource: source }; const second = scenario.controller.append([candidate]);
  source.address = Fixture.invalidEntry; candidate.title = Fixture.failure; cache.pending.resolve(null); await first; await second;
  assertion.equal(scenario.sourceRegistrations[Fixture.firstIndex].source.address, Fixture.localAddress);
  assertion.equal(scenario.entries()[Fixture.thirdIndex + Fixture.increment].title, Fixture.title);
});
test(TestNames.invalidSeek, async () => {
  const scenario = await initialized(); const identifier = scenario.currentEntry().entryIdentifier;
  for (const position of [Number.NaN, Number.POSITIVE_INFINITY, Fixture.invalidPositionSeconds, Number.MAX_VALUE]) {
    await assertion.rejects(scenario.controller.seek(identifier, position));
  }
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.seek).length, Fixture.initialCount);
});
test(TestNames.redaction, () => {
  const failure = new QueueCommandFailure({ status: CommandResultStatus.Rejected, requestIdentifier: Fixture.invalidEntry,
    error: { code: PlayerErrorCode.InvalidCommand, message: Fixture.privateMessage, retryable: false } });
  assertion.equal(failure.status, CommandResultStatus.Rejected); assertion.equal(failure.errorCode, PlayerErrorCode.InvalidCommand);
  assertion.equal(failure.message, QueueCommandFailurePolicy.rejectedMessage); assertion.equal(failure.message.includes(Fixture.privateMessage), false);
});
const RecoveryTestNames = Object.freeze({
  unknown: 'a lost receipt after native apply blocks dependent and later queue edits without replay',
  replaceRecovery: 'explicit replacement recovers ownership after an unknown native outcome',
  clearRecovery: 'explicit Clear recovers ownership after an unknown native outcome',
  rejectedInternal: 'an internal native rejection marks queue ownership uncertain',
  pausedRecovery: 'Pause remains available when a queue command outcome is unknown',
  inFlightAppend: 'an already prepared append cannot commit after another operation makes ownership uncertain',
  invalidBatch: 'atomic batch removal with a missing identifier leaves every existing occurrence present',
  seekStale: 'a stale seek target is passed as an occurrence identifier rather than replaced with the current row',
  empty: 'empty append and empty batch removal issue no native commands',
  rejectedDefinition: 'an invalid candidate selection does not cancel a valid pending replacement',
});
const { QueueCommandOutcomeUnknownError } = require('../.build/audio-migration/QueueCommandFailure');
async function loseReplacementReceipt(scenario) {
  scenario.setReceiptOperation(async name => { if (name === Operation.replace) throw new Error(Fixture.privateMessage); });
  await assertion.rejects(scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex), QueueCommandOutcomeUnknownError);
  scenario.setReceiptOperation(null);
}
test(RecoveryTestNames.unknown, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  scenario.setReceiptOperation(async name => { if (name === Operation.replace) throw new Error(Fixture.privateMessage); });
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex);
  const rejected = assertion.rejects(replacement, QueueCommandOutcomeUnknownError); await cache.started.promise;
  const dependent = scenario.controller.append([track(Fixture.fourthRecording)]); const rejectedDependent = assertion.rejects(dependent);
  cache.pending.resolve(null); await rejected; await rejectedDependent;
  assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording]); assertion.equal(scenario.controller.isQueueOutcomeKnown(), false);
  await assertion.rejects(scenario.controller.append([track(Fixture.fourthRecording)]), QueueCommandOutcomeUnknownError);
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.append).length, Fixture.initialCount);
});
test(RecoveryTestNames.replaceRecovery, async () => {
  const scenario = await initialized(); await loseReplacementReceipt(scenario);
  await scenario.controller.playTracks([track(Fixture.fourthRecording)], Fixture.firstIndex);
  assertion.equal(scenario.controller.isQueueOutcomeKnown(), true); assertion.deepEqual(scenario.recordings(), [Fixture.fourthRecording]);
});
test(RecoveryTestNames.clearRecovery, async () => {
  const scenario = await initialized(); await loseReplacementReceipt(scenario); await scenario.controller.clearQueue();
  assertion.equal(scenario.controller.isQueueOutcomeKnown(), true); assertion.deepEqual(scenario.recordings(), []);
  await scenario.controller.append([track(Fixture.fourthRecording)]); assertion.deepEqual(scenario.recordings(), [Fixture.fourthRecording]);
});
test(RecoveryTestNames.rejectedInternal, async () => {
  const scenario = await initialized(); scenario.setBeforeQueueCommand(async (name, context) => ({ status: CommandResultStatus.Rejected,
    requestIdentifier: context.requestIdentifier, error: { code: PlayerErrorCode.Internal, message: Fixture.privateMessage, retryable: false } }));
  await assertion.rejects(scenario.controller.append([track(Fixture.secondRecording)]), QueueCommandFailure);
  assertion.equal(scenario.controller.isQueueOutcomeKnown(), false);
  await assertion.rejects(scenario.controller.setShuffle(true), QueueCommandOutcomeUnknownError);
});
test(RecoveryTestNames.pausedRecovery, async () => {
  const scenario = await initialized(); await loseReplacementReceipt(scenario); await scenario.controller.pause();
  assertion.equal(scenario.state.playbackIntent, PlaybackIntent.Pause);
});
test(RecoveryTestNames.inFlightAppend, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); const rejectedAppend = assertion.rejects(append, QueueCommandOutcomeUnknownError);
  await cache.started.promise; scenario.setBeforeQueueCommand(async (name, context) => name === Operation.select
    ? { status: CommandResultStatus.Rejected, requestIdentifier: context.requestIdentifier,
      error: { code: PlayerErrorCode.Internal, message: Fixture.privateMessage, retryable: false } } : null);
  await assertion.rejects(scenario.controller.select(scenario.currentEntry().entryIdentifier));
  cache.pending.resolve(null); await rejectedAppend;
  assertion.equal(scenario.operations.filter(operation => operation.name === Operation.append).length, Fixture.initialCount);
});
test(RecoveryTestNames.invalidBatch, async () => {
  const scenario = await initialized(); const before = scenario.entries().map(entry => entry.entryIdentifier);
  await assertion.rejects(scenario.controller.removeMany([before[Fixture.firstIndex], Fixture.invalidEntry]), QueueCommandFailure);
  assertion.deepEqual(scenario.entries().map(entry => entry.entryIdentifier), before);
});
test(RecoveryTestNames.seekStale, async () => {
  const scenario = await initialized(); await scenario.controller.seek(Fixture.invalidEntry, Fixture.seekPositionSeconds);
  assertion.equal(scenario.positionMilliseconds, Fixture.zeroPositionMilliseconds);
});
test(RecoveryTestNames.empty, async () => {
  const scenario = environment(); await scenario.controller.append([]); await scenario.controller.removeMany([]);
  assertion.deepEqual(scenario.operations, []);
});
test(RecoveryTestNames.rejectedDefinition, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); await cache.started.promise;
  await assertion.rejects(scenario.controller.playTracks([], Fixture.firstIndex));
  cache.pending.resolve(null); await replacement; assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording]);
});
const SourceValidationTestNames = Object.freeze({
  invalidSource: 'a malformed explicit source rejects before canceling the pending valid candidate',
  invalidRequest: 'a malformed request rejects before entering the ordered edit lane',
});
const SourceValidationFixture = Object.freeze({ unsupportedKind: 'unsupported-source-kind', unsupportedMethod: 'unsupported-method' });
test(SourceValidationTestNames.invalidSource, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); await cache.started.promise;
  await assertion.rejects(scenario.controller.playTracks([{ ...track(), mediaSource: {
    kind: SourceValidationFixture.unsupportedKind, address: Fixture.localAddress } }], Fixture.firstIndex));
  cache.pending.resolve(null); await replacement; assertion.deepEqual(scenario.recordings(), [Fixture.secondRecording]);
});
test(SourceValidationTestNames.invalidRequest, async () => {
  const scenario = environment();
  await assertion.rejects(scenario.controller.append([{ ...track(), mediaRequest: { method: SourceValidationFixture.unsupportedMethod } }]));
  assertion.deepEqual(scenario.operations, []);
});
const QueueIdentityTestNames = Object.freeze({
  candidate: 'a pending replacement exposes its desired identity separately from the committed identity',
  uncertain: 'an unknown native outcome exposes no claimed committed identity',
});
test(QueueIdentityTestNames.candidate, async () => {
  const scenario = await initialized(); const committed = scenario.controller.getCommittedQueueIdentifier(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); await cache.started.promise;
  assertion.notEqual(scenario.controller.getDesiredQueueIdentifier(), committed);
  assertion.equal(scenario.controller.getCommittedQueueIdentifier(), committed); cache.pending.resolve(null); await replacement;
  assertion.equal(scenario.controller.getDesiredQueueIdentifier(), scenario.controller.getCommittedQueueIdentifier());
});
test(QueueIdentityTestNames.uncertain, async () => {
  const scenario = await initialized(); await loseReplacementReceipt(scenario);
  assertion.equal(scenario.controller.getCommittedQueueIdentifier(), null);
});
const ExternalCancellationTestNames = Object.freeze({
  replacement: 'the native-control cancellation port supersedes an uncommitted replacement without issuing another native command',
  append: 'the native-control cancellation port preserves an ordinary append on the committed queue',
});
test(ExternalCancellationTestNames.replacement, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const replacement = scenario.controller.playTracks([track(Fixture.secondRecording)], Fixture.firstIndex); const rejected = assertion.rejects(replacement);
  await cache.started.promise; scenario.controller.cancelPendingReplacement(); await rejected;
  assertion.equal(scenario.operations.length, Fixture.singleCount); cache.pending.resolve(null);
});
test(ExternalCancellationTestNames.append, async () => {
  const scenario = await initialized(); const cache = pendingCache(scenario);
  const append = scenario.controller.append([track(Fixture.secondRecording)]); await cache.started.promise;
  scenario.controller.cancelPendingReplacement(); cache.pending.resolve(null); await append;
  assertion.deepEqual(scenario.recordings(), [Fixture.firstRecording, Fixture.thirdRecording, Fixture.secondRecording]);
});

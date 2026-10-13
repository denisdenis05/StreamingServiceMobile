const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { NativePlaybackReporting } = require('../.build/audio-migration/NativePlaybackReporting');
const { PlaybackState, PlaybackIntent, PlayerEventType, EntryChangeReason } = require('streaming-service-player');

const ReportingFixture = Object.freeze({
  engine: 'reporting-engine', account: 'reporting-account', otherAccount: 'other-account', otherEngine: 'other-engine',
  firstEntry: 'first-entry', secondEntry: 'second-entry', recording: 'recording', initialSequence: 1, nextSequence: 2,
  playingSequence: 3, lateSequence: 4, laterSequence: 5, initialRevision: 1, zeroPositionMilliseconds: 0,
  originalPositionMilliseconds: 40000, destinationPositionMilliseconds: 2000, originalPositionSeconds: 40,
  destinationPositionSeconds: 2, failure: 'reporting-fixture-failure', firstIndex: 0, oneSession: 1, twoSessions: 2,
  noFailures: 0, oneFailure: 1, changedTitle: 'changed-title', title: 'original-title',
});
const TestNames = Object.freeze({
  initial: 'starts reporting for an authoritative playing snapshot',
  preparation: 'waits for actual playing state before starting a listening session',
  repeat: 'repeat stops the old session before starting another for the same entry',
  restart: 'previous restart creates a new listening session',
  seek: 'seek updates the current session without creating another session',
  wrongSeek: 'seek for a different entry cannot affect the current session',
  duplicate: 'duplicate and out of order events cannot create sessions or duplicate seeking',
  pause: 'pause and buffering pause accounting and playback resumes the same session',
  stopped: 'stop and queue exhaustion end the current listening session',
  account: 'old account events are rejected after authoritative account synchronization',
  engine: 'old engine events are rejected after authoritative engine synchronization',
  clear: 'clear stops reporting and ignores late events until synchronization',
  independent: 'pending reports do not delay accepting another track or seek',
  failed: 'failed reports leave the new session selected',
  synchronous: 'synchronous reporting failures do not escape the event receiver',
  snapshot: 'snapshot track change replaces the session when events were missed',
  capture: 'session creation captures metadata and cursor before caller mutation',
  rejected: 'foreign events cannot establish an uninitialized reporting session',
  failedStart: 'failed session start is cleaned up and can be retried on later playback state',
});
function cursor(sequence, account = ReportingFixture.account, engine = ReportingFixture.engine) {
  return { engineEpoch: engine, authenticationEpoch: account, eventSequence: sequence, queueRevision: ReportingFixture.initialRevision };
}
function snapshot(sequence = ReportingFixture.initialSequence, entryIdentifier = ReportingFixture.firstEntry,
  state = PlaybackState.Playing, account = ReportingFixture.account, engine = ReportingFixture.engine) {
  return { cursor: cursor(sequence, account, engine), state, playbackIntent: PlaybackIntent.Play,
    currentEntry: entryIdentifier === null ? null : { entryIdentifier, recordingIdentifier: ReportingFixture.recording, title: ReportingFixture.title },
    positionMilliseconds: ReportingFixture.zeroPositionMilliseconds };
}
function stateEvent(snapshot) { return { type: PlayerEventType.State, snapshot }; }
function change(sequence, reason = EntryChangeReason.Repeated, entryIdentifier = ReportingFixture.firstEntry) {
  return { type: PlayerEventType.EntryChanged, cursor: cursor(sequence), reason,
    entry: entryIdentifier === null ? null : { entryIdentifier } };
}
function seek(sequence = ReportingFixture.nextSequence, entryIdentifier = ReportingFixture.firstEntry) {
  return { type: PlayerEventType.Seeked, cursor: cursor(sequence), entryIdentifier,
    previousPositionMilliseconds: ReportingFixture.originalPositionMilliseconds,
    positionMilliseconds: ReportingFixture.destinationPositionMilliseconds };
}
function scenario() {
  const sessions = [];
  const failures = [];
  const snapshots = [];
  let reportingOperation = () => Promise.resolve();
  let failStart = false;
  let failCreation = false;
  const reporting = new NativePlaybackReporting({ create: capturedSnapshot => {
    if (failCreation) throw new Error(ReportingFixture.failure);
    snapshots.push(capturedSnapshot);
    const session = {
      calls: [],
      start() { this.calls.push(SessionCalls.start); if (failStart) throw new Error(ReportingFixture.failure); },
      pause() { this.calls.push(SessionCalls.pause); return reportingOperation(); },
      resume() { this.calls.push(SessionCalls.resume); return reportingOperation(); },
      seek(fromSeconds, toSeconds) { this.calls.push([SessionCalls.seek, fromSeconds, toSeconds]); return reportingOperation(); },
      stop() { this.calls.push(SessionCalls.stop); return reportingOperation(); },
    };
    sessions.push(session);
    return session;
  } }, failure => failures.push(failure));
  return { reporting, sessions, failures, snapshots,
    setOperation(operation) { reportingOperation = operation; },
    setFailStart(value) { failStart = value; },
    setFailCreation(value) { failCreation = value; },
  };
}
const SessionCalls = Object.freeze({ start: 'start', pause: 'pause', resume: 'resume', stop: 'stop', seek: 'seek' });

test(TestNames.initial, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start]);
});
test(TestNames.preparation, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot(ReportingFixture.initialSequence, ReportingFixture.firstEntry, PlaybackState.Resolving));
  assertion.deepEqual(environment.sessions, []);
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.nextSequence)));
  assertion.equal(environment.sessions.length, ReportingFixture.oneSession);
});
for (const [name, reason] of [[TestNames.repeat, EntryChangeReason.Repeated], [TestNames.restart, EntryChangeReason.Previous]]) {
  test(name, () => {
    const environment = scenario(); environment.reporting.synchronize(snapshot());
    environment.reporting.receive(change(ReportingFixture.nextSequence, reason));
    assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start, SessionCalls.stop]);
    environment.reporting.receive(stateEvent(snapshot(ReportingFixture.playingSequence)));
    assertion.equal(environment.sessions.length, ReportingFixture.twoSessions);
  });
}
test(TestNames.seek, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot()); environment.reporting.receive(seek());
  assertion.equal(environment.sessions.length, ReportingFixture.oneSession);
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls,
    [SessionCalls.start, [SessionCalls.seek, ReportingFixture.originalPositionSeconds, ReportingFixture.destinationPositionSeconds]]);
});
test(TestNames.wrongSeek, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.reporting.receive(seek(ReportingFixture.nextSequence, ReportingFixture.secondEntry));
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start]);
});
test(TestNames.duplicate, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.reporting.receive(seek()); environment.reporting.receive(seek());
  environment.reporting.receive(change(ReportingFixture.initialSequence));
  assertion.equal(environment.sessions.length, ReportingFixture.oneSession);
  assertion.equal(environment.sessions[ReportingFixture.firstIndex].calls.length, ReportingFixture.twoSessions);
});
test(TestNames.pause, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.nextSequence, ReportingFixture.firstEntry, PlaybackState.Paused)));
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.playingSequence, ReportingFixture.firstEntry, PlaybackState.Buffering)));
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.lateSequence)));
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls,
    [SessionCalls.start, SessionCalls.pause, SessionCalls.pause, SessionCalls.resume]);
});
test(TestNames.stopped, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.reporting.receive(stateEvent({ ...snapshot(ReportingFixture.nextSequence), playbackIntent: PlaybackIntent.Stop }));
  environment.reporting.receive(change(ReportingFixture.playingSequence, EntryChangeReason.Ended, null));
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start, SessionCalls.stop]);
});
for (const [name, account, engine] of [[TestNames.account, ReportingFixture.otherAccount, ReportingFixture.engine],
  [TestNames.engine, ReportingFixture.account, ReportingFixture.otherEngine]]) {
  test(name, () => {
    const environment = scenario(); environment.reporting.synchronize(snapshot());
    environment.reporting.synchronize(snapshot(ReportingFixture.initialSequence, ReportingFixture.secondEntry, PlaybackState.Playing, account, engine));
    environment.reporting.receive(change(ReportingFixture.laterSequence));
    environment.reporting.receive(seek(ReportingFixture.laterSequence));
    environment.reporting.receive(stateEvent(snapshot(ReportingFixture.laterSequence)));
    assertion.equal(environment.sessions.length, ReportingFixture.twoSessions);
    assertion.deepEqual(environment.sessions.at(-ReportingFixture.oneSession).calls, [SessionCalls.start]);
  });
}
test(TestNames.clear, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot()); environment.reporting.clear();
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.nextSequence)));
  assertion.equal(environment.sessions.length, ReportingFixture.oneSession);
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start, SessionCalls.stop]);
});
test(TestNames.independent, async () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  let resolveReport;
  environment.setOperation(() => new Promise(resolve => { resolveReport = resolve; }));
  environment.reporting.receive(change(ReportingFixture.nextSequence, EntryChangeReason.Next, ReportingFixture.secondEntry));
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.playingSequence, ReportingFixture.secondEntry)));
  assertion.equal(environment.sessions.length, ReportingFixture.twoSessions);
  environment.setOperation(() => Promise.resolve());
  environment.reporting.receive(seek(ReportingFixture.lateSequence, ReportingFixture.secondEntry));
  assertion.deepEqual(environment.sessions.at(-ReportingFixture.oneSession).calls,
    [SessionCalls.start, [SessionCalls.seek, ReportingFixture.originalPositionSeconds, ReportingFixture.destinationPositionSeconds]]);
  resolveReport(); await Promise.resolve();
});
test(TestNames.failed, async () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.setOperation(() => Promise.reject(new Error(ReportingFixture.failure)));
  environment.reporting.receive(change(ReportingFixture.nextSequence));
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.playingSequence)));
  await Promise.resolve();
  assertion.equal(environment.failures.length, ReportingFixture.oneFailure);
  assertion.deepEqual(environment.sessions.at(-ReportingFixture.oneSession).calls, [SessionCalls.start]);
});
test(TestNames.synchronous, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.setOperation(() => { throw new Error(ReportingFixture.failure); });
  assertion.doesNotThrow(() => environment.reporting.receive(seek()));
  assertion.equal(environment.failures.length, ReportingFixture.oneFailure);
});
test(TestNames.snapshot, () => {
  const environment = scenario(); environment.reporting.synchronize(snapshot());
  environment.reporting.receive(stateEvent(snapshot(ReportingFixture.nextSequence, ReportingFixture.secondEntry)));
  assertion.equal(environment.sessions.length, ReportingFixture.twoSessions);
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start, SessionCalls.stop]);
});
test(TestNames.capture, () => {
  const environment = scenario(); const currentSnapshot = snapshot(); environment.reporting.synchronize(currentSnapshot);
  currentSnapshot.currentEntry.title = ReportingFixture.changedTitle;
  currentSnapshot.cursor.eventSequence = ReportingFixture.laterSequence;
  assertion.equal(environment.snapshots[ReportingFixture.firstIndex].currentEntry.title, ReportingFixture.title);
  assertion.equal(environment.snapshots[ReportingFixture.firstIndex].cursor.eventSequence, ReportingFixture.initialSequence);
  environment.reporting.receive(seek());
  assertion.equal(environment.sessions[ReportingFixture.firstIndex].calls.length, ReportingFixture.twoSessions);
});
test(TestNames.rejected, () => {
  const environment = scenario(); environment.reporting.receive(stateEvent(snapshot()));
  assertion.deepEqual(environment.sessions, []);
});
test(TestNames.failedStart, () => {
  const environment = scenario(); environment.setFailStart(true); environment.reporting.synchronize(snapshot());
  assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, [SessionCalls.start, SessionCalls.stop]);
  environment.setFailStart(false); environment.reporting.receive(stateEvent(snapshot(ReportingFixture.nextSequence)));
  assertion.equal(environment.sessions.length, ReportingFixture.twoSessions);
});

const ErrorTestNames = Object.freeze({
  current: 'current entry error pauses the existing listening session',
  foreign: 'another entry error cannot pause the current listening session',
  creation: 'failed session factory leaves reporting ready for a later playing snapshot',
});
const ReportingErrorCode = 'NETWORK';
for (const [name, entryIdentifier, expectedCalls] of [
  [ErrorTestNames.current, ReportingFixture.firstEntry, [SessionCalls.start, SessionCalls.pause]],
  [ErrorTestNames.foreign, ReportingFixture.secondEntry, [SessionCalls.start]],
]) {
  test(name, () => {
    const environment = scenario(); environment.reporting.synchronize(snapshot());
    environment.reporting.receive({ type: PlayerEventType.Error, cursor: cursor(ReportingFixture.nextSequence),
      error: { code: ReportingErrorCode, message: ReportingFixture.failure, retryable: true, entryIdentifier } });
    assertion.deepEqual(environment.sessions[ReportingFixture.firstIndex].calls, expectedCalls);
  });
}
test(ErrorTestNames.creation, () => {
  const environment = scenario(); environment.setFailCreation(true); environment.reporting.synchronize(snapshot());
  assertion.deepEqual(environment.sessions, []);
  assertion.equal(environment.failures.length, ReportingFixture.oneFailure);
  environment.setFailCreation(false); environment.reporting.receive(stateEvent(snapshot(ReportingFixture.nextSequence)));
  assertion.equal(environment.sessions.length, ReportingFixture.oneSession);
});

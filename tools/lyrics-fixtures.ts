export const LyricsFixture = Object.freeze({
  first: 0,
  second: 1,
  third: 2,
  singleCall: 1,
  twoCalls: 2,
  noCalls: 0,
  firstTimestamp: 1000,
  secondTimestamp: 2500,
  thirdTimestamp: 5000,
  beforeFirst: 999,
  firstSeconds: 1,
  thirdSeconds: 5,
  midpoint: 3000,
  endPosition: 20000,
  plain: 'First invented line\nSecond invented line\nThird invented line',
  timed:
    '[00:01.00]First invented line\n[00:02.50]Second invented line\n[00:05.000]Third invented line',
  firstText: 'First invented line',
  secondText: 'Second invented line',
  thirdText: 'Third invented line',
  account: 'lyrics-account',
  otherAccount: 'other-account',
  recording: 'lyrics-recording',
  otherRecording: 'other-recording',
  rowHeight: 52,
  viewportHeight: 200,
  contentHeight: 600,
  lineTop: 208,
  expectedCenter: 134,
  bottomCenter: 400,
  top: 0,
  rowCount: 3,
  headerCount: 1,
  backgroundColor: '#315A62',
  cacheKeyPattern: /^lyrics:v1:/,
  malformed: '[00:99.00]Invalid\n[ar:Example artist]',
  repeated: '[00:01.0][00:02.50]First invented line',
  simultaneous:
    '[00:01.00]First invented line\n[00:01.000]Second invented line',
  negativeOffset: '[offset:-500]\n[00:01.00]First invented line',
  offsetResult: 500,
  positiveOffset: '[offset:500]\n[00:01.00]First invented line',
  positiveResult: 1500,
  outOfOrder: '[00:05.000]Third invented line\n[00:01.00]First invented line',
  downloaded: 'Downloaded',
  pending: 'Pending',
  skipped: 'Skipped',
  instrumental: 'Instrumental',
  failure: 'fixture-network-failure',
  fractional: '[00:01.1]First invented line',
  fractionalResult: 1100,
  flushTurns: 12,
  fontSizeValue: 'fontSize',
});
export const lyricsResponse = (overrides = {}) => ({
  recordingIdentifier: LyricsFixture.recording,
  state: LyricsFixture.downloaded,
  plainLyrics: LyricsFixture.plain,
  syncedLyrics: LyricsFixture.timed,
  ...overrides,
});
export function deferredLyrics<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<Value>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export async function settleLyrics() {
  for (
    let turn = LyricsFixture.noCalls;
    turn < LyricsFixture.flushTurns;
    turn += LyricsFixture.singleCall
  )
    await Promise.resolve();
}

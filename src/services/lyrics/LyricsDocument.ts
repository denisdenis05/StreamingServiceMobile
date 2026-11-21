export const LyricsPolicy = Object.freeze({
  millisecondsPerSecond: 1000,
  secondsPerMinute: 60,
  initialIndex: 0,
  missingIndex: -1,
  indexIncrement: 1,
  previousVisibleLines: 1,
  maximumTextCharacters: 1048576,
  maximumLines: 5000,
  fractionWidth: 3,
  fractionPadding: '0',
  decimalRadix: 10,
  lineSeparator: '\n',
  linePattern: /\r?\n/,
  timestampPattern: /\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]/g,
  leadingTimestampPattern: /^\s*\[\d+:[0-5]\d(?:[.:]\d{1,3})?\]/,
  offsetPattern: /^\s*\[offset:([+-]?\d+)\]\s*$/im,
  downloadedState: 'Downloaded',
  instrumentalState: 'Instrumental',
  pendingState: 'Pending',
  failedState: 'Failed',
  emptyText: '',
});

export interface LyricsLine {
  readonly text: string;
  readonly timestampMilliseconds: number | null;
}
export interface LyricsDocument {
  readonly lines: readonly LyricsLine[];
  readonly synchronized: boolean;
}
export interface LyricsResponse {
  readonly recordingIdentifier: string;
  readonly state: string;
  readonly plainLyrics: string | null;
  readonly syncedLyrics: string | null;
  readonly reason?: string | null;
}

export function parseLyrics(
  plainLyrics: string | null,
  syncedLyrics: string | null,
): LyricsDocument | null {
  const synchronizedText = boundedText(syncedLyrics);
  const timedLines: LyricsLine[] = [];
  const offset = Number(
    LyricsPolicy.offsetPattern.exec(synchronizedText)?.[
      LyricsPolicy.indexIncrement
    ] ?? LyricsPolicy.initialIndex,
  );
  for (const sourceLine of synchronizedText
    .split(LyricsPolicy.linePattern)
    .slice(LyricsPolicy.initialIndex, LyricsPolicy.maximumLines)) {
    if (!LyricsPolicy.leadingTimestampPattern.test(sourceLine)) continue;
    const pattern = new RegExp(LyricsPolicy.timestampPattern);
    const matches = [...sourceLine.matchAll(pattern)];
    let textStart: number = LyricsPolicy.initialIndex;
    for (const match of matches) {
      if (
        sourceLine.slice(textStart, match.index).trim() !==
        LyricsPolicy.emptyText
      )
        break;
      textStart =
        (match.index ?? LyricsPolicy.initialIndex) +
        match[LyricsPolicy.initialIndex]!.length;
    }
    const text = sourceLine.slice(textStart).trim();
    for (const match of matches.filter(
      candidate => (candidate.index ?? LyricsPolicy.initialIndex) < textStart,
    )) {
      const [, minutes, seconds, fraction = LyricsPolicy.emptyText] = match;
      const timestamp =
        (Number(minutes) * LyricsPolicy.secondsPerMinute + Number(seconds)) *
          LyricsPolicy.millisecondsPerSecond +
        Number(
          fraction.padEnd(
            LyricsPolicy.fractionWidth,
            LyricsPolicy.fractionPadding,
          ),
        ) +
        offset;
      if (Number.isFinite(timestamp))
        timedLines.push({
          text,
          timestampMilliseconds: Math.max(LyricsPolicy.initialIndex, timestamp),
        });
      if (timedLines.length >= LyricsPolicy.maximumLines) break;
    }
    if (timedLines.length >= LyricsPolicy.maximumLines) break;
  }
  timedLines.sort(
    (previous, next) =>
      previous.timestampMilliseconds! - next.timestampMilliseconds!,
  );
  if (timedLines.some(line => line.text.length > LyricsPolicy.initialIndex)) {
    const grouped: LyricsLine[] = [];
    for (const line of timedLines) {
      const previous = grouped[grouped.length - LyricsPolicy.indexIncrement];
      if (
        previous !== undefined &&
        previous.timestampMilliseconds === line.timestampMilliseconds
      ) {
        grouped[grouped.length - LyricsPolicy.indexIncrement] = {
          ...previous,
          text: [previous.text, line.text]
            .filter(Boolean)
            .join(LyricsPolicy.lineSeparator),
        };
      } else grouped.push(line);
    }
    return { synchronized: true, lines: grouped };
  }
  const plainText = boundedText(plainLyrics).trim();
  return plainText === LyricsPolicy.emptyText
    ? null
    : {
        synchronized: false,
        lines: plainText
          .split(LyricsPolicy.linePattern)
          .slice(LyricsPolicy.initialIndex, LyricsPolicy.maximumLines)
          .map(text => ({ text, timestampMilliseconds: null })),
      };
}

function boundedText(value: string | null): string {
  return typeof value === 'string' &&
    value.length <= LyricsPolicy.maximumTextCharacters
    ? value
    : LyricsPolicy.emptyText;
}

export function activeLyricsLine(
  document: LyricsDocument | null,
  positionMilliseconds: number,
): number {
  if (!document?.synchronized || !Number.isFinite(positionMilliseconds))
    return LyricsPolicy.missingIndex;
  let lower: number = LyricsPolicy.initialIndex;
  let upper = document.lines.length;
  const binaryDivision = 2;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / binaryDivision);
    if (document.lines[middle]!.timestampMilliseconds! <= positionMilliseconds)
      lower = middle + LyricsPolicy.indexIncrement;
    else upper = middle;
  }
  return lower - LyricsPolicy.indexIncrement;
}

export function compactLyricsAnchor(activeIndex: number): number {
  return Math.max(
    LyricsPolicy.initialIndex,
    activeIndex - LyricsPolicy.previousVisibleLines,
  );
}

export function centeredLyricsOffset(
  lineTop: number,
  lineHeight: number,
  viewportHeight: number,
  contentHeight: number,
): number {
  const centerDivision = 2;
  return Math.max(
    LyricsPolicy.initialIndex,
    Math.min(
      contentHeight - viewportHeight,
      lineTop + lineHeight / centerDivision - viewportHeight / centerDivision,
    ),
  );
}

export function equivalentLyrics(
  previous: LyricsDocument | null,
  next: LyricsDocument | null,
): boolean {
  return (
    previous === next ||
    (previous !== null &&
      next !== null &&
      previous.synchronized === next.synchronized &&
      previous.lines.length === next.lines.length &&
      previous.lines.every(
        (line, index) =>
          line.text === next.lines[index]?.text &&
          line.timestampMilliseconds ===
            next.lines[index]?.timestampMilliseconds,
      ))
  );
}

import {
  activeLyricsLine,
  centeredLyricsOffset,
  compactLyricsAnchor,
  LyricsPolicy,
  parseLyrics,
} from '../src/services/lyrics/LyricsDocument';
import { LyricsFixture } from './lyrics-fixtures';
const document = parseLyrics(LyricsFixture.plain, LyricsFixture.timed)!;
test('Parses milliseconds and chooses the current line exactly at timestamp boundaries', () => {
  expect(document.synchronized).toBe(true);
  expect(document.lines.map(line => line.timestampMilliseconds)).toEqual([
    LyricsFixture.firstTimestamp,
    LyricsFixture.secondTimestamp,
    LyricsFixture.thirdTimestamp,
  ]);
  expect(activeLyricsLine(document, LyricsFixture.beforeFirst)).toBe(
    LyricsPolicy.missingIndex,
  );
  expect(activeLyricsLine(document, LyricsFixture.firstTimestamp)).toBe(
    LyricsFixture.first,
  );
  expect(activeLyricsLine(document, LyricsFixture.secondTimestamp)).toBe(
    LyricsFixture.second,
  );
  expect(activeLyricsLine(document, LyricsFixture.endPosition)).toBe(
    LyricsFixture.third,
  );
});
test('Rewinds immediately after a seek and rejects nonfinite progress', () => {
  expect(activeLyricsLine(document, LyricsFixture.thirdTimestamp)).toBe(
    LyricsFixture.third,
  );
  expect(activeLyricsLine(document, LyricsFixture.firstTimestamp)).toBe(
    LyricsFixture.first,
  );
  expect(activeLyricsLine(document, Number.NaN)).toBe(
    LyricsPolicy.missingIndex,
  );
});
test('The compact first line stays for the second line then shifts to the previous line', () => {
  expect(compactLyricsAnchor(LyricsFixture.first)).toBe(LyricsFixture.first);
  expect(compactLyricsAnchor(LyricsFixture.second)).toBe(LyricsFixture.first);
  expect(compactLyricsAnchor(LyricsFixture.third)).toBe(LyricsFixture.second);
});
test('Expanded centering clamps to the beginning and end of the document', () => {
  expect(
    centeredLyricsOffset(
      LyricsFixture.lineTop,
      LyricsFixture.rowHeight,
      LyricsFixture.viewportHeight,
      LyricsFixture.contentHeight,
    ),
  ).toBe(LyricsFixture.expectedCenter);
  expect(
    centeredLyricsOffset(
      LyricsFixture.top,
      LyricsFixture.rowHeight,
      LyricsFixture.viewportHeight,
      LyricsFixture.contentHeight,
    ),
  ).toBe(LyricsFixture.top);
  expect(
    centeredLyricsOffset(
      LyricsFixture.contentHeight,
      LyricsFixture.rowHeight,
      LyricsFixture.viewportHeight,
      LyricsFixture.contentHeight,
    ),
  ).toBe(LyricsFixture.bottomCenter);
});
test('Supports repeated timestamps, ordering, fractions and global offsets', () => {
  expect(
    parseLyrics(null, LyricsFixture.repeated)!.lines.map(
      line => line.timestampMilliseconds,
    ),
  ).toEqual([LyricsFixture.firstTimestamp, LyricsFixture.secondTimestamp]);
  expect(
    parseLyrics(null, LyricsFixture.outOfOrder)!.lines.map(line => line.text),
  ).toEqual([LyricsFixture.firstText, LyricsFixture.thirdText]);
  expect(
    parseLyrics(null, LyricsFixture.negativeOffset)!.lines[LyricsFixture.first]!
      .timestampMilliseconds,
  ).toBe(LyricsFixture.offsetResult);
  expect(
    parseLyrics(null, LyricsFixture.positiveOffset)!.lines[LyricsFixture.first]!
      .timestampMilliseconds,
  ).toBe(LyricsFixture.positiveResult);
  expect(
    parseLyrics(null, LyricsFixture.fractional)!.lines[LyricsFixture.first]!
      .timestampMilliseconds,
  ).toBe(LyricsFixture.fractionalResult);
});
test('Simultaneous lyrics form one active row instead of hiding the first line', () => {
  const simultaneous = parseLyrics(null, LyricsFixture.simultaneous)!;
  expect(simultaneous.lines).toHaveLength(LyricsFixture.singleCall);
  expect(simultaneous.lines[LyricsFixture.first]!.text).toBe(
    [LyricsFixture.firstText, LyricsFixture.secondText].join(
      LyricsPolicy.lineSeparator,
    ),
  );
});
test('Plain lyrics are readable but never acquire invented timestamps', () => {
  const plain = parseLyrics(LyricsFixture.plain, LyricsFixture.malformed)!;
  expect(plain.synchronized).toBe(false);
  expect(plain.lines).toHaveLength(LyricsFixture.rowCount);
  expect(plain.lines.every(line => line.timestampMilliseconds === null)).toBe(
    true,
  );
  expect(activeLyricsLine(plain, LyricsFixture.endPosition)).toBe(
    LyricsPolicy.missingIndex,
  );
});
test('Empty malformed and oversized lyric documents are bounded and unavailable', () => {
  expect(parseLyrics(null, LyricsFixture.malformed)).toBeNull();
  expect(parseLyrics(null, null)).toBeNull();
  expect(
    parseLyrics(
      LyricsFixture.firstText.repeat(LyricsPolicy.maximumTextCharacters),
      null,
    ),
  ).toBeNull();
});

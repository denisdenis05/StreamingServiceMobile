import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useLyricsCoverColor } from '../src/services/lyrics/LyricsCoverColor';
import { LyricsPanelPolicy } from '../src/components/LyricsPanel/LyricsPanelPolicy';
import { ensureContrastWithWhite } from '../src/utils/colorUtils';
import { deferredLyrics, LyricsFixture } from './lyrics-fixtures';
const mockGetColor = jest.fn();
const mockCancel = jest.fn();
const mockImage = jest.fn();
const mockModules = { CoverColor: { getColor: mockGetColor } };
jest.mock('react-native', () => ({
  get NativeModules() {
    return mockModules;
  },
}));
jest.mock('../src/services/cache/ImageDownloadService', () => ({
  requestImage: (...parameters: unknown[]) => mockImage(...parameters),
}));
const ColorFixture = Object.freeze({
  address: 'file:///fixture-cover.png',
  nextAddress: 'file:///next-cover.png',
  bright: '#EEEEEE',
  invalid: 'invalid-color',
  emptyText: '',
});
const track = {
  entryIdentifier: LyricsFixture.recording,
  recordingIdentifier: LyricsFixture.recording,
  albumIdentifier: LyricsFixture.recording,
  title: LyricsFixture.firstText,
  artist: LyricsFixture.account,
  artworkAddress: ColorFixture.address,
  isLocalCached: true,
};
let color: string;
let renderer: ReactTestRenderer;
function Probe({ replacement = false }) {
  color = useLyricsCoverColor(
    replacement
      ? {
          ...track,
          albumIdentifier: LyricsFixture.otherRecording,
          artworkAddress: ColorFixture.nextAddress,
        }
      : track,
  );
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockImage.mockReturnValue({
    result: Promise.resolve(ColorFixture.address),
    cancel: mockCancel,
  });
  mockGetColor.mockResolvedValue(ColorFixture.bright);
});
afterEach(() => act(() => renderer?.unmount()));
test('Cached cover extraction reuses the existing contrast method for white lyric text', async () => {
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(mockGetColor).toHaveBeenCalledWith(ColorFixture.address);
  expect(color).toBe(ensureContrastWithWhite(ColorFixture.bright));
});
test('Late cover colors cannot overwrite a new song and old image work is canceled', async () => {
  const pending = deferredLyrics<string>();
  mockGetColor.mockReturnValueOnce(pending.promise);
  await act(async () => {
    renderer = create(<Probe />);
  });
  mockGetColor.mockResolvedValue(LyricsFixture.backgroundColor);
  await act(async () => renderer.update(<Probe replacement />));
  await act(async () => pending.resolve(ColorFixture.bright));
  expect(color).toBe(ensureContrastWithWhite(LyricsFixture.backgroundColor));
  expect(mockCancel).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});
test('Invalid native colors and extraction failures retain a readable fallback', async () => {
  mockGetColor.mockResolvedValue(ColorFixture.invalid);
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(color).toBe(LyricsPanelPolicy.backgroundFallback);
  mockGetColor.mockRejectedValue(new Error(LyricsFixture.failure));
  await act(async () => renderer.update(<Probe replacement />));
  expect(color).toBe(LyricsPanelPolicy.backgroundFallback);
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import Playing from '../src/pages/Playing/Playing.render';
import { PlayingLyrics } from '../src/components/LyricsPanel/PlayingLyrics';
import { ContentContainer } from '../src/pages/Playing/Playing.style';
import {
  PlayingControlButton,
  PlayingControlButtonPolicy,
} from '../src/pages/Playing/PlayingControlButton';
import { LyricsFixture } from './lyrics-fixtures';
import { parseLyrics } from '../src/services/lyrics/LyricsDocument';
const mockSeek = jest.fn();
const mockPlay = jest.fn();
const mockTrack = {
  entryIdentifier: 'lyrics-entry',
  recordingIdentifier: LyricsFixture.recording,
  title: LyricsFixture.firstText,
  artist: LyricsFixture.account,
  album: LyricsFixture.secondText,
  isLocalCached: true,
};
const mockQueue = {
  currentTrack: mockTrack,
  isPlaying: false,
  isLoading: false,
  canSeek: true,
  play: mockPlay,
  pause: jest.fn(),
  playNext: jest.fn(),
  playPrevious: jest.fn(),
  repeatingState: 0,
  setRepeatingState: jest.fn(),
  seekToPosition: mockSeek,
  isShuffled: false,
  toggleShuffle: jest.fn(),
};
const mockJamState = { mode: 'idle', pending: false };
const mockLyricsState = {
  accountIdentifier: LyricsFixture.account,
  recordingIdentifier: LyricsFixture.recording,
  document: parseLyrics(LyricsFixture.plain, LyricsFixture.timed),
  message: null,
  pending: false,
  retryable: false,
};
jest.mock('../MusicProvider', () => ({ useMusicQueue: () => mockQueue }));
jest.mock('../src/services/RecordingLikePlatform', () => ({
  useRecordingLike: () => ({
    state: { isLiked: true, pending: false, failure: null },
    toggle: jest.fn(),
    refresh: jest.fn(),
  }),
}));
jest.mock('../src/services/lyrics/LyricsPlatform', () => ({
  useLyrics: () => ({ state: mockLyricsState, refresh: jest.fn() }),
}));
jest.mock('../src/services/lyrics/LyricsCoverColor', () => ({
  useLyricsCoverColor: () => '#315A62',
}));
jest.mock('../src/components/LyricsPanel/PlayingLyrics', () => ({
  PlayingLyrics: () => null,
}));
jest.mock('../src/services/PlayerJamRuntime', () => ({
  playerJam: {
    subscribe: () => () => undefined,
    getSnapshot: () => mockJamState,
  },
}));
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../src/components/AudioProgressBar', () => () => null);
jest.mock('../src/components/ContextMenu/ContextMenu.render', () => () => null);
jest.mock('../src/constants/navigation', () => ({ menuOptions: [] }));
jest.mock('../src/pages/Playing/SpotifyPlayerJam.render', () => () => null);
jest.mock(
  '../src/pages/Playing/RecommendationPlaybackStatus',
  () => () => null,
);
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'ControlIcon',
  Path: 'ControlPath',
  G: 'ControlGroup',
  Defs: 'ControlDefinitions',
  ClipPath: 'ControlClip',
  Rect: 'ControlRectangle',
  Filter: 'ControlFilter',
  FeFlood: 'ControlFlood',
  FeColorMatrix: 'ControlColorMatrix',
  FeOffset: 'ControlOffset',
  FeGaussianBlur: 'ControlBlur',
  FeComposite: 'ControlComposite',
  FeBlend: 'ControlBlend',
}));
const navigation = { goBack: jest.fn() };
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockQueue.canSeek = true;
});
afterEach(() => act(() => renderer?.unmount()));
function render() {
  act(() => {
    renderer = create(<Playing navigation={navigation} />);
  });
}
test('Expansion covers Playing and hides underlying controls until the minimize callback runs', () => {
  render();
  expect(renderer.root.findByType(PlayingLyrics).props.expanded).toBe(false);
  act(() => renderer.root.findByType(PlayingLyrics).props.onExpand());
  expect(renderer.root.findByType(PlayingLyrics).props.expanded).toBe(true);
  expect(renderer.root.findByType(ContentContainer).props.disabled).toBe(true);
  act(() => renderer.root.findByType(PlayingLyrics).props.onMinimize());
  expect(renderer.root.findByType(PlayingLyrics).props.expanded).toBe(false);
  expect(renderer.root.findByType(ContentContainer).props.disabled).toBe(false);
});
test('Lyrics seeking uses the existing music command and native capability disables it', () => {
  render();
  act(() =>
    renderer.root
      .findByType(PlayingLyrics)
      .props.onSeek(LyricsFixture.thirdSeconds),
  );
  expect(mockSeek).toHaveBeenCalledWith(LyricsFixture.thirdSeconds);
  mockQueue.canSeek = false;
  act(() => renderer.update(<Playing navigation={navigation} />));
  expect(renderer.root.findByType(PlayingLyrics).props.seekEnabled).toBe(false);
});
test('Normalized controls retain their playback commands and accessible labels', () => {
  render();
  const playButton = renderer.root
    .findAllByType(PlayingControlButton)
    .find(button => button.props.label === PlayingControlButtonPolicy.play)!;
  act(() => playButton.props.onPress());
  expect(mockPlay).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});

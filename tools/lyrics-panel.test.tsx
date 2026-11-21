import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Animated, StyleSheet } from 'react-native';
import { LyricsPanel } from '../src/components/LyricsPanel/LyricsPanel';
import { LyricsPanelPolicy } from '../src/components/LyricsPanel/LyricsPanelPolicy';
import {
  LyricsPolicy,
  parseLyrics,
} from '../src/services/lyrics/LyricsDocument';
import { LyricsFixture } from './lyrics-fixtures';
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'LyricsIcon',
  Path: 'LyricsIconPath',
}));
const mockScrollTo = jest.fn();
const mockViewportRender = jest.fn();
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const react = require('react');
  return {
    Dimensions: native.Dimensions,
    Animated: native.Animated,
    BackHandler: native.BackHandler,
    Pressable: native.Pressable,
    StyleSheet: native.StyleSheet,
    Text: native.Text,
    View: native.View,
    ScrollView: react.forwardRef((properties: object, reference: unknown) => {
      mockViewportRender();
      react.useImperativeHandle(reference, () => ({ scrollTo: mockScrollTo }));
      return react.createElement(native.View, properties);
    }),
  };
});
const document = parseLyrics(LyricsFixture.plain, LyricsFixture.timed)!;
const onExpand = jest.fn();
const onMinimize = jest.fn();
const onSeek = jest.fn();
const onRetry = jest.fn();
let renderer: ReactTestRenderer;
const properties = {
  document,
  positionMilliseconds: LyricsFixture.firstTimestamp,
  backgroundColor: LyricsFixture.backgroundColor,
  expanded: false,
  onExpand,
  onMinimize,
  onSeek,
  seekEnabled: true,
  message: null,
  onRetry,
  retryable: false,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Animated, 'timing').mockImplementation((value, configuration) => ({
    start: callback => {
      (value as Animated.Value).setValue(configuration.toValue as number);
      callback?.({ finished: true });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});
afterEach(() => {
  act(() => renderer?.unmount());
  jest.restoreAllMocks();
});
function render(overrides = {}) {
  act(() => {
    renderer = create(<LyricsPanel {...properties} {...overrides} />);
  });
}
function update(overrides = {}) {
  act(() => renderer.update(<LyricsPanel {...properties} {...overrides} />));
}
const viewport = () =>
  renderer.root.findByProps({
    testID: LyricsPanelPolicy.viewportTestIdentifier,
  });
const row = (index: number) =>
  renderer.root.findByProps({
    testID: LyricsPanelPolicy.lineTestPrefix + index,
  });
function measure() {
  act(() => {
    viewport().props.onLayout({
      nativeEvent: { layout: { height: LyricsFixture.viewportHeight } },
    });
    viewport().props.onContentSizeChange(
      LyricsFixture.top,
      LyricsFixture.contentHeight,
    );
    document.lines.forEach((_line, index) =>
      row(index).props.onLayout({
        nativeEvent: {
          layout: {
            y: index * LyricsFixture.rowHeight,
            height: LyricsFixture.rowHeight,
          },
        },
      }),
    );
  });
}
test('Header remains outside scrolling lyrics and expand/minimize have independent controls', () => {
  render();
  expect(
    viewport().findAllByProps({
      testID: LyricsPanelPolicy.headerTestIdentifier,
    }),
  ).toHaveLength(LyricsFixture.noCalls);
  expect(
    renderer.root.findByProps({
      testID: LyricsPanelPolicy.headerTestIdentifier,
    }),
  ).toBeDefined();
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: LyricsPanelPolicy.expandLabel })
      .props.onPress(),
  );
  expect(onExpand).toHaveBeenCalledTimes(LyricsFixture.singleCall);
  update({ expanded: true });
  expect(
    renderer.root.findAllByProps({
      accessibilityLabel: LyricsPanelPolicy.expandLabel,
    }),
  ).toHaveLength(LyricsFixture.noCalls);
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: LyricsPanelPolicy.minimizeLabel })
      .props.onPress(),
  );
  expect(onMinimize).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});
test('First and second lyrics retain their positions and the third moves the previous row to the top', () => {
  render();
  measure();
  expect(row(LyricsFixture.first).props.accessibilityState.selected).toBe(true);
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    y: LyricsFixture.top,
    animated: false,
  });
  update({ positionMilliseconds: LyricsFixture.secondTimestamp });
  expect(row(LyricsFixture.first).props.accessibilityState.selected).toBe(
    false,
  );
  expect(row(LyricsFixture.second).props.accessibilityState.selected).toBe(
    true,
  );
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    y: LyricsFixture.top,
    animated: true,
  });
  update({ positionMilliseconds: LyricsFixture.thirdTimestamp });
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    y: LyricsFixture.rowHeight,
    animated: true,
  });
  expect(row(LyricsFixture.third).props.accessibilityState.selected).toBe(true);
});
test('Timed rows seek through the playback command and compact taps also expand', () => {
  render();
  act(() => row(LyricsFixture.third).props.onPress());
  expect(onSeek).toHaveBeenCalledWith(LyricsFixture.thirdSeconds);
  expect(onExpand).toHaveBeenCalledTimes(LyricsFixture.singleCall);
  update({ expanded: true });
  act(() => row(LyricsFixture.second).props.onPress());
  expect(onSeek).toHaveBeenLastCalledWith(
    LyricsFixture.secondTimestamp / LyricsPolicy.millisecondsPerSecond,
  );
  expect(onMinimize).not.toHaveBeenCalled();
  expect(onExpand).toHaveBeenCalledTimes(LyricsFixture.singleCall);
});
test('Expanded automatic scrolling pauses after a user drag and resets on both view changes', () => {
  render({ expanded: true });
  measure();
  act(() => viewport().props.onScrollBeginDrag());
  mockScrollTo.mockClear();
  update({
    expanded: true,
    positionMilliseconds: LyricsFixture.thirdTimestamp,
  });
  expect(mockScrollTo).not.toHaveBeenCalled();
  update({
    expanded: false,
    positionMilliseconds: LyricsFixture.thirdTimestamp,
  });
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    y: LyricsFixture.rowHeight,
    animated: false,
  });
  update({
    expanded: true,
    positionMilliseconds: LyricsFixture.thirdTimestamp,
  });
  expect(mockScrollTo).toHaveBeenCalled();
});
test('Plain lyrics remain visible without seeking or fabricated active lines', () => {
  render({ document: parseLyrics(LyricsFixture.plain, null) });
  expect(row(LyricsFixture.first).props.disabled).toBe(true);
  expect(row(LyricsFixture.first).props.accessibilityState.selected).toBe(
    false,
  );
});
test('Jam control restrictions prevent timed-line seeking', () => {
  render({ seekEnabled: false });
  expect(row(LyricsFixture.first).props.disabled).toBe(true);
  act(() => row(LyricsFixture.first).props.onPress());
  expect(onSeek).not.toHaveBeenCalled();
});
test('Highlight transitions animate white emphasis and the larger font smoothly', () => {
  render();
  update({ positionMilliseconds: LyricsFixture.secondTimestamp });
  expect(Animated.timing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      duration: LyricsPanelPolicy.transitionMilliseconds,
      useNativeDriver: false,
      toValue: LyricsPanelPolicy.activeProgress,
    }),
  );
});
test('Unavailable lyrics offer retry without manufacturing lyric text', () => {
  render({ document: null, message: LyricsFixture.failure, retryable: true });
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: LyricsPanelPolicy.retryLabel })
      .props.onPress(),
  );
  expect(onRetry).toHaveBeenCalledTimes(LyricsFixture.singleCall);
  expect(
    renderer.root.findAllByProps({
      testID: LyricsPanelPolicy.lineTestPrefix + LyricsFixture.first,
    }),
  ).toHaveLength(LyricsFixture.noCalls);
});

test('Playback frames within one lyric do not rebuild the scroll content', () => {
  render();
  measure();
  mockViewportRender.mockClear();
  update({
    positionMilliseconds:
      LyricsFixture.firstTimestamp + LyricsFixture.singleCall,
  });
  expect(mockViewportRender).not.toHaveBeenCalled();
});

test('Dragging the outer Playing page over the compact card cannot disable lyric synchronization', () => {
  render();
  measure();
  act(() => viewport().props.onScrollBeginDrag());
  mockScrollTo.mockClear();
  update({ positionMilliseconds: LyricsFixture.thirdTimestamp });
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    y: LyricsFixture.rowHeight,
    animated: true,
  });
});

test('Only expanded lyrics accept manual scrolling and nested scrolling', () => {
  render();
  expect(viewport().props.scrollEnabled).toBe(false);
  expect(viewport().props.nestedScrollEnabled).toBe(false);
  expect(viewport().props.bounces).toBe(false);
  expect(viewport().props.scrollsToTop).toBe(false);
  update({ expanded: true });
  expect(viewport().props.scrollEnabled).toBe(true);
  expect(viewport().props.nestedScrollEnabled).toBe(true);
  expect(viewport().props.bounces).toBe(true);
  expect(viewport().props.scrollsToTop).toBe(true);
});

test('Compact lyrics reserve enough trailing space to keep the final current line on the second row', () => {
  render();
  measure();
  expect(
    StyleSheet.flatten(viewport().props.contentContainerStyle).paddingBottom,
  ).toBe(LyricsFixture.viewportHeight);
  update({ positionMilliseconds: LyricsFixture.thirdTimestamp });
  expect(mockScrollTo).toHaveBeenLastCalledWith({
    y: LyricsFixture.rowHeight,
    animated: true,
  });
  update({ expanded: true });
  expect(
    StyleSheet.flatten(viewport().props.contentContainerStyle).paddingBottom,
  ).toBe(LyricsPanelPolicy.textInset);
});

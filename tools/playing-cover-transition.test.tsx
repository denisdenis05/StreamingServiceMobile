import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Animated, StyleSheet } from 'react-native';
import { AlbumCover } from '../src/pages/Playing/Playing.style';
import {
  CoverNavigation,
  CoverTransitionPolicy,
  PlayingCoverTransition,
} from '../src/pages/Playing/PlayingCoverTransition';

jest.mock('../src/components/CachedImage', () => () => null);
const first = {
  entryIdentifier: 'first-entry',
  title: 'First',
  artist: 'Artist',
  isLocalCached: true,
  artworkAddress: 'file:///first.png',
};
const second = {
  ...first,
  entryIdentifier: 'second-entry',
  artworkAddress: 'file:///second.png',
};
const third = {
  ...first,
  entryIdentifier: 'third-entry',
  artworkAddress: 'file:///third.png',
};
let renderer: ReactTestRenderer;
let animations: {
  completion?: (result: { finished: boolean }) => void;
  stop: jest.Mock;
}[];
beforeEach(() => {
  animations = [];
  jest.spyOn(Animated, 'timing').mockImplementation(() => {
    const animation = {
      start: (completion?: (result: { finished: boolean }) => void) => {
        animation.completion = completion;
      },
      completion: undefined as
        | ((result: { finished: boolean }) => void)
        | undefined,
      stop: jest.fn(),
      reset: jest.fn(),
    };
    animations.push(animation);
    return animation;
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  jest.restoreAllMocks();
});
function render(track = first, navigation: CoverNavigation | null = null) {
  return <PlayingCoverTransition track={track} navigation={navigation} />;
}
function layer(identifier: string) {
  return renderer.root.findAllByProps({ testID: identifier })[0];
}
function translation(identifier: string) {
  return StyleSheet.flatten(
    layer(identifier).props.style,
  ).transform[0].translateX.__getValue();
}
test('Initial artwork appears centered without a transition', () => {
  act(() => {
    renderer = create(render());
  });
  expect(translation('playing-current-cover')).toBe(
    CoverTransitionPolicy.startProgress,
  );
  expect(layer('playing-outgoing-cover')).toBeUndefined();
  expect(animations).toHaveLength(0);
});
test.each(['next', 'previous'] as const)(
  '%s retains the outgoing cover and slides the incoming cover from the matching side',
  direction => {
    act(() => {
      renderer = create(render());
    });
    act(() =>
      renderer.update(
        render(second, { entryIdentifier: first.entryIdentifier, direction }),
      ),
    );
    expect(layer('playing-outgoing-cover')).toBeDefined();
    expect(
      renderer.root.findAllByType(AlbumCover).map(cover => cover.props.cover),
    ).toEqual([first.artworkAddress, second.artworkAddress]);
    const incoming = translation('playing-current-cover');
    expect(direction === 'next' ? incoming > 0 : incoming < 0).toBe(true);
    expect(Animated.timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        duration: CoverTransitionPolicy.durationMilliseconds,
        useNativeDriver: true,
      }),
    );
    act(() => animations[0].completion?.({ finished: true }));
    expect(layer('playing-outgoing-cover')).toBeUndefined();
  },
);
test('Rapid skips stop earlier animation and stale completion cannot remove the latest outgoing cover', () => {
  act(() => {
    renderer = create(render());
  });
  act(() => renderer.update(render(second)));
  act(() => renderer.update(render(third)));
  expect(animations[0].stop).toHaveBeenCalled();
  act(() => animations[0].completion?.({ finished: true }));
  expect(layer('playing-outgoing-cover')).toBeDefined();
  expect(
    renderer.root.findAllByType(AlbumCover).map(cover => cover.props.cover),
  ).toEqual([second.artworkAddress, third.artworkAddress]);
  act(() => animations[1].completion?.({ finished: true }));
  expect(layer('playing-outgoing-cover')).toBeUndefined();
});
test('Metadata refresh for the same occurrence preserves the running transition', () => {
  act(() => {
    renderer = create(render());
  });
  act(() => renderer.update(render(second)));
  act(() => renderer.update(render({ ...second, title: 'Updated' })));
  expect(animations).toHaveLength(1);
  expect(animations[0].stop).not.toHaveBeenCalled();
});
test('Automatic advance defaults forward after an earlier Previous action', () => {
  const navigation = {
    entryIdentifier: first.entryIdentifier,
    direction: 'previous' as const,
  };
  act(() => {
    renderer = create(render());
  });
  act(() => renderer.update(render(second, navigation)));
  act(() => renderer.update(render(third, navigation)));
  expect(translation('playing-current-cover')).toBeGreaterThan(0);
});
test('Clearing the track removes retained artwork and cancels animation', () => {
  act(() => {
    renderer = create(render());
  });
  act(() => renderer.update(render(second)));
  act(() =>
    renderer.update(<PlayingCoverTransition track={null} navigation={null} />),
  );
  expect(animations[0].stop).toHaveBeenCalled();
  expect(layer('playing-outgoing-cover')).toBeUndefined();
  expect(translation('playing-current-cover')).toBe(
    CoverTransitionPolicy.startProgress,
  );
});

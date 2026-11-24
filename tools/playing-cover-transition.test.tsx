import React, { createRef } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import {
  Animated,
  PanResponder,
  PanResponderCallbacks,
  StyleSheet,
} from 'react-native';
import { AlbumCover } from '../src/pages/Playing/Playing.style';
import {
  CoverDirection,
  CoverGesturePolicy,
} from '../src/pages/Playing/CoverGestureController';
import {
  CoverPresentationPolicy,
  PlayingCoverHandle,
  PlayingCoverTransition,
} from '../src/pages/Playing/PlayingCoverTransition';
import { CoverFixture, coverTracks } from './cover-gesture-fixtures';

jest.mock('../src/components/CachedImage', () => () => null);
interface TestAnimation {
  readonly value: Animated.Value;
  readonly endOffsetPixels: number;
  completion?: (result: { finished: boolean }) => void;
  readonly stop: jest.Mock;
}
let renderer: ReactTestRenderer;
let animations: TestAnimation[];
let responder: PanResponderCallbacks;
const reference = createRef<PlayingCoverHandle>();
const next = jest.fn(
  async (): Promise<string | null> => CoverFixture.thirdIdentifier,
);
const previous = jest.fn(
  async (): Promise<string | null> => CoverFixture.firstIdentifier,
);
const select = jest.fn(async (_entryIdentifier: string) => undefined);
const busy = jest.fn();
const gestureEvent = {} as Parameters<
  NonNullable<PanResponderCallbacks['onPanResponderGrant']>
>[0];
function gesture(
  horizontalDistancePixels: number,
  horizontalVelocityPixelsPerMillisecond: number = CoverFixture.stationaryVelocityPixelsPerMillisecond,
  verticalDistancePixels: number = CoverFixture.initialOffsetPixels,
) {
  return {
    dx: horizontalDistancePixels,
    dy: verticalDistancePixels,
    vx: horizontalVelocityPixelsPerMillisecond,
  } as Parameters<NonNullable<PanResponderCallbacks['onPanResponderMove']>>[1];
}
function render(index: number = CoverFixture.secondIndex, disabled = false) {
  return (
    <PlayingCoverTransition
      ref={reference}
      track={coverTracks[index]}
      queue={coverTracks}
      disabled={disabled}
      onNext={next}
      onPrevious={previous}
      onSelect={select}
      onBusyChange={busy}
    />
  );
}
function layer(identifier: string) {
  return renderer.root.findAllByProps({ testID: identifier })[
    CoverFixture.firstIndex
  ];
}
function translation(identifier: string): number {
  return StyleSheet.flatten(layer(identifier).props.style).transform[
    CoverFixture.firstIndex
  ].translateX.__getValue();
}
function measure(widthPixels: number = CoverFixture.phoneWidthPixels) {
  act(() =>
    renderer.root
      .findByProps({ testID: CoverPresentationPolicy.gestureIdentifier })
      .props.onLayout({ nativeEvent: { layout: { width: widthPixels } } }),
  );
}
function frame(index: number, progress: number) {
  const animation = animations[index];
  const startOffsetPixels = (
    animation.value as Animated.Value & { __getValue(): number }
  ).__getValue();
  act(() =>
    animation.value.setValue(
      startOffsetPixels +
        (animation.endOffsetPixels - startOffsetPixels) * progress,
    ),
  );
}
function finish(index: number) {
  frame(index, CoverFixture.fullProgress);
  act(() => animations[index].completion?.({ finished: true }));
}
beforeEach(() => {
  jest.clearAllMocks();
  animations = [];
  jest.spyOn(PanResponder, 'create').mockImplementation(configuration => {
    responder = configuration;
    return { panHandlers: {} };
  });
  jest.spyOn(Animated, 'timing').mockImplementation((value, configuration) => {
    const animation: TestAnimation = {
      value: value as Animated.Value,
      endOffsetPixels: configuration.toValue as number,
      stop: jest.fn(),
    };
    animations.push(animation);
    return {
      start: completion => {
        animation.completion = completion;
      },
      stop: animation.stop,
      reset: jest.fn(),
    };
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  jest.restoreAllMocks();
});

async function buttonTransition(
  direction: CoverDirection,
  targetIndex: number,
) {
  const operation = direction === CoverDirection.Next ? next : previous;
  operation.mockResolvedValueOnce(coverTracks[targetIndex].entryIdentifier);
  act(() => {
    reference.current?.navigate(direction);
  });
  await act(async () => {
    await Promise.resolve();
  });
  act(() => renderer.update(render(targetIndex)));
}

test('Next moves the retained current cover left while its neighbor moves continuously from the right', async () => {
  act(() => {
    renderer = create(render(CoverFixture.firstIndex));
  });
  measure();
  await buttonTransition(CoverDirection.Next, CoverFixture.secondIndex);
  expect(
    layer(CoverPresentationPolicy.currentIdentifier).findByType(AlbumCover)
      .props.cover,
  ).toBe(CoverFixture.firstArtwork);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.initialOffsetPixels,
  );
  expect(translation(CoverPresentationPolicy.nextIdentifier)).toBe(
    CoverFixture.fullPhoneStepPixels,
  );
  frame(CoverFixture.firstIndex, CoverFixture.halfProgress);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    -CoverFixture.halfPhoneStepPixels,
  );
  expect(translation(CoverPresentationPolicy.nextIdentifier)).toBe(
    CoverFixture.halfPhoneStepPixels,
  );
  finish(CoverFixture.firstIndex);
  expect(
    layer(CoverPresentationPolicy.currentIdentifier).findByType(AlbumCover)
      .props.cover,
  ).toBe(CoverFixture.secondArtwork);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.initialOffsetPixels,
  );
  expect(animations).toHaveLength(CoverFixture.singleCall);
});

test('Previous reverses the outgoing and incoming motion, and the following Next reverses it again', async () => {
  act(() => {
    renderer = create(render());
  });
  measure();
  await buttonTransition(CoverDirection.Previous, CoverFixture.firstIndex);
  frame(CoverFixture.firstIndex, CoverFixture.halfProgress);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.halfPhoneStepPixels,
  );
  expect(translation(CoverPresentationPolicy.previousIdentifier)).toBe(
    -CoverFixture.halfPhoneStepPixels,
  );
  finish(CoverFixture.firstIndex);
  await buttonTransition(CoverDirection.Next, CoverFixture.secondIndex);
  frame(CoverFixture.secondIndex, CoverFixture.halfProgress);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    -CoverFixture.halfPhoneStepPixels,
  );
  expect(translation(CoverPresentationPolicy.nextIdentifier)).toBe(
    CoverFixture.halfPhoneStepPixels,
  );
  finish(CoverFixture.secondIndex);
  expect(previous).toHaveBeenCalledTimes(CoverFixture.singleCall);
  expect(next).toHaveBeenCalledTimes(CoverFixture.singleCall);
});

test('Horizontal gesture ownership leaves vertical scrolling and dismissing to the parent', () => {
  act(() => {
    renderer = create(render());
  });
  measure();
  expect(
    responder.onMoveShouldSetPanResponder?.(
      gestureEvent,
      gesture(CoverFixture.shortDragPixels),
    ),
  ).toBe(true);
  expect(
    responder.onMoveShouldSetPanResponder?.(
      gestureEvent,
      gesture(
        CoverFixture.shortDragPixels,
        CoverFixture.stationaryVelocityPixelsPerMillisecond,
        CoverFixture.verticalDragPixels,
      ),
    ),
  ).toBe(false);
  expect(
    responder.onMoveShouldSetPanResponder?.(
      gestureEvent,
      gesture(CoverFixture.smallerHorizontalPixels),
    ),
  ).toBe(false);
  act(() => renderer.update(render(CoverFixture.secondIndex, true)));
  expect(
    responder.onMoveShouldSetPanResponder?.(
      gestureEvent,
      gesture(CoverFixture.shortDragPixels),
    ),
  ).toBe(false);
});

test('While held, a fully dragged cover reveals its neighbor and reversing the finger reverses the same layers', () => {
  act(() => {
    renderer = create(render());
  });
  measure();
  act(() =>
    responder.onPanResponderGrant?.(
      gestureEvent,
      gesture(CoverFixture.initialOffsetPixels),
    ),
  );
  act(() =>
    responder.onPanResponderMove?.(
      gestureEvent,
      gesture(-CoverFixture.fullPhoneStepPixels),
    ),
  );
  expect(translation(CoverPresentationPolicy.nextIdentifier)).toBe(
    CoverFixture.initialOffsetPixels,
  );
  expect(select).not.toHaveBeenCalled();
  act(() =>
    responder.onPanResponderMove?.(
      gestureEvent,
      gesture(CoverFixture.shortDragPixels),
    ),
  );
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.shortDragPixels,
  );
  expect(translation(CoverPresentationPolicy.previousIdentifier)).toBe(
    -CoverFixture.fullPhoneStepPixels + CoverFixture.shortDragPixels,
  );
  expect(animations).toHaveLength(CoverFixture.noCalls);
});

test('A short fast release completes its current horizontal position and selects once', () => {
  act(() => {
    renderer = create(render());
  });
  measure();
  act(() =>
    responder.onPanResponderGrant?.(
      gestureEvent,
      gesture(CoverFixture.initialOffsetPixels),
    ),
  );
  act(() =>
    responder.onPanResponderMove?.(
      gestureEvent,
      gesture(-CoverFixture.shortDragPixels),
    ),
  );
  act(() =>
    responder.onPanResponderRelease?.(
      gestureEvent,
      gesture(
        -CoverFixture.shortDragPixels,
        -CoverFixture.fastVelocityPixelsPerMillisecond,
      ),
    ),
  );
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    -CoverFixture.shortDragPixels,
  );
  expect(select).toHaveBeenCalledWith(CoverFixture.thirdIdentifier);
  expect(animations[CoverFixture.firstIndex].endOffsetPixels).toBe(
    -CoverFixture.fullPhoneStepPixels,
  );
  act(() => renderer.update(render(CoverFixture.thirdIndex)));
  finish(CoverFixture.firstIndex);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.initialOffsetPixels,
  );
  expect(animations).toHaveLength(CoverFixture.singleCall);
});

test('A cancelled gesture animates from the held position instead of snapping to center', () => {
  act(() => {
    renderer = create(render());
  });
  measure();
  act(() =>
    responder.onPanResponderGrant?.(
      gestureEvent,
      gesture(CoverFixture.initialOffsetPixels),
    ),
  );
  act(() =>
    responder.onPanResponderMove?.(
      gestureEvent,
      gesture(CoverFixture.shortDragPixels),
    ),
  );
  act(() =>
    responder.onPanResponderTerminate?.(
      gestureEvent,
      gesture(CoverFixture.shortDragPixels),
    ),
  );
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.shortDragPixels,
  );
  expect(animations[CoverFixture.firstIndex].endOffsetPixels).toBe(
    CoverGesturePolicy.centeredOffsetPixels,
  );
  frame(CoverFixture.firstIndex, CoverFixture.halfProgress);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.shortDragPixels * CoverFixture.halfProgress,
  );
  finish(CoverFixture.firstIndex);
  expect(translation(CoverPresentationPolicy.currentIdentifier)).toBe(
    CoverFixture.initialOffsetPixels,
  );
  expect(select).not.toHaveBeenCalled();
});

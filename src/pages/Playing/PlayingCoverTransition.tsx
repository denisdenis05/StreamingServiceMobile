import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import type { PlaybackTrackView } from '../../services/player/PlaybackTrack';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders';
import { PlayingCardLayout } from '../../constants/playingLayout';
import { AlbumCover } from './Playing.style';
import {
  CoverDirection,
  CoverGestureController,
  CoverGesturePolicy,
  CoverPhase,
} from './CoverGestureController';

export interface PlayingCoverHandle {
  navigate(direction: CoverDirection): boolean;
}

interface PlayingCoverProperties {
  readonly track: PlaybackTrackView | null;
  readonly queue: readonly PlaybackTrackView[];
  readonly disabled: boolean;
  readonly onNext: () => Promise<string | null>;
  readonly onPrevious: () => Promise<string | null>;
  readonly onSelect: (entryIdentifier: string) => Promise<void>;
  readonly onBusyChange: (busy: boolean) => void;
}

export const CoverPresentationPolicy = Object.freeze({
  viewportIdentifier: 'playing-cover-viewport',
  gestureIdentifier: 'playing-cover-gesture',
  previousIdentifier: 'playing-previous-cover',
  currentIdentifier: 'playing-current-cover',
  nextIdentifier: 'playing-next-cover',
  fullWidth: '100%' as const,
  squareAspectRatio: 1,
  previousPosition: -1,
  currentPosition: 0,
  nextPosition: 1,
});

export const PlayingCoverTransition = forwardRef<
  PlayingCoverHandle,
  PlayingCoverProperties
>(function PlayingCoverTransition(properties, reference) {
  const offset = useRef(
    new Animated.Value(CoverGesturePolicy.centeredOffsetPixels),
  ).current;
  const latestProperties = useRef(properties);
  latestProperties.current = properties;
  const [controller] = useState(
    () =>
      new CoverGestureController(properties.track, properties.queue, {
        setOffset: offsetPixels => offset.setValue(offsetPixels),
        stopOffset: onStopped => offset.stopAnimation(onStopped),
        navigate: direction =>
          direction === CoverDirection.Next
            ? latestProperties.current.onNext()
            : latestProperties.current.onPrevious(),
        select: entryIdentifier =>
          latestProperties.current.onSelect(entryIdentifier),
        scheduleTimeout: (operation, delayMilliseconds) => {
          const timeout = setTimeout(operation, delayMilliseconds);
          return () => clearTimeout(timeout);
        },
      }),
  );
  const scene = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useImperativeHandle(
    reference,
    () => ({ navigate: direction => controller.navigate(direction) }),
    [controller],
  );
  useLayoutEffect(() => {
    controller.update(properties.track, properties.queue, properties.disabled);
  }, [controller, properties.track, properties.queue, properties.disabled]);
  const { onBusyChange } = properties;
  useLayoutEffect(() => onBusyChange(scene.busy), [onBusyChange, scene.busy]);
  useLayoutEffect(() => {
    const motion = scene.motion;
    offset.stopAnimation();
    offset.setValue(
      motion?.startOffsetPixels ?? CoverGesturePolicy.centeredOffsetPixels,
    );
    if (motion === null) return;
    const animation = Animated.timing(offset, {
      toValue: motion.endOffsetPixels,
      duration: motion.durationMilliseconds,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) controller.completeMotion(motion.identifier);
    });
    return () => animation.stop();
  }, [controller, offset, scene.revision, scene.motion]);
  useEffect(() => () => controller.dispose(), [controller]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          controller.canDrag() &&
          Math.abs(gesture.dx) >
            CoverGesturePolicy.horizontalActivationPixels &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          controller.beginDrag();
        },
        onPanResponderMove: (_event, gesture) => controller.drag(gesture.dx),
        onPanResponderRelease: (_event, gesture) =>
          controller.release(gesture.vx),
        onPanResponderTerminate: () => controller.cancelDrag(),
        onPanResponderTerminationRequest: () =>
          controller.getSnapshot().phase !== CoverPhase.Dragging,
      }),
    [controller],
  );
  const layers = [
    {
      track: scene.previous,
      position: CoverPresentationPolicy.previousPosition,
      identifier: CoverPresentationPolicy.previousIdentifier,
    },
    {
      track: scene.center,
      position: CoverPresentationPolicy.currentPosition,
      identifier: CoverPresentationPolicy.currentIdentifier,
    },
    {
      track: scene.next,
      position: CoverPresentationPolicy.nextPosition,
      identifier: CoverPresentationPolicy.nextIdentifier,
    },
  ];
  return (
    <View
      testID={CoverPresentationPolicy.viewportIdentifier}
      style={styles.viewport}
    >
      <View
        testID={CoverPresentationPolicy.gestureIdentifier}
        style={styles.gesture}
        onLayout={event => controller.measure(event.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        {layers.map(layer =>
          layer.track === null ? null : (
            <Animated.View
              key={layer.track.entryIdentifier}
              testID={layer.identifier}
              accessibilityElementsHidden={
                layer.position !== CoverPresentationPolicy.currentPosition
              }
              importantForAccessibility={
                layer.position === CoverPresentationPolicy.currentPosition
                  ? 'auto'
                  : 'no-hide-descendants'
              }
              style={[
                styles.layer,
                {
                  transform: [
                    {
                      translateX: Animated.add(
                        offset,
                        layer.position * controller.stepPixels,
                      ),
                    },
                  ],
                },
              ]}
            >
              <AlbumCover
                source={{
                  uri: layer.track.artworkAddress || PLACEHOLDER_ALBUM_COVER,
                }}
                releaseId={layer.track.albumIdentifier}
                cover={layer.track.artworkAddress}
                smallCover={layer.track.smallArtworkAddress}
                verySmallCover={layer.track.thumbnailArtworkAddress}
                style={styles.cover}
              />
            </Animated.View>
          ),
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: {
    width: CoverPresentationPolicy.fullWidth,
    overflow: 'hidden',
    alignItems: 'center',
  },
  gesture: {
    width: PlayingCardLayout.width,
    aspectRatio: CoverPresentationPolicy.squareAspectRatio,
  },
  layer: { position: 'absolute', width: CoverPresentationPolicy.fullWidth },
  cover: { width: CoverPresentationPolicy.fullWidth },
});

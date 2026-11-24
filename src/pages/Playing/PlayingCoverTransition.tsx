import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import type { PlaybackTrackView } from '../../services/player/PlaybackTrack';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders';
import { PlayingCardLayout } from '../../constants/playingLayout';
import { AlbumCover } from './Playing.style';

export type CoverNavigation = {
  readonly entryIdentifier: string | undefined;
  readonly direction: 'next' | 'previous';
};

export const CoverTransitionPolicy = Object.freeze({
  durationMilliseconds: 280,
  startProgress: 0,
  endProgress: 1,
  nextDirection: 1,
  previousDirection: -1,
  viewportAspectRatio: 1 / 0.84,
});

interface CoverPresentation {
  readonly outgoing: PlaybackTrackView | null;
  readonly direction: number;
}

export function PlayingCoverTransition({
  track,
  navigation,
}: {
  track: PlaybackTrackView | null;
  navigation: CoverNavigation | null;
}) {
  const [presentation, setPresentation] = useState<CoverPresentation>({
    outgoing: null,
    direction: CoverTransitionPolicy.nextDirection,
  });
  const [viewportWidth, setViewportWidth] = useState(
    Dimensions.get('window').width,
  );
  const progress = useRef(
    new Animated.Value(CoverTransitionPolicy.endProgress),
  ).current;
  const currentTrack = useRef(track);
  const requestedNavigation = useRef(navigation);
  requestedNavigation.current = navigation;

  const entryIdentifier = track?.entryIdentifier;
  const latestTrack = useRef(track);
  latestTrack.current = track;

  useLayoutEffect(() => {
    const selectedTrack = latestTrack.current;
    const outgoing = currentTrack.current;
    currentTrack.current = selectedTrack;
    if (outgoing?.entryIdentifier === selectedTrack?.entryIdentifier) return;
    const request = requestedNavigation.current;
    const direction =
      request?.entryIdentifier === outgoing?.entryIdentifier &&
      request?.direction === 'previous'
        ? CoverTransitionPolicy.previousDirection
        : CoverTransitionPolicy.nextDirection;
    progress.stopAnimation();
    if (outgoing === null || selectedTrack === null) {
      progress.setValue(CoverTransitionPolicy.endProgress);
      setPresentation({ outgoing: null, direction });
      return;
    }
    progress.setValue(CoverTransitionPolicy.startProgress);
    setPresentation({ outgoing, direction });
    const animation = Animated.timing(progress, {
      toValue: CoverTransitionPolicy.endProgress,
      duration: CoverTransitionPolicy.durationMilliseconds,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    let active = true;
    animation.start(({ finished }) => {
      if (active && finished)
        setPresentation(current => ({ ...current, outgoing: null }));
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [entryIdentifier, progress]);

  const distance = viewportWidth * presentation.direction;
  const incomingTranslation = progress.interpolate({
    inputRange: [
      CoverTransitionPolicy.startProgress,
      CoverTransitionPolicy.endProgress,
    ],
    outputRange: [distance, CoverTransitionPolicy.startProgress],
  });
  const outgoingTranslation = progress.interpolate({
    inputRange: [
      CoverTransitionPolicy.startProgress,
      CoverTransitionPolicy.endProgress,
    ],
    outputRange: [CoverTransitionPolicy.startProgress, -distance],
  });
  const cover = (candidate: PlaybackTrackView | null) => (
    <AlbumCover
      source={{ uri: candidate?.artworkAddress || PLACEHOLDER_ALBUM_COVER }}
      releaseId={candidate?.albumIdentifier}
      cover={candidate?.artworkAddress}
      smallCover={candidate?.smallArtworkAddress}
      verySmallCover={candidate?.thumbnailArtworkAddress}
      style={styles.cover}
    />
  );
  return (
    <View
      style={styles.viewport}
      onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}
    >
      {presentation.outgoing !== null && (
        <Animated.View
          key={presentation.outgoing.entryIdentifier}
          testID="playing-outgoing-cover"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.layer,
            { transform: [{ translateX: outgoingTranslation }] },
          ]}
        >
          {cover(presentation.outgoing)}
        </Animated.View>
      )}
      <Animated.View
        key={track?.entryIdentifier}
        testID="playing-current-cover"
        style={[
          styles.layer,
          { transform: [{ translateX: incomingTranslation }] },
        ]}
      >
        {cover(track)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: '100%',
    aspectRatio: CoverTransitionPolicy.viewportAspectRatio,
    overflow: 'hidden',
    alignItems: 'center',
  },
  layer: { position: 'absolute', width: PlayingCardLayout.width },
  cover: { width: '100%' },
});

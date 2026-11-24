import {
  PlayingCoverTransition,
  PlayingCoverHandle,
} from './PlayingCoverTransition';
import { CoverDirection, CoverGesturePolicy } from './CoverGestureController';
import {
  PlayingControlButton,
  PlayingControlButtonPolicy,
} from './PlayingControlButton';
import { useRecordingLike } from '../../services/RecordingLikePlatform';
import { colors, iconSizes } from '../../constants/styling.tsx';
import HeartEmptyIcon from '../../../assets/icons/heartEmptyIcon.tsx';
import { useLyrics } from '../../services/lyrics/LyricsPlatform';
import { useLyricsCoverColor } from '../../services/lyrics/LyricsCoverColor';
import { PlayingLyrics } from '../../components/LyricsPanel/PlayingLyrics';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  Dimensions,
  PanResponder,
  StyleSheet,
} from 'react-native';
import {
  AllPlayingControlsContainer,
  BackdropContainer,
  ContentContainer,
  DragIndicator,
  HeaderContainer,
  HeaderTitle,
  SongAuthor,
  SongDescriptorContainer,
  SongDetailsContainer,
  SongTitle,
} from './Playing.style.tsx';
import ArrowDownIcon from '../../../assets/icons/arrowDownIcon.tsx';
import MoreIcon from '../../../assets/icons/moreIcon.tsx';
import HeartIcon from '../../../assets/icons/heartIcon.tsx';
import AudioProgressBar from '../../components/AudioProgressBar';

import { useMusicQueue } from '../../../MusicProvider.tsx';
import { RepeatingType } from '../../constants/types.tsx';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';
import SpotifyPlayerJam from './SpotifyPlayerJam.render';
import RecommendationPlaybackStatus from './RecommendationPlaybackStatus';
import { playerJam } from '../../services/PlayerJamRuntime';
import { SpotifyPlayerJamMode } from '../../services/spotify/SpotifyPlayerJamController';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Playing = ({ navigation }: any) => {
  const {
    currentTrack,
    queue,
    selectEntry,
    readCurrentEntryIdentifier,
    isPlaying,
    isLoading,
    play,
    pause,
    playNext,
    playPrevious,
    repeatingState,
    setRepeatingState,
    seekToPosition,
    canSeek,
    isShuffled,
    toggleShuffle,
  } = useMusicQueue();

  const coverReference = useRef<PlayingCoverHandle>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const navigateNext = useCallback(
    () => coverReference.current?.navigate(CoverDirection.Next),
    [],
  );
  const navigatePrevious = useCallback(
    () => coverReference.current?.navigate(CoverDirection.Previous),
    [],
  );

  const advanceCoverNext = useCallback(async () => {
    await playNext();
    return readCurrentEntryIdentifier();
  }, [playNext, readCurrentEntryIdentifier]);
  const advanceCoverPrevious = useCallback(async () => {
    await playPrevious();
    return readCurrentEntryIdentifier();
  }, [playPrevious, readCurrentEntryIdentifier]);

  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const { state: lyricsState, refresh: refreshLyrics } = useLyrics(
    currentTrack?.recordingIdentifier,
  );
  const lyricsColor = useLyricsCoverColor(currentTrack);
  useEffect(() => {
    setLyricsExpanded(false);
  }, [currentTrack?.entryIdentifier]);
  const jam = useSyncExternalStore(playerJam.subscribe, playerJam.getSnapshot);
  const sharing =
    jam.mode === SpotifyPlayerJamMode.Hosting ||
    jam.mode === SpotifyPlayerJamMode.Following ||
    jam.mode === SpotifyPlayerJamMode.Resolving;
  const controlsDisabled =
    jam.pending ||
    jam.mode === SpotifyPlayerJamMode.Preparing ||
    jam.mode === SpotifyPlayerJamMode.Resolving ||
    jam.mode === SpotifyPlayerJamMode.Stopping ||
    (jam.mode === SpotifyPlayerJamMode.Following &&
      !jam.remoteControlsAvailable);
  const selectCoverEntry = useCallback(
    (entryIdentifier: string) => {
      if (jam.mode !== SpotifyPlayerJamMode.Following)
        return selectEntry(entryIdentifier);
      const currentIndex = queue.findIndex(
        entry => entry.entryIdentifier === currentTrack?.entryIdentifier,
      );
      const targetIndex = queue.findIndex(
        entry => entry.entryIdentifier === entryIdentifier,
      );
      if (
        currentIndex === CoverGesturePolicy.missingQueueIndex ||
        targetIndex === CoverGesturePolicy.missingQueueIndex ||
        currentIndex === targetIndex
      )
        return Promise.resolve();
      return targetIndex > currentIndex ? playNext() : playPrevious();
    },
    [
      currentTrack?.entryIdentifier,
      jam.mode,
      playNext,
      playPrevious,
      queue,
      selectEntry,
    ],
  );

  const {
    state: preferenceState,
    toggle: toggleRecordingLike,
    refresh: refreshRecordingLike,
  } = useRecordingLike(currentTrack?.recordingIdentifier);
  const toggleLike = useCallback(() => {
    void toggleRecordingLike({
      title: currentTrack?.title,
      artist: currentTrack?.artist,
      album: currentTrack?.album,
      cover: currentTrack?.artworkAddress,
    });
  }, [toggleRecordingLike, currentTrack]);
  const preferenceDisabled =
    preferenceState.pending || preferenceState.isLiked === null;

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const translateY = useRef(new Animated.Value(0)).current;
  const contentScrollOffset = useRef<number>(PlayingScrollPolicy.startOffset);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        contentScrollOffset.current <= PlayingScrollPolicy.startOffset &&
        gestureState.dy > 0 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 300,
            useNativeDriver: true,
          }).start(() => navigation.goBack());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const handleMorePress = useCallback((event: any) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setMenuVisible(true);
  }, []);

  const handleRepeatCycle = useCallback(() => {
    if (repeatingState === RepeatingType.None)
      setRepeatingState(RepeatingType.Song);
    else if (repeatingState === RepeatingType.Song)
      setRepeatingState(RepeatingType.Album);
    else setRepeatingState(RepeatingType.None);
  }, [repeatingState, setRepeatingState]);

  useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const lyricsPanel =
    currentTrack === null ? null : (
      <PlayingLyrics
        key={currentTrack.entryIdentifier}
        state={lyricsState}
        entryIdentifier={currentTrack.entryIdentifier}
        backgroundColor={lyricsColor}
        expanded={lyricsExpanded}
        onExpand={() => setLyricsExpanded(true)}
        onMinimize={() => setLyricsExpanded(false)}
        onSeek={seekToPosition}
        seekEnabled={!controlsDisabled && canSeek && !isLoading}
        onRetry={() => {
          void refreshLyrics();
        }}
      />
    );
  return (
    <BackdropContainer>
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        {...(lyricsExpanded ? {} : panResponder.panHandlers)}
      >
        <ContentContainer
          disabled={lyricsExpanded}
          onScroll={event => {
            contentScrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
        >
          <DragIndicator />
          <HeaderContainer>
            <ArrowDownIcon
              height={iconSizes.md}
              onPress={navigation.goBack}
              fill={colors.normalText}
            />
            <HeaderTitle>Playing {currentTrack?.album}</HeaderTitle>
            <MoreIcon
              height={iconSizes.md}
              fill={colors.normalText}
              onPress={handleMorePress}
            />
          </HeaderContainer>
          <PlayingCoverTransition
            ref={coverReference}
            track={currentTrack}
            queue={queue}
            disabled={controlsDisabled || lyricsExpanded}
            onNext={advanceCoverNext}
            onPrevious={advanceCoverPrevious}
            onSelect={selectCoverEntry}
            onBusyChange={setCoverBusy}
          />
          <SongDetailsContainer>
            <SongDescriptorContainer>
              <SongTitle>{currentTrack?.title}</SongTitle>
              <SongAuthor>{currentTrack?.artist}</SongAuthor>
            </SongDescriptorContainer>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                preferenceState.pending
                  ? PlayingPreferenceMessages.checking
                  : preferenceState.isLiked === null
                  ? PlayingPreferenceMessages.unknown
                  : preferenceState.isLiked
                  ? PlayingPreferenceMessages.remove
                  : PlayingPreferenceMessages.add
              }
              accessibilityState={{
                disabled: preferenceDisabled,
                busy: preferenceState.pending,
                selected: preferenceState.isLiked === true,
              }}
              disabled={preferenceDisabled}
              onPress={toggleLike}
              style={styles.heartTarget}
            >
              {preferenceState.pending ? (
                <ActivityIndicator color={colors.normalText} />
              ) : preferenceState.isLiked === null ? (
                <Text style={styles.heartFailureText}>
                  {PlayingPreferenceMessages.unknownSymbol}
                </Text>
              ) : preferenceState.isLiked ? (
                <HeartIcon height={iconSizes.md} fill={colors.accentPrimary} />
              ) : (
                <HeartEmptyIcon
                  height={iconSizes.md}
                  fill={colors.normalText}
                />
              )}
            </Pressable>
          </SongDetailsContainer>
          {preferenceState.failure !== null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={PlayingPreferenceMessages.retry}
              onPress={() => {
                void refreshRecordingLike();
              }}
              style={styles.heartFailure}
            >
              <Text style={styles.heartFailureText}>
                {preferenceState.failure} {PlayingPreferenceMessages.retry}
              </Text>
            </Pressable>
          )}
          <AudioProgressBar
            isLoading={isLoading}
            isBuffering={false}
            onSeek={controlsDisabled ? undefined : seekToPosition}
            showThumb
            showTimeLabels
            containerStyle={{ padding: 30 }}
          />
          <AllPlayingControlsContainer disabled={controlsDisabled}>
            <PlayingControlButton
              glyph="shuffle"
              label={PlayingControlButtonPolicy.shuffle}
              color={isShuffled ? colors.accentPrimary : colors.normalText}
              onPress={toggleShuffle}
              disabled={controlsDisabled || sharing}
              selected={isShuffled}
            />
            <PlayingControlButton
              glyph="previous"
              label={PlayingControlButtonPolicy.previous}
              color={colors.normalText}
              onPress={navigatePrevious}
              disabled={controlsDisabled || coverBusy}
            />
            <PlayingControlButton
              glyph={isPlaying ? 'pause' : 'play'}
              label={
                isPlaying
                  ? PlayingControlButtonPolicy.pause
                  : PlayingControlButtonPolicy.play
              }
              color={colors.normalText}
              onPress={isPlaying ? pause : play}
              disabled={controlsDisabled}
            />
            <PlayingControlButton
              glyph="next"
              label={PlayingControlButtonPolicy.next}
              color={colors.normalText}
              onPress={navigateNext}
              disabled={controlsDisabled || coverBusy}
            />
            <PlayingControlButton
              glyph={
                repeatingState === RepeatingType.Song ? 'repeatOnce' : 'repeat'
              }
              label={PlayingControlButtonPolicy.repeat}
              color={
                repeatingState === RepeatingType.None
                  ? colors.normalText
                  : colors.accentPrimary
              }
              onPress={handleRepeatCycle}
              disabled={controlsDisabled || sharing}
              selected={repeatingState !== RepeatingType.None}
            />
          </AllPlayingControlsContainer>
          {!lyricsExpanded && lyricsPanel}
          <RecommendationPlaybackStatus />
          <SpotifyPlayerJam navigation={navigation} />
        </ContentContainer>
        {lyricsExpanded && lyricsPanel}
      </Animated.View>
      {menuVisible && (
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          options={menuOptions}
          position={menuPosition}
          navigation={navigation}
          params={{
            recordingIds: [currentTrack?.recordingIdentifier],
            albumId: currentTrack?.albumIdentifier || '',
            albumTitle: currentTrack?.album || '',
            albumCover: currentTrack?.artworkAddress || '',
            albumArtist: currentTrack?.artist || '',
          }}
        />
      )}
    </BackdropContainer>
  );
};

export default Playing;

const PlayingPreferenceLayout = Object.freeze({ touchSize: 48, inset: 8 });
const styles = StyleSheet.create({
  heartTarget: {
    minWidth: PlayingPreferenceLayout.touchSize,
    minHeight: PlayingPreferenceLayout.touchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartFailure: { padding: PlayingPreferenceLayout.inset },
  heartFailureText: { color: colors.normalText, textAlign: 'center' },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 30,
  },
});

const PlayingScrollPolicy = Object.freeze({ startOffset: 0 });

const PlayingPreferenceMessages = Object.freeze({
  unknown: 'Song heart unavailable',
  unknownSymbol: '—',
  checking: 'Checking song heart',
  add: 'Like song',
  remove: 'Remove song from Liked Songs',
  retry: 'Retry heart status',
});

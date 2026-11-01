import { useRecordingLike } from '../../services/RecordingLikePlatform';
import { colors, iconSizes } from '../../constants/styling.tsx';
import HeartEmptyIcon from '../../../assets/icons/heartEmptyIcon.tsx';

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
  AlbumCover,
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
import ShufflIcon from '../../../assets/icons/shuffleIcon.tsx';
import RepeatIcon from '../../../assets/icons/repeatIcon.tsx';
import RepeatOnceIcon from '../../../assets/icons/repeatOnceIcon.tsx';
import BackwardIcon from '../../../assets/icons/backwardIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';
import PauseIcon from '../../../assets/icons/pauseIcon.tsx';
import ForwardIcon from '../../../assets/icons/forwardIcon.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import AudioProgressBar from '../../components/AudioProgressBar';

import { useMusicQueue } from '../../../MusicProvider.tsx';
import { RepeatingType } from '../../constants/types.tsx';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';
import SpotifyPlayerJam from './SpotifyPlayerJam.render';
import { playerJam } from '../../services/PlayerJamRuntime';
import { SpotifyPlayerJamMode } from '../../services/spotify/SpotifyPlayerJamController';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Playing = ({ navigation }: any) => {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    play,
    pause,
    playNext,
    playPrevious,
    repeatingState,
    setRepeatingState,
    seekToPosition,
    isShuffled,
    toggleShuffle,
  } = useMusicQueue();

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

  return (
    <BackdropContainer>
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <ContentContainer
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
          <AlbumCover
            source={{
              uri: currentTrack?.artworkAddress || PLACEHOLDER_ALBUM_COVER,
            }}
            releaseId={currentTrack?.albumIdentifier}
            cover={currentTrack?.artworkAddress}
            smallCover={currentTrack?.smallArtworkAddress}
            verySmallCover={currentTrack?.thumbnailArtworkAddress}
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
            <ShufflIcon
              height={iconSizes.lg}
              fill={isShuffled ? colors.accentPrimary : colors.normalText}
              onPress={sharing ? undefined : toggleShuffle}
            />
            <BackwardIcon
              height={iconSizes.lg}
              onPress={playPrevious}
              fill={colors.normalText}
            />
            {isPlaying ? (
              <PauseIcon
                height={iconSizes.lg}
                onPress={pause}
                fill={colors.normalText}
              />
            ) : (
              <PlayIcon
                height={iconSizes.lg}
                onPress={play}
                fill={colors.normalText}
              />
            )}
            <ForwardIcon
              height={iconSizes.lg}
              onPress={playNext}
              fill={colors.normalText}
            />
            {repeatingState === RepeatingType.None ? (
              <RepeatIcon
                height={iconSizes.lg}
                fill={colors.normalText}
                onPress={sharing ? undefined : handleRepeatCycle}
              />
            ) : repeatingState === RepeatingType.Song ? (
              <RepeatOnceIcon
                height={iconSizes.lg}
                fill={colors.accentPrimary}
                onPress={sharing ? undefined : handleRepeatCycle}
              />
            ) : (
              <RepeatIcon
                height={iconSizes.lg}
                fill={colors.accentPrimary}
                onPress={sharing ? undefined : handleRepeatCycle}
              />
            )}
          </AllPlayingControlsContainer>
          <SpotifyPlayerJam navigation={navigation} />
        </ContentContainer>
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

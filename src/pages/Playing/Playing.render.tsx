import { useApi } from '../../hooks/useApi.ts';
import { useData } from '../../services/DataProvider.tsx';
import { colors, iconSizes } from '../../constants/styling.tsx';
import HeartEmptyIcon from '../../../assets/icons/heartEmptyIcon.tsx';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
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

  const api = useApi();
  const { data: isLiked, updateData } = useData<boolean>(
    `isLiked:${currentTrack?.recordingIdentifier}`,
    undefined,
    currentTrack?.isLiked
  );

  const toggleLike = useCallback(async () => {
    if (!currentTrack?.recordingIdentifier) return;
    const newLikedState = !isLiked;
    updateData(newLikedState);
    try {
      await api.post(`Library/likes/${currentTrack.recordingIdentifier}`, {
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        cover: currentTrack.artworkAddress,
      });
    } catch (error) {
      console.error('Failed to toggle like:', error);
      updateData(!newLikedState);
    }
  }, [currentTrack, isLiked, updateData, api]);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
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
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const handleMorePress = useCallback((event: any) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setMenuVisible(true);
  }, []);

  const handleRepeatCycle = useCallback(() => {
    if (repeatingState === RepeatingType.None) setRepeatingState(RepeatingType.Song);
    else if (repeatingState === RepeatingType.Song) setRepeatingState(RepeatingType.Album);
    else setRepeatingState(RepeatingType.None);
  }, [repeatingState, setRepeatingState]);

  useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <BackdropContainer>
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <ContentContainer>
          <DragIndicator />
          <HeaderContainer>
            <ArrowDownIcon height={iconSizes.md} onPress={navigation.goBack} fill={colors.normalText} />
            <HeaderTitle>Playing {currentTrack?.album}</HeaderTitle>
            <MoreIcon
              height={iconSizes.md}
              fill={colors.normalText}
              onPress={handleMorePress}
            />
          </HeaderContainer>
          <AlbumCover
            source={{ uri: currentTrack?.artworkAddress || PLACEHOLDER_ALBUM_COVER }}
          />
          <SongDetailsContainer>
            <SongDescriptorContainer>
              <SongTitle>{currentTrack?.title}</SongTitle>
              <SongAuthor>{currentTrack?.artist}</SongAuthor>
            </SongDescriptorContainer>
            {isLiked ? (
              <HeartIcon height={iconSizes.md} onPress={toggleLike} fill={colors.accentPrimary} />
            ) : (
              <HeartEmptyIcon height={iconSizes.md} onPress={toggleLike} fill={colors.normalText} />
            )}
          </SongDetailsContainer>
          <AudioProgressBar
            isLoading={isLoading}
            isBuffering={false}
            onSeek={seekToPosition}
            showThumb
            showTimeLabels
            containerStyle={{ padding: 30 }}
          />
          <AllPlayingControlsContainer>
            <ShufflIcon height={iconSizes.lg} fill={isShuffled ? colors.accentPrimary : colors.normalText} onPress={toggleShuffle} />
            <BackwardIcon height={iconSizes.lg} onPress={playPrevious} fill={colors.normalText} />
            {isPlaying ? (
              <PauseIcon height={iconSizes.lg} onPress={pause} fill={colors.normalText} />
            ) : (
              <PlayIcon height={iconSizes.lg} onPress={play} fill={colors.normalText} />
            )}
            <ForwardIcon height={iconSizes.lg} onPress={playNext} fill={colors.normalText} />
            {repeatingState === RepeatingType.None ? (
              <RepeatIcon height={iconSizes.lg} fill={colors.normalText} onPress={handleRepeatCycle} />
            ) : repeatingState === RepeatingType.Song ? (
              <RepeatOnceIcon height={iconSizes.lg} fill={colors.accentPrimary} onPress={handleRepeatCycle} />
            ) : (
              <RepeatIcon height={iconSizes.lg} fill={colors.accentPrimary} onPress={handleRepeatCycle} />
            )}
          </AllPlayingControlsContainer>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 30,
  },
});

import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';
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
import { State, usePlaybackState } from 'react-native-track-player';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { RepeatingType } from '../../constants/types.tsx';
import { useState } from 'react';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Playing = ({ navigation }: any) => {
  const playbackState = usePlaybackState();
  const {
    currentTrack,
    isLoading,
    play,
    pause,
    playNext,
    playPrevious,
    repeatingState,
    setRepeatingState,
    seekToPosition,
  } = useMusicQueue();

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      gestureState.dy > 0 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
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
  });

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
            <ArrowDownIcon height={25} onPress={navigation.goBack} />
            <HeaderTitle>Playing {currentTrack?.album}</HeaderTitle>
            <MoreIcon
              height={25}
              onPress={(event: any) => {
                setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
                setMenuVisible(true);
              }}
            />
          </HeaderContainer>
          <AlbumCover
            source={{ uri: currentTrack?.artwork || PLACEHOLDER_ALBUM_COVER }}
          />
          <SongDetailsContainer>
            <SongDescriptorContainer>
              <SongTitle>{currentTrack?.title}</SongTitle>
              <SongAuthor>{currentTrack?.artist}</SongAuthor>
            </SongDescriptorContainer>
            <HeartIcon height={25} onPress={() => { }} />
          </SongDetailsContainer>
          <AudioProgressBar
            isLoading={isLoading}
            isBuffering={false}
            onSeek={seekToPosition}
            showThumb
            showTimeLabels
            onSeekStart={() => { }}
            onSeekEnd={() => { }}
            containerStyle={{ padding: 30 }}
          />
          <AllPlayingControlsContainer>
            <ShufflIcon height={30} />
            <BackwardIcon height={30} onPress={playPrevious} />
            {playbackState.state === State.Playing ? (
              <PauseIcon height={30} onPress={pause} />
            ) : (
              <PlayIcon height={30} onPress={play} />
            )}
            <ForwardIcon height={30} onPress={playNext} />
            {repeatingState === RepeatingType.None ? (
              <RepeatIcon
                height={30}
                onPress={() => {
                  setRepeatingState(RepeatingType.Song);
                }}
              />
            ) : repeatingState === RepeatingType.Song ? (
              <RepeatOnceIcon
                height={30}
                fill={'green'}
                onPress={() => {
                  setRepeatingState(RepeatingType.Album);
                }}
              />
            ) : (
              <RepeatIcon
                height={30}
                fill={'green'}
                onPress={() => {
                  setRepeatingState(RepeatingType.None);
                }}
              />
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
          params={{ recordingIds: [currentTrack?.id] }}
        />
      )}
    </BackdropContainer>
  );
};

export default Playing;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 60,
  },
});

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Dimensions, Animated, PanResponder } from 'react-native';
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
import BackwardIcon from '../../../assets/icons/backwardIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';
import PauseIcon from '../../../assets/icons/pauseIcon.tsx';
import ForwardIcon from '../../../assets/icons/forwardIcon.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import AudioProgressBar from '../../components/AudioProgressBar';
import {
  getIsBuffering,
  getIsLoading,
  pauseTrack,
  resumeTrack,
  seekTo,
  skipToNext,
  skipToPrevious,
  useCurrentTrack,
} from '../../services/AudioPlayerService.ts';
import { State, usePlaybackState } from 'react-native-track-player';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Playing = ({ navigation }: any) => {
  const playbackState = usePlaybackState();
  const currentlyPlayingSong = useCurrentTrack();

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
            <HeaderTitle>Playing {currentlyPlayingSong?.album}</HeaderTitle>
            <MoreIcon height={25} />
          </HeaderContainer>
          <AlbumCover source={{ uri: PLACEHOLDER_ALBUM_COVER }} />
          <SongDetailsContainer>
            <SongDescriptorContainer>
              <SongTitle>{currentlyPlayingSong?.title}</SongTitle>
              <SongAuthor>{currentlyPlayingSong?.artist}</SongAuthor>
            </SongDescriptorContainer>
            <HeartIcon height={25} onPress={() => {}} />
          </SongDetailsContainer>
          <AudioProgressBar
            isLoading={getIsLoading()}
            isBuffering={getIsBuffering()}
            onSeek={seekTo}
            showThumb
            showTimeLabels
            onSeekStart={() => {}}
            onSeekEnd={() => {}}
            containerStyle={{ padding: 30 }}
          />
          <AllPlayingControlsContainer>
            <ShufflIcon height={30} />
            <BackwardIcon height={30} onPress={skipToPrevious} />
            {playbackState.state === State.Playing ? (
              <PauseIcon height={30} onPress={pauseTrack} />
            ) : (
              <PlayIcon height={30} onPress={resumeTrack} />
            )}
            <ForwardIcon height={30} onPress={skipToNext} />
            <RepeatIcon height={30} />
          </AllPlayingControlsContainer>
        </ContentContainer>
      </Animated.View>
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

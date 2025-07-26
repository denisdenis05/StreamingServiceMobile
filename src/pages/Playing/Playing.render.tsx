import React, { useEffect, useRef, useState } from 'react';
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
import ForwardIcon from '../../../assets/icons/forwardIcon.tsx';
import {
  PLACEHOLDER_ALBUM_COVER,
  PLACEHOLDER_SONG,
  PLACEHOLDER_SONG_ARTIST,
} from '../../constants/placeholders.tsx';
import AudioProgressBar from '../../components/AudioProgressBar';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Playing = ({ navigation }: any) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(245); // 4:05 minutes
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  useEffect(() => {
    let interval: any;
    if (isPlaying && !isLoading) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isLoading, duration]);

  const handleSeek = (timeInSeconds: any) => {
    console.log('Seeking to:', timeInSeconds);
    setCurrentTime(timeInSeconds);
    // Here seek audio player
  };

  const handleSeekStart = () => {
    console.log('Seek started');
    // Pause audio updates while seeking
  };

  const handleSeekEnd = () => {
    console.log('Seek ended');
    // Resume audio updates
  };

  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return (
        gestureState.dy > 0 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      );
    },
    onPanResponderMove: (evt, gestureState) => {
      if (gestureState.dy > 0) {
        translateY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      if (gestureState.dy > 100 || gestureState.vy > 0.5) {
        // Dismiss modal
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          navigateBack();
        });
      } else {
        // Snap back
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

  const navigateBack = () => {
    navigation.goBack();
  };

  return (
    <BackdropContainer>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <ContentContainer>
          <DragIndicator />
          <HeaderContainer>
            <ArrowDownIcon height={25} onPress={navigateBack} />
            <HeaderTitle>Playing {PLACEHOLDER_SONG}</HeaderTitle>
            <MoreIcon height={25} />
          </HeaderContainer>
          <AlbumCover source={{ uri: PLACEHOLDER_ALBUM_COVER }} />
          <SongDetailsContainer>
            <SongDescriptorContainer>
              <SongTitle>{PLACEHOLDER_SONG}</SongTitle>
              <SongAuthor>{PLACEHOLDER_SONG_ARTIST}</SongAuthor>
            </SongDescriptorContainer>
            <HeartIcon height={25} onPress={navigateBack} />
          </SongDetailsContainer>
          <AudioProgressBar
            currentTime={currentTime}
            duration={duration}
            isLoading={isLoading}
            isBuffering={isBuffering}
            onSeek={handleSeek}
            showThumb={true}
            showTimeLabels={true}
            onSeekStart={handleSeekStart}
            onSeekEnd={handleSeekEnd}
            containerStyle={{ padding: 30 }}
          />
          <AllPlayingControlsContainer>
            <ShufflIcon height={30} />
            <BackwardIcon height={30} />
            <PlayIcon height={30} />
            <ForwardIcon height={30} />
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

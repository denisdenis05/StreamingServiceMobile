import {
  CardAuthor,
  CardImage,
  CardTitle,
  MainContainer,
  MetadataContainer,
  TextContainer,
} from './PlayingOverlay.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { State, usePlaybackState } from 'react-native-track-player';
import PauseIcon from '../../../assets/icons/pauseIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';
import React, { useEffect, useRef, useState } from 'react';
import ImageColors from 'react-native-image-colors';
import { ensureContrastWithWhite } from '../../utils/colorUtils';
import { Animated, Platform } from 'react-native';

const PlayingOverlay = ({ navigation, bottomOffset }: { navigation: any; bottomOffset?: number }) => {
  const playbackState = usePlaybackState();
  const { currentTrack, play, pause } = useMusicQueue();

  // Animation state
  const colorAnim = useRef(new Animated.Value(0)).current;
  const [prevColor, setPrevColor] = useState('#222222');
  const [nextColor, setNextColor] = useState('#222222');

  useEffect(() => {
    if (currentTrack?.artwork) {
      const fetchColors = async () => {
        try {
          const result = await ImageColors.getColors(currentTrack.artwork as string, {
            fallback: '#222222',
            cache: true,
            key: currentTrack.artwork as string,
          });

          let pickedColor = '#222222';

          if (Platform.OS === 'android') {
            pickedColor = (result as any).vibrant || (result as any).dominant || '#222222';
          } else {
            pickedColor = (result as any).primary || (result as any).background || '#222222';
          }

          const safeColor = ensureContrastWithWhite(pickedColor);

          // Trigger animation
          setPrevColor(nextColor); // Start from where we were
          setNextColor(safeColor); // Go to new color

          colorAnim.setValue(0);
          Animated.timing(colorAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false, // color interpolation not supported on native driver
          }).start();

        } catch (error) {
          console.log('Error fetching colors', error);
        }
      };

      fetchColors();
    }
  }, [currentTrack]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [prevColor, nextColor],
  });

  const handleClick = () => {
    navigation.navigate('Playing');
  };

  return (
    <MainContainer
      onPress={handleClick}
      style={{
        backgroundColor: backgroundColor as any,
        ...(bottomOffset !== undefined ? { bottom: bottomOffset } : {}),
      }}
    >
      <MetadataContainer>
        <CardImage
          source={{ uri: currentTrack?.artwork || PLACEHOLDER_ALBUM_COVER }}
        />
        <TextContainer>
          <CardTitle>{currentTrack?.title}</CardTitle>
          <CardAuthor>{currentTrack?.artist}</CardAuthor>
        </TextContainer>
      </MetadataContainer>
      {playbackState.state === State.Playing ? (
        <PauseIcon height={20} onPress={pause} />
      ) : (
        <PlayIcon height={20} onPress={play} />
      )}
    </MainContainer>
  );
};

export default PlayingOverlay;

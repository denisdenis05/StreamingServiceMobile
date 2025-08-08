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
import React from 'react';

const PlayingOverlay = ({ navigation }: { navigation: any }) => {
  const playbackState = usePlaybackState();
  const { currentTrack, play, pause } = useMusicQueue();

  const handleClick = () => {
    navigation.navigate('Playing');
  };

  return (
    <MainContainer onPress={handleClick}>
      <MetadataContainer>
        <CardImage
          source={{ uri: currentTrack?.cover || PLACEHOLDER_ALBUM_COVER }}
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

import {
  CardAuthor,
  CardImage,
  CardTitle,
  MainContainer,
  MetadataContainer,
  TextContainer,
} from './PlayingOverlay.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import { iconSizes } from '../../constants/styling.tsx';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { State, usePlaybackState } from 'react-native-track-player';
import PauseIcon from '../../../assets/icons/pauseIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';

const PlayingOverlay = ({ navigation, bottomOffset }: { navigation: any; bottomOffset?: number }) => {
  const playbackState = usePlaybackState();
  const { currentTrack, play, pause } = useMusicQueue();

  const handleClick = () => {
    navigation.navigate('Playing');
  };

  return (
    <MainContainer
      onPress={handleClick}
      style={bottomOffset !== undefined ? { bottom: bottomOffset } : undefined}
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
        <PauseIcon height={iconSizes.md} onPress={pause} fill="#FFFFFF" />
      ) : (
        <PlayIcon height={iconSizes.md} onPress={play} fill="#FFFFFF" />
      )}
    </MainContainer>
  );
};

export default PlayingOverlay;

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
import PauseIcon from '../../../assets/icons/pauseIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';

const PlayingOverlay = ({ navigation, bottomOffset }: { navigation: any; bottomOffset?: number }) => {
  const { currentTrack, play, pause, isPlaying } = useMusicQueue();

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
          source={{ uri: currentTrack?.artworkAddress || PLACEHOLDER_ALBUM_COVER }}
            releaseId={currentTrack?.albumIdentifier}
            cover={currentTrack?.artworkAddress}
            smallCover={currentTrack?.smallArtworkAddress}
            verySmallCover={currentTrack?.thumbnailArtworkAddress}
        />
        <TextContainer>
          <CardTitle>{currentTrack?.title}</CardTitle>
          <CardAuthor>{currentTrack?.artist}</CardAuthor>
        </TextContainer>
      </MetadataContainer>
      {isPlaying ? (
        <PauseIcon height={iconSizes.md} onPress={pause} fill="#FFFFFF" />
      ) : (
        <PlayIcon height={iconSizes.md} onPress={play} fill="#FFFFFF" />
      )}
    </MainContainer>
  );
};

export default PlayingOverlay;

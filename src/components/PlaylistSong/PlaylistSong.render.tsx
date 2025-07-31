import {
  CardAuthor,
  CardContainer,
  CardTitle,
  MainContainer,
  MusicCard,
} from './PlaylistSong.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import { playTrack, resetQueue } from '../../services/AudioPlayerService.ts';

const PlaylistSong = ({
  navigation,
  songId,
  songTitle,
  songAuthor,
  albumTitle,
}: {
  navigation: any;
  songId: any;
  songTitle: any;
  songAuthor: any;
  albumId: any;
  albumTitle: any;
}) => {
  const handleCardClick = () => {
    resetQueue();
    playTrack({
      id: 'audio1',
      url: `http://192.168.1.137:5068/Stream?id=${songId}`,
      title: songTitle,
      artist: songAuthor,
      album: albumTitle,
      mediaId: songId,
      artwork: PLACEHOLDER_ALBUM_COVER,
    });
    navigation.navigate('Playing', {});
  };

  return (
    <MainContainer>
      <CardContainer>
        <MusicCard
          onPress={() => {
            handleCardClick();
          }}
        >
          <CardTitle>{songTitle}</CardTitle>
          <CardAuthor>{songAuthor}</CardAuthor>
        </MusicCard>
      </CardContainer>
    </MainContainer>
  );
};

export default PlaylistSong;

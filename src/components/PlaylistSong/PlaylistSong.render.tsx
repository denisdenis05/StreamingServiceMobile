import {
  CardAuthor,
  CardContainer,
  CardTitle,
  MainContainer,
  MusicCard,
} from './PlaylistSong.style.tsx';
import MoreIcon from '../../../assets/icons/moreIcon.tsx';

const PlaylistSong = ({
  songTitle,
  songAuthor,
  playAction,
  onMorePress,
}: {
  navigation: any;
  songId: any;
  songTitle: any;
  songAuthor: any;
  albumId: any;
  albumTitle: any;
  albumCover: string;
  playAction: any;
  onMorePress: (event: any) => void;
}) => {
  return (
    <MainContainer>
      <CardContainer>
        <MusicCard onPress={playAction}>
          <CardTitle numberOfLines={1}>{songTitle}</CardTitle>
          <CardAuthor numberOfLines={1}>{songAuthor}</CardAuthor>
        </MusicCard>
        <MoreIcon height={25} onPress={onMorePress} />
      </CardContainer>
    </MainContainer>
  );
};

export default PlaylistSong;

import {
  CardAuthor,
  CardContainer,
  CardTitle,
  MainContainer,
  MusicCard,
} from './PlaylistSong.style.tsx';

const PlaylistSong = ({
  songTitle,
  songAuthor,
  playAction,
}: {
  navigation: any;
  songId: any;
  songTitle: any;
  songAuthor: any;
  albumId: any;
  albumTitle: any;
  albumCover: string;
  playAction: any;
}) => {
  return (
    <MainContainer>
      <CardContainer>
        <MusicCard
          onPress={() => {
            playAction();
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

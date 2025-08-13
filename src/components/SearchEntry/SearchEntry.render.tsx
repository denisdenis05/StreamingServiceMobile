import {
  AlbumCover,
  CardAuthor,
  CardTitle,
  MainContainer,
  MusicCard,
} from './SearchEntry.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';

const SearchEntry = ({
  songTitle,
  songAuthor,
  albumCover,
  onPressAction,
}: {
  songTitle: any;
  songAuthor: any;
  albumCover: string;
  onPressAction: any;
}) => {
  return (
    <MainContainer>
      <AlbumCover source={{ uri: albumCover || PLACEHOLDER_ALBUM_COVER }} />
      <MusicCard
        onPress={() => {
          onPressAction();
        }}
      >
        <CardTitle>{songTitle}</CardTitle>
        <CardAuthor>{songAuthor}</CardAuthor>
      </MusicCard>
    </MainContainer>
  );
};

export default SearchEntry;

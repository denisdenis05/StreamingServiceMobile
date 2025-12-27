import {
  AlbumCover,
  CardAuthor,
  CardTitle,
  MainContainer,
  MusicCard,
} from './SearchEntry.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import SkeletonLoader from '../SkeletonLoader/SkeletonLoader.tsx';
import { View } from 'react-native';

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

export const SearchEntrySkeleton = () => {
  return (
    <MainContainer>
      <SkeletonLoader width={50} height={50} borderRadius={5} />
      <View style={{ gap: 5, justifyContent: 'center' }}>
        <SkeletonLoader width={150} height={14} />
        <SkeletonLoader width={100} height={12} />
      </View>
    </MainContainer>
  );
};

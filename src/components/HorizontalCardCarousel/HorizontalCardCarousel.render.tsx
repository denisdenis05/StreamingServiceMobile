import {
  CardAuthor,
  CardContainer,
  CardImage,
  CardTitle,
  MainContainer,
  MusicCard,
} from './HorizontalCardCarousel.style.tsx';
import SectionTitle from '../SectionTitle';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import SkeletonLoader from '../SkeletonLoader/SkeletonLoader.tsx';
import { View } from 'react-native';
import { sizes } from '../../constants/styling.tsx';

const HorizontalCardCarousel = ({
  navigation,
  sectionTitle,
  content,
  isLoading = false,
}: {
  navigation: any;
  sectionTitle: string;
  content: any;
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return <HorizontalCardSkeleton />;
  }
  const handleCardClick = (card: any) => {
    if (card.type === 'Playlist') {
      navigation.navigate('PlaylistViewer', {
        playlistId: card.id,
        playlistTitle: card.title,
        playlistOwner: card.artistName,
        playlistCover: card.cover,
        isOwner: false,
      });
    } else {
      navigation.navigate('AlbumViewer', {
        albumId: card.id,
        albumTitle: card.title,
        albumArtist: card.artistName,
        albumCover: card.cover,
      });
    }
  };

  return (
    <MainContainer>
      <SectionTitle>{sectionTitle}</SectionTitle>
      <CardContainer>
        {content.map((card: any, index: number) => (
          <MusicCard
            key={index}
            onPress={() => {
              handleCardClick(card);
            }}
          >
            <CardImage
              source={{ uri: card.smallCover || PLACEHOLDER_ALBUM_COVER }}
            />
            <CardTitle>{card.title}</CardTitle>
            <CardAuthor>{card.artistName}</CardAuthor>
          </MusicCard>
        ))}
      </CardContainer>
    </MainContainer>
  );
};

export default HorizontalCardCarousel;

export const HorizontalCardSkeleton = () => {
  const skeletonItems = Array.from({ length: 5 }); // Show 5 skeleton items

  return (
    <MainContainer>
      <SkeletonLoader width={150} height={20} style={{ marginBottom: 10 }} />
      <CardContainer>
        {skeletonItems.map((_, index) => (
          <View
            key={index}
            style={{ gap: 5, width: sizes.albumCoverHomeHeight }}
          >
            <SkeletonLoader
              width={sizes.albumCoverHomeHeight}
              height={sizes.albumCoverHomeHeight}
              borderRadius={10}
            />
            <SkeletonLoader width={80} height={14} />
            <SkeletonLoader width={60} height={12} />
          </View>
        ))}
      </CardContainer>
    </MainContainer>
  );
};

import {
  CardAuthor,
  CardContainer,
  CardImage,
  CardTitle,
  MainContainer,
  MusicCard,
  cardImageRadius,
  cardImageSize,
} from './HorizontalCardCarousel.style.tsx';
import SectionTitle from '../SectionTitle';
import SkeletonLoader from '../SkeletonLoader/SkeletonLoader.tsx';
import { View } from 'react-native';
import { typography } from '../../constants/styling.tsx';

const SKELETON_ITEMS = Array.from({ length: 5 });

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
        albumSmallCover: card.smallCover,
        albumVerySmallCover: card.verySmallCover,
      });
    }
  };

  return (
    <MainContainer>
      <SectionTitle>{sectionTitle}</SectionTitle>
      <CardContainer>
        {content.map((card: any) => (
          <MusicCard
            key={card.id}
            onPress={() => handleCardClick(card)}
          >
            <CardImage
              releaseId={card.id}
              cover={card.cover}
              smallCover={card.smallCover}
              verySmallCover={card.verySmallCover}
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
  return (
    <MainContainer>
      <SkeletonLoader width={150} height={20} style={{ marginBottom: 10 }} />
      <CardContainer>
        {SKELETON_ITEMS.map((_, index) => (
          <View
            key={index}
            style={{ gap: 5, width: cardImageSize }}
          >
            <SkeletonLoader
              width={cardImageSize}
              height={cardImageSize}
              borderRadius={cardImageRadius}
            />
            <SkeletonLoader width={80} height={typography.itemTitle} />
            <SkeletonLoader width={60} height={typography.secondary} />
          </View>
        ))}
      </CardContainer>
    </MainContainer>
  );
};

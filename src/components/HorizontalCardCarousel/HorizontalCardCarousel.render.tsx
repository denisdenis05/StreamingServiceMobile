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
import { HomeCollectionCard, HomeCollectionType, homeCollectionDestination } from '../../services/home/HomeCollectionNavigation';
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
  content: readonly HomeCollectionCard[];
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return <HorizontalCardSkeleton sectionTitle={sectionTitle} />;
  }
  const handleCardClick = (card: HomeCollectionCard) => {
    const destination = homeCollectionDestination(card);
    if (destination) navigation.navigate(destination.route, destination.parameters);
  };

  return (
    <MainContainer>
      <SectionTitle>{sectionTitle}</SectionTitle>
      <CardContainer>
        {content.map((card: HomeCollectionCard) => (
          <MusicCard
            key={card.type + card.id}
            onPress={() => handleCardClick(card)}
          >
            <CardImage
              releaseId={card.type === HomeCollectionType.Playlist ? undefined : card.id}
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

export const HorizontalCardSkeleton = ({ sectionTitle }: { sectionTitle?: string }) => {
  return (
    <MainContainer>
      {sectionTitle ? <SectionTitle>{sectionTitle}</SectionTitle> :
        <SkeletonLoader width={150} height={20} style={{ marginBottom: 10 }} />}
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

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

const HorizontalCardCarousel = ({
  navigation,
  sectionTitle,
  content,
}: {
  navigation: any;
  sectionTitle: string;
  content: any;
}) => {
  const handleCardClick = (
    albumId: any,
    albumTitle: any,
    albumArtist: any,
    albumCover: any
  ) => {
    navigation.navigate('AlbumViewer', {
      albumId,
      albumTitle,
      albumArtist,
      albumCover,
    });
  };

  return (
    <MainContainer>
      <SectionTitle>{sectionTitle}</SectionTitle>
      <CardContainer>
        {content.map((card: any, index: number) => (
          <MusicCard
            key={index}
            onPress={() => {
              handleCardClick(card.id, card.title, card.artistName, card.cover);
            }}
          >
            <CardImage
              source={{ uri: card.cover || PLACEHOLDER_ALBUM_COVER }}
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

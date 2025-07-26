import {
  CardAuthor,
  CardContainer,
  CardImage,
  CardTitle,
  MainContainer,
  MusicCard,
} from './HorizontalCardCarousel.style.tsx';
import SectionTitle from '../SectionTitle';

const HorizontalCardCarousel = ({
  navigation,
  sectionTitle,
  content,
}: {
  navigation: any;
  sectionTitle: string;
  content: any;
}) => {
  const handleCardClick = () => {};

  return (
    <MainContainer>
      <SectionTitle>{sectionTitle}</SectionTitle>
      <CardContainer>
        {content.map((card: any, index: number) => (
          <MusicCard key={index} onPress={() => handleCardClick()}>
            <CardImage source={{ uri: card.cover }} />
            <CardTitle>{card.title}</CardTitle>
            <CardAuthor>{card.author}</CardAuthor>
          </MusicCard>
        ))}
      </CardContainer>
    </MainContainer>
  );
};

export default HorizontalCardCarousel;

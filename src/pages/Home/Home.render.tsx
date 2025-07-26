import React from 'react';
import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  StyledImage,
} from './Home.style.tsx';
import {
  PLACEHOLDER_PROFILE_PIC,
  PLACEHOLDER_SECTION_CONTENT,
  PLACEHOLDER_SECTION_NAME,
  PLACEHOLDER_USERNAME,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import HorizontalCardCarouselRender from '../../components/HorizontalCardCarousel';

const Home = ({ navigation, route }: { navigation: any; route: any }) => {
  return (
    <PageContainer>
      <ContentContainer>
        <HeaderContainer>
          <StyledImage source={{ uri: PLACEHOLDER_PROFILE_PIC }} />
          <HeaderTitle>
            {HOME_HEADER_TEXT}
            {PLACEHOLDER_USERNAME}
          </HeaderTitle>
        </HeaderContainer>
        {Array.from({ length: 10 }).map((_, index) => (
          <HorizontalCardCarouselRender
            key={index}
            navigation={navigation}
            sectionTitle={`${PLACEHOLDER_SECTION_NAME} ${index + 1}`}
            content={PLACEHOLDER_SECTION_CONTENT}
          />
        ))}
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
};

export default Home;

import React, { useEffect, useState } from 'react';
import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  StyledImage,
} from './Home.style.tsx';
import {
  PLACEHOLDER_PROFILE_PIC,
  PLACEHOLDER_SECTION_NAME,
  PLACEHOLDER_USERNAME,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import HorizontalCardCarouselRender from '../../components/HorizontalCardCarousel';
import axios from 'axios';

const Home = ({ navigation, route }: { navigation: any; route: any }) => {
  const [albums, setAlbums] = useState([]);

  useEffect(() => {
    axios
      .get('http://192.168.1.137:5068/Metadata/get-available-albums')
      .then(res => {
        setAlbums(res.data);
      })
      .catch(err => {
        console.error('Failed to fetch recordings:', err);
      });
  }, []);

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
        <HorizontalCardCarouselRender
          navigation={navigation}
          sectionTitle={PLACEHOLDER_SECTION_NAME}
          content={albums}
        />
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
};

export default Home;

import React, { useEffect, useState } from 'react';
import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  StyledImage,
} from './Home.style.tsx';
import {
  PLACEHOLDER_ALBUM_COVER,
  PLACEHOLDER_PROFILE_PIC,
  PLACEHOLDER_SECTION_NAME,
  PLACEHOLDER_USERNAME,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import HorizontalCardCarouselRender from '../../components/HorizontalCardCarousel';
import { Album } from '../../constants/types.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { useData } from '../../services/DataProvider.tsx';

const Home = ({ navigation, route }: { navigation: any; route: any }) => {
  const api = useApi();
  const fetchAlbums = async () => {
    const res = await api.get(`Metadata/get-available-albums`);
    return res.data;
  };

  const { data: albums, loading } = useData<Album[]>('home_albums', fetchAlbums);

  return (
    <PageContainer>
      <ContentContainer>
        <HeaderContainer>
          <StyledImage
            source={{ uri: PLACEHOLDER_PROFILE_PIC }}
            navigation={navigation}
            redirect={'Profile'}
          />
          <HeaderTitle>
            {HOME_HEADER_TEXT}
            {PLACEHOLDER_USERNAME}
          </HeaderTitle>
        </HeaderContainer>
        <HorizontalCardCarouselRender
          navigation={navigation}
          sectionTitle={PLACEHOLDER_SECTION_NAME}
          content={albums || []}
        />
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
};

export default Home;

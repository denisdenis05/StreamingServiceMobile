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
import { cacheImage } from '../../services/CachingService.ts';
import { useApi } from '../../hooks/useApi.ts';

const Home = ({ navigation, route }: { navigation: any; route: any }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const api = useApi();

  useEffect(() => {
    const fetchAndCacheAlbums = async () => {
      try {
        const res = await api.get(`Metadata/get-available-albums`);
        const fetchedAlbums: Album[] = res.data;

        const processedAlbumsPromises = fetchedAlbums.map(async album => {
          if (album.cover && album.cover !== PLACEHOLDER_ALBUM_COVER) {
            const cachedCoverUri = await cacheImage(album.cover);
            return { ...album, cover: cachedCoverUri };
          }
          return album;
        });

        const updatedAlbums = await Promise.all(processedAlbumsPromises);

        setAlbums(updatedAlbums);
      } catch (err) {
        console.error('Failed to fetch and cache albums:', err);
      }
    };

    fetchAndCacheAlbums();
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

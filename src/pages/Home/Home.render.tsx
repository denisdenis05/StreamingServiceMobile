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
  PLACEHOLDER_USERNAME,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import HorizontalCardCarouselRender from '../../components/HorizontalCardCarousel';
import { Album } from '../../constants/types.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { useData } from '../../services/DataProvider.tsx';

type RecommendationSection = {
  id: string;
  title: string;
};

const HomeSection = ({ section, navigation }: { section: RecommendationSection; navigation: any }) => {
  const api = useApi();
  const fetchSection = async () => {
    const res = await api.get(`Recommendation/section/${section.id}`);
    return res.data;
  };

  const { data: albums, loading } = useData<Album[]>(`section_${section.id}`, fetchSection);

  if (loading) {
    return (
      <HorizontalCardCarouselRender
        navigation={navigation}
        sectionTitle={section.title}
        content={[]}
        isLoading={true}
      />
    );
  }

  if (!albums || albums.length === 0) return null;

  return (
    <HorizontalCardCarouselRender
      navigation={navigation}
      sectionTitle={section.title}
      content={albums}
    />
  );
};

const Home = ({ navigation, route }: { navigation: any; route: any }) => {
  const api = useApi();
  const fetchSections = async () => {
    const res = await api.get(`Recommendation/sections`);
    return res.data;
  };

  const { data: sections, loading } = useData<RecommendationSection[]>('home_sections', fetchSections);

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
        {loading && (
          <>
            <HorizontalCardCarouselRender
              navigation={navigation}
              sectionTitle=""
              content={[]}
              isLoading={true}
            />
            <HorizontalCardCarouselRender
              navigation={navigation}
              sectionTitle=""
              content={[]}
              isLoading={true}
            />
            <HorizontalCardCarouselRender
              navigation={navigation}
              sectionTitle=""
              content={[]}
              isLoading={true}
            />
          </>
        )}
        {sections?.map((section) => (
          <HomeSection key={section.id} section={section} navigation={navigation} />
        ))}
      </ContentContainer>
      <Navbar navigation={navigation} route={route} />
    </PageContainer>
  );
};

export default Home;

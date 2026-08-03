import React from 'react';
import PageContainer from '../../components/PageContainer';
import {
  ContentContainer,
  HeaderContainer,
  HeaderTitle,
  StyledImage,
} from './Home.style.tsx';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  PLACEHOLDER_ALBUM_COVER,
  PLACEHOLDER_PROFILE_PIC,
  PLACEHOLDER_USERNAME,
} from '../../constants/placeholders.tsx';
import { HOME_HEADER_TEXT } from '../../constants/texts.tsx';
import Navbar from '../../components/Navbar';
import HorizontalCardCarouselRender from '../../components/HorizontalCardCarousel';
import { Album } from '../../constants/types.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { useData } from '../../services/DataProvider.tsx';
import { colors, typography } from '../../constants/styling.tsx';
import { moderateScale, scale } from '../../utils/scaling';
import CachedImage from '../../components/CachedImage.tsx';
import DefaultText from '../../components/DefaultText';
import SkeletonLoader from '../../components/SkeletonLoader/SkeletonLoader.tsx';

const SCREEN_WIDTH = Dimensions.get('window').width;
// ContentContainer has paddingHorizontal: scale(20) on each side; gap between the two columns
const COLUMN_GAP = scale(8);
const CONTENT_PADDING = scale(20) * 2;
const CARD_WIDTH = (SCREEN_WIDTH - CONTENT_PADDING - COLUMN_GAP) / 2;
const COVER_SIZE = moderateScale(52);

const quickCardStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COLUMN_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: COVER_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: moderateScale(6),
    overflow: 'hidden',
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
  },
  title: {
    flex: 1,
    paddingHorizontal: scale(10),
    fontSize: typography.itemTitle,
    fontWeight: '600',
    color: colors.normalText,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    height: COVER_SIZE,
    borderRadius: moderateScale(6),
    overflow: 'hidden',
  },
});

const SKELETON_ITEMS = Array.from({ length: 6 });

const RecentQuickGrid = ({ navigation }: { navigation: any }) => {
  const api = useApi();
  const fetchRecent = async () => {
    const res = await api.get('Recommendation/recent-quick?count=6');
    return res.data;
  };

  const { data: items, loading } = useData<any[]>('recent_quick', fetchRecent);

  if (loading) {
    return (
      <View style={quickCardStyles.grid}>
        {SKELETON_ITEMS.map((_, i) => (
          <View key={i} style={quickCardStyles.skeletonCard}>
            <SkeletonLoader width={CARD_WIDTH} height={COVER_SIZE} borderRadius={0} />
          </View>
        ))}
      </View>
    );
  }

  if (!items || items.length === 0) return null;

  const handlePress = (item: any) => {
    if (item.type === 'Playlist') {
      navigation.navigate('PlaylistViewer', {
        playlistId: item.id,
        playlistTitle: item.title,
        playlistOwner: item.artistName,
        playlistCover: item.cover,
        isOwner: false,
      });
    } else {
      navigation.navigate('AlbumViewer', {
        albumId: item.id,
        albumTitle: item.title,
        albumArtist: item.artistName,
        albumCover: item.cover,
      });
    }
  };

  return (
    <View style={quickCardStyles.grid}>
      {items.map((item: any) => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [quickCardStyles.card, { opacity: pressed ? 0.75 : 1 }]}
          onPress={() => handlePress(item)}
        >
          <CachedImage
            source={{ uri: item.smallCover || item.cover || PLACEHOLDER_ALBUM_COVER }}
            style={quickCardStyles.cover}
            resizeMode="cover"
          />
          <DefaultText style={quickCardStyles.title} numberOfLines={2}>
            {item.title}
          </DefaultText>
        </Pressable>
      ))}
    </View>
  );
};

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
        <RecentQuickGrid navigation={navigation} />
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

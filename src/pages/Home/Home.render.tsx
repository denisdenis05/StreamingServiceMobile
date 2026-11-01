import React, { useCallback } from 'react';
import { AppState, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PageContainer from '../../components/PageContainer';
import { ContentContainer, HeaderContainer, HeaderTitle, StyledImage } from './Home.style';
import { PLACEHOLDER_PROFILE_PIC, PLACEHOLDER_USERNAME } from '../../constants/placeholders';
import { HOME_HEADER_TEXT } from '../../constants/texts';
import Navbar from '../../components/Navbar';
import HorizontalCardCarousel from '../../components/HorizontalCardCarousel';
import { useApi } from '../../hooks/useApi';
import { invalidateCache, refreshHomeRecommendations, useData } from '../../services/DataProvider';
import { colors, typography } from '../../constants/styling';
import { moderateScale, scale } from '../../utils/scaling';
import CachedImage from '../../components/CachedImage';
import DefaultText from '../../components/DefaultText';
import SectionTitle from '../../components/SectionTitle';
import SkeletonLoader from '../../components/SkeletonLoader/SkeletonLoader';
import { HomeRecommendationQueries, homeSectionQuery } from '../../services/home/HomeRecommendationQueries';
import { HomeCollectionCard, HomeCollectionType, homeCollectionDestination } from '../../services/home/HomeCollectionNavigation';

const HomePolicy = Object.freeze({
  columnGap: 8, horizontalPadding: 20, columnCount: 2, coverSize: 52,
  cornerRadius: 6, titlePadding: 10, titleLines: 2,
  recentSkeletonCount: 6, sectionSkeletonCount: 3, skeletonRadius: 0,
  emptyCount: 0, firstSkeletonIndex: 0, activeApplicationState: 'active', applicationStateEvent: 'change',
  recentSectionIdentifier: 'recent', profileRoute: 'Profile',
  pressedOpacity: 0.75, normalOpacity: 1,
});
const HomeCopy = Object.freeze({
  noHeading: '',
  loading: 'Loading your Home…',
  recentTitle: 'Recently played',
  recentFailure: 'Recently played could not be loaded.',
  sectionsFailure: 'Home could not be loaded.',
  sectionFailure: 'These recommendations could not be loaded.',
  retry: 'Try again',
  emptyTitle: 'Your Home starts here',
  emptyDescription: 'Play an album or playlist, or save albums to your library. Home will use that activity as you listen.',
});
const screenWidth = Dimensions.get('window').width;
const columnGap = scale(HomePolicy.columnGap);
const coverSize = moderateScale(HomePolicy.coverSize);
const cardWidth = (screenWidth - scale(HomePolicy.horizontalPadding) * HomePolicy.columnCount - columnGap) / HomePolicy.columnCount;
const recentSkeletons = Array.from({ length: HomePolicy.recentSkeletonCount });
const sectionSkeletons = Array.from({ length: HomePolicy.sectionSkeletonCount });
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: columnGap },
  card: {
    width: cardWidth, height: coverSize, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceCard, borderRadius: moderateScale(HomePolicy.cornerRadius), overflow: 'hidden',
  },
  cover: { width: coverSize, height: coverSize },
  title: {
    flex: 1, paddingHorizontal: scale(HomePolicy.titlePadding), fontSize: typography.itemTitle,
    fontWeight: '600', color: colors.normalText,
  },
  skeletonCard: { width: cardWidth, height: coverSize, borderRadius: moderateScale(HomePolicy.cornerRadius), overflow: 'hidden' },
  feedback: { gap: columnGap },
  muted: { color: colors.slightlyTransparentText },
  retry: { color: colors.accentPrimary, paddingVertical: columnGap },
});
type HomeNavigation = { navigate(route: string, parameters: object): void };
type RecommendationSection = { id: string; title: string };

function HomeQueryFeedback({ message, retry }: { message: string; retry(): void }) {
  return <View style={styles.feedback}>
    <DefaultText accessibilityRole="alert" style={styles.muted}>{message}</DefaultText>
    <Pressable accessibilityRole="button" onPress={retry}>
      <DefaultText style={styles.retry}>{HomeCopy.retry}</DefaultText>
    </Pressable>
  </View>;
}

function RecentQuickGrid({ navigation }: { navigation: HomeNavigation }) {
  const network = useApi();
  const fetchRecent = async (signal: AbortSignal) =>
    (await network.get<HomeCollectionCard[]>(HomeRecommendationQueries.recentQuickRoute, { signal })).data;
  const { data: items, loading, error } = useData<HomeCollectionCard[]>(HomeRecommendationQueries.recentQuick, fetchRecent);
  if (error) return <HomeQueryFeedback message={HomeCopy.recentFailure} retry={() => invalidateCache(HomeRecommendationQueries.recentQuick)} />;
  if (loading) return <View style={styles.grid}>
    {recentSkeletons.map((_, index) => <View key={index} style={styles.skeletonCard}>
      <SkeletonLoader width={cardWidth} height={coverSize} borderRadius={HomePolicy.skeletonRadius} />
    </View>)}
  </View>;
  if (!items || items.length === HomePolicy.emptyCount) return null;
  return <View>
    <SectionTitle>{HomeCopy.recentTitle}</SectionTitle>
    <View style={styles.grid}>
      {items.map(item => <Pressable
        key={item.type + item.id}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        style={({ pressed }) => [styles.card, { opacity: pressed ? HomePolicy.pressedOpacity : HomePolicy.normalOpacity }]}
        onPress={() => {
          const destination = homeCollectionDestination(item);
          if (destination) navigation.navigate(destination.route, destination.parameters);
        }}
      >
        <CachedImage releaseId={item.type === HomeCollectionType.Playlist ? undefined : item.id}
          cover={item.cover} smallCover={item.smallCover} verySmallCover={item.verySmallCover}
          tier="small" style={styles.cover} resizeMode="cover" />
        <DefaultText style={styles.title} numberOfLines={HomePolicy.titleLines}>{item.title}</DefaultText>
      </Pressable>)}
    </View>
  </View>;
}

function HomeSection({ section, navigation }: { section: RecommendationSection; navigation: HomeNavigation }) {
  const network = useApi();
  const key = homeSectionQuery(section.id);
  const fetchSection = async (signal: AbortSignal) =>
    (await network.get<HomeCollectionCard[]>(HomeRecommendationQueries.sectionRoutePrefix + encodeURIComponent(section.id), { signal })).data;
  const { data: albums, loading, error } = useData<HomeCollectionCard[]>(key, fetchSection);
  if (error) return <View>
    <SectionTitle>{section.title}</SectionTitle>
    <HomeQueryFeedback message={HomeCopy.sectionFailure} retry={() => invalidateCache(key)} />
  </View>;
  if (!loading && (!albums || albums.length === HomePolicy.emptyCount)) return null;
  return <HorizontalCardCarousel navigation={navigation} sectionTitle={section.title} content={albums ?? []} isLoading={loading} />;
}

export default function Home({ navigation, route }: { navigation: any; route: any }) {
  const network = useApi();
  const fetchSections = async (signal: AbortSignal) =>
    (await network.get<RecommendationSection[]>(HomeRecommendationQueries.sectionsRoute, { signal })).data;
  const { data: sections, loading, error } = useData<RecommendationSection[]>(HomeRecommendationQueries.sections, fetchSections);
  useFocusEffect(useCallback(() => {
    refreshHomeRecommendations();
    const subscription = AppState.addEventListener(HomePolicy.applicationStateEvent, state => {
      if (state === HomePolicy.activeApplicationState) refreshHomeRecommendations();
    });
    return () => subscription.remove();
  }, []));
  const visibleSections = sections?.filter(section => section.id !== HomePolicy.recentSectionIdentifier);
  return <PageContainer>
    <ContentContainer>
      <HeaderContainer>
        <StyledImage source={{ uri: PLACEHOLDER_PROFILE_PIC }} navigation={navigation} redirect={HomePolicy.profileRoute} />
        <HeaderTitle>{HOME_HEADER_TEXT}{PLACEHOLDER_USERNAME}</HeaderTitle>
      </HeaderContainer>
      <RecentQuickGrid navigation={navigation} />
      {error && <HomeQueryFeedback message={HomeCopy.sectionsFailure} retry={refreshHomeRecommendations} />}
      {loading && sectionSkeletons.map((_, index) => <HorizontalCardCarousel key={index}
        navigation={navigation} sectionTitle={index === HomePolicy.firstSkeletonIndex ? HomeCopy.loading : HomeCopy.noHeading} content={[]} isLoading />)}
      {!loading && !error && sections?.length === HomePolicy.emptyCount && <View>
        <SectionTitle>{HomeCopy.emptyTitle}</SectionTitle>
        <DefaultText style={styles.muted}>{HomeCopy.emptyDescription}</DefaultText>
      </View>}
      {visibleSections?.map(section => <HomeSection key={section.id} section={section} navigation={navigation} />)}
    </ContentContainer>
    <Navbar navigation={navigation} route={route} />
  </PageContainer>;
}

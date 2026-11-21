import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import DefaultText from '../../components/DefaultText';
import SectionTitle from '../../components/SectionTitle';
import { colors, typography } from '../../constants/styling';
import { useApi } from '../../hooks/useApi';
import { invalidateCache, useData } from '../../services/DataProvider';
import { HomeRecommendationQueries } from '../../services/home/HomeRecommendationQueries';
import {
  RecommendationOverview,
  RecommendationRoutes,
} from '../../services/recommendations/RecommendationContracts';
import { moderateScale, scale } from '../../utils/scaling';

const styles = StyleSheet.create({
  row: { gap: scale(12) },
  card: {
    width: moderateScale(164),
    minHeight: moderateScale(140),
    padding: scale(16),
    gap: scale(10),
    borderRadius: moderateScale(12),
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 4,
    borderTopColor: colors.accentPrimary,
  },
  title: { fontSize: typography.itemTitle, fontWeight: '700' },
  muted: { color: colors.slightlyTransparentText },
  retry: { color: colors.accentPrimary, paddingVertical: scale(8) },
});

export default function RecommendationPlaylists({
  navigation,
}: {
  navigation: { navigate(route: string, parameters: object): void };
}) {
  const api = useApi();
  const { data, loading, error } = useData<RecommendationOverview>(
    HomeRecommendationQueries.playlists,
    async signal =>
      (
        await api.get<RecommendationOverview>(RecommendationRoutes.overview, {
          signal,
        })
      ).data,
  );
  return (
    <View>
      <SectionTitle>Recommendations</SectionTitle>
      {error ? (
        <View>
          <DefaultText accessibilityRole="alert" style={styles.muted}>
            Recommended playlists could not be loaded.
          </DefaultText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry recommended playlists"
            onPress={() => invalidateCache(HomeRecommendationQueries.playlists)}
          >
            <DefaultText style={styles.retry}>Try again</DefaultText>
          </Pressable>
        </View>
      ) : loading ? (
        <DefaultText style={styles.muted}>
          Loading recommended playlists…
        </DefaultText>
      ) : data?.cards.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {data.cards.map(card => (
            <Pressable
              key={card.mode}
              accessibilityRole="button"
              accessibilityLabel={card.title}
              accessibilityHint="Open recommended playlist"
              style={styles.card}
              onPress={() =>
                navigation.navigate(RecommendationRoutes.screen, {
                  mode: card.mode,
                  playlistTitle: card.title,
                })
              }
            >
              <DefaultText style={styles.title}>{card.title}</DefaultText>
              <DefaultText style={styles.muted}>{card.description}</DefaultText>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <DefaultText style={styles.muted}>
          Recommended playlists will appear as your music is analyzed.
        </DefaultText>
      )}
    </View>
  );
}

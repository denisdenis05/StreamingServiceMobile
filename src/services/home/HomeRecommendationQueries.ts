export const HomeRecommendationQueries = Object.freeze({
  recentQuick: 'recent_quick',
  sections: 'home_sections',
  playlists: 'home_recommendation_playlists',
  sectionPrefix: 'section_',
  sectionsRoute: 'Recommendation/sections',
  sectionRoutePrefix: 'Recommendation/section/',
  recentQuickRoute: 'Recommendation/recent-quick?count=6',
});
export const homeSectionQuery = (identifier: string): string => HomeRecommendationQueries.sectionPrefix + identifier;
export const isHomeRecommendationQuery = (key: string): boolean => key === HomeRecommendationQueries.recentQuick ||
  key === HomeRecommendationQueries.sections || key === HomeRecommendationQueries.playlists || key.startsWith(HomeRecommendationQueries.sectionPrefix);

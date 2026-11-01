export const HomeRecommendationQueries = Object.freeze({
  recentQuick: 'recent_quick',
  sections: 'home_sections',
  sectionPrefix: 'section_',
  sectionsRoute: 'Recommendation/sections',
  sectionRoutePrefix: 'Recommendation/section/',
  recentQuickRoute: 'Recommendation/recent-quick?count=6',
});
export const homeSectionQuery = (identifier: string): string => HomeRecommendationQueries.sectionPrefix + identifier;
export const isHomeRecommendationQuery = (key: string): boolean => key === HomeRecommendationQueries.recentQuick ||
  key === HomeRecommendationQueries.sections || key.startsWith(HomeRecommendationQueries.sectionPrefix);

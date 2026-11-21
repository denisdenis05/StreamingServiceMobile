import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppState, AppStateStatus, Pressable, Text } from 'react-native';
import Home from '../src/pages/Home/Home.render';
import { HomeCollectionRoutes, HomeCollectionType, homeCollectionDestination } from '../src/services/home/HomeCollectionNavigation';
import { HomeRecommendationQueries, homeSectionQuery } from '../src/services/home/HomeRecommendationQueries';
import HorizontalCardCarousel from '../src/components/HorizontalCardCarousel/HorizontalCardCarousel.render';
import CachedImage from '../src/components/CachedImage';
import { RecommendationModes } from '../src/services/recommendations/RecommendationContracts';

const mockQuerySnapshots = new Map<string, { data: unknown; loading: boolean; error: Error | null }>();
const mockInvalidate = jest.fn();
const mockRefresh = jest.fn();
const mockFocusEffects: Array<() => () => void> = [];
const mockNetwork = { get: jest.fn() };
jest.mock('../src/services/DataProvider', () => ({
  useData: (key: string) => mockQuerySnapshots.get(key) ?? { data: [], loading: false, error: null },
  invalidateCache: (key: string) => mockInvalidate(key),
  refreshHomeRecommendations: () => mockRefresh(),
}));
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: () => () => void) => mockFocusEffects.push(effect) }));
jest.mock('../src/components/PageContainer', () => ({ children }: { children: React.ReactNode }) => children);
jest.mock('../src/components/Navbar', () => () => null);
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../src/components/SkeletonLoader/SkeletonLoader', () => () => null);
const Fixture = Object.freeze({
  albumIdentifier: 'album-fixture', playlistIdentifier: 'playlist-fixture',
  title: 'Fixture collection', artist: 'Fixture artist', cover: 'fixture-cover',
  smallCover: 'small-fixture-cover', thumbnailCover: 'thumbnail-fixture-cover',
  recentSection: 'recent', artistsSection: 'artists', artistsTitle: 'More from your artists',
  latestSection: 'latest', latestTitle: 'Recently added albums',
  failure: 'Fixture failure', homeFailure: 'Home could not be loaded.',
  retry: 'Try again', initial: 0, firstCall: 0, secondCall: 1, once: 1, twice: 2,
  active: 'active', background: 'background', unknownType: 'unsupported',
});
const navigation = { navigate: jest.fn() };
const album = { id: Fixture.albumIdentifier, title: Fixture.title, artistName: Fixture.artist,
  cover: Fixture.cover, smallCover: Fixture.smallCover, verySmallCover: Fixture.thumbnailCover,
  type: HomeCollectionType.Album };
const playlist = { ...album, id: Fixture.playlistIdentifier, type: HomeCollectionType.Playlist, canEdit: true };
let renderer: ReactTestRenderer;
const texts = () => renderer.root.findAllByType(Text).map(element => element.props.children).flat().join();
async function renderHome() { await act(async () => { renderer = create(<Home navigation={navigation} route={{}} />); }); }
beforeEach(() => {
  jest.clearAllMocks(); mockQuerySnapshots.clear(); mockFocusEffects.length = Fixture.initial;
  mockQuerySnapshots.set(HomeRecommendationQueries.playlists, { data: null, loading: false, error: null });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.restoreAllMocks(); });

test('album cards preserve all album navigation metadata', () => {
  expect(homeCollectionDestination(album)).toEqual({ route: HomeCollectionRoutes.album,
    parameters: { albumId: album.id, albumTitle: album.title, albumArtist: album.artistName,
      albumCover: album.cover, albumSmallCover: album.smallCover, albumVerySmallCover: album.verySmallCover } });
});

test('playlist navigation requires explicit server edit capability', () => {
  expect(homeCollectionDestination(playlist)?.parameters).toMatchObject({ playlistId: playlist.id, isOwner: true });
  expect(homeCollectionDestination({ ...playlist, canEdit: false })?.parameters).toMatchObject({ isOwner: false });
  const legacyPlaylist = { ...album, id: playlist.id, type: HomeCollectionType.Playlist };
  expect(homeCollectionDestination(legacyPlaylist)?.parameters).toMatchObject({ isOwner: false });
  expect(homeCollectionDestination({ ...album, type: Fixture.unknownType })).toBeNull();
});

test('recent playlist cards open the playlist and never request album artwork metadata for its identifier', async () => {
  mockQuerySnapshots.set(HomeRecommendationQueries.recentQuick, { data: [playlist], loading: false, error: null });
  await renderHome();
  const card = renderer.root.findByProps({ accessibilityLabel: Fixture.title });
  await act(async () => card.props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(HomeCollectionRoutes.playlist, expect.objectContaining({ playlistId: playlist.id, isOwner: true }));
  const artwork = renderer.root.findAllByType(CachedImage).find(element => element.props.cover === playlist.cover);
  expect(artwork?.props.releaseId).toBeUndefined();
});

test('does not duplicate the recently played grid as a carousel', async () => {
  mockQuerySnapshots.set(HomeRecommendationQueries.sections, { data: [
    { id: Fixture.recentSection, title: Fixture.title },
    { id: Fixture.artistsSection, title: Fixture.artistsTitle },
  ], loading: false, error: null });
  mockQuerySnapshots.set(homeSectionQuery(Fixture.artistsSection), { data: [album], loading: false, error: null });
  await renderHome();
  const carousels = renderer.root.findAllByType(HorizontalCardCarousel);
  expect(carousels).toHaveLength(Fixture.once);
  expect(carousels[Fixture.firstCall].props.sectionTitle).toBe(Fixture.artistsTitle);
});

test('recommendations reuse the album carousel and open the existing playlist view with the generated collage', async () => {
  const cards = [
    { mode: RecommendationModes.daily, title: "Today's playlist", description: 'Daily tracks' },
    { mode: RecommendationModes.calm, title: 'Take it easy', description: 'Calmer tracks' },
    { mode: RecommendationModes.smartShuffle, title: 'Smart shuffle', description: 'A varied flow' },
  ].map(card => ({ id: card.mode, title: card.title, artistName: card.description, cover: 'playlist-collage',
    type: HomeCollectionType.Recommendation,
    recommendation: { request: { mode: card.mode }, page: { tracks: [], mode: card.mode, continuationToken: null, explanation: card.description, featureGeneration: 'fixture' },
      cover: 'playlist-collage', dailyVersion: null, savedPlaylistId: null } }));
  mockQuerySnapshots.set(HomeRecommendationQueries.playlists, { data: cards, loading: false, error: null });
  await renderHome();
  const carousel = renderer.root.findByType(HorizontalCardCarousel);
  expect(carousel.props.sectionTitle).toBe('Recommendations');
  expect(carousel.props.content).toEqual(cards);
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Open recommendations' })).toHaveLength(0);
  const clickables = carousel.findAll(element => typeof element.props.onPress === 'function');
  await act(async () => clickables[0].props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(HomeCollectionRoutes.playlist, {
    playlistTitle: cards[0].title, playlistOwner: cards[0].artistName,
    playlistCover: cards[0].cover, recommendation: cards[0].recommendation,
  });
  for (const image of carousel.findAllByType(CachedImage)) {
    expect(image.props.releaseId).toBeUndefined();
    expect(image.props.cover).toBe('playlist-collage');
  }
  expect(mockNetwork.get).not.toHaveBeenCalled();
});

test('recommended playlist failures retry their own query', async () => {
  mockQuerySnapshots.set(HomeRecommendationQueries.playlists, { data: null, loading: false, error: new Error(Fixture.failure) });
  await renderHome();
  expect(texts()).toContain('These recommendations could not be loaded.');
  const retry = renderer.root.findAllByType(Pressable).find(element => element.findAllByType(Text).some(label => label.props.children === Fixture.retry));
  await act(async () => retry?.props.onPress());
  expect(mockInvalidate).toHaveBeenCalledWith(HomeRecommendationQueries.playlists);
});

test('shows a useful empty Home explanation without inventing recommendations', async () => {
  await renderHome();
  expect(texts()).toContain('Your Home starts here');
  expect(renderer.root.findAllByType(HorizontalCardCarousel)).toHaveLength(Fixture.initial);
});

test('Home failures offer targeted retry and do not claim an empty library', async () => {
  mockQuerySnapshots.set(HomeRecommendationQueries.sections, { data: null, loading: false, error: new Error(Fixture.failure) });
  await renderHome();
  expect(texts()).toContain(Fixture.homeFailure);
  expect(texts()).not.toContain('Your Home starts here');
  const retry = renderer.root.findAllByType(Pressable).find(element =>
    element.findAllByType(Text).some(label => label.props.children === Fixture.retry));
  await act(async () => retry?.props.onPress());
  expect(mockRefresh).toHaveBeenCalledTimes(Fixture.once);
});

test('individual recommendation failures retry only their section', async () => {
  const key = homeSectionQuery(Fixture.artistsSection);
  mockQuerySnapshots.set(HomeRecommendationQueries.sections, { data: [{ id: Fixture.artistsSection, title: Fixture.artistsTitle }], loading: false, error: null });
  mockQuerySnapshots.set(key, { data: null, loading: false, error: new Error(Fixture.failure) });
  await renderHome();
  const retry = renderer.root.findAllByType(Pressable).find(element => element.findAllByType(Text).some(label => label.props.children === Fixture.retry));
  await act(async () => retry?.props.onPress());
  expect(mockInvalidate).toHaveBeenCalledWith(key);
});

test('focus and foreground refresh Home while background transitions do not', async () => {
  const remove = jest.fn();
  let changeState: ((state: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeState = listener;
    return { remove };
  });
  await renderHome();
  let cleanup: () => void;
  await act(async () => { cleanup = mockFocusEffects[Fixture.firstCall](); });
  expect(mockRefresh).toHaveBeenCalledTimes(Fixture.once);
  await act(async () => changeState?.(Fixture.background));
  expect(mockRefresh).toHaveBeenCalledTimes(Fixture.once);
  await act(async () => changeState?.(Fixture.active));
  expect(mockRefresh).toHaveBeenCalledTimes(Fixture.twice);
  cleanup!();
  expect(remove).toHaveBeenCalledTimes(Fixture.once);
});

test('carousel playlist cards keep playlist context and server ownership capability', async () => {
  await act(async () => { renderer = create(<HorizontalCardCarousel navigation={navigation}
    sectionTitle={Fixture.title} content={[playlist]} />); });
  const clickable = renderer.root.findAll(element => typeof element.props.onPress === 'function');
  await act(async () => clickable[Fixture.firstCall].props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(HomeCollectionRoutes.playlist, expect.objectContaining({ playlistId: playlist.id, isOwner: true }));
});

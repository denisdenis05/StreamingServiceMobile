import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import Search from '../src/pages/Search/Search.render';
import SearchEntry from '../src/components/SearchEntry';
import { ArtistRoutes } from '../src/pages/Artist/ArtistNavigation';
const mockScope = {};
const mockNetwork = { get: jest.fn() };
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
jest.mock('../src/services/DataProvider', () => ({
  useData: () => ({ data: { query: 'Fixture' }, updateData: jest.fn() }),
  useDataScope: () => mockScope,
}));
jest.mock('../MusicProvider', () => ({
  useMusicQueue: () => ({ playTracks: jest.fn() }),
}));
jest.mock('../src/services/NativeAudioRuntime', () => ({
  catalogPlaybackMapping: {},
}));
jest.mock('../src/constants/navigation', () => ({ menuOptions: [] }));
jest.mock(
  '../src/components/PageContainer',
  () =>
    ({ children }: { children: React.ReactNode }) =>
      children,
);
jest.mock('../src/components/Navbar', () => () => null);
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../src/components/SearchEntry', () => () => null);
jest.mock('../src/components/SearchEntry/SearchEntry.render', () => ({
  SearchEntrySkeleton: () => null,
}));
const Fixture = Object.freeze({
  id: 'fixture-artist',
  name: 'Fixture artist',
  image: 'fixture-image',
  debounceMilliseconds: 300,
});
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.useRealTimers();
});
test('pressing an artist search result opens its artist identity and name', async () => {
  jest.useFakeTimers();
  mockNetwork.get.mockResolvedValue({ data: { artists: [Fixture] } });
  const navigation = { navigate: jest.fn() };
  await act(async () => {
    renderer = create(<Search navigation={navigation} route={{}} />);
  });
  await act(async () => jest.advanceTimersByTime(Fixture.debounceMilliseconds));
  await act(async () =>
    renderer.root.findByType(SearchEntry).props.onPressAction(),
  );
  expect(navigation.navigate).toHaveBeenCalledWith(ArtistRoutes.screen, {
    artistId: Fixture.id,
    artistName: Fixture.name,
    artistImage: Fixture.image,
  });
});

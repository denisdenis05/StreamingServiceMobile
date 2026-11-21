import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Pressable, Text, TextInput } from 'react-native';
import Recommendations from '../src/pages/Recommendations/Recommendations.render';
import {
  RecommendationModes,
  RecommendationRoutes,
} from '../src/services/recommendations/RecommendationContracts';

const mockNetwork = { get: jest.fn(), post: jest.fn() };
const mockStart = jest.fn(async () => undefined);
const mockStop = jest.fn();
const mockRetry = jest.fn();
const mockNotify = jest.fn();
const mockPlayback = { active: false, loading: false, failure: null };
const mockAccount = 'fixture-owner';
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
jest.mock('../src/hooks/AuthContext', () => ({
  useAuth: () => ({ accountIdentifier: mockAccount }),
}));
jest.mock('../src/services/RecommendationPlaybackPlatform', () => ({
  recommendationPlayback: {
    start: (...arguments_: unknown[]) => mockStart(...(arguments_ as [])),
    stop: () => mockStop(),
    retry: () => mockRetry(),
    subscribe: () => () => undefined,
    getSnapshot: () => mockPlayback,
  },
}));
jest.mock('../src/services/LibraryChanges', () => ({
  notifyLibraryChanged: () => mockNotify(),
}));
jest.mock(
  '../src/components/PageContainer',
  () =>
    ({ children }: { children: React.ReactNode }) =>
      children,
);
jest.mock('../src/components/CachedImage', () => () => null);
const Fixture = Object.freeze({
  version: 'daily-version',
  day: '2026-11-13',
  track: 'fixture-recording',
  album: 'fixture-album',
  title: 'Fixture title',
  artist: 'Fixture artist',
  playlist: 'saved-playlist',
  playlistName: 'Saved selection',
  cover: 'local-collage',
  firstCall: 0,
  firstIndex: 0,
  once: 1,
  conflict: 409,
});
const track = {
  id: Fixture.track,
  title: Fixture.title,
  artistName: Fixture.artist,
  releaseTitle: Fixture.album,
};
const daily = {
  version: Fixture.version,
  day: Fixture.day,
  tracks: [track],
  savedPlaylistId: null,
};
const overview = {
  analyzedTracks: 100,
  cards: [
    {
      mode: RecommendationModes.daily,
      title: "Today's playlist",
      description: 'Your daily selection',
    },
    {
      mode: RecommendationModes.calm,
      title: 'Take it easy',
      description: 'Calmer tracks',
    },
  ],
};
const page = {
  tracks: [track],
  continuationToken: 'cursor',
  mode: RecommendationModes.calm,
  explanation: 'Similar sound',
  featureGeneration: Fixture.version,
};
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let renderer: ReactTestRenderer;
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(element => element.props.children)
    .flat()
    .join();
const button = (label: string) =>
  renderer.root
    .findAllByType(Pressable)
    .find(element => element.props.accessibilityLabel === label)!;
async function render(parameters: object = {}) {
  await act(async () => {
    renderer = create(
      <Recommendations
        navigation={navigation as never}
        route={{ params: parameters } as never}
      />,
    );
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockNetwork.get.mockImplementation(async (route: string) => ({
    data: route === RecommendationRoutes.overview ? overview : daily,
  }));
  mockNetwork.post.mockImplementation(async () => ({ data: page }));
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

test('empty navigation parameters load the stable daily mix and expose recommendation modes', async () => {
  await render();
  expect(mockNetwork.get).toHaveBeenCalledWith(
    RecommendationRoutes.daily,
    expect.anything(),
  );
  expect(text()).toContain(Fixture.title);
  expect(text()).toContain('Take it easy');
  expect(mockNetwork.post).not.toHaveBeenCalled();
});

test('song radio navigation forwards the selected recording and starts through the queue controller', async () => {
  const request = {
    mode: RecommendationModes.songRadio,
    recordingId: Fixture.track,
  };
  await render(request);
  expect(mockNetwork.post).toHaveBeenCalledWith(
    RecommendationRoutes.generate,
    request,
    expect.anything(),
  );
  await act(async () => button('Play selection').props.onPress());
  expect(mockStart).toHaveBeenCalledWith(request, page, Fixture.firstIndex);
  expect(navigation.navigate).toHaveBeenCalledWith(
    RecommendationRoutes.playing,
  );
});

test('explicit regeneration uses the current version and never silently regenerates on reload', async () => {
  await render();
  mockNetwork.post.mockResolvedValueOnce({ data: daily });
  await act(async () => button('Regenerate today').props.onPress());
  expect(mockNetwork.post).toHaveBeenCalledWith(
    RecommendationRoutes.regenerate,
    { expectedVersion: Fixture.version },
    expect.anything(),
  );
});

test('saving snapshots the ordered tracks and opens the saved playlist with its generated cover', async () => {
  await render();
  mockNetwork.post.mockResolvedValueOnce({
    data: {
      id: Fixture.playlist,
      name: Fixture.playlistName,
      cover: Fixture.cover,
    },
  });
  const input = renderer.root.findByType(TextInput);
  await act(async () => input.props.onChangeText(Fixture.playlistName));
  await act(async () => button('Save as playlist').props.onPress());
  expect(mockNetwork.post).toHaveBeenCalledWith(
    RecommendationRoutes.playlists,
    {
      name: Fixture.playlistName,
      recordingIds: [Fixture.track],
      dailyVersion: Fixture.version,
    },
  );
  expect(mockNotify).toHaveBeenCalledTimes(Fixture.once);
  expect(navigation.navigate).toHaveBeenCalledWith(
    'PlaylistViewer',
    expect.objectContaining({
      playlistId: Fixture.playlist,
      playlistCover: Fixture.cover,
      isOwner: true,
    }),
  );
});

test('load failures offer retry and expose no backend exception details', async () => {
  mockNetwork.get.mockImplementation(async (route: string) => {
    if (route === RecommendationRoutes.daily)
      throw new Error('private backend details');
    return { data: overview };
  });
  await render();
  expect(text()).toContain('Recommendations could not be loaded. Try again.');
  expect(text()).not.toContain('private backend details');
  expect(button('Try again')).toBeDefined();
});

test('unmount aborts unfinished requests and their late response cannot start playback', async () => {
  let resolve: (value: unknown) => void = () => undefined;
  mockNetwork.get.mockImplementation((route: string) =>
    route === RecommendationRoutes.daily
      ? new Promise(complete => {
          resolve = complete;
        })
      : Promise.resolve({ data: overview }),
  );
  await render();
  const signal = mockNetwork.get.mock.calls.find(
    call => call[0] === RecommendationRoutes.daily,
  )![1].signal;
  await act(async () => renderer.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ data: daily }));
  expect(mockStart).not.toHaveBeenCalled();
});

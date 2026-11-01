import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PlaylistSong from '../src/components/PlaylistSong/PlaylistSong.render';
import CollectionViewer from '../src/components/CollectionViewer/CollectionViewer.render';
import PlaylistViewer from '../src/pages/PlaylistViewer/PlaylistViewer.render';
import ContextMenu from '../src/components/ContextMenu/ContextMenu.render';
import AddToPlaylist from '../src/pages/AddToPlaylist/AddToPlaylist.render';
import CreatePlaylist from '../src/pages/CreatePlaylist/CreatePlaylist.render';
import { getLibraryRevision } from '../src/services/LibraryChanges';
import { Recording } from '../src/constants/types';

jest.mock('../src/constants/navigation', () => ({ menuOptions: [] }));
jest.mock('../src/hooks/useCollectionRecordings', () => ({
  CollectionRecordingPolicy: { playlist: 'playlist' },
  useCollectionRecordings: () => ({ recordings: [mockSong], loading: false, error: null, loadMore: jest.fn(), retry: jest.fn() }),
}));
jest.mock('../src/components/CachedImage', () => () => null);
jest.mock('../MusicProvider', () => ({ useMusicQueue: () => ({ currentTrack: null }) }));
jest.mock('../src/components/PlayingOverlay', () => () => null);
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
const mockNetwork = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };
const Fixture = Object.freeze({
  identifier: 'owned-playlist', song: 'recording', name: 'Fixture playlist',
  title: 'Fixture song', artist: 'Fixture artist', album: 'Fixture album', cover: 'fixture-cover',
  liked: 'Liked song', empty: 'Playlist is empty', loading: 'Loading songs…',
  error: 'Songs could not be refreshed. Try again.', create: 'Create New Playlist',
  remove: 'Remove from playlist', coordinate: 0,
  save: 'Save Changes', alert: 'alert', button: 'button', revisionStep: 1,
  noCalls: 0, oneCall: 1,
});
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
let renderer: ReactTestRenderer;
const mockSong = { id: Fixture.song, title: Fixture.title, artistName: Fixture.artist, isLiked: true } as Recording;
const collection = {
  navigation, title: Fixture.name, subtitle: Fixture.artist, cover: Fixture.cover,
  songs: [] as Recording[], onPlay: jest.fn(), onSongPlay: jest.fn(), onSongMorePress: jest.fn(), emptyMessage: Fixture.empty,
};
const renderedText = () => renderer.root.findAllByType(Text).map(element => element.props.children).flat().join();
const pressText = async (text: string) => {
  const button = renderer.root.findAllByType(TouchableOpacity).find(element =>
    element.findAllByType(Text).some(label => label.props.children === text));
  if (!button) throw new Error(text);
  await act(async () => button.props.onPress());
};
beforeEach(() => {
  jest.clearAllMocks();
  mockNetwork.get.mockResolvedValue({ data: [{ id: Fixture.identifier, name: Fixture.name }] });
  mockNetwork.post.mockResolvedValue({ data: {} });
  mockNetwork.put.mockResolvedValue({ data: {} });
  mockNetwork.delete.mockResolvedValue({ data: {} });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

test('renders an accessible filled heart only for liked rows', async () => {
  const properties = { navigation, songId: Fixture.song, songTitle: Fixture.title, songAuthor: Fixture.artist,
    albumId: Fixture.album, albumTitle: Fixture.album, albumCover: Fixture.cover, playAction: jest.fn(), onMorePress: jest.fn() };
  await act(async () => { renderer = create(<PlaylistSong {...properties} isLiked />); });
  expect(renderer.root.findAllByProps({ accessibilityLabel: Fixture.liked }).length).toBeGreaterThan(Fixture.noCalls);
  await act(async () => renderer.update(<PlaylistSong {...properties} isLiked={false} />));
  expect(renderer.root.findAllByProps({ accessibilityLabel: Fixture.liked })).toHaveLength(Fixture.noCalls);
});

test('collection passes the server liked membership to its rows', async () => {
  await act(async () => { renderer = create(<CollectionViewer {...collection} songs={[mockSong]} />); });
  expect(renderer.root.findAllByProps({ accessibilityLabel: Fixture.liked }).length).toBeGreaterThan(Fixture.noCalls);
});

test('separates initial loading from successful empty and failed refresh states', async () => {
  await act(async () => { renderer = create(<CollectionViewer {...collection} isLoading />); });
  expect(renderedText()).toContain(Fixture.loading);
  expect(renderedText()).not.toContain(Fixture.empty);
  const retry = jest.fn();
  await act(async () => renderer.update(<CollectionViewer {...collection} errorMessage={Fixture.error} onRetry={retry} />));
  expect(renderedText()).toContain(Fixture.error);
  expect(renderedText()).not.toContain(Fixture.empty);
  await pressText('Try again');
  expect(retry).toHaveBeenCalledTimes(Fixture.oneCall);
  await act(async () => renderer.update(<CollectionViewer {...collection} />));
  expect(renderedText()).toContain(Fixture.empty);
});

const addingRoute = { params: { songs: [mockSong] } };
test('adding to a playlist publishes membership changes after success', async () => {
  await act(async () => { renderer = create(<AddToPlaylist navigation={navigation} route={addingRoute} />); });
  const revision = getLibraryRevision();
  await pressText(Fixture.name);
  expect(getLibraryRevision()).toBe(revision + Fixture.revisionStep);
  expect(navigation.goBack).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('failed playlist additions preserve the page and allow retry without publishing', async () => {
  mockNetwork.post.mockRejectedValueOnce(new Error(Fixture.error));
  await act(async () => { renderer = create(<AddToPlaylist navigation={navigation} route={addingRoute} />); });
  const revision = getLibraryRevision();
  await pressText(Fixture.name);
  expect(getLibraryRevision()).toBe(revision);
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ accessibilityRole: Fixture.alert }).length).toBeGreaterThan(Fixture.noCalls);
  await pressText(Fixture.name);
  expect(getLibraryRevision()).toBe(revision + Fixture.revisionStep);
});

test('creating a playlist from selected songs refreshes library choices', async () => {
  await act(async () => { renderer = create(<AddToPlaylist navigation={navigation} route={addingRoute} />); });
  const revision = getLibraryRevision();
  await pressText(Fixture.create);
  expect(getLibraryRevision()).toBe(revision + Fixture.revisionStep);
});

test('renaming a playlist refreshes its settings label', async () => {
  const route = { params: { playlistId: Fixture.identifier, initialName: Fixture.name } };
  await act(async () => { renderer = create(<CreatePlaylist navigation={navigation} route={route} />); });
  const revision = getLibraryRevision();
  await pressText(Fixture.save);
  expect(getLibraryRevision()).toBe(revision + Fixture.revisionStep);
  expect(mockNetwork.put).toHaveBeenCalledTimes(Fixture.oneCall);
});

test('failed rename preserves input and re-enables save for retry', async () => {
  mockNetwork.put.mockRejectedValueOnce(new Error(Fixture.error));
  const route = { params: { playlistId: Fixture.identifier, initialName: Fixture.name } };
  await act(async () => { renderer = create(<CreatePlaylist navigation={navigation} route={route} />); });
  const revision = getLibraryRevision();
  await pressText(Fixture.save);
  expect(getLibraryRevision()).toBe(revision);
  expect(navigation.goBack).not.toHaveBeenCalled();
  await pressText(Fixture.save);
  expect(getLibraryRevision()).toBe(revision + Fixture.revisionStep);
});

async function openRemovalMenu() {
  const route = { params: { playlistId: Fixture.identifier, playlistTitle: Fixture.name,
    playlistOwner: Fixture.artist, playlistCover: Fixture.cover, isOwner: true } };
  await act(async () => { renderer = create(<PlaylistViewer navigation={navigation} route={route} />); });
  await act(async () => renderer.root.findByType(CollectionViewer).props.onSongMorePress(
    { nativeEvent: { pageX: Fixture.coordinate, pageY: Fixture.coordinate } }, mockSong,
  ));
  return renderer.root.findByType(ContextMenu).props.options.find((option: { label: string }) => option.label === Fixture.remove);
}

test('removing a liked playlist member publishes a heart refresh after success', async () => {
  const action = await openRemovalMenu();
  const revision = getLibraryRevision();
  await act(async () => action.onClick());
  expect(mockNetwork.delete).toHaveBeenCalledTimes(Fixture.oneCall);
  expect(getLibraryRevision()).toBe(revision + Fixture.revisionStep);
});

test('failed removal preserves membership and gives visible feedback without publishing', async () => {
  mockNetwork.delete.mockRejectedValueOnce(new Error(Fixture.error));
  const action = await openRemovalMenu();
  const revision = getLibraryRevision();
  await act(async () => action.onClick());
  expect(getLibraryRevision()).toBe(revision);
  expect(renderer.root.findByType(CollectionViewer).props.songs).toContain(mockSong);
  expect(renderer.root.findByType(CollectionViewer).props.errorMessage).toBeTruthy();
});

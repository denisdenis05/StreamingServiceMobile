import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import PlaylistViewer from '../src/pages/PlaylistViewer/PlaylistViewer.render';
import CollectionViewer from '../src/components/CollectionViewer';
import ContextMenu from '../src/components/ContextMenu/ContextMenu.render';
import { RecommendationModes, RecommendationRoutes } from '../src/services/recommendations/RecommendationContracts';

const mockNetwork = { get: jest.fn(), post: jest.fn() };
const mockStart = jest.fn(async () => undefined);
const mockPlaySaved = jest.fn();
const mockNotify = jest.fn();
let mockScope = {};
const mockRecordings: never[] = [];
const mockSavedRecordings = jest.fn(() => ({ recordings: mockRecordings, loading: false, error: null, loadMore: jest.fn(), retry: jest.fn() }));
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
jest.mock('../src/services/DataProvider', () => ({ useDataScope: () => mockScope }));
jest.mock('../src/hooks/useCollectionRecordings', () => ({ CollectionRecordingPolicy: { playlist: 'playlist' }, useCollectionRecordings: (...args: unknown[]) => mockSavedRecordings(...args as []) }));
jest.mock('../MusicProvider', () => ({ useMusicQueue: () => ({ playPlaylist: mockPlaySaved }) }));
jest.mock('../src/services/RecommendationPlaybackPlatform', () => ({ recommendationPlayback: { start: (...args: unknown[]) => mockStart(...args as []) } }));
jest.mock('../src/services/LibraryChanges', () => ({ notifyLibraryChanged: () => mockNotify() }));
jest.mock('../src/components/CollectionViewer', () => () => null);
jest.mock('../src/components/ContextMenu/ContextMenu.render', () => () => null);
jest.mock('../src/constants/navigation', () => ({ menuOptions: [{ label: 'Add to playlist' }] }));

const tracks = [
  { id: 'first', title: 'First song', artistName: 'First artist', releaseTitle: 'First album', cover: 'first-cover', isLiked: true },
  { id: 'second', title: 'Second song', artistName: 'Second artist', releaseTitle: 'Second album', cover: 'second-cover' },
];
const preview = {
  request: { mode: RecommendationModes.daily },
  page: { tracks, continuationToken: null, mode: RecommendationModes.daily, explanation: 'Daily tracks', featureGeneration: 'version' },
  cover: 'generated-playlist-collage', dailyVersion: 'version', savedPlaylistId: null,
};
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let renderer: ReactTestRenderer;
const collection = () => renderer.root.findByType(CollectionViewer);
async function render(params: object = { playlistTitle: "Today's playlist", recommendation: preview }) {
  await act(async () => { renderer = create(<PlaylistViewer navigation={navigation} route={{ params }} />); });
}
async function menu() {
  await act(async () => collection().props.onMorePress({ nativeEvent: { pageX: 0, pageY: 0 } }));
  return renderer.root.findByType(ContextMenu).props.options as Array<{ label: string; onClick(): Promise<void> }>;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockScope = {};
  mockNetwork.post.mockResolvedValue({ data: preview });
  mockNetwork.get.mockResolvedValue({ data: { cover: 'saved-collage' } });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

test('a recommendation uses the existing playlist view, generated collage and standard song rows', async () => {
  await render();
  expect(collection().props).toMatchObject({ title: "Today's playlist", cover: preview.cover, songs: tracks, isLoading: false });
  expect(mockSavedRecordings).toHaveBeenCalledWith('', 'playlist', false);
  expect(mockNetwork.get).not.toHaveBeenCalled();
  expect(mockNetwork.post).not.toHaveBeenCalled();
});

test('playing a recommendation at a selected row never requires a saved playlist', async () => {
  await render();
  await act(async () => collection().props.onSongPlay(1));
  expect(mockStart).toHaveBeenCalledWith(preview.request, preview.page, 1);
  expect(navigation.navigate).toHaveBeenCalledWith('Playing', {});
  expect(mockPlaySaved).not.toHaveBeenCalled();
  expect(mockNetwork.post).not.toHaveBeenCalled();
});

test('the existing playlist menu saves the ordered selection and opens the saved playlist', async () => {
  await render();
  const options = await menu();
  expect(options.map(option => option.label)).not.toContain('Edit Playlist');
  mockNetwork.post.mockResolvedValueOnce({ data: { id: 'saved', name: "Today's playlist", cover: 'saved-collage' } });
  await act(async () => options.find(option => option.label === 'Save as playlist')!.onClick());
  expect(mockNetwork.post).toHaveBeenCalledWith(RecommendationRoutes.playlists, { name: "Today's playlist", recordingIds: ['first', 'second'], dailyVersion: 'version' });
  expect(mockNotify).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('PlaylistViewer', expect.objectContaining({ playlistId: 'saved', playlistCover: 'saved-collage', isOwner: true }));
});

test('song radio also uses the standard playlist view and server cover generator', async () => {
  const request = { mode: RecommendationModes.songRadio, recordingId: 'first' };
  mockNetwork.post.mockResolvedValueOnce({ data: { ...preview, request, dailyVersion: null } });
  await render(request);
  expect(mockNetwork.post).toHaveBeenCalledWith(RecommendationRoutes.preview, request, expect.objectContaining({ signal: expect.anything() }));
  expect(collection().props.title).toBe('Song radio');
  expect(collection().props.cover).toBe(preview.cover);
});

test('daily mixes regenerate only through the explicit playlist menu action', async () => {
  await render();
  expect(mockNetwork.post).not.toHaveBeenCalled();
  const options = await menu();
  await act(async () => options.find(option => option.label === 'Regenerate today')!.onClick());
  expect(mockNetwork.post).toHaveBeenCalledWith(RecommendationRoutes.regenerate, { expectedVersion: 'version' }, expect.anything());
  expect(mockNetwork.post).toHaveBeenCalledWith(RecommendationRoutes.preview + '?refresh=true', preview.request, expect.anything());
});

test('an already saved daily mix keeps playback and omits another save action', async () => {
  await render({ recommendation: { ...preview, savedPlaylistId: 'already-saved' } });
  expect((await menu()).map(option => option.label)).not.toContain('Save as playlist');
  await act(async () => collection().props.onPlay());
  expect(mockStart).toHaveBeenCalledWith(preview.request, preview.page, 0);
});

test('load failures use the existing playlist retry and hide backend exception details', async () => {
  mockNetwork.post.mockRejectedValueOnce(new Error('private backend details'));
  await render({ mode: RecommendationModes.calm });
  expect(collection().props.errorMessage).toBe('The recommended playlist could not be loaded. Try again.');
  expect(collection().props.songs).toEqual([]);
  await act(async () => collection().props.onRetry());
  expect(collection().props.songs).toEqual(tracks);
});

test('unmount aborts a pending preview and ignores its late response', async () => {
  let complete: (response: unknown) => void = () => undefined;
  mockNetwork.post.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  await render({ mode: RecommendationModes.calm });
  const signal = mockNetwork.post.mock.calls[0][2].signal;
  await act(async () => renderer.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () => complete({ data: preview }));
  expect(mockStart).not.toHaveBeenCalled();
});

test('save failure preserves the recommendation for playback and retry', async () => {
  await render();
  mockNetwork.post.mockRejectedValueOnce(new Error('save failed'));
  const options = await menu();
  await act(async () => options.find(option => option.label === 'Save as playlist')!.onClick());
  expect(collection().props.songs).toEqual(tracks);
  expect(collection().props.errorMessage).toBe('The playlist could not be saved. Try again.');
  expect(mockNotify).not.toHaveBeenCalled();
});

test('switching accounts hides the old preview and ignores a pending save result', async () => {
  const params = { recommendation: preview };
  await render(params);
  let complete: (response: unknown) => void = () => undefined;
  mockNetwork.post.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const options = await menu();
  let save: Promise<void>;
  act(() => { save = options.find(option => option.label === 'Save as playlist')!.onClick(); });
  mockNetwork.post.mockResolvedValueOnce({ data: { ...preview, page: { ...preview.page, tracks: [] } } });
  mockScope = {};
  await act(async () => renderer.update(<PlaylistViewer navigation={navigation} route={{ params }} />));
  expect(collection().props.songs).toEqual([]);
  await act(async () => { complete({ data: { id: 'old-account-playlist', name: 'Old', cover: '' } }); await save; });
  expect(mockNotify).not.toHaveBeenCalled();
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('saved playlists keep their existing loader, artwork and playback path', async () => {
  await render({ playlistId: 'saved', playlistTitle: 'Saved playlist', playlistCover: 'old-cover', isOwner: true });
  expect(mockSavedRecordings).toHaveBeenCalledWith('saved', 'playlist', true);
  expect(collection().props.cover).toBe('saved-collage');
  await act(async () => collection().props.onPlay());
  expect(mockPlaySaved).toHaveBeenCalledWith('saved', 0, undefined);
  expect(mockNetwork.post).not.toHaveBeenCalled();
});

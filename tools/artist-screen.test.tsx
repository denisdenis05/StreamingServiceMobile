import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import ArtistPage from '../src/pages/Artist/Artist.render';
import { artistMenuDestination } from '../src/pages/Artist/ArtistNavigation';
const mockNetwork = { get: jest.fn() };
let mockAccount = 'owner';
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
jest.mock('../src/hooks/AuthContext', () => ({
  useAuth: () => ({ accountIdentifier: mockAccount }),
}));
jest.mock(
  '../src/components/PageContainer',
  () =>
    ({ children }: { children: React.ReactNode }) =>
      children,
);
jest.mock('../src/components/CachedImage', () => () => null);
const Fixture = Object.freeze({
  artistId: 'artist-fixture',
  artistName: 'Fixture artist',
  albumId: 'album-fixture',
  title: 'Fixture album',
  cover: 'cover-fixture',
  recordingId: 'recording-fixture',
  offset: 24,
  first: 0,
  once: 1,
  twice: 2,
  library: 'In your library',
  catalog: 'Discography',
  retry: 'Try again',
  more: 'Load more albums',
  failure: 'Fixture failure',
  otherAccount: 'other-owner',
  owner: 'owner',
  otherArtist: 'other-artist',
});
const artist = { id: Fixture.artistId, name: Fixture.artistName, image: null };
const album = {
  id: Fixture.albumId,
  title: Fixture.title,
  artistName: Fixture.artistName,
  cover: Fixture.cover,
  smallCover: Fixture.cover,
  verySmallCover: Fixture.cover,
  type: 'EP',
};
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
let renderer: ReactTestRenderer;
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .map(element => element.props.children)
    .flat()
    .join();
const press = async (label: string) =>
  act(async () =>
    renderer.root
      .findByProps({
        accessibilityLabel: label,
        accessibilityRole:
          label === Fixture.catalog || label === Fixture.library
            ? 'tab'
            : 'button',
      })
      .props.onPress(),
  );
async function render(parameters: object = { artistId: Fixture.artistId }) {
  await act(async () => {
    renderer = create(
      <ArtistPage navigation={navigation} route={{ params: parameters }} />,
    );
  });
}
function deferred() {
  let resolve!: (response: any) => void;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockAccount = Fixture.owner;
  mockNetwork.get.mockResolvedValue({
    data: { artist, albums: [album], nextOffset: null },
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});
test('menu preserves recording and album identity without guessing artists by name', () => {
  expect(
    artistMenuDestination({
      recordingIds: [Fixture.recordingId],
      albumId: Fixture.albumId,
      albumArtist: Fixture.artistName,
    }),
  ).toEqual({
    recordingId: Fixture.recordingId,
    albumId: Fixture.albumId,
    artistName: Fixture.artistName,
  });
  expect(artistMenuDestination({ artistId: Fixture.artistId })).toEqual({
    artistId: Fixture.artistId,
  });
  expect(artistMenuDestination({ albumArtist: Fixture.artistName })).toBeNull();
});
test('library albums open the album page with artwork including EPs', async () => {
  await render();
  expect(mockNetwork.get).toHaveBeenCalledWith(
    `api/artists/${Fixture.artistId}/albums`,
    expect.objectContaining({
      params: { offset: Fixture.first, catalogSource: false },
    }),
  );
  expect(texts()).toContain(Fixture.artistName);
  await press(`Open album ${Fixture.title}`);
  expect(navigation.navigate).toHaveBeenCalledWith(
    'AlbumViewer',
    expect.objectContaining({
      albumId: Fixture.albumId,
      albumTitle: Fixture.title,
      albumSmallCover: Fixture.cover,
    }),
  );
});
test('player recording is resolved before the artist albums load', async () => {
  mockNetwork.get.mockResolvedValueOnce({ data: artist });
  await render({ recordingId: Fixture.recordingId, albumId: Fixture.albumId });
  expect(mockNetwork.get.mock.calls[Fixture.first]).toEqual([
    'api/artists/resolve',
    expect.objectContaining({
      params: { recordingId: Fixture.recordingId, albumId: Fixture.albumId },
    }),
  ]);
  expect(mockNetwork.get).toHaveBeenCalledTimes(Fixture.twice);
});
test('catalog selection cancels the library request and rejects its late results', async () => {
  const pending = deferred();
  mockNetwork.get.mockReturnValueOnce(pending.promise);
  await render();
  const signal = mockNetwork.get.mock.calls[Fixture.first][Fixture.once].signal;
  await press(Fixture.catalog);
  expect(signal.aborted).toBe(true);
  expect(mockNetwork.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      params: { offset: Fixture.first, catalogSource: true },
    }),
  );
  await act(async () =>
    pending.resolve({
      data: {
        artist,
        albums: [{ ...album, title: Fixture.failure }],
        nextOffset: null,
      },
    }),
  );
  expect(texts()).not.toContain(Fixture.failure);
});
test('pagination deduplicates albums and failures retry the same page', async () => {
  mockNetwork.get
    .mockResolvedValueOnce({
      data: { artist, albums: [album], nextOffset: Fixture.offset },
    })
    .mockRejectedValueOnce(new Error(Fixture.failure));
  await render();
  await press(Fixture.more);
  expect(texts()).toContain(Fixture.title);
  await press(Fixture.retry);
  expect(mockNetwork.get).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      params: { offset: Fixture.offset, catalogSource: false },
    }),
  );
  expect(
    renderer.root
      .findAllByType(Pressable)
      .filter(
        element =>
          element.props.accessibilityLabel === `Open album ${Fixture.title}`,
      ),
  ).toHaveLength(Fixture.once);
});
test('empty library and catalog explain their different availability', async () => {
  mockNetwork.get.mockResolvedValue({
    data: { artist, albums: [], nextOffset: null },
  });
  await render();
  expect(texts()).toContain('No albums by this artist are in your library');
  await press(Fixture.catalog);
  expect(texts()).toContain('No releases were found');
});
test('identity resolution failures support retry', async () => {
  mockNetwork.get
    .mockRejectedValueOnce(new Error(Fixture.failure))
    .mockResolvedValueOnce({ data: artist });
  await render({ recordingId: Fixture.recordingId });
  expect(texts()).toContain('This artist could not be opened');
  await press(Fixture.retry);
  expect(texts()).toContain(Fixture.title);
});
test('account changes clear albums and reject previous account results', async () => {
  const pending = deferred();
  mockNetwork.get.mockReturnValueOnce(pending.promise);
  await render();
  const signal = mockNetwork.get.mock.calls[Fixture.first][Fixture.once].signal;
  mockAccount = Fixture.otherAccount;
  mockNetwork.get.mockResolvedValueOnce({
    data: { artist, albums: [], nextOffset: null },
  });
  await act(async () =>
    renderer.update(
      <ArtistPage
        navigation={navigation}
        route={{ params: { artistId: Fixture.artistId } }}
      />,
    ),
  );
  expect(signal.aborted).toBe(true);
  await act(async () =>
    pending.resolve({ data: { artist, albums: [album], nextOffset: null } }),
  );
  expect(texts()).not.toContain(Fixture.title);
});
test('artist changes clear previous albums immediately', async () => {
  await render();
  const pending = deferred();
  mockNetwork.get.mockReturnValueOnce(pending.promise);
  await act(async () =>
    renderer.update(
      <ArtistPage
        navigation={navigation}
        route={{ params: { artistId: Fixture.otherArtist } }}
      />,
    ),
  );
  expect(texts()).not.toContain(Fixture.title);
  expect(mockNetwork.get).toHaveBeenLastCalledWith(
    `api/artists/${Fixture.otherArtist}/albums`,
    expect.anything(),
  );
});

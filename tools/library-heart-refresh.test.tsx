import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';
import { LibraryChangeStore, notifyLibraryChanged } from '../src/services/LibraryChanges';

const Fixture = Object.freeze({
  playlist: 'owned-playlist', otherPlaylist: 'other-owned-playlist', account: 'account-one',
  otherAccount: 'account-two', recording: 'recording-one', title: 'Fixture song',
  firstIndex: 0, secondIndex: 1, oneRequest: 1, twoRequests: 2, threeRequests: 3,
});
const mockNetwork = { get: jest.fn() };
let mockAccount = Fixture.account as string | null;
const mockAuthenticationListeners = new Set<() => void>();
jest.mock('../src/hooks/useApi', () => ({ useApi: () => mockNetwork }));
jest.mock('../src/services/AuthenticationService', () => ({ authenticationSession: {
  getSnapshot: () => ({ accountIdentifier: mockAccount }),
  subscribe: (listener: () => void) => {
    mockAuthenticationListeners.add(listener);
    return () => mockAuthenticationListeners.delete(listener);
  },
} }));

const { useData, useDataScope } = require('../src/services/DataProvider') as typeof import('../src/services/DataProvider');
const { useCollectionRecordings, CollectionRecordingPolicy } = require('../src/hooks/useCollectionRecordings') as typeof import('../src/hooks/useCollectionRecordings');

type RecordingState = ReturnType<typeof useCollectionRecordings>;
let snapshot: RecordingState;
let renderer: ReactTestRenderer;
const requests: Array<{ resolve: (response: { data: unknown[] }) => void; reject: (failure: Error) => void }> = [];
function Probe({ identifier = Fixture.playlist, kind = CollectionRecordingPolicy.playlist }: {
  identifier?: string; kind?: typeof CollectionRecordingPolicy.playlist | typeof CollectionRecordingPolicy.album;
}) {
  snapshot = useCollectionRecordings(identifier, kind);
  return <View />;
}
const recording = (isLiked: boolean) => ({ id: Fixture.recording, title: Fixture.title, isLiked });
async function renderProbe() { await act(async () => { renderer = create(<Probe />); }); }
async function finishRequest(index: number, recordings: unknown[]) {
  await act(async () => { requests[index].resolve({ data: recordings }); });
}

beforeEach(() => {
  mockAccount = Fixture.account;
  requests.length = CollectionRecordingPolicy.emptyCount;
  mockNetwork.get.mockReset().mockImplementation(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

test('publishes stable revisions and supports unsubscribe', () => {
  const changes = new LibraryChangeStore();
  const initialRevision = changes.getSnapshot();
  const listener = jest.fn();
  const unsubscribe = changes.subscribe(listener);
  changes.publish();
  expect(changes.getSnapshot()).toBe(initialRevision + Fixture.oneRequest);
  expect(listener).toHaveBeenCalledTimes(Fixture.oneRequest);
  unsubscribe();
  changes.publish();
  expect(listener).toHaveBeenCalledTimes(Fixture.oneRequest);
});

test('refreshes mounted playlist hearts after a library change and clears stale indicators while waiting', async () => {
  await renderProbe();
  await finishRequest(Fixture.firstIndex, [recording(false)]);
  expect(snapshot.recordings[Fixture.firstIndex].isLiked).toBe(false);
  await act(async () => notifyLibraryChanged());
  expect(snapshot.recordings).toEqual([]);
  expect(mockNetwork.get).toHaveBeenCalledTimes(Fixture.twoRequests);
  await finishRequest(Fixture.secondIndex, [recording(true)]);
  expect(snapshot.recordings[Fixture.firstIndex].isLiked).toBe(true);
});

test('aborts the previous refresh and ignores late responses', async () => {
  await renderProbe();
  const previousSignal = mockNetwork.get.mock.calls[Fixture.firstIndex][Fixture.secondIndex].signal;
  await act(async () => notifyLibraryChanged());
  expect(previousSignal.aborted).toBe(true);
  await finishRequest(Fixture.secondIndex, [recording(true)]);
  await finishRequest(Fixture.firstIndex, [recording(false)]);
  expect(snapshot.recordings[Fixture.firstIndex].isLiked).toBe(true);
});

test('discards old account results when authentication changes', async () => {
  await renderProbe();
  await act(async () => {
    mockAccount = Fixture.otherAccount;
    for (const listener of mockAuthenticationListeners) listener();
  });
  await finishRequest(Fixture.firstIndex, [recording(true)]);
  expect(snapshot.recordings).toEqual([]);
  await finishRequest(Fixture.secondIndex, [recording(false)]);
  expect(snapshot.recordings[Fixture.firstIndex].isLiked).toBe(false);
});

test('replaces playlist content when route identity changes', async () => {
  await renderProbe();
  await finishRequest(Fixture.firstIndex, [recording(true)]);
  await act(async () => renderer.update(<Probe identifier={Fixture.otherPlaylist} />));
  expect(snapshot.recordings).toEqual([]);
  await finishRequest(Fixture.secondIndex, [recording(false)]);
  expect(snapshot.recordings[Fixture.firstIndex].isLiked).toBe(false);
});

test('paginates once per page and preserves all rows after appending', async () => {
  await renderProbe();
  const firstPage = Array.from({ length: CollectionRecordingPolicy.pageSize }, () => recording(true));
  await finishRequest(Fixture.firstIndex, firstPage);
  await act(async () => { snapshot.loadMore(); snapshot.loadMore(); });
  expect(mockNetwork.get).toHaveBeenCalledTimes(Fixture.twoRequests);
  await finishRequest(Fixture.secondIndex, [recording(false)]);
  expect(snapshot.recordings).toHaveLength(CollectionRecordingPolicy.pageSize + Fixture.oneRequest);
  expect(snapshot.hasMore).toBe(false);
  await act(async () => snapshot.loadMore());
  expect(mockNetwork.get).toHaveBeenCalledTimes(Fixture.twoRequests);
});

test('failed pages preserve rows and retry the failed page', async () => {
  await renderProbe();
  await finishRequest(Fixture.firstIndex, Array.from({ length: CollectionRecordingPolicy.pageSize }, () => recording(true)));
  await act(async () => snapshot.loadMore());
  await act(async () => requests[Fixture.secondIndex].reject(new Error(CollectionRecordingPolicy.failure)));
  expect(snapshot.recordings).toHaveLength(CollectionRecordingPolicy.pageSize);
  expect(snapshot.error).toBe(CollectionRecordingPolicy.failure);
  await act(async () => snapshot.retry());
  expect(mockNetwork.get).toHaveBeenCalledTimes(Fixture.threeRequests);
  const retryRoute = mockNetwork.get.mock.calls.at(-Fixture.oneRequest)[Fixture.firstIndex];
  const failedRoute = mockNetwork.get.mock.calls[Fixture.secondIndex][Fixture.firstIndex];
  expect(retryRoute).toBe(failedRoute);
});

test('album hearts refresh without requesting playlist pagination', async () => {
  await act(async () => { renderer = create(<Probe kind={CollectionRecordingPolicy.album} />); });
  await finishRequest(Fixture.firstIndex, [recording(true)]);
  expect(snapshot.hasMore).toBe(false);
  await act(async () => notifyLibraryChanged());
  expect(mockNetwork.get).toHaveBeenCalledTimes(Fixture.twoRequests);
  await finishRequest(Fixture.secondIndex, [recording(false)]);
  expect(snapshot.recordings[Fixture.firstIndex].isLiked).toBe(false);
});

test('unmount cancels work and discards its completion', async () => {
  await renderProbe();
  const signal = mockNetwork.get.mock.calls[Fixture.firstIndex][Fixture.secondIndex].signal;
  await act(async () => renderer.unmount());
  expect(signal.aborted).toBe(true);
  await finishRequest(Fixture.firstIndex, [recording(true)]);
});

test('preserves search query and account scope while invalidating the library list', async () => {
  const searchQuery = Fixture.title;
  const libraryFetcher = jest.fn(async () => [Fixture.playlist]);
  let currentSearchQuery: string | undefined;
  let currentScope: object;
  function QueryProbe() {
    currentSearchQuery = useData('search_state', undefined, { query: searchQuery }).data?.query;
    useData('library', libraryFetcher);
    currentScope = useDataScope();
    return <View />;
  }
  await act(async () => { renderer = create(<QueryProbe />); });
  const capturedScope = currentScope!;
  expect(currentSearchQuery).toBe(searchQuery);
  expect(libraryFetcher).toHaveBeenCalledTimes(Fixture.oneRequest);
  await act(async () => notifyLibraryChanged());
  expect(currentSearchQuery).toBe(searchQuery);
  expect(currentScope!).toBe(capturedScope);
  expect(libraryFetcher).toHaveBeenCalledTimes(Fixture.twoRequests);
});

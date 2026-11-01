import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Recording } from '../constants/types';
import { useDataScope } from '../services/DataProvider';
import { subscribeLibraryChanges, getLibraryRevision } from '../services/LibraryChanges';
import { useApi } from './useApi';

export const CollectionRecordingPolicy = Object.freeze({
  firstPage: 1,
  pageStep: 1,
  pageSize: 20,
  emptyCount: 0,
  playlist: 'playlist',
  album: 'album',
  failure: 'Songs could not be refreshed. Try again.',
});

type CollectionKind = typeof CollectionRecordingPolicy.playlist | typeof CollectionRecordingPolicy.album;
interface CollectionState {
  recordings: Recording[];
  loading: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
}
const initialState = (): CollectionState => ({
  recordings: [], loading: true, error: null,
  page: CollectionRecordingPolicy.firstPage, hasMore: false,
});

export function useCollectionRecordings(identifier: string, kind: CollectionKind) {
  const network = useApi();
  const scope = useDataScope();
  const revision = useSyncExternalStore(subscribeLibraryChanges, getLibraryRevision);
  const [state, setState] = useState(initialState);
  const stateReference = useRef(state);
  const stateIdentity = useRef({ scope, identifier, kind, revision });
  const activeRequest = useRef<AbortController | null>(null);
  const activeRevision = useRef(revision);
  activeRevision.current = revision;
  const activeScope = useRef(scope);
  const activeIdentifier = useRef(identifier);
  const activeKind = useRef(kind);
  activeScope.current = scope;
  activeIdentifier.current = identifier;
  activeKind.current = kind;
  stateReference.current = state;

  const load = useCallback(async (page: number) => {
    if (activeRequest.current !== null) return;
    const cancellation = new AbortController();
    const capturedScope = scope;
    activeRequest.current = cancellation;
    const current = () => !cancellation.signal.aborted && activeScope.current === capturedScope &&
      activeIdentifier.current === identifier && activeKind.current === kind && activeRevision.current === revision;
    setState(previous => ({ ...previous, loading: true, error: null }));
    try {
      const route = kind === CollectionRecordingPolicy.playlist
        ? `Library/playlists/${encodeURIComponent(identifier)}/recordings?page=${page}&pageSize=${CollectionRecordingPolicy.pageSize}`
        : `Metadata/get-recordings?albumId=${encodeURIComponent(identifier)}`;
      const response = await network.get<Recording[]>(route, { signal: cancellation.signal });
      if (!current()) return;
      setState(previous => ({
        recordings: page === CollectionRecordingPolicy.firstPage ? response.data : [...previous.recordings, ...response.data],
        loading: false,
        error: null,
        page,
        hasMore: kind === CollectionRecordingPolicy.playlist && response.data.length === CollectionRecordingPolicy.pageSize,
      }));
    } catch {
      if (current()) setState(previous => ({ ...previous, loading: false, error: CollectionRecordingPolicy.failure }));
    } finally {
      if (activeRequest.current === cancellation) activeRequest.current = null;
    }
  }, [identifier, kind, network, scope, revision]);

  useEffect(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    stateIdentity.current = { scope, identifier, kind, revision };
    setState(initialState());
    void load(CollectionRecordingPolicy.firstPage);
    return () => { activeRequest.current?.abort(); activeRequest.current = null; };
  }, [load, scope, identifier, kind, revision]);

  const loadMore = useCallback(() => {
    const current = stateReference.current;
    if (!current.loading && current.hasMore && current.error === null)
      void load(current.page + CollectionRecordingPolicy.pageStep);
  }, [load]);
  const retry = useCallback(() => {
    const current = stateReference.current;
    if (current.loading) return;
    const nextPage = current.recordings.length === CollectionRecordingPolicy.emptyCount
      ? CollectionRecordingPolicy.firstPage : current.page + CollectionRecordingPolicy.pageStep;
    void load(nextPage);
  }, [load]);

  const visibleState = stateIdentity.current.scope === scope && stateIdentity.current.identifier === identifier &&
    stateIdentity.current.kind === kind && stateIdentity.current.revision === revision ? state : initialState();
  return { ...visibleState, loadMore, retry };
}

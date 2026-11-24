import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from './useApi';
import { useDataScope } from '../services/DataProvider';
import { notifyLibraryChanged } from '../services/LibraryChanges';
import { recommendationPlayback } from '../services/RecommendationPlaybackPlatform';
import { RecommendationRoutes } from '../services/recommendations/RecommendationContracts';
import type {
  RecommendationPlaylistPreview,
  RecommendationRequest,
} from '../services/recommendations/RecommendationContracts';

export function useRecommendationPlaylist(
  request: RecommendationRequest | undefined,
  initial?: RecommendationPlaylistPreview,
) {
  const api = useApi();
  const scope = useDataScope();
  const initialScope = useRef(scope);
  const key = JSON.stringify(request);
  const identity = useRef({ scope, key });
  identity.current = { scope, key };
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [state, setState] = useState({
    scope,
    key,
    preview: initial ?? null,
    loading: !!request && !initial,
    saving: false,
    error: null as string | null,
  });
  const current = useCallback(
    (operation: number) =>
      identity.current.scope === scope &&
      identity.current.key === key &&
      generation.current === operation,
    [key, scope],
  );
  const load = useCallback(
    async (dailyVersion?: string, refresh = false) => {
      if (!request) return;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      const operation = ++generation.current;
      setState({
        scope,
        key,
        preview: null,
        loading: true,
        saving: false,
        error: null,
      });
      try {
        if (dailyVersion)
          await api.post(
            RecommendationRoutes.regenerate,
            { expectedVersion: dailyVersion },
            { signal: controller.signal },
          );
        const response = await api.post<RecommendationPlaylistPreview>(
          refresh
            ? RecommendationRoutes.preview + '?refresh=true'
            : RecommendationRoutes.preview,
          request,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted && current(operation))
          setState({
            scope,
            key,
            preview: response.data,
            loading: false,
            saving: false,
            error: null,
          });
      } catch {
        if (!controller.signal.aborted && current(operation))
          setState({
            scope,
            key,
            preview: null,
            loading: false,
            saving: false,
            error: 'The recommended playlist could not be loaded. Try again.',
          });
      }
    },
    [api, current, key, request, scope],
  );

  useEffect(() => {
    const operations = generation;
    if (request) {
      if (initial && initialScope.current === scope)
        setState({
          scope,
          key,
          preview: initial,
          loading: false,
          saving: false,
          error: null,
        });
      else void load();
    }
    return () => {
      pending.current?.abort();
      operations.current++;
    };
  }, [initial, key, load, request, scope]);

  const visible =
    state.scope === scope && state.key === key
      ? state
      : { preview: null, loading: !!request, saving: false, error: null };
  const fail = (message: string, operation: number) => {
    if (current(operation))
      setState(previous => ({ ...previous, error: message }));
  };
  const play = async (index: number) => {
    const preview = visible.preview;
    if (!preview || !preview.page.tracks.length) return false;
    const operation = generation.current;
    try {
      await recommendationPlayback.start(preview.request, preview.page, index);
      return current(operation);
    } catch {
      fail('This playlist could not start. Try again.', operation);
      return false;
    }
  };
  const save = async (name: string) => {
    const preview = visible.preview;
    if (
      !preview ||
      preview.savedPlaylistId ||
      !preview.page.tracks.length ||
      saving.current
    )
      return;
    const operation = generation.current;
    saving.current = true;
    setState(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { data } = await api.post<{
        id: string;
        name: string;
        cover: string;
      }>(RecommendationRoutes.playlists, {
        name,
        recordingIds: preview.page.tracks.map(track => track.id),
        dailyVersion: preview.dailyVersion,
      });
      if (!current(operation)) return;
      setState(previous => ({
        ...previous,
        preview: { ...preview, savedPlaylistId: data.id },
      }));
      notifyLibraryChanged();
      return data;
    } catch {
      fail('The playlist could not be saved. Try again.', operation);
    } finally {
      saving.current = false;
      if (current(operation))
        setState(previous => ({ ...previous, saving: false }));
    }
  };
  return {
    ...visible,
    play,
    save,
    reload: (dailyVersion?: string) => load(dailyVersion, true),
  };
}

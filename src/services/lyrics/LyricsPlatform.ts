import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticationSession } from '../AuthenticationService';
import { createApplicationNetworkClient } from '../ApplicationNetworkClient';
import {
  emptyLyricsState,
  LyricsRepository,
  LyricsRepositoryPolicy,
} from './LyricsRepository';
import type { LyricsResponse } from './LyricsDocument';

const LyricsPlatformPolicy = Object.freeze({
  activeState: 'active',
  changeEvent: 'change' as const,
});
export function useLyrics(recordingIdentifier: string | undefined) {
  const account = useSyncExternalStore(
    authenticationSession.subscribe,
    authenticationSession.getSnapshot,
  );
  const repository = useMemo(
    () =>
      new LyricsRepository({
        read: key => AsyncStorage.getItem(key),
        write: (key, value) => AsyncStorage.setItem(key, value),
        remove: key => AsyncStorage.removeItem(key),
        async fetch(accountIdentifier, identifier, signal) {
          const current = authenticationSession.getSnapshot();
          if (
            !current.isLoggedIn ||
            current.accountIdentifier !== accountIdentifier ||
            current.token === null
          )
            throw new Error(LyricsRepositoryPolicy.unavailable);
          const network = createApplicationNetworkClient({
            accountIdentifier,
            token: current.token,
          });
          return (
            await network.get<LyricsResponse>(
              LyricsRepositoryPolicy.routePrefix +
                encodeURIComponent(identifier),
              { signal },
            )
          ).data;
        },
      }),
    [],
  );
  const state = useSyncExternalStore(
    repository.subscribe,
    repository.getSnapshot,
  );
  const accountIdentifier = account.isLoggedIn
    ? account.accountIdentifier
    : null;
  useEffect(() => {
    const synchronize = () => {
      const current = authenticationSession.getSnapshot();
      repository.setScope(
        current.isLoggedIn ? current.accountIdentifier : null,
        recordingIdentifier ?? null,
      );
    };
    synchronize();
    const unsubscribe = authenticationSession.subscribe(synchronize);
    return () => {
      unsubscribe();
      repository.setScope(null, null);
    };
  }, [repository, recordingIdentifier]);
  useEffect(() => {
    if (!state.retryable || state.pending) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer =
        AppState.currentState === LyricsPlatformPolicy.activeState
          ? setTimeout(() => {
              void repository.refresh();
            }, LyricsRepositoryPolicy.retryIntervalMilliseconds)
          : null;
    };
    schedule();
    const subscription = AppState.addEventListener(
      LyricsPlatformPolicy.changeEvent,
      schedule,
    );
    return () => {
      if (timer !== null) clearTimeout(timer);
      subscription.remove();
    };
  }, [repository, state.retryable, state.pending]);
  const current =
    state.accountIdentifier === accountIdentifier &&
    state.recordingIdentifier === (recordingIdentifier ?? null);
  return {
    state: current
      ? state
      : emptyLyricsState(accountIdentifier, recordingIdentifier ?? null),
    refresh: repository.refresh,
  };
}

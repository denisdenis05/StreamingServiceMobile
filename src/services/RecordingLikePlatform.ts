import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import {
  notifyLibraryChanged,
  subscribeLibraryChanges,
} from './LibraryChanges';
import {
  RecordingLikePolicy,
  RecordingLikeService,
} from './settings/RecordingLikeService';

export function useRecordingLike(recordingIdentifier: string | undefined) {
  const account = useSyncExternalStore(
    authenticationSession.subscribe,
    authenticationSession.getSnapshot,
  );
  const service = useMemo(() => {
    let publishingChange = false;
    function network(accountIdentifier: string) {
      const current = authenticationSession.getSnapshot();
      if (
        !current.isLoggedIn ||
        current.accountIdentifier !== accountIdentifier ||
        current.token === null
      )
        throw new Error(RecordingLikePolicy.loadFailure);
      return createApplicationNetworkClient({
        accountIdentifier,
        token: current.token,
      });
    }
    const controller = new RecordingLikeService({
      read: async (accountIdentifier, identifier, signal) =>
        (
          await network(accountIdentifier).get(
            RecordingLikePolicy.routePrefix + encodeURIComponent(identifier),
            { signal },
          )
        ).data,
      toggle: async (accountIdentifier, identifier, details, signal) =>
        (
          await network(accountIdentifier).post(
            RecordingLikePolicy.routePrefix + encodeURIComponent(identifier),
            details,
            { signal },
          )
        ).data,
      changed() {
        publishingChange = true;
        try {
          notifyLibraryChanged();
        } finally {
          publishingChange = false;
        }
      },
    });
    return {
      controller,
      refresh: () => {
        if (!publishingChange) void controller.refresh();
      },
    };
  }, []);
  const state = useSyncExternalStore(
    service.controller.subscribe,
    service.controller.getSnapshot,
  );
  const accountIdentifier = account.isLoggedIn
    ? account.accountIdentifier
    : null;
  useEffect(() => {
    const synchronize = () => {
      const current = authenticationSession.getSnapshot();
      service.controller.setScope(
        current.isLoggedIn ? current.accountIdentifier : null,
        recordingIdentifier ?? null,
      );
    };
    synchronize();
    const unsubscribeAccount = authenticationSession.subscribe(synchronize);
    const unsubscribeLibrary = subscribeLibraryChanges(service.refresh);
    return () => {
      unsubscribeAccount();
      unsubscribeLibrary();
      service.controller.setScope(null, null);
    };
  }, [service, recordingIdentifier]);
  const current =
    state.accountIdentifier === accountIdentifier &&
    state.recordingIdentifier === (recordingIdentifier ?? null);
  return {
    state: current
      ? state
      : {
          accountIdentifier,
          recordingIdentifier: recordingIdentifier ?? null,
          isLiked: null,
          pending:
            accountIdentifier !== null && recordingIdentifier !== undefined,
          failure: null,
        },
    toggle: service.controller.toggle,
    refresh: service.controller.refresh,
  };
}

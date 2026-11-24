import axios from 'axios';
import { RecommendationPageLoader } from './recommendations/RecommendationPageLoader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedRecommendationSession } from './recommendations/RecommendationPlaybackController';
import { recommendationSuggestionGate } from './recommendations/RecommendationSuggestionGate';
import {
  audioRuntime,
  catalogPlaybackMapping,
  playbackApplication,
} from './NativeAudioRuntime';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { RecommendationPlaybackController } from './recommendations/RecommendationPlaybackController';
import {
  RecommendationRoutes,
  RecommendationModes,
} from './recommendations/RecommendationContracts';
import type { RecommendationPage } from './recommendations/RecommendationContracts';

const TransportPolicy = Object.freeze({
  expiredSessionCode: 'recommendation_session_expired',
  signedOutMessage: 'Sign in before requesting recommendations.',
});
const StoragePolicy = Object.freeze({
  key: 'recommendation-playback-session.v1',
  maximumSeen: 1500,
  maximumCursorLength: 131072,
});
export const recommendationPlayback = new RecommendationPlaybackController({
  storage: {
    async load() {
      try {
        const serialized = await AsyncStorage.getItem(StoragePolicy.key);
        if (!serialized) return null;
        const session: PersistedRecommendationSession = JSON.parse(serialized);
        return typeof session.account === 'string' &&
          typeof session.queueIdentifier === 'string' &&
          Object.values(RecommendationModes).includes(
            session.request?.mode as never,
          ) &&
          Array.isArray(session.seen) &&
          session.seen.length <= StoragePolicy.maximumSeen &&
          session.seen.every(identifier => typeof identifier === 'string') &&
          (session.cursor === null ||
            (typeof session.cursor === 'string' &&
              session.cursor.length <= StoragePolicy.maximumCursorLength))
          ? session
          : null;
      } catch {
        return null;
      }
    },
    async save(session) {
      if (session === null) await AsyncStorage.removeItem(StoragePolicy.key);
      else
        await AsyncStorage.setItem(StoragePolicy.key, JSON.stringify(session));
    },
  },
  snapshot: () => {
    const view = audioRuntime.views.getSnapshot();
    return {
      account: authenticationSession.getSnapshot().accountIdentifier,
      queueIdentifier: audioRuntime.queue.getCommittedQueueIdentifier(),
      entryIdentifiers: view.queue.map(entry => entry.entryIdentifier),
      recordingIdentifiers: view.queue.flatMap(entry =>
        entry.recordingIdentifier ? [entry.recordingIdentifier] : [],
      ),
      currentIndex: view.currentIndex,
    };
  },
  replace: async (tracks, index, isCurrent, request) => {
    const account = authenticationSession.getSnapshot().accountIdentifier;
    const previousQueue = audioRuntime.queue.getCommittedQueueIdentifier();
    const wasReady = playbackApplication.getSnapshot().ready;
    await playbackApplication.whenReady();
    if (
      !isCurrent() ||
      account !== authenticationSession.getSnapshot().accountIdentifier ||
      (wasReady &&
        previousQueue !== audioRuntime.queue.getCommittedQueueIdentifier())
    )
      return false;
    const view = audioRuntime.views.getSnapshot();
    if (
      request.mode === RecommendationModes.songRadio &&
      tracks[index]?.id === view.currentTrack?.recordingIdentifier
    ) {
      const queued = new Set(
        view.queue.map(entry => entry.recordingIdentifier),
      );
      const upcoming = tracks.filter(track => !queued.has(track.id));
      await audioRuntime.append(
        upcoming.map(track => catalogPlaybackMapping.map(track)),
        isCurrent,
      );
      if (!view.isPlaying && isCurrent()) await audioRuntime.play();
    } else
      await audioRuntime.playTracks(
        tracks.map(track => catalogPlaybackMapping.map(track)),
        index,
      );
    await audioRuntime.setShuffle(false);
    await audioRuntime.views.refresh();
    return true;
  },
  append: (tracks, isCurrent) =>
    audioRuntime.append(
      tracks.map(track => catalogPlaybackMapping.map(track)),
      isCurrent,
    ),
  generate: async (request, signal) => {
    const account = authenticationSession.getSnapshot();
    if (account.accountIdentifier === null || account.token === null)
      throw new Error(TransportPolicy.signedOutMessage);
    const network = createApplicationNetworkClient({
      accountIdentifier: account.accountIdentifier,
      token: account.token,
    });
    const loader = new RecommendationPageLoader({
      generate: async (selection, cancellation) =>
        (
          await network.post<RecommendationPage>(
            RecommendationRoutes.generate,
            selection,
            { signal: cancellation },
          )
        ).data,
      isExpiredSession: failure =>
        axios.isAxiosError(failure) &&
        failure.response?.data?.code === TransportPolicy.expiredSessionCode,
    });
    return loader.load(request, signal);
  },
  subscribe: listener => {
    const stopViews = audioRuntime.views.subscribe(listener);
    const stopAuthentication = authenticationSession.subscribe(listener);
    return () => {
      stopViews();
      stopAuthentication();
    };
  },
  now: () => Date.now(),
});

recommendationSuggestionGate.attach(recommendationPlayback.ownsCurrentQueue);

let restoredAccount: string | null = null;
function restoreRecommendationPlayback(): void {
  const account = authenticationSession.getSnapshot().accountIdentifier;
  if (account === null) {
    if (restoredAccount !== null) recommendationPlayback.stop();
    restoredAccount = null;
    return;
  }
  if (!playbackApplication.getSnapshot().ready || restoredAccount === account)
    return;
  restoredAccount = account;
  void audioRuntime.views
    .refresh()
    .then(() => recommendationPlayback.restore())
    .catch(() => undefined);
}
authenticationSession.subscribe(restoreRecommendationPlayback);
playbackApplication.subscribe(restoreRecommendationPlayback);
restoreRecommendationPlayback();

import { retireLegacyImageCache } from './cache/ImageDownloadService';
import Toast from 'react-native-toast-message';
import { PlaybackApplicationLifecycle, PlaybackApplicationPolicy } from './player/PlaybackApplicationLifecycle';
import { playbackNativeSessionStorage } from './PlaybackNativeSessionStorage';
import axios from 'axios';
import { NativeStreamingPlayer, PlayerProgressStore } from 'streaming-service-player';
import { reactNativePlaybackTransport } from './ReactNativePlaybackTransport';
import { PlaybackRuntime } from './player/PlaybackRuntime';
import { playbackQueueChanges } from './player/PlaybackQueueChangeLifecycle';
import { PlaybackCatalogMapping } from './player/PlaybackCatalogMapping';
import { PlaybackReportingQueue, PlaybackTracker } from './PlaybackTracker';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { findCachedTrackAddress, clearAccountAudioCache, retireLegacyAudioCache } from './cache/AudioCacheService';
import { PLACEHOLDER_ALBUM_COVER, TEMPORARY_API_URL } from '../constants/placeholders';

export const AudioRuntimePolicy = Object.freeze({
  identifierRadix: 36, initialSequence: 0, sequenceIncrement: 1, separator: '-',
  minimumCacheBytes: 0, filePrefix: 'file://', millisecondsPerSecond: 1000, unknownDurationMilliseconds: 0,
  startRoute: '/lastfm/start-playback', suggestionRoute: 'Metadata/get-suggested-recordings?count=20',
  unknownAlbum: 'Unknown Album', failureMessage: 'Audio playback operation failed.',
  legacyCleanupDelayMilliseconds: 1500,
  playbackFailureMessage: 'Audio playback failed. Tap Play to try again.', toastType: 'message',
});
const instancePrefix = Date.now().toString(AudioRuntimePolicy.identifierRadix) + AudioRuntimePolicy.separator
  + Math.random().toString(AudioRuntimePolicy.identifierRadix);
let sequence: number = AudioRuntimePolicy.initialSequence;
const identifiers = { nextIdentifier() {
  sequence += AudioRuntimePolicy.sequenceIncrement;
  if (!Number.isSafeInteger(sequence)) throw new Error(AudioRuntimePolicy.failureMessage);
  return instancePrefix + AudioRuntimePolicy.separator + sequence;
} };
export const catalogPlaybackMapping = new PlaybackCatalogMapping(TEMPORARY_API_URL, PLACEHOLDER_ALBUM_COVER);
const native = new NativeStreamingPlayer(reactNativePlaybackTransport, identifiers);
export const sharedPlaybackNative = native;
const reports = new PlaybackReportingQueue();
export const audioRuntime = new PlaybackRuntime({
  native, queueChanges: playbackQueueChanges, mediaServerAddress: TEMPORARY_API_URL, identifiers, sessionOwnership: playbackNativeSessionStorage,
  reportPlaybackFailure() { Toast.show({ type: AudioRuntimePolicy.toastType, text1: AudioRuntimePolicy.playbackFailureMessage }); },
  cache: { async findReadableCachedAddress(address) {
    const accountIdentifier = authenticationSession.getSnapshot().accountIdentifier;
    return accountIdentifier === null ? null : findCachedTrackAddress(address, { accountIdentifier, serverAddress: TEMPORARY_API_URL });
  } },
  listening: metadata => ({ create(snapshot) {
    const entry = snapshot.currentEntry;
    const account = authenticationSession.getSnapshot();
    const view = entry === null ? null : metadata.viewFor(entry);
    if (view?.recordingIdentifier === undefined || account.accountIdentifier === null || account.token === null) {
      return { start() {}, async pause() {}, async resume() {}, async seek() {}, async stop() {} };
    }
    const client = createApplicationNetworkClient({ accountIdentifier: account.accountIdentifier, token: account.token });
    const durationSeconds = Math.floor((snapshot.durationMilliseconds ?? entry?.durationHintMilliseconds
      ?? AudioRuntimePolicy.unknownDurationMilliseconds) / AudioRuntimePolicy.millisecondsPerSecond);
    return new PlaybackTracker(async () => {
      const response = await client.post<{ success?: boolean; sessionId?: string }>(AudioRuntimePolicy.startRoute, {
        trackId: view.recordingIdentifier, artist: view.artist, track: view.title, album: view.album ?? AudioRuntimePolicy.unknownAlbum,
        durationSeconds, isLocalCached: view.isLocalCached, playlistId: view.playlistIdentifier,
      });
      return response.data.success ? response.data.sessionId ?? null : null;
    }, client, reports);
  } }),
  async fetchSuggestions() {
    const account = authenticationSession.getSnapshot();
    if (account.accountIdentifier === null || account.token === null) return [];
    const client = createApplicationNetworkClient({ accountIdentifier: account.accountIdentifier, token: account.token });
    const response = await client.get<Parameters<typeof catalogPlaybackMapping.map>[0][]>(AudioRuntimePolicy.suggestionRoute);
    return response.data.map(recording => catalogPlaybackMapping.map(recording));
  },
  reportFailure(failure) {
    if (!axios.isCancel(failure)) console.warn(AudioRuntimePolicy.failureMessage);
  },
});

export const playbackApplication = new PlaybackApplicationLifecycle(authenticationSession, audioRuntime, () => {
  Toast.show({ type: AudioRuntimePolicy.toastType, text1: PlaybackApplicationPolicy.startupFailureMessage });
});

const playbackProgressClock = globalThis as typeof globalThis & { performance: { now(): number } };
export const playbackProgressStore = new PlayerProgressStore(audioRuntime.state, {
  nowMilliseconds: () => playbackProgressClock.performance.now(),
  requestFrame(callback) {
    const frameIdentifier = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frameIdentifier);
  },
});

let previousCacheAccount = authenticationSession.getSnapshot().accountIdentifier;
const stopCacheOwnership = authenticationSession.subscribe(() => {
  const accountIdentifier = authenticationSession.getSnapshot().accountIdentifier;
  const retiredAccount = previousCacheAccount;
  previousCacheAccount = accountIdentifier;
  if (retiredAccount !== null && retiredAccount !== accountIdentifier) {
    void clearAccountAudioCache({ accountIdentifier: retiredAccount, serverAddress: TEMPORARY_API_URL })
      .catch(() => console.warn(AudioRuntimePolicy.failureMessage));
  }
});

let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
let legacyCleanupStarted = false;
const stopCacheMaintenance = playbackApplication.subscribe(() => {
  if (!playbackApplication.getSnapshot().ready || legacyCleanupStarted) return;
  legacyCleanupStarted = true;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    void Promise.all([retireLegacyImageCache(), retireLegacyAudioCache()]).catch(() => console.warn(AudioRuntimePolicy.failureMessage));
  }, AudioRuntimePolicy.legacyCleanupDelayMilliseconds);
});

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
module.hot?.dispose(() => {
  stopCacheOwnership(); stopCacheMaintenance();
  if (cleanupTimer !== null) clearTimeout(cleanupTimer);
  playbackProgressStore.setActive(false); playbackApplication.dispose();
});

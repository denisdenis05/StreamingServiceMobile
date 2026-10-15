import axios from 'axios';
import RNFS from 'react-native-fs';
import { NativeStreamingPlayer } from 'streaming-service-player';
import { reactNativePlaybackTransport } from './ReactNativePlaybackTransport';
import { PlaybackRuntime } from './player/PlaybackRuntime';
import { PlaybackCatalogMapping } from './player/PlaybackCatalogMapping';
import { PlaybackReportingQueue, PlaybackTracker } from './PlaybackTracker';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { getCacheFilePath } from './cache/AudioCacheService';
import { PLACEHOLDER_ALBUM_COVER, TEMPORARY_API_URL } from '../constants/placeholders';

export const AudioRuntimePolicy = Object.freeze({
  identifierRadix: 36, initialSequence: 0, sequenceIncrement: 1, separator: '-',
  minimumCacheBytes: 0, filePrefix: 'file://', millisecondsPerSecond: 1000, unknownDurationMilliseconds: 0,
  startRoute: '/lastfm/start-playback', suggestionRoute: 'Metadata/get-suggested-recordings?count=20',
  unknownAlbum: 'Unknown Album', failureMessage: 'Audio playback operation failed.',
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
const reports = new PlaybackReportingQueue();
export const audioRuntime = new PlaybackRuntime({
  native, mediaServerAddress: TEMPORARY_API_URL, identifiers,
  cache: { async findReadableCachedAddress(address) {
    const path = getCacheFilePath(address);
    if (!await RNFS.exists(path)) return null;
    const information = await RNFS.stat(path);
    return information.isFile() && information.size > AudioRuntimePolicy.minimumCacheBytes ? AudioRuntimePolicy.filePrefix + path : null;
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

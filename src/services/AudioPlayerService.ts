import { useCallback, useEffect, useSyncExternalStore } from 'react';
import Toast from 'react-native-toast-message';
import { RepeatMode } from 'streaming-service-player';
import type { PlayerSnapshot } from 'streaming-service-player';
import { audioRuntime, AudioRuntimePolicy, catalogPlaybackMapping } from './NativeAudioRuntime';
import { authenticationSession } from './AuthenticationService';
import type { PlaybackTrack } from './player/PlaybackTrack';
import { QueueIntentSupersededError } from './player/QueueIntentScheduler';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { PlaybackCollectionLoader } from './player/PlaybackCollectionLoader';
import type { CatalogRecording } from './player/PlaybackCatalogMapping';
import { RepeatingType } from '../constants/types';

export { PlaybackTracker } from './PlaybackTracker';
const PlaybackMessages = Object.freeze({ failure: 'Playback unavailable. Please try again.', toastType: 'message', zeroSeconds: 0 });
async function runAudioCommand(operation: () => Promise<void>): Promise<void> {
  try { await operation(); }
  catch (failure) {
    if (failure instanceof QueueIntentSupersededError) return;
    Toast.show({ type: PlaybackMessages.toastType, text1: PlaybackMessages.failure });
  }
}
export const setupPlayer = (): Promise<void> => audioRuntime.initialize();
export const getPosition = async (): Promise<number> => (await audioRuntime.dispatcher.getSnapshot()).positionMilliseconds / AudioRuntimePolicy.millisecondsPerSecond;
export const getDuration = async (): Promise<number> => ((await audioRuntime.dispatcher.getSnapshot()).durationMilliseconds
  ?? PlaybackMessages.zeroSeconds) / AudioRuntimePolicy.millisecondsPerSecond;
const selectPosition = (snapshot: PlayerSnapshot | null) =>
  (snapshot?.positionMilliseconds ?? PlaybackMessages.zeroSeconds) / AudioRuntimePolicy.millisecondsPerSecond;
const selectDuration = (snapshot: PlayerSnapshot | null) =>
  (snapshot?.durationMilliseconds ?? PlaybackMessages.zeroSeconds) / AudioRuntimePolicy.millisecondsPerSecond;
function useProgressValue(selector: (snapshot: PlayerSnapshot | null) => number): number {
  const subscribe = useCallback((listener: () => void) => audioRuntime.state.subscribeSelector(selector, listener), [selector]);
  const read = useCallback(() => selector(audioRuntime.state.getSnapshot()), [selector]);
  return useSyncExternalStore(subscribe, read, read);
}
export const usePlaybackProgress = () => ({ position: useProgressValue(selectPosition), duration: useProgressValue(selectDuration) });

const PlaylistPlaybackPolicy = Object.freeze({
  routePrefix: 'Library/playlists/', routeSuffix: '/recordings', pageParameter: '?page=', pageSizeParameter: '&pageSize=',
  changedMessage: 'The selected playlist row changed. Reload the playlist and try again.',
});
const collectionLoader = new PlaybackCollectionLoader();
const Commands = Object.freeze({
  playPlaylist: (playlistIdentifier: string, selectedIndex: number, expectedRecordingIdentifier?: string) => runAudioCommand(() =>
    audioRuntime.playCollection(async isCurrent => {
      const account = authenticationSession.getSnapshot();
      if (account.accountIdentifier === null || account.token === null) throw new Error(PlaylistPlaybackPolicy.changedMessage);
      const client = createApplicationNetworkClient({ accountIdentifier: account.accountIdentifier, token: account.token });
      const recordings = await collectionLoader.load(async (page, pageSize) => {
        const response = await client.get<CatalogRecording[]>(PlaylistPlaybackPolicy.routePrefix + encodeURIComponent(playlistIdentifier)
          + PlaylistPlaybackPolicy.routeSuffix + PlaylistPlaybackPolicy.pageParameter + page + PlaylistPlaybackPolicy.pageSizeParameter + pageSize);
        return response.data;
      }, isCurrent);
      if (expectedRecordingIdentifier !== undefined && recordings[selectedIndex]?.id !== expectedRecordingIdentifier) {
        throw new Error(PlaylistPlaybackPolicy.changedMessage);
      }
      return { tracks: recordings.map(recording => catalogPlaybackMapping.map(recording, undefined, playlistIdentifier)), selectedIndex };
    })),
  playTracks: (tracks: readonly PlaybackTrack[], selectedIndex: number) => runAudioCommand(() => audioRuntime.playTracks(tracks, selectedIndex)),
  addToQueue: (tracks: readonly PlaybackTrack[]) => runAudioCommand(() => audioRuntime.append(tracks)),
  removeFromQueue: (identifier: string) => runAudioCommand(() => audioRuntime.removeMany([identifier])),
  moveEntry: (identifier: string, beforeIdentifier: string | null) => runAudioCommand(() => audioRuntime.move(identifier, beforeIdentifier)),
  selectEntry: (identifier: string) => runAudioCommand(() => audioRuntime.select(identifier)),
  clearQueue: () => runAudioCommand(() => audioRuntime.clear()),
  play: () => runAudioCommand(() => audioRuntime.play()), pause: () => runAudioCommand(() => audioRuntime.pause()),
  playNext: () => runAudioCommand(() => audioRuntime.next()), playPrevious: () => runAudioCommand(() => audioRuntime.previous()),
});
export function useQueue() {
  const view = useSyncExternalStore(audioRuntime.views.subscribe, audioRuntime.views.getSnapshot);
  useEffect(() => {
    const synchronize = () => {
      const state = authenticationSession.getSnapshot();
      void audioRuntime.updateAuthentication({ restored: state.restored, accountIdentifier: state.accountIdentifier,
        accessToken: state.token }).catch(() => console.warn(AudioRuntimePolicy.failureMessage));
    };
    const unsubscribe = authenticationSession.subscribe(synchronize);
    synchronize();
    return unsubscribe;
  }, []);
  const seekToPosition = useCallback((seconds: number) => {
    const entry = audioRuntime.state.getSnapshot()?.currentEntry;
    return entry === null || entry === undefined ? Promise.resolve()
      : runAudioCommand(() => audioRuntime.seek(entry.entryIdentifier, seconds));
  }, []);
  const toggleShuffle = useCallback(() => runAudioCommand(() => audioRuntime.setShuffle(!audioRuntime.views.getSnapshot().isShuffled)), []);
  const setRepeatingState = useCallback((mode: RepeatingType) => runAudioCommand(() => audioRuntime.setRepeat(
    mode === RepeatingType.Song ? RepeatMode.One : mode === RepeatingType.Album ? RepeatMode.All : RepeatMode.Off)), []);
  return { ...view, ...Commands, seekToPosition, toggleShuffle, setRepeatingState,
    repeatingState: view.repeatMode === RepeatMode.One ? RepeatingType.Song
      : view.repeatMode === RepeatMode.All ? RepeatingType.Album : RepeatingType.None,
  };
}

import { recommendationPlayback } from './RecommendationPlaybackPlatform';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import Toast from 'react-native-toast-message';
import { AppState } from 'react-native';
import { RepeatMode } from 'streaming-service-player';
import { audioRuntime, AudioRuntimePolicy, catalogPlaybackMapping, playbackProgressStore, playbackApplication } from './NativeAudioRuntime';
import { authenticationSession } from './AuthenticationService';
import type { PlaybackTrack } from './player/PlaybackTrack';
import { QueueIntentSupersededError } from './player/QueueIntentScheduler';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { PlaybackCollectionLoader } from './player/PlaybackCollectionLoader';
import type { CatalogRecording } from './player/PlaybackCatalogMapping';
import { RepeatingType } from '../constants/types';
import { playerJam, PlayerJamControls } from './PlayerJamRuntime';

export { PlaybackTracker } from './PlaybackTracker';
const PlaybackMessages = Object.freeze({ failure: 'Playback unavailable. Please try again.', toastType: 'message', zeroSeconds: 0 });
async function runAudioCommand(operation: () => Promise<void>): Promise<void> {
  const account = authenticationSession.getSnapshot().accountIdentifier;
  try {
    await playbackApplication.whenReady();
    if (account !== authenticationSession.getSnapshot().accountIdentifier) throw new QueueIntentSupersededError();
    await operation();
  }
  catch (failure) {
    if (failure instanceof QueueIntentSupersededError || playbackApplication.getSnapshot().error !== null) return;
    Toast.show({ type: PlaybackMessages.toastType, text1: PlaybackMessages.failure });
  }
}
export const setupPlayer = (): Promise<void> => playbackApplication.start();
export const getCurrentEntryIdentifier = async (): Promise<string | null> =>
  (await audioRuntime.dispatcher.getSnapshot()).currentEntry?.entryIdentifier ?? null;
export const getPosition = async (): Promise<number> => (await audioRuntime.dispatcher.getSnapshot()).positionMilliseconds / AudioRuntimePolicy.millisecondsPerSecond;
export const getDuration = async (): Promise<number> => ((await audioRuntime.dispatcher.getSnapshot()).durationMilliseconds
  ?? PlaybackMessages.zeroSeconds) / AudioRuntimePolicy.millisecondsPerSecond;
const ProgressLifecycle = Object.freeze({ active: 'active', changeEvent: 'change' as const });
export function usePlaybackProgress() {
  const progress = useSyncExternalStore(playbackProgressStore.subscribe, playbackProgressStore.getSnapshot,
    playbackProgressStore.getSnapshot);
  useEffect(() => {
    const synchronize = () => {
      const active = AppState.currentState === ProgressLifecycle.active;
      playbackProgressStore.setActive(active);
      if (active) void audioRuntime.state.refresh().catch(() => console.warn(AudioRuntimePolicy.failureMessage));
    };
    const subscription = AppState.addEventListener(ProgressLifecycle.changeEvent, synchronize);
    synchronize();
    return () => subscription.remove();
  }, []);
  return { position: progress.positionMilliseconds / AudioRuntimePolicy.millisecondsPerSecond,
    duration: (progress.durationMilliseconds ?? PlaybackMessages.zeroSeconds) / AudioRuntimePolicy.millisecondsPerSecond,
    entryIdentifier: progress.entryIdentifier };
}

const PlaylistPlaybackPolicy = Object.freeze({
  routePrefix: 'Library/playlists/', routeSuffix: '/recordings', pageParameter: '?page=', pageSizeParameter: '&pageSize=',
  changedMessage: 'The selected playlist row changed. Reload the playlist and try again.',
});
const collectionLoader = new PlaybackCollectionLoader();
const Commands = Object.freeze({
  readCurrentEntryIdentifier: getCurrentEntryIdentifier,
  playPlaylist: (playlistIdentifier: string, selectedIndex: number, expectedRecordingIdentifier?: string) => { recommendationPlayback.stop(); return runAudioCommand(() =>
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
    })); },
  playTracks: (tracks: readonly PlaybackTrack[], selectedIndex: number) => { recommendationPlayback.stop(); return runAudioCommand(() => audioRuntime.playTracks(tracks, selectedIndex)); },
  addToQueue: (tracks: readonly PlaybackTrack[]) => runAudioCommand(() => audioRuntime.append(tracks)),
  removeFromQueue: (identifier: string) => runAudioCommand(() => audioRuntime.removeMany([identifier])),
  moveEntry: (identifier: string, beforeIdentifier: string | null) => runAudioCommand(() => audioRuntime.move(identifier, beforeIdentifier)),
  selectEntry: (identifier: string) => runAudioCommand(() => audioRuntime.select(identifier)),
  clearQueue: () => { recommendationPlayback.stop(); return runAudioCommand(() => audioRuntime.clear()); },
  play: () => runAudioCommand(() => playerJam.control(PlayerJamControls.play, () => audioRuntime.play())),
  pause: () => runAudioCommand(() => playerJam.control(PlayerJamControls.pause, () => audioRuntime.pause())),
  playNext: () => runAudioCommand(() => playerJam.control(PlayerJamControls.next, () => audioRuntime.next())),
  playPrevious: () => runAudioCommand(() => playerJam.control(PlayerJamControls.previous, () => audioRuntime.previous())),
});
export function useQueue() {
  const view = useSyncExternalStore(audioRuntime.views.subscribe, audioRuntime.views.getSnapshot);
  const application = useSyncExternalStore(playbackApplication.subscribe, playbackApplication.getSnapshot);
  useEffect(() => { void playbackApplication.start().catch(() => undefined); }, []);
  const seekToPosition = useCallback((seconds: number) => {
    const entry = audioRuntime.state.getSnapshot()?.currentEntry;
    return entry === null || entry === undefined ? Promise.resolve()
      : runAudioCommand(() => playerJam.seek(seconds, () => audioRuntime.seek(entry.entryIdentifier, seconds)));
  }, []);
  const toggleShuffle = useCallback(() => { recommendationPlayback.stop(); return runAudioCommand(() => playerJam.localOptions(() => audioRuntime.setShuffle(!audioRuntime.views.getSnapshot().isShuffled))); }, []);
  const setRepeatingState = useCallback((mode: RepeatingType) => runAudioCommand(() => playerJam.localOptions(() => audioRuntime.setRepeat(
    mode === RepeatingType.Song ? RepeatMode.One : mode === RepeatingType.Album ? RepeatMode.All : RepeatMode.Off))), []);
  return { ...view, ...Commands, isLoading: view.isLoading || application.initializing, isPlayerReady: application.ready, isPlayerInitializing: application.initializing,
    playbackError: application.error, seekToPosition, toggleShuffle, setRepeatingState,
    repeatingState: view.repeatMode === RepeatMode.One ? RepeatingType.Song
      : view.repeatMode === RepeatMode.All ? RepeatingType.Album : RepeatingType.None,
  };
}

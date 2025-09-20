import TrackPlayer, {
  Capability,
  Track,
  Event,
  useTrackPlayerEvents,
  State,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { useState, useCallback, useRef } from 'react';
import { cacheTrack, getCacheFilePath, isTrackCached } from './CachingService';
import RNFS from 'react-native-fs';
import { RepeatingType } from '../constants/types.tsx';

let isSetup = false;

export async function setupPlayer() {
  if (isSetup) return;

  await TrackPlayer.setupPlayer();
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
    android: {
      alwaysPauseOnInterruption: true,
      appKilledPlaybackBehavior:
        AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
  });

  isSetup = true;
}

async function processTrack(track: Track): Promise<Track> {
  if (track.url && track.url.startsWith('http')) {
    const cached = await isTrackCached(track.url);

    if (cached) {
      let localPath = getCacheFilePath(track.url);

      try {
        const stat = await RNFS.stat(localPath);
        if (stat.size > 0) {
          return {
            ...track,
            url: `file://${localPath}`,
          };
        } else {
          console.warn(
            'Cached file is empty or invalid, falling back to streaming:',
            localPath
          );
        }
      } catch (error) {
        console.warn(
          'Error reading cached file, falling back to streaming:',
          localPath,
          error
        );
      }
    } else {
      cacheTrack(track.url, track.headers).catch(e => {
        console.error(`Error while caching track ${track.id}:`, e);
      });
    }
  }
  return track;
}

export async function playTrack(track: Track) {
  await setupPlayer();
  await TrackPlayer.stop();
  await TrackPlayer.reset();

  const processedTrack = await processTrack(track);

  await TrackPlayer.add(processedTrack);
  await TrackPlayer.play();
}

export async function pauseTrack() {
  await TrackPlayer.pause();
}

export async function resumeTrack() {
  await TrackPlayer.play();
}

export async function seekTo(position: number) {
  await TrackPlayer.seekTo(position);
}

export async function getPosition(): Promise<number> {
  const progress = await TrackPlayer.getProgress();
  return progress.position;
}

export async function getDuration(): Promise<number> {
  const progress = await TrackPlayer.getProgress();
  return progress.duration;
}

export function useQueue() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [repeatingState, setRepeatingState] = useState(RepeatingType.None);

  const isStoppingRef = useRef(false);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;

  useTrackPlayerEvents(
    [Event.PlaybackState, Event.PlaybackQueueEnded],
    async event => {
      if (event.type === Event.PlaybackState) {
        setIsPlaying(event.state === State.Playing);
        setIsLoading(
          event.state === State.Loading || event.state === State.Buffering
        );

        if (event.state === State.Ended) {
          console.log('Track ended, attempting to play next');
          if (repeatingState === RepeatingType.Song) {
            await playTrackAtIndex(currentIndexRef.current);
          } else {
            if (currentIndex < queue.length - 1) {
              const nextIndex = currentIndexRef.current + 1;
              await playTrackAtIndex(nextIndex);
            } else {
              if (repeatingState === RepeatingType.Album) {
                const nextIndex = 0;
                await playTrackAtIndex(nextIndex);
              }
            }
          }
        }

        if (event.state === State.Stopped && !isStoppingRef.current) {
          playNext();
        }
      }
    }
  );

  const playTrackAtIndex = useCallback(
    async (index: number) => {
      if (index < 0 || index >= queue.length) {
        return;
      }
      try {
        setIsLoading(true);
        setCurrentIndex(index);

        const track = queue[index];

        isStoppingRef.current = true;
        await setupPlayer();
        await TrackPlayer.stop();
        await TrackPlayer.reset();
        isStoppingRef.current = false;

        const processedTrack = await processTrack(track);

        await TrackPlayer.add(processedTrack);
        await TrackPlayer.play();
      } catch (error) {
        console.error('Error playing track:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [queue]
  );

  const addToQueue = useCallback((tracks: Track | Track[]) => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    setQueue(prev => [...prev, ...tracksArray]);
  }, []);

  const replaceQueue = useCallback((tracks: Track[]) => {
    setQueue(tracks);
    setCurrentIndex(-1);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(-1);
    TrackPlayer.stop();
    TrackPlayer.reset();
  }, []);

  const playNext = useCallback(async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      await playTrackAtIndex(nextIndex);
    } else {
      setIsPlaying(false);
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    }
  }, [currentIndex, queue.length, playTrackAtIndex]);

  const playPrevious = useCallback(async () => {
    const progress = await TrackPlayer.getProgress();

    if (progress.position > 5) {
      await TrackPlayer.seekTo(0);
    } else {
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        await playTrackAtIndex(prevIndex);
      } else {
        await TrackPlayer.seekTo(0);
      }
    }
  }, [currentIndex, playTrackAtIndex]);

  const play = useCallback(async () => {
    if (currentTrack) {
      await TrackPlayer.play();
    } else if (queue.length > 0) {
      await playTrackAtIndex(0);
    }
  }, [currentTrack, queue.length, playTrackAtIndex]);

  const pause = useCallback(async () => {
    await TrackPlayer.pause();
  }, []);

  const playQueueFromStart = useCallback(async () => {
    if (queue.length > 0) {
      await playTrackAtIndex(0);
    }
  }, [queue.length, playTrackAtIndex]);

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueue(prev => {
        const newQueue = [...prev];
        newQueue.splice(index, 1);

        if (index < currentIndex) {
          setCurrentIndex(prev => prev - 1);
        } else if (index === currentIndex) {
          setCurrentIndex(-1);
          TrackPlayer.stop();
          TrackPlayer.reset();
        }

        return newQueue;
      });
    },
    [currentIndex]
  );

  return {
    queue,
    currentTrack,
    currentIndex,
    isPlaying,
    isLoading,

    addToQueue,
    replaceQueue,
    clearQueue,
    removeFromQueue,
    play,
    pause,
    playNext,
    playPrevious,
    playTrackAtIndex,
    playQueueFromStart,
    setRepeatingState,

    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    queueLength: queue.length,
  };
}

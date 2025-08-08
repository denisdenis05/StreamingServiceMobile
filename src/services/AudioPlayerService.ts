import TrackPlayer, {
  Capability,
  Track,
  Event,
  useTrackPlayerEvents,
  State,
} from 'react-native-track-player';
import { useState, useCallback } from 'react';
import { cacheTrack, getCacheFilePath, isTrackCached } from './CachingService';
import RNFS from 'react-native-fs';

let isSetup = false;

export async function setupPlayer() {
  if (isSetup) return;

  await TrackPlayer.setupPlayer({ waitForBuffer: true });
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });

  isSetup = true;
}

async function processTrack(track: Track): Promise<Track> {
  let localPath: string | null = null;
  console.log('hgere');
  if (
    track.url &&
    typeof track.url === 'string' &&
    track.url.startsWith('http')
  ) {
    console.log('hgere');
    const cached = await isTrackCached(track.url);
    console.log(`Track cached: ${cached} for URL: ${track.url}`);

    if (cached) {
      localPath = getCacheFilePath(track.url);
      console.log(`Using cached file: ${localPath}`);

      try {
        const stat = await RNFS.stat(localPath);
        console.log(`Cached file size: ${stat.size} bytes`);
        if (stat.size === 0) {
          console.warn('Cached file is empty, falling back to streaming');
          localPath = null;
        }
      } catch (error) {
        console.warn(
          'Error reading cached file, falling back to streaming:',
          error
        );
        localPath = null;
      }

      const finalUrl = localPath ? `file://${localPath}` : track.url;
      return {
        ...track,
        url: finalUrl,
      };
    } else {
      console.log('Caching track in background...');
      cacheTrack(track.url).catch(e => {
        console.log(`Final track URL: ${finalUrl}`);
      });
      const finalUrl = localPath ? `file://${localPath}` : track.url;
      return {
        ...track,
        url: finalUrl,
      };
    }
  }
}

// Simple player functions for single track
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

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;

  useTrackPlayerEvents([Event.PlaybackState], async event => {
    setIsPlaying(event.state === State.Playing);
    if (event.state === State.Stopped) {
      playNext();
    }
    setIsLoading(
      event.state === State.Loading || event.state === State.Buffering
    );
    setIsPlaying(event.state === State.Playing);
    setIsLoading(
      event.state === State.Loading || event.state === State.Buffering
    );
  });

  const playTrackAtIndex = useCallback(
    async (index: number) => {
      if (index < 0 || index >= queue.length) return;
      console.log('We play track at index ' + index);
      try {
        setIsLoading(true);
        setCurrentIndex(index);

        const track = queue[index];
        console.log('we load from: ' + track.url);

        const processedTrack = await processTrack(track);
        console.log('HERE WTF');
        console.log('we play from: ' + processedTrack.url);
        await setupPlayer();
        await TrackPlayer.stop();
        await TrackPlayer.reset();
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

  const playNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      playTrackAtIndex(nextIndex);
    } else {
      // End of queue
      setIsPlaying(false);
    }
  }, [currentIndex, queue.length, playTrackAtIndex]);

  const playPrevious = useCallback(async () => {
    const progress = await TrackPlayer.getProgress();

    if (progress.position > 5) {
      // If more than 5 seconds played, restart current track
      await TrackPlayer.seekTo(0);
    } else {
      // Play previous track
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        playTrackAtIndex(prevIndex);
      }
    }
  }, [currentIndex, playTrackAtIndex]);

  const play = useCallback(async () => {
    if (currentTrack) {
      await TrackPlayer.play();
    } else if (queue.length > 0) {
      // No current track, start from beginning
      playTrackAtIndex(0);
    }
  }, [currentTrack, queue.length, playTrackAtIndex]);

  const pause = useCallback(async () => {
    await TrackPlayer.pause();
  }, []);

  const playQueueFromStart = useCallback(() => {
    console.log('queue length: ' + queue.length);
    if (queue.length > 0) {
      playTrackAtIndex(0);
    }
  }, [queue.length, playTrackAtIndex]);

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueue(prev => {
        const newQueue = [...prev];
        newQueue.splice(index, 1);

        // Adjust current index if needed
        if (index < currentIndex) {
          setCurrentIndex(prev => prev - 1);
        } else if (index === currentIndex) {
          // Current track was removed, stop playback
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

    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    queueLength: queue.length,
  };
}

import TrackPlayer, {
  Capability,
  Track,
  Event,
  useTrackPlayerEvents,
  State,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { useState, useCallback, useRef, useEffect } from 'react';
import { getCacheFilePath, isTrackCached } from './cache/AudioCacheService';
import RNFS from 'react-native-fs';
import { RepeatingType } from '../constants/types.tsx';
import { useApi } from '../hooks/useApi.ts';
import { useAuth } from '../hooks/AuthContext.tsx';
import { onNext, onPrevious } from './QueueEventEmitter';
import {
  TEMPORARY_API_URL,
  PLACEHOLDER_ALBUM_COVER,
} from '../constants/placeholders.tsx';
import { PlaybackReportingQueue, PlaybackTracker } from './PlaybackTracker';

export { PlaybackTracker } from './PlaybackTracker';

let isSetup = false;

export async function setupPlayer() {
  if (isSetup) return;

  await TrackPlayer.setupPlayer({
    minBuffer: 15,
    maxBuffer: 3600,
    backBuffer: 0,
    playBuffer: 0.5,
    waitForBuffer: true,
  });
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

async function resolveTrackUrl(track: Track): Promise<Track> {
  if (!track.url || !track.url.startsWith('http')) {
    return track;
  }

  const cached = await isTrackCached(track.url);
  if (!cached) {
    return track;
  }

  const localPath = getCacheFilePath(track.url);
  try {
    const stat = await RNFS.stat(localPath);
    if (stat.size > 0) {
      return { ...track, url: `file://${localPath}` };
    }
  } catch {
    return track;
  }

  return track;
}

export async function getPosition(): Promise<number> {
  const progress = await TrackPlayer.getProgress();
  return progress.position;
}

export async function getDuration(): Promise<number> {
  const progress = await TrackPlayer.getProgress();
  return progress.duration;
}

function fisherYates<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useQueue() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [repeatingState, setRepeatingState] = useState(RepeatingType.None);
  const [isShuffled, setIsShuffled] = useState(false);
  const [suggestedQueueStartIndex, setSuggestedQueueStartIndex] = useState<
    number | null
  >(null);

  const api = useApi();
  const { getToken } = useAuth();

  const isStoppingRef = useRef(false);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatingStateRef = useRef(repeatingState);
  const isShuffledRef = useRef(isShuffled);
  const suggestedQueueStartIndexRef = useRef(suggestedQueueStartIndex);
  const originalQueueRef = useRef<Track[]>([]);

  const playbackTrackerRef = useRef<PlaybackTracker | null>(null);
  const playbackReportingQueueRef = useRef<PlaybackReportingQueue | null>(null);
  if (!playbackReportingQueueRef.current) {
    playbackReportingQueueRef.current = new PlaybackReportingQueue();
  }
  const playbackStateRef = useRef<State | undefined>(undefined);
  const nextTrackQueuedRef = useRef(false);
  const playbackRequestRef = useRef<object | null>(null);
  const pendingPlayerOperationsRef = useRef<Promise<void>>(Promise.resolve());

  const stopPlaybackTracking = useCallback(() => {
    const previousTracker = playbackTrackerRef.current;
    playbackTrackerRef.current = null;
    if (previousTracker) previousTracker.stop();
  }, []);

  const enqueuePlayerOperation = useCallback(
    (operation: () => Promise<void>) => {
      const pendingOperation =
        pendingPlayerOperationsRef.current.then(operation);
      pendingPlayerOperationsRef.current = pendingOperation.catch(
        () => undefined,
      );
      return pendingOperation;
    },
    [],
  );

  const runPlaybackTransition = useCallback(
    (operation: (isCurrentRequest: () => boolean) => Promise<void>) => {
      const playbackRequest = {};
      playbackRequestRef.current = playbackRequest;
      stopPlaybackTracking();
      nextTrackQueuedRef.current = false;
      return enqueuePlayerOperation(async () => {
        const isCurrentRequest = () =>
          playbackRequestRef.current === playbackRequest;
        if (!isCurrentRequest()) return;
        isStoppingRef.current = true;
        try {
          await operation(isCurrentRequest);
        } finally {
          isStoppingRef.current = false;
        }
      });
    },
    [enqueuePlayerOperation, stopPlaybackTracking],
  );

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatingStateRef.current = repeatingState;
  isShuffledRef.current = isShuffled;
  suggestedQueueStartIndexRef.current = suggestedQueueStartIndex;

  const startPlaybackTracking = useCallback(
    (track: Track) => {
      stopPlaybackTracking();
      const duration = (
        typeof track.duration === 'number'
          ? Promise.resolve(track.duration)
          : getDuration()
      ).catch(() => undefined);
      const tracker = new PlaybackTracker(
        async () => {
          const response = await api.post('/lastfm/start-playback', {
            trackId: track.id,
            artist: track.artist || 'Unknown Artist',
            track: track.title || 'Unknown Track',
            album: track.album || 'Unknown Album',
            durationSeconds: Math.floor((await duration) ?? 0),
            isLocalCached: track.url?.startsWith('file://') || false,
            playlistId: track.playlistId,
          });
          return response.data.success ? response.data.sessionId : null;
        },
        api,
        playbackReportingQueueRef.current!,
      );
      playbackTrackerRef.current = tracker;
      tracker.start();
      if (playbackStateRef.current === State.Paused) tracker.pause();
    },
    [api, stopPlaybackTracking],
  );

  useEffect(
    () => () => {
      playbackRequestRef.current = null;
      stopPlaybackTracking();
    },
    [stopPlaybackTracking],
  );

  const prefetchTrackAtIndex = useCallback(async (index: number) => {
    const currentQueue = queueRef.current;
    if (index < 0 || index >= currentQueue.length) return;

    const track = currentQueue[index];
    if (!track.url || !track.url.startsWith('http')) return;

    const alreadyCached = await isTrackCached(track.url);
    if (!alreadyCached) return;

    const localPath = getCacheFilePath(track.url);
    try {
      const stat = await RNFS.stat(localPath);
      if (stat.size > 0) {
        setQueue(previousQueue =>
          previousQueue.map((queueTrack, queueIndex) =>
            queueIndex === index
              ? { ...queueTrack, url: `file://${localPath}` }
              : queueTrack,
          ),
        );
      }
    } catch {
      // cached file is gone, stream instead
    }
  }, []);

  const playTrackAtIndex = useCallback(
    async (index: number) => {
      const currentQueue = queueRef.current;
      if (index < 0 || index >= currentQueue.length) return;
      const track = currentQueue[index];
      currentIndexRef.current = index;
      setCurrentIndex(index);
      setIsLoading(true);
      try {
        await runPlaybackTransition(async isCurrentRequest => {
          try {
            await setupPlayer();
            if (!isCurrentRequest()) return;
            await TrackPlayer.reset();
            if (!isCurrentRequest()) return;
            const resolvedTrack = await resolveTrackUrl(track);
            if (!isCurrentRequest()) return;

            if (resolvedTrack.url !== track.url) {
              setQueue(previousQueue =>
                previousQueue.map((queueTrack, queueIndex) =>
                  queueIndex === index && queueTrack === track
                    ? { ...queueTrack, url: resolvedTrack.url }
                    : queueTrack,
                ),
              );
            }

            await TrackPlayer.add(resolvedTrack);
            if (!isCurrentRequest()) return;
            await TrackPlayer.play();
            if (!isCurrentRequest()) return;
            currentIndexRef.current = index;
            setCurrentIndex(index);
            startPlaybackTracking(resolvedTrack);
          } finally {
            if (isCurrentRequest()) setIsLoading(false);
          }
        });
      } catch (error) {
        console.error('Error playing track:', error);
      }
    },
    [runPlaybackTransition, startPlaybackTracking],
  );

  const fetchAndPlaySuggested = useCallback(async () => {
    const originatingPlaybackRequest = playbackRequestRef.current;
    try {
      const response = await api.get(
        'Metadata/get-suggested-recordings?count=20',
      );
      const recordings: any[] = response.data;
      const token = await getToken();
      if (playbackRequestRef.current !== originatingPlaybackRequest) return;

      const suggestedTracks: Track[] = recordings.map(r => ({
        id: r.id,
        url: `${TEMPORARY_API_URL}Stream?id=${r.id}`,
        title: r.title,
        artist: r.artistName,
        album: r.releaseTitle,
        releaseId: r.releaseId,
        mediaId: r.id,
        artwork: r.cover || PLACEHOLDER_ALBUM_COVER,
        headers: { Authorization: `Bearer ${token}` },
        isLiked: r.isLiked,
      }));

      const currentQueue = queueRef.current;
      const suggestedStart = currentQueue.length;
      const newQueue = [...currentQueue, ...suggestedTracks];

      // Update ref before state so playTrackAtIndex sees the new tracks immediately
      queueRef.current = newQueue;
      setQueue(newQueue);
      setSuggestedQueueStartIndex(suggestedStart);

      await playTrackAtIndex(suggestedStart);
    } catch {
      if (playbackRequestRef.current !== originatingPlaybackRequest) return;
      await runPlaybackTransition(async () => {
        setIsPlaying(false);
        await TrackPlayer.reset();
      });
    }
  }, [api, getToken, playTrackAtIndex, runPlaybackTransition]);

  const playNext = useCallback(async () => {
    const currentQueue = queueRef.current;
    const index = currentIndexRef.current;
    const repeating = repeatingStateRef.current;

    if (repeating === RepeatingType.Song) {
      await playTrackAtIndex(index);
      return;
    }

    const nextIndex = index + 1;
    if (nextIndex < currentQueue.length) {
      if (nextTrackQueuedRef.current) {
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
        await runPlaybackTransition(async isCurrentRequest => {
          await TrackPlayer.skipToNext();
          if (!isCurrentRequest()) return;
          startPlaybackTracking(currentQueue[nextIndex]);
        });
      } else {
        await playTrackAtIndex(nextIndex);
      }
    } else if (repeating === RepeatingType.Album) {
      await playTrackAtIndex(0);
    } else if (suggestedQueueStartIndexRef.current === null) {
      await fetchAndPlaySuggested();
    } else {
      await runPlaybackTransition(async () => {
        setIsPlaying(false);
        await TrackPlayer.reset();
      });
    }
  }, [
    playTrackAtIndex,
    fetchAndPlaySuggested,
    runPlaybackTransition,
    startPlaybackTracking,
  ]);

  const playPrevious = useCallback(async () => {
    const playbackRequest = playbackRequestRef.current;
    const playbackTracker = playbackTrackerRef.current;
    const progress = await TrackPlayer.getProgress();
    if (playbackRequestRef.current !== playbackRequest) return;

    if (progress.position > 5) {
      await enqueuePlayerOperation(async () => {
        if (playbackRequestRef.current !== playbackRequest) return;
        await TrackPlayer.seekTo(0);
        if (playbackRequestRef.current === playbackRequest && playbackTracker) {
          playbackTracker.seek(progress.position, 0);
        }
      });
    } else {
      const previousIndex = currentIndexRef.current - 1;
      if (previousIndex >= 0) {
        await playTrackAtIndex(previousIndex);
      } else {
        await enqueuePlayerOperation(async () => {
          if (playbackRequestRef.current !== playbackRequest) return;
          await TrackPlayer.seekTo(0);
          if (
            playbackRequestRef.current === playbackRequest &&
            playbackTracker
          ) {
            playbackTracker.seek(progress.position, 0);
          }
        });
      }
    }
  }, [playTrackAtIndex, enqueuePlayerOperation]);

  useEffect(() => {
    if (!isPlaying || nextTrackQueuedRef.current) return;

    const playbackRequest = playbackRequestRef.current;
    let isCancelled = false;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queueRef.current.length) return;

    const interval = setInterval(async () => {
      if (
        isCancelled ||
        playbackRequestRef.current !== playbackRequest ||
        nextTrackQueuedRef.current
      ) {
        clearInterval(interval);
        return;
      }
      try {
        const progress = await TrackPlayer.getProgress();
        if (progress.buffered < 3) return;
        clearInterval(interval);
        const nextTrack = queueRef.current[nextIndex];
        if (!nextTrack) return;
        const resolved = await resolveTrackUrl(nextTrack);
        await enqueuePlayerOperation(async () => {
          if (isCancelled || playbackRequestRef.current !== playbackRequest)
            return;
          if (
            queueRef.current[nextIndex] !== nextTrack ||
            nextTrackQueuedRef.current
          )
            return;
          await TrackPlayer.add(resolved);
          if (!isCancelled && playbackRequestRef.current === playbackRequest) {
            nextTrackQueuedRef.current = true;
          }
        });
      } catch {
        // next track pre-queue failed; it will stream normally on skip
      }
    }, 500);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isPlaying, currentIndex, enqueuePlayerOperation]);

  const playNextRef = useRef(playNext);
  const playPreviousRef = useRef(playPrevious);
  playNextRef.current = playNext;
  playPreviousRef.current = playPrevious;

  useEffect(() => {
    const unsubscribeNext = onNext(() => {
      playNextRef.current();
    });
    const unsubscribePrevious = onPrevious(() => {
      playPreviousRef.current();
    });

    return () => {
      unsubscribeNext();
      unsubscribePrevious();
    };
  }, []);

  const isAdvancingRef = useRef(false);

  useTrackPlayerEvents(
    [
      Event.PlaybackState,
      Event.PlaybackQueueEnded,
      Event.RemoteSeek,
      Event.PlaybackActiveTrackChanged,
      Event.PlaybackError,
    ],
    async event => {
      if (event.type === Event.PlaybackState) {
        playbackStateRef.current = event.state;
        setIsPlaying(event.state === State.Playing);
        setIsLoading(
          event.state === State.Loading || event.state === State.Buffering,
        );

        if (event.state === State.Playing) {
          if (playbackTrackerRef.current) {
            playbackTrackerRef.current.resume();
          }
        } else if (event.state === State.Paused) {
          if (playbackTrackerRef.current) {
            playbackTrackerRef.current.pause();
          }
        } else if (event.state === State.Stopped && !isStoppingRef.current) {
          stopPlaybackTracking();
        }
      } else if (event.type === Event.PlaybackQueueEnded) {
        if (isAdvancingRef.current || isStoppingRef.current) {
          return;
        }
        isAdvancingRef.current = true;
        try {
          stopPlaybackTracking();
          await playNextRef.current();
        } finally {
          isAdvancingRef.current = false;
        }
      } else if (event.type === Event.RemoteSeek) {
        const playbackRequest = playbackRequestRef.current;
        const playbackTracker = playbackTrackerRef.current;
        if (playbackTracker) {
          const currentPosition = await getPosition();
          if (playbackRequestRef.current === playbackRequest) {
            playbackTracker.seek(currentPosition, event.position);
          }
        }
      } else if (event.type === Event.PlaybackActiveTrackChanged) {
        if (isStoppingRef.current || !nextTrackQueuedRef.current) return;
        const newIndex = currentIndexRef.current + 1;
        if (newIndex < queueRef.current.length) {
          playbackRequestRef.current = {};
          currentIndexRef.current = newIndex;
          setCurrentIndex(newIndex);
          nextTrackQueuedRef.current = false;
          startPlaybackTracking(queueRef.current[newIndex]);
        }
      } else if (event.type === Event.PlaybackError) {
        if (isAdvancingRef.current || isStoppingRef.current) return;
        isAdvancingRef.current = true;
        try {
          stopPlaybackTracking();
          await playNextRef.current();
        } finally {
          isAdvancingRef.current = false;
        }
      }
    },
  );

  const addToQueue = useCallback((tracks: Track | Track[]) => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    setQueue(previous => [...previous, ...tracksArray]);
  }, []);

  const replaceQueue = useCallback(
    (tracks: Track[]) => {
      playbackRequestRef.current = null;
      stopPlaybackTracking();
      nextTrackQueuedRef.current = false;
      queueRef.current = tracks;
      currentIndexRef.current = -1;
      setQueue(tracks);
      setCurrentIndex(-1);
      setIsLoading(false);
      setIsShuffled(false);
      setSuggestedQueueStartIndex(null);
      originalQueueRef.current = [];
    },
    [stopPlaybackTracking],
  );

  const clearQueue = useCallback(async () => {
    queueRef.current = [];
    currentIndexRef.current = -1;
    setQueue([]);
    setCurrentIndex(-1);
    setIsLoading(false);
    setIsShuffled(false);
    setSuggestedQueueStartIndex(null);
    originalQueueRef.current = [];
    await runPlaybackTransition(async isCurrentRequest => {
      await TrackPlayer.stop();
      if (!isCurrentRequest()) return;
      await TrackPlayer.reset();
    });
  }, [runPlaybackTransition]);

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
    async (index: number) => {
      const previousQueue = queueRef.current;
      if (index < 0 || index >= previousQueue.length) return;
      const updatedQueue = [...previousQueue];
      updatedQueue.splice(index, 1);
      queueRef.current = updatedQueue;
      setQueue(updatedQueue);

      if (index < currentIndexRef.current) {
        currentIndexRef.current -= 1;
        setCurrentIndex(currentIndexRef.current);
      } else if (index === currentIndexRef.current) {
        currentIndexRef.current = -1;
        setCurrentIndex(-1);
        setIsLoading(false);
        await runPlaybackTransition(async isCurrentRequest => {
          await TrackPlayer.stop();
          if (!isCurrentRequest()) return;
          await TrackPlayer.reset();
        });
      }
    },
    [runPlaybackTransition],
  );

  const seekToPosition = useCallback(
    async (position: number) => {
      const playbackRequest = playbackRequestRef.current;
      const playbackTracker = playbackTrackerRef.current;
      await enqueuePlayerOperation(async () => {
        if (playbackRequestRef.current !== playbackRequest) return;
        const currentPosition = await getPosition();
        if (playbackRequestRef.current !== playbackRequest) return;
        await TrackPlayer.seekTo(position);
        if (playbackRequestRef.current === playbackRequest && playbackTracker) {
          playbackTracker.seek(currentPosition, position);
        }
      });
    },
    [enqueuePlayerOperation],
  );

  const toggleShuffle = useCallback(() => {
    const currentQueue = queueRef.current;
    const currentIdx =
      currentIndexRef.current >= 0 ? currentIndexRef.current : 0;

    if (!isShuffledRef.current) {
      if (currentQueue.length <= 1) {
        setIsShuffled(true);
        return;
      }

      originalQueueRef.current = [...currentQueue];

      const currentTrack = currentQueue[currentIdx];
      const others = currentQueue.filter((_, i) => i !== currentIdx);
      const shuffledOthers = fisherYates(others);

      // Place the playing track first so playback continues uninterrupted
      setQueue([currentTrack, ...shuffledOthers]);
      setCurrentIndex(0);
      // Shuffle boundary resets — suggested mode no longer meaningful after reshuffle
      setSuggestedQueueStartIndex(null);
      setIsShuffled(true);
    } else {
      const playingTrack = queueRef.current[currentIndexRef.current];
      const original = originalQueueRef.current;

      if (original.length > 0 && playingTrack) {
        const restoredIdx = original.findIndex(t => t.id === playingTrack.id);
        setQueue(original);
        setCurrentIndex(restoredIdx >= 0 ? restoredIdx : 0);
      }

      setIsShuffled(false);
      setSuggestedQueueStartIndex(null);
      originalQueueRef.current = [];
    }
  }, []);

  return {
    queue,
    currentTrack,
    currentIndex,
    isPlaying,
    isLoading,
    isShuffled,
    suggestedQueueStartIndex,

    addToQueue,
    replaceQueue,
    clearQueue,
    removeFromQueue,
    play,
    pause,
    playNext,
    playPrevious,
    playTrackAtIndex,
    seekToPosition,
    toggleShuffle,
    repeatingState,
    setRepeatingState,
    prefetchTrackAtIndex,

    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    queueLength: queue.length,
  };
}

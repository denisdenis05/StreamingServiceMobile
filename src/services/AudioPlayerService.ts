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
import { TEMPORARY_API_URL, PLACEHOLDER_ALBUM_COVER } from '../constants/placeholders.tsx';

let isSetup = false;

export class PlaybackTracker {
  private sessionId: string;
  private api: any;
  private startTime: number;
  private lastUpdateTime: number;
  private totalListenedTime: number;
  private updateInterval: ReturnType<typeof setInterval> | null;
  private isPaused: boolean;
  private pauseStartTime: number | null;

  constructor(sessionId: string, api: any) {
    this.sessionId = sessionId;
    this.api = api;
    this.startTime = Date.now();
    this.lastUpdateTime = Date.now();
    this.totalListenedTime = 0;
    this.updateInterval = null;
    this.isPaused = false;
    this.pauseStartTime = null;
  }

  start(): void {
    this.lastUpdateTime = Date.now();

    this.updateInterval = setInterval(async () => {
      if (!this.isPaused) {
        const now = Date.now();
        const deltaSeconds = Math.floor((now - this.lastUpdateTime) / 1000);

        if (deltaSeconds > 0) {
          this.totalListenedTime += deltaSeconds;
          await this.reportProgress(deltaSeconds);
          this.lastUpdateTime = now;
        }
      }
    }, 30_000);
  }

  private async reportProgress(deltaSeconds: number): Promise<void> {
    try {
      await this.api.post('/lastfm/playback-progress', {
        sessionId: this.sessionId,
        deltaListenedSeconds: deltaSeconds,
        totalListenedSeconds: this.totalListenedTime,
      });
    } catch (error) {
      console.error('Failed to report progress:', error);
    }
  }

  async pause(): Promise<void> {
    if (this.isPaused) return;

    const now = Date.now();
    const deltaSeconds = Math.floor((now - this.lastUpdateTime) / 1000);
    if (deltaSeconds > 0) {
      this.totalListenedTime += deltaSeconds;
    }

    this.isPaused = true;
    this.pauseStartTime = now;

    try {
      await this.api.post('/lastfm/pause', {
        sessionId: this.sessionId,
        deltaListenedSeconds: deltaSeconds,
        totalListenedSeconds: this.totalListenedTime,
      });
    } catch (error) {
      console.error('Failed to report pause:', error);
    }
  }

  async resume(): Promise<void> {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.lastUpdateTime = Date.now();
    this.pauseStartTime = null;

    try {
      await this.api.post('/lastfm/resume', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      console.error('Failed to report resume:', error);
    }
  }

  async seek(fromSeconds: number, toSeconds: number): Promise<void> {
    try {
      await this.api.post('/lastfm/seek', {
        sessionId: this.sessionId,
        fromSeconds: Math.floor(fromSeconds),
        toSeconds: Math.floor(toSeconds),
      });

      this.lastUpdateTime = Date.now();
    } catch (error) {
      console.error('Failed to report seek:', error);
    }
  }

  async stop(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (!this.isPaused) {
      const now = Date.now();
      const deltaSeconds = Math.floor((now - this.lastUpdateTime) / 1000);
      if (deltaSeconds > 0) {
        this.totalListenedTime += deltaSeconds;
      }
    }

    try {
      await this.api.post('/lastfm/stop-playback', {
        sessionId: this.sessionId,
        totalListenedSeconds: this.totalListenedTime,
      });
    } catch (error) {
      console.error('Failed to report playback stop:', error);
    }
  }

  getTotalListenedTime(): number {
    return this.totalListenedTime;
  }
}

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
  const [suggestedQueueStartIndex, setSuggestedQueueStartIndex] = useState<number | null>(null);

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
  const nextTrackQueuedRef = useRef(false);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatingStateRef.current = repeatingState;
  isShuffledRef.current = isShuffled;
  suggestedQueueStartIndexRef.current = suggestedQueueStartIndex;

  const startPlaybackTracking = async (track: Track) => {
    try {
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.stop();
        playbackTrackerRef.current = null;
      }

      const isLocalCached = track.url?.startsWith('file://') || false;
      const duration = await getDuration();

      const response = await api.post('/lastfm/start-playback', {
        trackId: track.id,
        artist: track.artist || 'Unknown Artist',
        track: track.title || 'Unknown Track',
        album: track.album || 'Unknown Album',
        durationSeconds: Math.floor(duration),
        isLocalCached,
        playlistId: (track as any).playlistId,
      });

      if (response.data.success) {
        playbackTrackerRef.current = new PlaybackTracker(
          response.data.sessionId,
          api
        );
        playbackTrackerRef.current.start();
      }
    } catch (error) {
      console.error('Failed to start playback tracking:', error);
    }
  };

  const prefetchTrackAtIndex = useCallback(
    async (index: number) => {
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
                : queueTrack
            )
          );
        }
      } catch {
        // cached file is gone, stream instead
      }
    },
    []
  );

  const playTrackAtIndex = useCallback(
    async (index: number) => {
      const currentQueue = queueRef.current;
      if (index < 0 || index >= currentQueue.length) {
        return;
      }
      try {
        setIsLoading(true);
        setCurrentIndex(index);

        if (playbackTrackerRef.current) {
          await playbackTrackerRef.current.stop();
          playbackTrackerRef.current = null;
        }

        nextTrackQueuedRef.current = false;
        isStoppingRef.current = true;
        await setupPlayer();
        await TrackPlayer.reset();
        isStoppingRef.current = false;

        const track = currentQueue[index];
        const resolvedTrack = await resolveTrackUrl(track);

        if (resolvedTrack.url !== track.url) {
          setQueue(previousQueue =>
            previousQueue.map((queueTrack, queueIndex) =>
              queueIndex === index
                ? { ...queueTrack, url: resolvedTrack.url }
                : queueTrack
            )
          );
        }

        console.log(`[AudioPlayer] Playing track "${resolvedTrack.title}" with URL: ${resolvedTrack.url}`);
        await TrackPlayer.add(resolvedTrack);
        await TrackPlayer.play();

        startPlaybackTracking(resolvedTrack);
      } catch (error) {
        console.error('Error playing track:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [api]
  );

  const fetchAndPlaySuggested = useCallback(async () => {
    try {
      const response = await api.get('Metadata/get-suggested-recordings?count=20');
      const recordings: any[] = response.data;
      const token = await getToken();

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
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.stop();
        playbackTrackerRef.current = null;
      }
      setIsPlaying(false);
      await TrackPlayer.reset();
    }
  }, [api, getToken, playTrackAtIndex]);

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
        if (playbackTrackerRef.current) {
          await playbackTrackerRef.current.stop();
          playbackTrackerRef.current = null;
        }
        isStoppingRef.current = true;
        await TrackPlayer.skipToNext();
        isStoppingRef.current = false;
        setCurrentIndex(nextIndex);
        nextTrackQueuedRef.current = false;
        startPlaybackTracking(currentQueue[nextIndex]);
      } else {
        await playTrackAtIndex(nextIndex);
      }
    } else if (repeating === RepeatingType.Album) {
      await playTrackAtIndex(0);
    } else if (suggestedQueueStartIndexRef.current === null) {
      await fetchAndPlaySuggested();
    } else {
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.stop();
        playbackTrackerRef.current = null;
      }
      setIsPlaying(false);
      await TrackPlayer.reset();
    }
  }, [playTrackAtIndex, fetchAndPlaySuggested]);

  const playPrevious = useCallback(async () => {
    const progress = await TrackPlayer.getProgress();

    if (progress.position > 5) {
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.seek(progress.position, 0);
      }
      await TrackPlayer.seekTo(0);
    } else {
      const previousIndex = currentIndexRef.current - 1;
      if (previousIndex >= 0) {
        await playTrackAtIndex(previousIndex);
      } else {
        if (playbackTrackerRef.current) {
          await playbackTrackerRef.current.seek(progress.position, 0);
        }
        await TrackPlayer.seekTo(0);
      }
    }
  }, [playTrackAtIndex]);

  useEffect(() => {
    if (!isPlaying || nextTrackQueuedRef.current) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= queueRef.current.length) return;

    const interval = setInterval(async () => {
      if (nextTrackQueuedRef.current) {
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
        await TrackPlayer.add(resolved);
        nextTrackQueuedRef.current = true;
      } catch {
        // next track pre-queue failed; it will stream normally on skip
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, currentIndex]);

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
    [Event.PlaybackState, Event.PlaybackQueueEnded, Event.RemoteSeek, Event.PlaybackActiveTrackChanged, Event.PlaybackError],
    async event => {
      if (event.type === Event.PlaybackState) {
        const wasPlaying = isPlaying;
        setIsPlaying(event.state === State.Playing);
        setIsLoading(
          event.state === State.Loading || event.state === State.Buffering
        );

        if (event.state === State.Playing && !wasPlaying) {
          if (playbackTrackerRef.current) {
            await playbackTrackerRef.current.resume();
          }
        } else if (event.state === State.Paused && wasPlaying) {
          if (playbackTrackerRef.current) {
            await playbackTrackerRef.current.pause();
          }
        } else if (event.state === State.Stopped && !isStoppingRef.current) {
          if (playbackTrackerRef.current) {
            await playbackTrackerRef.current.stop();
            playbackTrackerRef.current = null;
          }
        }
      } else if (event.type === Event.PlaybackQueueEnded) {
        if (isAdvancingRef.current || isStoppingRef.current) {
          return;
        }
        isAdvancingRef.current = true;
        try {
          if (playbackTrackerRef.current) {
            await playbackTrackerRef.current.stop();
            playbackTrackerRef.current = null;
          }
          await playNextRef.current();
        } finally {
          isAdvancingRef.current = false;
        }
      } else if (event.type === Event.RemoteSeek) {
        if (playbackTrackerRef.current) {
          const currentPosition = await getPosition();
          await playbackTrackerRef.current.seek(
            currentPosition,
            event.position
          );
        }
      } else if (event.type === Event.PlaybackActiveTrackChanged) {
        if (isStoppingRef.current || !nextTrackQueuedRef.current) return;
        const newIndex = currentIndexRef.current + 1;
        if (newIndex < queueRef.current.length) {
          setCurrentIndex(newIndex);
          nextTrackQueuedRef.current = false;
          await startPlaybackTracking(queueRef.current[newIndex]);
        }
      } else if (event.type === Event.PlaybackError) {
        if (isAdvancingRef.current || isStoppingRef.current) return;
        isAdvancingRef.current = true;
        try {
          if (playbackTrackerRef.current) {
            await playbackTrackerRef.current.stop();
            playbackTrackerRef.current = null;
          }
          await playNextRef.current();
        } finally {
          isAdvancingRef.current = false;
        }
      }
    }
  );

  const addToQueue = useCallback((tracks: Track | Track[]) => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    setQueue(previous => [...previous, ...tracksArray]);
  }, []);

  const replaceQueue = useCallback(
    (tracks: Track[]) => {
      setQueue(tracks);
      setCurrentIndex(-1);
      setIsShuffled(false);
      setSuggestedQueueStartIndex(null);
      originalQueueRef.current = [];
    },
    []
  );

  const clearQueue = useCallback(async () => {
    if (playbackTrackerRef.current) {
      await playbackTrackerRef.current.stop();
      playbackTrackerRef.current = null;
    }

    setQueue([]);
    setCurrentIndex(-1);
    setIsShuffled(false);
    setSuggestedQueueStartIndex(null);
    originalQueueRef.current = [];
    await TrackPlayer.stop();
    await TrackPlayer.reset();
  }, []);

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
      setQueue(previous => {
        const newQueue = [...previous];
        newQueue.splice(index, 1);

        if (index < currentIndex) {
          setCurrentIndex(previousIndex => previousIndex - 1);
        } else if (index === currentIndex) {
          if (playbackTrackerRef.current) {
            playbackTrackerRef.current.stop();
            playbackTrackerRef.current = null;
          }

          setCurrentIndex(-1);
          TrackPlayer.stop();
          TrackPlayer.reset();
        }

        return newQueue;
      });
    },
    [currentIndex]
  );

  const seekToPosition = useCallback(async (position: number) => {
    const currentPosition = await getPosition();

    if (playbackTrackerRef.current) {
      await playbackTrackerRef.current.seek(currentPosition, position);
    }

    await TrackPlayer.seekTo(position);
  }, []);

  const toggleShuffle = useCallback(() => {
    const currentQueue = queueRef.current;
    const currentIdx = currentIndexRef.current >= 0 ? currentIndexRef.current : 0;

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

import TrackPlayer, {
  Capability,
  Track,
  Event,
  useTrackPlayerEvents,
  State,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { useState, useCallback, useRef, useEffect } from 'react';
import { cacheTrack, getCacheFilePath, isTrackCached } from './cache/AudioCacheService';
import RNFS from 'react-native-fs';
import { RepeatingType } from '../constants/types.tsx';
import { useApi } from '../hooks/useApi.ts';
import { onNext, onPrevious } from './QueueEventEmitter';

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

export function useQueue() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [repeatingState, setRepeatingState] = useState(RepeatingType.None);

  const api = useApi();

  const isStoppingRef = useRef(false);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatingStateRef = useRef(repeatingState);

  const playbackTrackerRef = useRef<PlaybackTracker | null>(null);
  const prefetchingRef = useRef<string | null>(null);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatingStateRef.current = repeatingState;

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
      if (index < 0 || index >= currentQueue.length) {
        return;
      }

      const track = currentQueue[index];
      if (!track.url || !track.url.startsWith('http')) {
        return;
      }

      if (prefetchingRef.current === track.id) {
        return;
      }

      const alreadyCached = await isTrackCached(track.url);
      if (alreadyCached) {
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
            return;
          }
        } catch {
          // fall through to download
        }
      }

      prefetchingRef.current = track.id;
      try {
        const localPath = await cacheTrack(track.url, track.headers);
        setQueue(previousQueue =>
          previousQueue.map((queueTrack, queueIndex) =>
            queueIndex === index
              ? { ...queueTrack, url: `file://${localPath}` }
              : queueTrack
          )
        );
      } catch (error) {
        console.error(`Failed to prefetch track ${track.id}:`, error);
      } finally {
        prefetchingRef.current = null;
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

        if (track.url.startsWith('http')) {
          cacheTrack(track.url, track.headers).catch(() => { });
        }

        const nextIndex = index + 1;
        if (nextIndex < currentQueue.length) {
          prefetchTrackAtIndex(nextIndex);
        }
      } catch (error) {
        console.error('Error playing track:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [api, prefetchTrackAtIndex]
  );

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
      await playTrackAtIndex(nextIndex);
    } else if (repeating === RepeatingType.Album) {
      await playTrackAtIndex(0);
    } else {
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.stop();
        playbackTrackerRef.current = null;
      }
      setIsPlaying(false);
      await TrackPlayer.reset();
    }
  }, [playTrackAtIndex]);

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
    [Event.PlaybackState, Event.PlaybackQueueEnded, Event.RemoteSeek],
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

      if (tracks.length > 0) {
        const firstTrack = tracks[0];
        if (firstTrack.url && firstTrack.url.startsWith('http')) {
          cacheTrack(firstTrack.url, firstTrack.headers)
            .then(localPath => {
              setQueue(previousQueue =>
                previousQueue.map((queueTrack, queueIndex) =>
                  queueIndex === 0
                    ? { ...queueTrack, url: `file://${localPath}` }
                    : queueTrack
                )
              );
            })
            .catch(() => { });
        }
      }
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
    seekToPosition,
    repeatingState,
    setRepeatingState,
    prefetchTrackAtIndex,

    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    queueLength: queue.length,
  };
}

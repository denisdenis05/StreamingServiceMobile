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
import { useApi } from '../hooks/useApi.ts';

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
    console.log('Starting playback tracking for session:', this.sessionId);
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

      console.log(
        `Progress reported: +${deltaSeconds}s (total: ${this.totalListenedTime}s) for session ${this.sessionId}`
      );
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
      console.log(`Pause reported for session ${this.sessionId}`);
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
      console.log(`Resume reported for session ${this.sessionId}`);
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

      console.log(
        `Seek reported: ${fromSeconds}s -> ${toSeconds}s for session ${this.sessionId}`
      );
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
      console.log(
        `Playback stopped for session ${this.sessionId}, total listened: ${this.totalListenedTime}s`
      );
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

  const api = useApi();

  const isStoppingRef = useRef(false);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);

  const playbackTrackerRef = useRef<PlaybackTracker | null>(null);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null;
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;

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
      });

      if (response.data.success) {
        playbackTrackerRef.current = new PlaybackTracker(
          response.data.sessionId,
          api
        );
        playbackTrackerRef.current.start();

        console.log(
          `Started tracking for "${track.title}" with session ${response.data.sessionId}`
        );
      }
    } catch (error) {
      console.error('Failed to start playback tracking:', error);
    }
  };

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
        } else if (event.state === State.Stopped) {
          if (playbackTrackerRef.current && !isStoppingRef.current) {
            await playbackTrackerRef.current.stop();
            playbackTrackerRef.current = null;
          }
        }

        if (event.state === State.Ended) {
          console.log('Track ended, attempting to play next');

          if (playbackTrackerRef.current) {
            await playbackTrackerRef.current.stop();
            playbackTrackerRef.current = null;
          }

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

  const playTrackAtIndex = useCallback(
    async (index: number) => {
      if (index < 0 || index >= queue.length) {
        return;
      }
      try {
        setIsLoading(true);
        setCurrentIndex(index);

        const track = queue[index];

        if (playbackTrackerRef.current) {
          await playbackTrackerRef.current.stop();
          playbackTrackerRef.current = null;
        }

        isStoppingRef.current = true;
        await setupPlayer();
        await TrackPlayer.stop();
        await TrackPlayer.reset();
        isStoppingRef.current = false;

        const processedTrack = track;

        await TrackPlayer.add(processedTrack);
        await TrackPlayer.play();

        setTimeout(() => {
          startPlaybackTracking(processedTrack);
        }, 1000);
      } catch (error) {
        console.error('Error playing track:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [queue, api]
  );

  const addToQueue = useCallback((tracks: Track | Track[]) => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    setQueue(prev => [...prev, ...tracksArray]);
  }, []);

  const replaceQueue = useCallback((tracks: Track[]) => {
    setQueue(tracks);
    setCurrentIndex(-1);
  }, []);

  const clearQueue = useCallback(async () => {
    if (playbackTrackerRef.current) {
      await playbackTrackerRef.current.stop();
      playbackTrackerRef.current = null;
    }

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
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.stop();
        playbackTrackerRef.current = null;
      }

      setIsPlaying(false);
      await TrackPlayer.stop();
      await TrackPlayer.reset();
    }
  }, [currentIndex, queue.length, playTrackAtIndex]);

  const playPrevious = useCallback(async () => {
    const progress = await TrackPlayer.getProgress();

    if (progress.position > 5) {
      if (playbackTrackerRef.current) {
        await playbackTrackerRef.current.seek(progress.position, 0);
      }
      await TrackPlayer.seekTo(0);
    } else {
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        await playTrackAtIndex(prevIndex);
      } else {
        if (playbackTrackerRef.current) {
          await playbackTrackerRef.current.seek(progress.position, 0);
        }
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
    async (index: number) => {
      setQueue(prev => {
        const newQueue = [...prev];
        newQueue.splice(index, 1);

        if (index < currentIndex) {
          setCurrentIndex(prev => prev - 1);
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

    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    queueLength: queue.length,
  };
}

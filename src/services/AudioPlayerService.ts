import TrackPlayer, {
  Capability,
  Track,
  Event,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { useEffect, useState } from 'react';

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

export async function playTrack(track: Track) {
  await setupPlayer();
  await resetQueue();
  await TrackPlayer.add(track);
  await TrackPlayer.play();
}

export async function resetQueue() {
  await TrackPlayer.stop();
  await TrackPlayer.reset();
  const queue = await TrackPlayer.getQueue();
  if (queue.length > 0) {
    await TrackPlayer.remove(queue.map(t => t.id));
  }
}

export async function addTrack(track: Track) {
  await setupPlayer();
  await TrackPlayer.add(track);
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

export async function skipToNext() {
  await TrackPlayer.skipToNext();
}

export async function skipToPrevious() {
  const progress = await TrackPlayer.getProgress();
  console.log(progress);
  if (progress.position > 5) {
    await TrackPlayer.seekTo(0);
  } else {
    await TrackPlayer.skipToPrevious();
  }
}

export async function getPosition(): Promise<number> {
  return TrackPlayer.getProgress().then(progress => progress.position);
}

export async function getDuration(): Promise<number> {
  return TrackPlayer.getProgress().then(progress => progress.duration);
}

export function getIsLoading() {
  return false;
}

export function getIsBuffering() {
  return false;
}

export function useCurrentTrack() {
  const [track, setTrack] = useState<Track | undefined>(undefined);

  // Fetch on mount
  useEffect(() => {
    const fetchCurrentTrack = async () => {
      const trackId = await TrackPlayer.getActiveTrackIndex();
      if (trackId != null) {
        const trackObj = await TrackPlayer.getTrack(trackId);
        setTrack(trackObj);
      } else {
        setTrack(undefined);
      }
    };
    fetchCurrentTrack();
  }, []);

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], event => {
    if (event.track) {
      setTrack(event.track);
    } else {
      setTrack(undefined);
    }
  });

  return track;
}

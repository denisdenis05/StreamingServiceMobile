import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlaybackQueueContextStorage } from './player/PlaybackQueueContextPersistence';
import { QueueContextPersistencePolicy } from './player/PlaybackQueueContextPersistence';

export const PlaybackQueueContextStoragePolicy = Object.freeze({
  key: 'streaming.playback.queue-context.v1',
  readDeadlineMilliseconds: 1500,
});

export const playbackQueueContextStorage: PlaybackQueueContextStorage = {
  async read() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const serialized = await Promise.race([
        AsyncStorage.getItem(PlaybackQueueContextStoragePolicy.key),
        new Promise<null>(resolve => {
          timeout = setTimeout(() => resolve(null), PlaybackQueueContextStoragePolicy.readDeadlineMilliseconds);
        }),
      ]);
      return serialized === null || serialized.length > QueueContextPersistencePolicy.maximumSerializedCharacters
        ? null : JSON.parse(serialized) as unknown;
    } catch { return null; }
    finally { if (timeout !== undefined) clearTimeout(timeout); }
  },
  write: receipt => AsyncStorage.setItem(PlaybackQueueContextStoragePolicy.key, JSON.stringify(receipt)),
};

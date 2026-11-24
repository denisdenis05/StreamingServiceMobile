import { DefaultQueuePolicy } from 'streaming-service-player';
import type { CatalogRecording } from './PlaybackCatalogMapping';
import { QueueIntentSupersededError } from './QueueIntentScheduler';

export const CollectionLoadingPolicy = Object.freeze({
  firstPage: 1, pageIncrement: 1, pageSize: 100, emptyLength: 0,
  maximumEntries: DefaultQueuePolicy.maximumEntries,
  capacityMessage: 'The collection exceeds the player queue capacity.',
  cancelledMessage: 'The collection playback request was superseded.',
});
export class PlaybackCollectionLoader {
  async load(readPage: (page: number, pageSize: number) => Promise<readonly CatalogRecording[]>,
    isCurrent: () => boolean): Promise<readonly CatalogRecording[]> {
    const recordings: CatalogRecording[] = [];
    for (let page = CollectionLoadingPolicy.firstPage; ; page += CollectionLoadingPolicy.pageIncrement) {
      if (!isCurrent()) throw new QueueIntentSupersededError();
      const entries = await readPage(page, CollectionLoadingPolicy.pageSize);
      if (!isCurrent()) throw new QueueIntentSupersededError();
      if (entries.length > CollectionLoadingPolicy.pageSize
        || recordings.length + entries.length > CollectionLoadingPolicy.maximumEntries) throw new Error(CollectionLoadingPolicy.capacityMessage);
      recordings.push(...entries.map(entry => ({ ...entry })));
      if (entries.length < CollectionLoadingPolicy.pageSize) return recordings;
    }
  }
}

import { QueuePageStatus } from 'streaming-service-player';
import type { PlayerCursor, PlayerObservation, PlayerSnapshot, QueueEntry } from 'streaming-service-player';
import type { PlaybackTrackView } from './PlaybackTrack';

export interface PlaybackTrackViewSource {
  viewFor(entry: QueueEntry): PlaybackTrackView;
}

export interface NativeQueuePageReader {
  getQueuePage: PlayerObservation['getQueuePage'];
}

export const QueueProjectionPolicy = Object.freeze({
  initialReadGeneration: 0,
  readGenerationIncrement: 1,
  firstPageOffset: 0,
  emptyQueueLength: 0,
  emptyPageEntryCount: 0,
  maximumPageEntries: 100,
});

export class NativeQueueProjection {
  private readGeneration = QueueProjectionPolicy.initialReadGeneration;
  private cachedCursor: PlayerCursor | null = null;
  private cachedEntries: readonly QueueEntry[] = [];
  private cachedViews: readonly PlaybackTrackView[] = [];

  constructor(
    private readonly observation: NativeQueuePageReader,
    private readonly metadata: PlaybackTrackViewSource,
  ) {}

  async read(snapshot: PlayerSnapshot): Promise<readonly PlaybackTrackView[] | null> {
    const generation = ++this.readGeneration;
    if (!Number.isSafeInteger(snapshot.queueLength) || snapshot.queueLength < QueueProjectionPolicy.emptyQueueLength) return null;
    if (this.cachedCursor !== null && this.sameQueue(this.cachedCursor, snapshot.cursor)) return this.cachedViews;
    const cursor = { ...snapshot.cursor };
    const entries: QueueEntry[] = [];
    let offset = QueueProjectionPolicy.firstPageOffset;
    while (offset < snapshot.queueLength) {
      const result = await this.observation.getQueuePage(offset, QueueProjectionPolicy.maximumPageEntries, cursor.queueRevision);
      if (generation !== this.readGeneration || result.status !== QueuePageStatus.Success
        || !this.sameQueue(cursor, result.page.cursor)) return null;
      if (result.page.offset !== offset || result.page.totalEntries !== snapshot.queueLength
        || result.page.entries.length === QueueProjectionPolicy.emptyPageEntryCount
        || result.page.entries.length > QueueProjectionPolicy.maximumPageEntries
        || entries.length + result.page.entries.length > snapshot.queueLength) return null;
      entries.push(...result.page.entries);
      offset += result.page.entries.length;
    }
    if (generation !== this.readGeneration) return null;
    if (new Set(entries.map(entry => entry.entryIdentifier)).size !== entries.length) return null;
    const views = entries.map(entry => this.metadata.viewFor(entry));
    const unchanged = this.cachedCursor !== null && this.sameSession(this.cachedCursor, cursor)
      && this.cachedEntries.length === entries.length
      && entries.every((entry, entryIndex) => JSON.stringify(entry) === JSON.stringify(this.cachedEntries[entryIndex]));
    this.cachedCursor = cursor;
    this.cachedEntries = entries.map(entry => ({ ...entry }));
    if (!unchanged) this.cachedViews = views;
    return this.cachedViews;
  }

  clear(): void {
    this.readGeneration += QueueProjectionPolicy.readGenerationIncrement;
    this.cachedCursor = null;
    this.cachedEntries = [];
    this.cachedViews = [];
  }

  private sameQueue(previous: PlayerCursor, current: PlayerCursor): boolean {
    return this.sameSession(previous, current) && (previous.queueIdentifier === current.queueIdentifier)
      && (previous.queueContentRevision ?? previous.queueRevision) === (current.queueContentRevision ?? current.queueRevision);
  }

  private sameSession(previous: PlayerCursor, current: PlayerCursor): boolean {
    return previous.engineEpoch === current.engineEpoch && previous.authenticationEpoch === current.authenticationEpoch;
  }
}

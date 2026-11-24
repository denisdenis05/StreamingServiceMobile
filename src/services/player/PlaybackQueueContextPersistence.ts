import { DefaultQueuePolicy } from 'streaming-service-player';
import type { PlayerCursor, PlayerSnapshot } from 'streaming-service-player';
import type { PlaybackTrackView } from './PlaybackTrack';
import type { PlaybackMetadataRegistry } from './PlaybackMetadataRegistry';

export interface PlaybackQueueContextReceipt {
  readonly serverAddress: string;
  readonly accountIdentifier: string;
  readonly engineEpoch: string;
  readonly authenticationEpoch: string;
  readonly queueIdentifier: string | null;
  readonly queueContentRevision: number;
  readonly origins: readonly {
    readonly entryIdentifier: string;
    readonly recordingIdentifier: string;
    readonly sourceAlbumIdentifier: string;
    readonly isLocalCached: boolean;
  }[];
}

export interface PlaybackQueueContextStorage {
  read(): Promise<unknown>;
  write(receipt: PlaybackQueueContextReceipt): Promise<void>;
}

export interface PlaybackQueueContextDependencies {
  readonly serverAddress: string;
  readonly storage: PlaybackQueueContextStorage;
  readonly metadata: Pick<PlaybackMetadataRegistry, 'stage'>;
  readonly getSnapshot: () => Promise<PlayerSnapshot>;
  readonly readQueue: (snapshot: PlayerSnapshot) => Promise<readonly PlaybackTrackView[] | null>;
  readonly reportFailure: (failure: unknown) => void;
}

export const QueueContextPersistencePolicy = Object.freeze({
  initialGeneration: 0,
  generationIncrement: 1,
  minimumRevision: 0,
  maximumSerializedCharacters: 1024 * 1024,
  storageFailureMessage: 'Listening queue context could not be saved.',
  identifierPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isNonemptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > QueueContextPersistencePolicy.minimumRevision;
}
function isReceipt(value: unknown): value is PlaybackQueueContextReceipt {
  if (!isRecord(value) || ![value.serverAddress, value.accountIdentifier, value.engineEpoch, value.authenticationEpoch].every(isNonemptyText)
    || !(value.queueIdentifier === null || isNonemptyText(value.queueIdentifier))
    || typeof value.queueContentRevision !== 'number' || !Number.isSafeInteger(value.queueContentRevision)
    || value.queueContentRevision < QueueContextPersistencePolicy.minimumRevision || !Array.isArray(value.origins)
    || value.origins.length > DefaultQueuePolicy.maximumEntries) return false;
  return value.origins.every(origin => isRecord(origin) && isNonemptyText(origin.entryIdentifier)
    && isNonemptyText(origin.recordingIdentifier) && isNonemptyText(origin.sourceAlbumIdentifier)
    && QueueContextPersistencePolicy.identifierPattern.test(origin.recordingIdentifier)
    && QueueContextPersistencePolicy.identifierPattern.test(origin.sourceAlbumIdentifier) && typeof origin.isLocalCached === 'boolean')
    && new Set(value.origins.map(origin => origin.entryIdentifier)).size === value.origins.length;
}

export class PlaybackQueueContextPersistence {
  private generation = QueueContextPersistencePolicy.initialGeneration;
  private writes: Promise<void> = Promise.resolve();
  private lastCaptured: string | null = null;

  constructor(private readonly dependencies: PlaybackQueueContextDependencies) {}

  invalidate(): void {
    this.generation += QueueContextPersistencePolicy.generationIncrement;
    this.lastCaptured = null;
  }

  async restore(accountIdentifier: string, snapshot: PlayerSnapshot, isCurrent: () => boolean): Promise<void> {
    const generation = this.generation;
    const current = () => generation === this.generation && isCurrent();
    try {
      const receipt = await this.dependencies.storage.read();
      if (!current() || !isReceipt(receipt) || !this.matches(receipt, accountIdentifier, snapshot.cursor)) return;
      const queue = await this.dependencies.readQueue(snapshot);
      if (!current() || queue === null) return;
      const latest = await this.dependencies.getSnapshot();
      if (!current() || !this.matches(receipt, accountIdentifier, latest.cursor)) return;
      const origins = new Map(receipt.origins.map(origin => [origin.entryIdentifier, origin]));
      const restored = queue.flatMap(view => {
        const origin = origins.get(view.entryIdentifier);
        return origin === undefined || view.playlistIdentifier !== undefined || (view.recordingIdentifier !== undefined && origin.recordingIdentifier !== view.recordingIdentifier)
          ? [] : [{ ...view, recordingIdentifier: origin.recordingIdentifier,
            sourceAlbumIdentifier: origin.sourceAlbumIdentifier, isLocalCached: origin.isLocalCached }];
      });
      if (restored.length > QueueContextPersistencePolicy.minimumRevision) this.dependencies.metadata.stage(restored).settle(true);
    } catch {}
  }

  capture(accountIdentifier: string, snapshot: PlayerSnapshot, queue: readonly PlaybackTrackView[]): void {
    if (queue.length !== snapshot.queueLength || queue.length > DefaultQueuePolicy.maximumEntries) return;
    const receipt: PlaybackQueueContextReceipt = {
      serverAddress: this.dependencies.serverAddress, accountIdentifier,
      engineEpoch: snapshot.cursor.engineEpoch, authenticationEpoch: snapshot.cursor.authenticationEpoch,
      queueIdentifier: snapshot.cursor.queueIdentifier ?? null,
      queueContentRevision: snapshot.cursor.queueContentRevision ?? snapshot.cursor.queueRevision,
      origins: queue.flatMap(view => view.sourceAlbumIdentifier === undefined || view.recordingIdentifier === undefined
        || view.playlistIdentifier !== undefined ? [] : [{ entryIdentifier: view.entryIdentifier,
          recordingIdentifier: view.recordingIdentifier, sourceAlbumIdentifier: view.sourceAlbumIdentifier, isLocalCached: view.isLocalCached }]),
    };
    if (!isReceipt(receipt)) return;
    const serialized = JSON.stringify(receipt);
    if (serialized === this.lastCaptured || serialized.length > QueueContextPersistencePolicy.maximumSerializedCharacters) return;
    this.lastCaptured = serialized;
    const generation = this.generation;
    this.writes = this.writes.catch(() => undefined).then(async () => {
      if (generation !== this.generation) return;
      try { await this.dependencies.storage.write(receipt); }
      catch {
        if (generation === this.generation) this.lastCaptured = null;
        try { this.dependencies.reportFailure(new Error(QueueContextPersistencePolicy.storageFailureMessage)); } catch {}
      }
    });
  }

  private matches(receipt: PlaybackQueueContextReceipt, accountIdentifier: string, cursor: PlayerCursor): boolean {
    return receipt.serverAddress === this.dependencies.serverAddress && receipt.accountIdentifier === accountIdentifier
      && receipt.engineEpoch === cursor.engineEpoch && receipt.authenticationEpoch === cursor.authenticationEpoch
      && receipt.queueIdentifier === (cursor.queueIdentifier ?? null)
      && receipt.queueContentRevision === (cursor.queueContentRevision ?? cursor.queueRevision);
  }
}

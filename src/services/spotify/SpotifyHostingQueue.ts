import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import { QueuePageStatus } from 'streaming-service-player';
import type { PlayerCursor, PlayerObservation } from 'streaming-service-player';

export const SpotifyHostingQueuePolicy = Object.freeze({ maximumEntries: 80, minimumEntries: 1, firstOffset: 0, minimumRevision: 0 } as const);
export interface SpotifyHostingQueue {
  readonly playerEngineEpoch: string;
  readonly playerAuthenticationEpoch: string;
  readonly expectedCursor: Readonly<{ queueIdentifier: string; queueRevision: number; contentRevision: number; controlRevision: number }>;
  readonly entries: readonly Readonly<{ occurrenceIdentifier: string; recordingIdentifier: string }>[];
}
export async function captureSpotifyHostingQueue(player: Pick<PlayerObservation, 'getSnapshot' | 'getQueuePage'>): Promise<SpotifyHostingQueue> {
  const snapshot = await player.getSnapshot();
  if (snapshot.externalAuthorityIdentifier !== null || !snapshot.currentEntry || !Number.isSafeInteger(snapshot.queueLength) || snapshot.queueLength < SpotifyHostingQueuePolicy.minimumEntries
    || snapshot.queueLength > SpotifyHostingQueuePolicy.maximumEntries) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  const cursor = snapshot.cursor;
  if (!cursor.queueIdentifier || cursor.queueContentRevision === undefined || cursor.playbackControlRevision === undefined
    || ![cursor.queueRevision, cursor.queueContentRevision, cursor.playbackControlRevision].every(value => Number.isSafeInteger(value) && value >= SpotifyHostingQueuePolicy.minimumRevision)) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  }
  const result = await player.getQueuePage(SpotifyHostingQueuePolicy.firstOffset, SpotifyHostingQueuePolicy.maximumEntries, cursor.queueRevision);
  if (result.status !== QueuePageStatus.Success || !sameSpotifyHostingCursor(result.page.cursor, cursor)
    || result.page.offset !== SpotifyHostingQueuePolicy.firstOffset || result.page.totalEntries !== snapshot.queueLength
    || result.page.entries.length !== snapshot.queueLength) {
    throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
  const confirmed = await player.getSnapshot();
  if (!sameSpotifyHostingCursor(confirmed.cursor, cursor) || confirmed.externalAuthorityIdentifier !== null
    || confirmed.queueLength !== snapshot.queueLength || confirmed.currentEntry?.entryIdentifier !== snapshot.currentEntry.entryIdentifier) {
    throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
  const entries = result.page.entries.map(entry => {
    if (!entry.recordingIdentifier || !entry.entryIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
    return Object.freeze({ occurrenceIdentifier: entry.entryIdentifier, recordingIdentifier: entry.recordingIdentifier });
  });
  if (!entries.some(entry => entry.occurrenceIdentifier === snapshot.currentEntry?.entryIdentifier)
    || new Set(entries.map(entry => entry.occurrenceIdentifier)).size !== entries.length) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  return Object.freeze({ playerEngineEpoch: cursor.engineEpoch, playerAuthenticationEpoch: cursor.authenticationEpoch,
    expectedCursor: Object.freeze({ queueIdentifier: cursor.queueIdentifier, queueRevision: cursor.queueRevision,
      contentRevision: cursor.queueContentRevision, controlRevision: cursor.playbackControlRevision }), entries: Object.freeze(entries) });
}
export function sameSpotifyHostingCursor(first: PlayerCursor, second: PlayerCursor): boolean {
  return first.engineEpoch === second.engineEpoch && first.authenticationEpoch === second.authenticationEpoch && first.queueIdentifier === second.queueIdentifier
    && first.queueRevision === second.queueRevision && first.queueContentRevision === second.queueContentRevision && first.playbackControlRevision === second.playbackControlRevision;
}

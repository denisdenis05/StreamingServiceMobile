import { IntegrationFailure, IntegrationFailureCode, QueueSide } from 'streaming-service-spotify-jam';
import type { ControllableQueueChange, ControllableQueuePort, ControllableQueueSnapshot } from 'streaming-service-spotify-jam';

export interface SpotifyControllableQueueNative {
  getHostingQueue(side: QueueSide): Promise<string>;
  applyHostingQueue(side: QueueSide, serialized: string): Promise<string>;
}
export interface SpotifyControllableQueueDependencies {
  readonly native: SpotifyControllableQueueNative;
  readonly side: QueueSide;
  readonly getScope: () => string | null;
}
const QueuePortPolicy = Object.freeze({ maximumSerializedCharacters: 1048576, maximumEntries: 2001,
  minimumCharacters: 1, stringType: 'string', booleanType: 'boolean' } as const);

export class SpotifyControllableQueuePort implements ControllableQueuePort {
  constructor(private readonly dependencies: SpotifyControllableQueueDependencies) {}
  async read(cancellation: AbortSignal): Promise<ControllableQueueSnapshot> {
    const scope = this.captureScope(cancellation);
    const response = await this.dependencies.native.getHostingQueue(this.dependencies.side);
    this.requireScope(scope, cancellation);
    return decodeSnapshot(response);
  }
  async apply(change: ControllableQueueChange, cancellation: AbortSignal): Promise<ControllableQueueSnapshot> {
    const scope = this.captureScope(cancellation);
    const captured = Object.freeze({ ...change, entries: Object.freeze(change.entries.map(entry => Object.freeze({ ...entry }))) });
    if (!identifier(captured.operationIdentifier) || !identifier(captured.expectedScopeIdentifier) || !identifier(captured.expectedRevision))
      throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    validateEntries(captured.entries, captured.currentOccurrenceIdentifier);
    const current = await this.read(cancellation);
    this.requireScope(scope, cancellation);
    if (current.scopeIdentifier !== captured.expectedScopeIdentifier || current.revision !== captured.expectedRevision)
      throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    const response = await this.dependencies.native.applyHostingQueue(this.dependencies.side, JSON.stringify(captured));
    this.requireScope(scope, cancellation);
    const receipt = decodeSnapshot(response);
    if (receipt.scopeIdentifier !== captured.expectedScopeIdentifier || receipt.lastOperationIdentifier !== captured.operationIdentifier)
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    return receipt;
  }
  private captureScope(cancellation: AbortSignal): string {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    const scope = this.dependencies.getScope();
    if (scope === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    return scope;
  }
  private requireScope(scope: string, cancellation: AbortSignal): void {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    if (this.dependencies.getScope() !== scope) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
}

function identifier(value: unknown): value is string {
  return typeof value === QueuePortPolicy.stringType && (value as string).trim().length >= QueuePortPolicy.minimumCharacters;
}
function validateEntries(entries: ControllableQueueSnapshot['entries'], current: string | null): void {
  if (!Array.isArray(entries) || entries.length > QueuePortPolicy.maximumEntries)
    throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  const occurrences = new Set<string>();
  for (const entry of entries) {
    if (!entry || !identifier(entry.occurrenceIdentifier) || occurrences.has(entry.occurrenceIdentifier)
      || entry.recordingIdentifier !== null && !identifier(entry.recordingIdentifier)
      || entry.spotifyIdentifier !== null && !identifier(entry.spotifyIdentifier)
      || entry.recordingIdentifier === null && entry.spotifyIdentifier === null)
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    occurrences.add(entry.occurrenceIdentifier);
  }
  if (current !== null && (!identifier(current) || !occurrences.has(current)))
    throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
}
function decodeSnapshot(serialized: string): ControllableQueueSnapshot {
  try {
    if (typeof serialized !== QueuePortPolicy.stringType || serialized.length > QueuePortPolicy.maximumSerializedCharacters)
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    const snapshot = JSON.parse(serialized) as ControllableQueueSnapshot;
    if (!snapshot || !identifier(snapshot.scopeIdentifier) || !identifier(snapshot.revision)
      || snapshot.lastOperationIdentifier !== null && !identifier(snapshot.lastOperationIdentifier)
      || snapshot.complete !== undefined && typeof snapshot.complete !== QueuePortPolicy.booleanType)
      throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    validateEntries(snapshot.entries, snapshot.currentOccurrenceIdentifier);
    return Object.freeze({ scopeIdentifier: snapshot.scopeIdentifier, revision: snapshot.revision,
      currentOccurrenceIdentifier: snapshot.currentOccurrenceIdentifier, lastOperationIdentifier: snapshot.lastOperationIdentifier,
      entries: Object.freeze(snapshot.entries.map(entry => Object.freeze({ occurrenceIdentifier: entry.occurrenceIdentifier,
        recordingIdentifier: entry.recordingIdentifier, spotifyIdentifier: entry.spotifyIdentifier }))),
      ...(snapshot.complete === undefined ? {} : { complete: snapshot.complete }) });
  } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse); }
}

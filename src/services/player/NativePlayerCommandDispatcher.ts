import { CommandResultStatus } from 'streaming-service-player';
import type { CommandContext, CommandResult, PlayerCursor, PlayerSnapshot, QueueCommandContext } from 'streaming-service-player';

export interface NativeCommandLifecycle {
  initialize(): Promise<unknown>;
  getSnapshot(): Promise<PlayerSnapshot>;
  clearSession(): Promise<void>;
}

export interface PlaybackIdentifierSource {
  nextIdentifier(): string;
}

export const PlayerDispatchPolicy = Object.freeze({
  initialSessionGeneration: 0,
  sessionGenerationIncrement: 1,
  firstAttempt: 0,
  attemptIncrement: 1,
  maximumQueueAttempts: 3,
  supersededMessage: 'The playback request belongs to an earlier session.',
  queueConflictMessage: 'The native queue changed before the operation could finish.',
});

export class NativePlayerCommandDispatcher {
  private initialization: Promise<void> | null = null;
  private pendingOperation: Promise<unknown> = Promise.resolve();
  private sessionGeneration = PlayerDispatchPolicy.initialSessionGeneration;

  constructor(
    private readonly lifecycle: NativeCommandLifecycle,
    private readonly identifiers: PlaybackIdentifierSource,
  ) {}

  initialize(): Promise<void> {
    if (this.initialization === null) {
      this.initialization = this.lifecycle.initialize().then(() => undefined)
        .catch(failure => { this.initialization = null; throw failure; });
    }
    return this.initialization;
  }

  async getSnapshot(): Promise<PlayerSnapshot> {
    await this.initialize();
    try { return await this.lifecycle.getSnapshot(); }
    catch (failure) { this.initialization = null; throw failure; }
  }

  async clearSession(): Promise<void> {
    this.sessionGeneration += PlayerDispatchPolicy.sessionGenerationIncrement;
    await this.initialize();
    try { await this.lifecycle.clearSession(); }
    catch (failure) { this.initialization = null; throw failure; }
  }

  playbackCommand(operation: (context: CommandContext) => Promise<CommandResult>): Promise<CommandResult> {
    return this.enqueue(async isCurrent => {
      const snapshot = await this.getSnapshot();
      this.requireCurrent(isCurrent);
      const result = await operation(this.commandContext(snapshot));
      this.requireCurrent(isCurrent);
      return result;
    });
  }

  queueCommand(operation: (context: QueueCommandContext) => Promise<CommandResult>): Promise<CommandResult> {
    return this.enqueue(async isCurrent => {
      let initialCursor: PlayerCursor | null = null;
      for (let attempt = PlayerDispatchPolicy.firstAttempt; attempt < PlayerDispatchPolicy.maximumQueueAttempts;
        attempt += PlayerDispatchPolicy.attemptIncrement) {
        const snapshot = await this.getSnapshot();
        this.requireCurrent(isCurrent);
        if (initialCursor !== null && !this.sameSession(initialCursor, snapshot.cursor)) {
          throw new Error(PlayerDispatchPolicy.supersededMessage);
        }
        initialCursor ??= { ...snapshot.cursor };
        const result = await operation({ ...this.commandContext(snapshot), expectedQueueRevision: snapshot.cursor.queueRevision });
        this.requireCurrent(isCurrent);
        if (result.status !== CommandResultStatus.Conflict) return result;
      }
      throw new Error(PlayerDispatchPolicy.queueConflictMessage);
    });
  }

  private enqueue<Result>(operation: (isCurrent: () => boolean) => Promise<Result>): Promise<Result> {
    const sessionGeneration = this.sessionGeneration;
    const isCurrent = () => sessionGeneration === this.sessionGeneration;
    const result = this.pendingOperation.then(() => {
      this.requireCurrent(isCurrent);
      return operation(isCurrent);
    });
    this.pendingOperation = result.catch(() => undefined);
    return result;
  }

  private commandContext(snapshot: PlayerSnapshot): CommandContext {
    return { requestIdentifier: this.identifiers.nextIdentifier(), engineEpoch: snapshot.cursor.engineEpoch,
      authenticationEpoch: snapshot.cursor.authenticationEpoch };
  }

  private sameSession(previous: PlayerCursor, current: PlayerCursor): boolean {
    return previous.engineEpoch === current.engineEpoch
      && previous.authenticationEpoch === current.authenticationEpoch;
  }

  private requireCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) throw new Error(PlayerDispatchPolicy.supersededMessage);
  }
}

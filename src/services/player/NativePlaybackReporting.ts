import { PlaybackIntent, PlaybackState, PlayerEventType } from 'streaming-service-player';
import type { PlayerCursor, PlayerEvent, PlayerSnapshot } from 'streaming-service-player';

export interface PlaybackListeningSession {
  start(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(fromSeconds: number, toSeconds: number): Promise<void>;
  stop(): Promise<void>;
}

export interface PlaybackListeningSessionFactory {
  create(snapshot: PlayerSnapshot): PlaybackListeningSession;
}

export const PlaybackReportingPolicy = Object.freeze({
  millisecondsPerSecond: 1000,
});

export class NativePlaybackReporting {
  private cursor: PlayerCursor | null = null;
  private session: PlaybackListeningSession | null = null;
  private entryIdentifier: string | null = null;

  constructor(
    private readonly factory: PlaybackListeningSessionFactory,
    private readonly reportFailure: (failure: unknown) => void,
  ) {}

  synchronize(snapshot: PlayerSnapshot): void {
    if (this.cursor === null || !this.sameSession(this.cursor, snapshot.cursor)) {
      this.clear();
      this.cursor = { ...snapshot.cursor };
      this.applySnapshot(snapshot);
      return;
    }
    this.receive({ type: PlayerEventType.State, snapshot });
  }

  receive(event: PlayerEvent): void {
    const cursor = event.type === PlayerEventType.State ? event.snapshot.cursor : event.cursor;
    if (this.cursor === null || !this.sameSession(this.cursor, cursor)
      || cursor.eventSequence <= this.cursor.eventSequence) return;
    this.cursor = { ...cursor };
    switch (event.type) {
      case PlayerEventType.State:
        this.applySnapshot(event.snapshot);
        return;
      case PlayerEventType.EntryChanged:
        this.stopSession();
        this.entryIdentifier = event.entry?.entryIdentifier ?? null;
        return;
      case PlayerEventType.Seeked: {
        const session = this.session;
        if (session !== null && event.entryIdentifier === this.entryIdentifier) {
          this.invoke(() => session.seek(event.previousPositionMilliseconds / PlaybackReportingPolicy.millisecondsPerSecond,
            event.positionMilliseconds / PlaybackReportingPolicy.millisecondsPerSecond));
        }
        return;
      }
      case PlayerEventType.Error: {
        const session = this.session;
        if (session !== null && (event.error.entryIdentifier === undefined || event.error.entryIdentifier === this.entryIdentifier)) {
          this.invoke(() => session.pause());
        }
        return;
      }
      default:
        return;
    }
  }

  clear(): void {
    this.stopSession();
    this.cursor = null;
    this.entryIdentifier = null;
  }

  private applySnapshot(snapshot: PlayerSnapshot): void {
    const identifier = snapshot.currentEntry?.entryIdentifier ?? null;
    if (identifier === null || snapshot.playbackIntent === PlaybackIntent.Stop) {
      this.stopSession();
      this.entryIdentifier = identifier;
      return;
    }
    if (identifier !== this.entryIdentifier) {
      this.stopSession();
      this.entryIdentifier = identifier;
    }
    const playing = snapshot.state === PlaybackState.Playing && snapshot.playbackIntent === PlaybackIntent.Play;
    if (this.session === null) {
      if (!playing) return;
      const capturedSnapshot = { ...snapshot, cursor: { ...snapshot.cursor },
        currentEntry: snapshot.currentEntry === null ? null : { ...snapshot.currentEntry } };
      try {
        const session = this.factory.create(capturedSnapshot);
        this.session = session;
        session.start();
      } catch (failure) {
        this.stopSession();
        this.reportFailure(failure);
      }
      return;
    }
    const session = this.session;
    this.invoke(() => playing ? session.resume() : session.pause());
  }

  private stopSession(): void {
    const session = this.session;
    this.session = null;
    if (session !== null) this.invoke(() => session.stop());
  }

  private invoke(operation: () => Promise<void>): void {
    try { void operation().catch(failure => this.reportFailure(failure)); }
    catch (failure) { this.reportFailure(failure); }
  }

  private sameSession(previous: PlayerCursor, current: PlayerCursor): boolean {
    return previous.engineEpoch === current.engineEpoch && previous.authenticationEpoch === current.authenticationEpoch;
  }
}

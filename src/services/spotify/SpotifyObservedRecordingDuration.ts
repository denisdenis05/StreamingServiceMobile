import { PlaybackInterruption, PlaybackState } from 'streaming-service-player';
import type { PlayerCursor, PlayerObservation, PlayerSnapshot } from 'streaming-service-player';
import type { SpotifyObservedRecordingStore } from './SpotifyObservedRecordingStore';

export const SpotifyObservedRecordingDurationPolicy = Object.freeze({ minimumDurationMilliseconds: 0,
  readyStates: Object.freeze([PlaybackState.Playing, PlaybackState.Paused, PlaybackState.Ended]) });

export interface SpotifyObservedRecordingDurationDependencies {
  readonly store: Pick<SpotifyObservedRecordingStore, 'captureScope' | 'read' | 'remember'>;
  readonly player: Pick<PlayerObservation, 'getSnapshot'>;
}

interface ObservedCurrentRecording {
  readonly occurrenceIdentifier: string;
  readonly recordingIdentifier: string;
  readonly durationMilliseconds: number;
  readonly cursor: PlayerCursor;
}

export class SpotifyObservedRecordingDuration {
  constructor(private readonly dependencies: SpotifyObservedRecordingDurationDependencies) {}

  async capture(): Promise<void> {
    const scope = this.dependencies.store.captureScope();
    if (scope === null) return;
    try {
      const first = this.current(await this.dependencies.player.getSnapshot());
      if (first === null || this.dependencies.store.captureScope() !== scope) return;
      const recording = this.dependencies.store.read().find(song => song.identifier === first.recordingIdentifier);
      if (!recording || recording.durationMilliseconds !== undefined) return;
      const second = this.current(await this.dependencies.player.getSnapshot());
      if (second === null || !this.sameCurrent(first, second) || this.dependencies.store.captureScope() !== scope) return;
      const current = this.dependencies.store.read().find(song => song.identifier === first.recordingIdentifier);
      if (current !== recording) return;
      this.dependencies.store.remember([{ recordingIdentifier: recording.identifier, title: recording.title,
        artist: recording.author, durationMilliseconds: second.durationMilliseconds }], scope);
    } catch {}
  }

  private current(snapshot: PlayerSnapshot): ObservedCurrentRecording | null {
    if (!SpotifyObservedRecordingDurationPolicy.readyStates.includes(snapshot.state) || snapshot.interruption !== PlaybackInterruption.None
      || snapshot.error !== null || !snapshot.currentEntry?.recordingIdentifier || !Number.isSafeInteger(snapshot.durationMilliseconds)
      || snapshot.durationMilliseconds! <= SpotifyObservedRecordingDurationPolicy.minimumDurationMilliseconds) return null;
    return Object.freeze({ occurrenceIdentifier: snapshot.currentEntry.entryIdentifier, recordingIdentifier: snapshot.currentEntry.recordingIdentifier,
      durationMilliseconds: snapshot.durationMilliseconds!, cursor: Object.freeze({ ...snapshot.cursor }) });
  }

  private sameCurrent(first: ObservedCurrentRecording, second: ObservedCurrentRecording): boolean {
    return first.occurrenceIdentifier === second.occurrenceIdentifier && first.recordingIdentifier === second.recordingIdentifier
      && first.durationMilliseconds === second.durationMilliseconds && first.cursor.engineEpoch === second.cursor.engineEpoch
      && first.cursor.authenticationEpoch === second.cursor.authenticationEpoch && first.cursor.queueIdentifier === second.cursor.queueIdentifier
      && first.cursor.queueRevision === second.cursor.queueRevision && first.cursor.queueContentRevision === second.cursor.queueContentRevision
      && first.cursor.playbackControlRevision === second.cursor.playbackControlRevision;
  }
}

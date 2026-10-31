import { CommandResultStatus, PlaybackInterruption, PlaybackState } from 'streaming-service-player';
import type { CommandContext, CommandResult, PlayerCapabilities, PlayerExternalAuthority, PlayerSnapshot, QueueCommandContext, QueueEntry } from 'streaming-service-player';
import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { CatalogSong, SharedPlaybackClock, SharedPlaybackExecution, SharedPlaybackIdentity, SharedPlaybackLease,
  SharedPlaybackOutput, SharedPlaybackRecordingOccurrence, SharedPlaybackLocalSample } from 'streaming-service-spotify-jam';

interface SharedNativePlayer extends PlayerExternalAuthority {
  initialize(): Promise<PlayerCapabilities>;
  getSnapshot(): Promise<PlayerSnapshot>;
  replaceQueueAndSelect(context: QueueCommandContext, entries: readonly QueueEntry[], occurrence: string | null, playing: boolean): Promise<CommandResult>;
  seek(context: CommandContext, occurrence: string, positionMilliseconds: number): Promise<CommandResult>;
  play(context: CommandContext): Promise<CommandResult>;
  pause(context: CommandContext): Promise<CommandResult>;
}

export interface SpotifyNativePlaybackDependencies {
  readonly native: SharedNativePlayer;
  readonly clock: SharedPlaybackClock;
  readonly nextIdentifier: () => string;
  readonly whenReady: () => Promise<void>;
  readonly resolveRecording: (recordingIdentifier: string, cancellation: AbortSignal) => Promise<CatalogSong | null>;
}

const NativePlaybackPolicy = Object.freeze({ minimumMilliseconds: 0, midpointDivisor: 2,
  maximumQueueEntries: 2001, singleOccurrenceCount: 1,
  maximumSampleRoundTripMilliseconds: 1500 });

interface NativePlaybackLifetime {
  readonly identifier: string;
  readonly cancellation: AbortController;
  readonly externalCancellation: AbortSignal;
  readonly abort: () => void;
  retired: boolean;
  engineEpoch: string | null;
  authenticationEpoch: string | null;
  occurrenceIdentifier: string | null;
  release: Promise<void> | null;
}

export class SpotifyNativePlaybackOutput implements SharedPlaybackOutput {
  private owner: NativePlaybackLifetime | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly dependencies: SpotifyNativePlaybackDependencies) {}

  async acquire(_identity: SharedPlaybackIdentity, cancellation: AbortSignal): Promise<SharedPlaybackLease> {
    this.checkCancellation(cancellation);
    if (this.owner) throw new IntegrationFailure(IntegrationFailureCode.Backpressure);
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    const owner: NativePlaybackLifetime = { identifier: this.dependencies.nextIdentifier(), cancellation: abortController,
      externalCancellation: cancellation, abort, retired: false, engineEpoch: null, authenticationEpoch: null,
      occurrenceIdentifier: null, release: null };
    this.owner = owner;
    cancellation.addEventListener(AbortEvent, abort, { once: true });
    try {
      await this.enqueue(async () => {
        await this.dependencies.whenReady(); this.requireCurrent(owner);
        const capabilities = await this.dependencies.native.initialize(); this.requireCurrent(owner);
        if (capabilities.supportsExternalAuthority !== true) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
        let snapshot = await this.dependencies.native.getSnapshot(); this.requireCurrent(owner);
        owner.engineEpoch = snapshot.cursor.engineEpoch; owner.authenticationEpoch = snapshot.cursor.authenticationEpoch;
        if (snapshot.externalAuthorityIdentifier) {
          if (!snapshot.externalAuthorityExpired) throw new IntegrationFailure(IntegrationFailureCode.Backpressure);
          this.requireApplied(await this.dependencies.native.setExternalAuthority({ ...this.context(owner, false),
            externalAuthorityIdentifier: snapshot.externalAuthorityIdentifier }, null));
          this.requireCurrent(owner);
          snapshot = await this.dependencies.native.getSnapshot(); this.requireCurrent(owner);
          if (snapshot.cursor.engineEpoch !== owner.engineEpoch || snapshot.cursor.authenticationEpoch !== owner.authenticationEpoch
            || snapshot.externalAuthorityIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
        }
        const context = this.context(owner, false);
        this.requireApplied(await this.dependencies.native.setExternalAuthority(context, owner.identifier));
        this.requireCurrent(owner);
      });
    } catch (failure) {
      try { await this.release(owner); } catch {}
      throw this.failure(failure);
    }
    return {
      prepare: (recording, occurrence, signal) => this.prepareQueue(owner, [{ recordingIdentifier: recording, occurrenceIdentifier: occurrence }], occurrence, signal),
      prepareQueue: (recordings, occurrence, signal) => this.prepareQueue(owner, recordings, occurrence, signal),
      sample: signal => this.sample(owner, signal),
      apply: (execution, signal) => this.apply(owner, execution, signal),
      release: () => this.release(owner),
    };
  }

  private prepareQueue(owner: NativePlaybackLifetime, recordings: readonly SharedPlaybackRecordingOccurrence[], occurrence: string, cancellation: AbortSignal): Promise<void> {
    const captured = recordings.map(recording => Object.freeze({ ...recording }));
    return this.enqueue(async () => {
      this.requireCurrent(owner, cancellation);
      if (!captured.length || captured.length > NativePlaybackPolicy.maximumQueueEntries
        || captured.filter(recording => recording.occurrenceIdentifier === occurrence).length !== NativePlaybackPolicy.singleOccurrenceCount
        || new Set(captured.map(recording => recording.occurrenceIdentifier)).size !== captured.length) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
      const songs = new Map<string, CatalogSong>();
      const entries: QueueEntry[] = [];
      for (const recording of captured) {
        let song = songs.get(recording.recordingIdentifier);
        if (!song) {
          song = await this.resolveRecording(owner, recording.recordingIdentifier, cancellation) ?? undefined;
          this.requireCurrent(owner, cancellation);
          if (!song || song.identifier !== recording.recordingIdentifier) throw new IntegrationFailure(IntegrationFailureCode.NotFound);
          songs.set(recording.recordingIdentifier, song);
        }
        entries.push({ entryIdentifier: recording.occurrenceIdentifier, recordingIdentifier: song.identifier,
          title: song.title, artist: song.author,
          ...(song.durationMilliseconds === undefined ? {} : { durationHintMilliseconds: song.durationMilliseconds }) });
      }
      const snapshot = await this.snapshot(owner, cancellation);
      this.requireApplied(await this.dependencies.native.replaceQueueAndSelect({ ...this.context(owner),
        expectedQueueRevision: snapshot.cursor.queueRevision,
        ...(snapshot.cursor.queueIdentifier === undefined ? {} : { expectedQueueIdentifier: snapshot.cursor.queueIdentifier }),
        ...(snapshot.cursor.playbackControlRevision === undefined ? {} : { expectedPlaybackControlRevision: snapshot.cursor.playbackControlRevision }) }, entries, occurrence, false));
      this.requireCurrent(owner, cancellation);
      owner.occurrenceIdentifier = occurrence;
    });
  }

  private sample(owner: NativePlaybackLifetime, cancellation: AbortSignal): Promise<SharedPlaybackLocalSample> {
    return this.enqueue(async () => {
      await this.snapshot(owner, cancellation);
      this.requireApplied(await this.dependencies.native.renewExternalAuthority(this.context(owner)));
      this.requireCurrent(owner, cancellation);
      const before = this.dependencies.clock.nowMonotonicMilliseconds();
      const snapshot = await this.snapshot(owner, cancellation);
      const after = this.dependencies.clock.nowMonotonicMilliseconds();
      if (![before, after].every(value => Number.isFinite(value) && value >= NativePlaybackPolicy.minimumMilliseconds)
        || after < before || after - before > NativePlaybackPolicy.maximumSampleRoundTripMilliseconds) {
        throw new IntegrationFailure(IntegrationFailureCode.Deadline);
      }
      if (!owner.occurrenceIdentifier || snapshot.currentEntry?.entryIdentifier !== owner.occurrenceIdentifier) {
        throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      }
      return Object.freeze({ occurrenceIdentifier: owner.occurrenceIdentifier, positionMilliseconds: snapshot.positionMilliseconds,
        durationMilliseconds: snapshot.durationMilliseconds,
        sampledMonotonicMilliseconds: before + (after - before) / NativePlaybackPolicy.midpointDivisor,
        uncertaintyMilliseconds: (after - before) / NativePlaybackPolicy.midpointDivisor,
        ready: snapshot.interruption === PlaybackInterruption.None && (snapshot.state === PlaybackState.Paused
          || snapshot.state === PlaybackState.Playing || snapshot.state === PlaybackState.Ended),
        buffering: snapshot.state === PlaybackState.Buffering || snapshot.state === PlaybackState.Resolving,
        seekable: snapshot.canSeek, playing: snapshot.state === PlaybackState.Playing });
    });
  }

  private apply(owner: NativePlaybackLifetime, execution: SharedPlaybackExecution, cancellation: AbortSignal): Promise<void> {
    const captured = Object.freeze({ ...execution });
    return this.enqueue(async () => {
      if (captured.occurrenceIdentifier !== owner.occurrenceIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      let snapshot = await this.snapshot(owner, cancellation);
      if (snapshot.currentEntry?.entryIdentifier !== captured.occurrenceIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      if (captured.seek) {
        this.requireApplied(await this.dependencies.native.seek(this.context(owner), captured.occurrenceIdentifier, captured.positionMilliseconds));
        snapshot = await this.snapshot(owner, cancellation);
      }
      if (snapshot.currentEntry?.entryIdentifier !== captured.occurrenceIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      this.requireApplied(await (captured.playing ? this.dependencies.native.play(this.context(owner))
        : this.dependencies.native.pause(this.context(owner))));
      this.requireCurrent(owner, cancellation);
    });
  }

  private release(owner: NativePlaybackLifetime): Promise<void> {
    if (owner.release) return owner.release;
    owner.retired = true; owner.cancellation.abort();
    owner.externalCancellation.removeEventListener(AbortEvent, owner.abort);
    owner.release = this.enqueue(async () => {
      try {
        if (this.owner !== owner || owner.engineEpoch === null) return;
        const snapshot = await this.dependencies.native.getSnapshot();
        if (snapshot.externalAuthorityIdentifier !== owner.identifier || snapshot.cursor.engineEpoch !== owner.engineEpoch
          || snapshot.cursor.authenticationEpoch !== owner.authenticationEpoch) return;
        this.requireApplied(await this.dependencies.native.setExternalAuthority(this.context(owner), null));
      } finally { if (this.owner === owner) this.owner = null; }
    });
    return owner.release;
  }

  private async snapshot(owner: NativePlaybackLifetime, cancellation: AbortSignal): Promise<PlayerSnapshot> {
    this.requireCurrent(owner, cancellation);
    const snapshot = await this.dependencies.native.getSnapshot(); this.requireCurrent(owner, cancellation);
    if (snapshot.cursor.engineEpoch !== owner.engineEpoch || snapshot.cursor.authenticationEpoch !== owner.authenticationEpoch
      || snapshot.externalAuthorityIdentifier !== owner.identifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    if (snapshot.externalAuthoritySuspended) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    return snapshot;
  }

  private resolveRecording(owner: NativePlaybackLifetime, recording: string, cancellation: AbortSignal): Promise<CatalogSong | null> {
    const combined = new AbortController();
    let rejectCancellation: (failure: IntegrationFailure) => void = () => undefined;
    const abort = () => { combined.abort(); rejectCancellation(new IntegrationFailure(IntegrationFailureCode.Canceled)); };
    return new Promise<CatalogSong | null>((resolve, reject) => {
      rejectCancellation = reject;
      owner.cancellation.signal.addEventListener(AbortEvent, abort, { once: true });
      cancellation.addEventListener(AbortEvent, abort, { once: true });
      if (owner.cancellation.signal.aborted || cancellation.aborted) { abort(); return; }
      Promise.resolve().then(() => {
        this.requireCurrent(owner, cancellation);
        return this.dependencies.resolveRecording(recording, combined.signal);
      }).then(resolve, reject);
    }).finally(() => {
      owner.cancellation.signal.removeEventListener(AbortEvent, abort);
      cancellation.removeEventListener(AbortEvent, abort);
    });
  }

  private context(owner: NativePlaybackLifetime, owned = true): CommandContext {
    if (!owner.engineEpoch || !owner.authenticationEpoch) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    return { engineEpoch: owner.engineEpoch, authenticationEpoch: owner.authenticationEpoch, requestIdentifier: this.dependencies.nextIdentifier(),
      ...(owned ? { externalAuthorityIdentifier: owner.identifier } : {}) };
  }

  private requireCurrent(owner: NativePlaybackLifetime, cancellation?: AbortSignal): void {
    this.checkCancellation(owner.cancellation.signal);
    if (cancellation) this.checkCancellation(cancellation);
    if (this.owner !== owner || owner.retired) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }

  private checkCancellation(cancellation: AbortSignal): void {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
  }

  private requireApplied(result: CommandResult): void {
    if (result.status !== CommandResultStatus.Applied) throw new IntegrationFailure(result.status === CommandResultStatus.Superseded
      ? IntegrationFailureCode.Superseded : result.status === CommandResultStatus.Conflict ? IntegrationFailureCode.UnknownOutcome : IntegrationFailureCode.Unsupported);
  }

  private failure(failure: unknown): IntegrationFailure {
    return failure instanceof IntegrationFailure ? failure : new IntegrationFailure(IntegrationFailureCode.Network);
  }

  private enqueue<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = this.pending.then(operation).catch(failure => { throw this.failure(failure); });
    this.pending = result.catch(() => undefined);
    return result;
  }
}

const AbortEvent = 'abort';

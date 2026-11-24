import type { PlaybackTrackView } from '../../services/player/PlaybackTrack';

export enum CoverDirection {
  Next = 'next',
  Previous = 'previous',
}

export enum CoverPhase {
  Idle = 'idle',
  Dragging = 'dragging',
  Returning = 'returning',
  Changing = 'changing',
}

export const CoverGesturePolicy = Object.freeze({
  centeredOffsetPixels: 0,
  initialRevision: 0,
  revisionIncrement: 1,
  firstQueueIndex: 0,
  missingQueueIndex: -1,
  adjacentQueueOffset: 1,
  completionFraction: 0.3,
  coverGapFraction: 0.12,
  fullWidthFraction: 1,
  horizontalActivationPixels: 6,
  minimumFlickVelocityPixelsPerMillisecond: 0.5,
  inertiaProjectionMilliseconds: 180,
  transitionDurationMilliseconds: 280,
  returnDurationMilliseconds: 220,
  minimumDurationMilliseconds: 100,
  selectionTimeoutMilliseconds: 2000,
  nextSign: -1,
  previousSign: 1,
});

export interface CoverMotion {
  readonly identifier: number;
  readonly startOffsetPixels: number;
  readonly endOffsetPixels: number;
  readonly durationMilliseconds: number;
}

export interface CoverScene {
  readonly center: PlaybackTrackView | null;
  readonly previous: PlaybackTrackView | null;
  readonly next: PlaybackTrackView | null;
  readonly phase: CoverPhase;
  readonly revision: number;
  readonly motion: CoverMotion | null;
  readonly busy: boolean;
}

export interface CoverGestureDependencies {
  setOffset(offsetPixels: number): void;
  stopOffset(onStopped: (offsetPixels: number) => void): void;
  navigate(direction: CoverDirection): Promise<string | null>;
  select(entryIdentifier: string): Promise<void>;
  scheduleTimeout(operation: () => void, delayMilliseconds: number): () => void;
}

interface CoverSelection {
  readonly origin: PlaybackTrackView;
  readonly target: PlaybackTrackView;
  readonly direction: CoverDirection;
  animationFinished: boolean;
}

interface ButtonRequest {
  targetIdentifier: string | null;
  readonly originIdentifier: string;
  readonly direction: CoverDirection;
}

export class CoverGestureController {
  private scene: CoverScene;
  private queue: readonly PlaybackTrackView[];
  private observed: PlaybackTrackView | null;
  private disabled = false;
  private widthPixels: number = CoverGesturePolicy.centeredOffsetPixels;
  private dragOffsetPixels: number = CoverGesturePolicy.centeredOffsetPixels;
  private sequence: number = CoverGesturePolicy.initialRevision;
  private selection: CoverSelection | null = null;
  private buttonRequest: ButtonRequest | null = null;
  private cancelTimeout: (() => void) | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    track: PlaybackTrackView | null,
    queue: readonly PlaybackTrackView[],
    private readonly dependencies: CoverGestureDependencies,
  ) {
    this.queue = queue;
    this.observed = track;
    this.scene = this.centeredScene(track);
  }

  getSnapshot = (): CoverScene => this.scene;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get stepPixels(): number {
    return (
      this.widthPixels + this.widthPixels * CoverGesturePolicy.coverGapFraction
    );
  }

  canDrag(): boolean {
    return (
      !this.disposed &&
      !this.disabled &&
      this.scene.center !== null &&
      !this.scene.busy &&
      this.widthPixels > CoverGesturePolicy.centeredOffsetPixels
    );
  }

  measure(widthPixels: number): void {
    if (
      !Number.isFinite(widthPixels) ||
      widthPixels <= CoverGesturePolicy.centeredOffsetPixels ||
      widthPixels === this.widthPixels
    )
      return;
    this.widthPixels = widthPixels;
    if (this.scene.phase === CoverPhase.Dragging)
      this.drag(this.dragOffsetPixels);
    else if (this.scene.phase !== CoverPhase.Idle) this.returnToCenter();
    else this.publish({ ...this.scene });
  }

  update(
    track: PlaybackTrackView | null,
    queue: readonly PlaybackTrackView[],
    disabled: boolean,
  ): void {
    if (this.disposed) return;
    this.queue = queue;
    this.observed = track;
    this.disabled = disabled;
    if (track === null) {
      if (queue.length === CoverGesturePolicy.firstQueueIndex)
        this.center(null);
      else if (disabled && this.scene.phase === CoverPhase.Dragging)
        this.cancelDrag();
      return;
    }
    if (
      this.selection !== null &&
      track.entryIdentifier === this.selection.target.entryIdentifier
    ) {
      if (this.selection.animationFinished) this.center(track);
      return;
    }
    if (track.entryIdentifier !== this.scene.center?.entryIdentifier) {
      const origin = this.scene.center;
      if (
        origin === null ||
        this.widthPixels <= CoverGesturePolicy.centeredOffsetPixels
      ) {
        this.center(track);
        return;
      }
      const request = this.buttonRequest;
      const originIndex = queue.findIndex(
        candidate => candidate.entryIdentifier === origin.entryIdentifier,
      );
      const targetIndex = queue.findIndex(
        candidate => candidate.entryIdentifier === track.entryIdentifier,
      );
      const direction =
        request?.originIdentifier === origin.entryIdentifier &&
        (request.targetIdentifier === null ||
          request.targetIdentifier === track.entryIdentifier)
          ? request.direction
          : originIndex !== CoverGesturePolicy.missingQueueIndex &&
            targetIndex !== CoverGesturePolicy.missingQueueIndex &&
            targetIndex < originIndex
          ? CoverDirection.Previous
          : CoverDirection.Next;
      this.buttonRequest = null;
      if (this.scene.motion !== null) {
        const activeIdentifier = this.scene.motion.identifier;
        this.dependencies.stopOffset(offsetPixels => {
          if (
            !this.disposed &&
            this.scene.motion?.identifier === activeIdentifier
          )
            this.change(origin, track, direction, offsetPixels);
        });
      } else
        this.change(
          origin,
          track,
          direction,
          this.scene.phase === CoverPhase.Dragging
            ? this.dragOffsetPixels
            : CoverGesturePolicy.centeredOffsetPixels,
        );
      return;
    }
    if (disabled && this.scene.phase === CoverPhase.Dragging) {
      this.cancelDrag();
      return;
    }
    if (
      this.scene.phase === CoverPhase.Idle ||
      this.scene.phase === CoverPhase.Dragging
    ) {
      const neighbors = this.neighbors(track);
      if (
        this.scene.center !== track ||
        this.scene.previous !== neighbors.previous ||
        this.scene.next !== neighbors.next
      )
        this.publish({ ...this.scene, center: track, ...neighbors });
    }
  }

  beginDrag(): boolean {
    if (!this.canDrag()) return false;
    this.dragOffsetPixels = CoverGesturePolicy.centeredOffsetPixels;
    this.publish({ ...this.scene, phase: CoverPhase.Dragging });
    return true;
  }

  drag(horizontalDistancePixels: number): void {
    if (
      this.scene.phase !== CoverPhase.Dragging ||
      !Number.isFinite(horizontalDistancePixels)
    )
      return;
    const direction =
      horizontalDistancePixels < CoverGesturePolicy.centeredOffsetPixels
        ? CoverDirection.Next
        : CoverDirection.Previous;
    const target = this.neighbor(direction);
    const limitPixels =
      target === null
        ? this.widthPixels * CoverGesturePolicy.completionFraction
        : this.stepPixels;
    this.dragOffsetPixels = Math.max(
      -limitPixels,
      Math.min(limitPixels, horizontalDistancePixels),
    );
    this.dependencies.setOffset(this.dragOffsetPixels);
  }

  release(horizontalVelocityPixelsPerMillisecond: number): void {
    if (this.scene.phase !== CoverPhase.Dragging) return;
    const velocity = Number.isFinite(horizontalVelocityPixelsPerMillisecond)
      ? horizontalVelocityPixelsPerMillisecond
      : CoverGesturePolicy.centeredOffsetPixels;
    const projectedOffsetPixels =
      this.dragOffsetPixels +
      (Math.abs(velocity) >=
      CoverGesturePolicy.minimumFlickVelocityPixelsPerMillisecond
        ? velocity * CoverGesturePolicy.inertiaProjectionMilliseconds
        : CoverGesturePolicy.centeredOffsetPixels);
    const direction =
      projectedOffsetPixels < CoverGesturePolicy.centeredOffsetPixels
        ? CoverDirection.Next
        : CoverDirection.Previous;
    const target = this.neighbor(direction);
    const origin = this.scene.center;
    if (
      !this.disabled &&
      target !== null &&
      origin !== null &&
      Math.abs(projectedOffsetPixels) >
        this.widthPixels * CoverGesturePolicy.completionFraction
    ) {
      this.change(origin, target, direction, this.dragOffsetPixels);
      const selection = this.selection;
      this.cancelTimeout = this.dependencies.scheduleTimeout(() => {
        if (this.selection === selection) this.returnToCenter();
      }, CoverGesturePolicy.selectionTimeoutMilliseconds);
      this.dependencies.select(target.entryIdentifier).catch(() => {
        if (this.selection === selection) this.returnToCenter();
      });
    } else this.returnToCenter();
  }

  cancelDrag(): void {
    if (this.scene.phase === CoverPhase.Dragging) this.returnToCenter();
  }

  navigate(direction: CoverDirection): boolean {
    if (!this.canDrag()) return false;
    const origin = this.scene.center;
    if (origin === null) return false;
    const request: ButtonRequest = {
      targetIdentifier: null,
      originIdentifier: origin.entryIdentifier,
      direction,
    };
    this.buttonRequest = request;
    this.publish({ ...this.scene, busy: true });
    this.dependencies
      .navigate(direction)
      .then(entryIdentifier => {
        if (this.disposed || this.buttonRequest !== request) return;
        if (
          entryIdentifier === null ||
          entryIdentifier === request.originIdentifier
        ) {
          this.finishButtonRequest(request);
          return;
        }
        request.targetIdentifier = entryIdentifier;
        this.cancelTimeout = this.dependencies.scheduleTimeout(
          () => this.finishButtonRequest(request),
          CoverGesturePolicy.selectionTimeoutMilliseconds,
        );
      })
      .catch(() => this.finishButtonRequest(request));
    return true;
  }

  completeMotion(identifier: number): void {
    if (this.disposed || this.scene.motion?.identifier !== identifier) return;
    if (this.scene.phase === CoverPhase.Returning) {
      this.center(this.observed);
      return;
    }
    if (this.selection === null) return;
    this.selection.animationFinished = true;
    if (
      this.observed?.entryIdentifier === this.selection.target.entryIdentifier
    )
      this.center(this.observed);
  }

  dispose(): void {
    this.disposed = true;
    this.selection = null;
    this.buttonRequest = null;
    this.cancelTimeout?.();
    this.listeners.clear();
  }

  private finishButtonRequest(request: ButtonRequest): void {
    if (this.disposed || this.buttonRequest !== request) return;
    this.cancelTimeout?.();
    this.cancelTimeout = null;
    this.buttonRequest = null;
    this.publish({ ...this.scene, busy: this.scene.phase !== CoverPhase.Idle });
  }

  private neighbors(
    track: PlaybackTrackView | null,
  ): Pick<CoverScene, 'previous' | 'next'> {
    const index = this.queue.findIndex(
      candidate => candidate.entryIdentifier === track?.entryIdentifier,
    );
    return index === CoverGesturePolicy.missingQueueIndex
      ? { previous: null, next: null }
      : {
          previous:
            this.queue[index - CoverGesturePolicy.adjacentQueueOffset] ?? null,
          next:
            this.queue[index + CoverGesturePolicy.adjacentQueueOffset] ?? null,
        };
  }

  private neighbor(direction: CoverDirection): PlaybackTrackView | null {
    const neighbors = this.neighbors(this.scene.center);
    return direction === CoverDirection.Next
      ? neighbors.next
      : neighbors.previous;
  }

  private nextIdentifier(): number {
    this.sequence += CoverGesturePolicy.revisionIncrement;
    return this.sequence;
  }

  private centeredScene(track: PlaybackTrackView | null): CoverScene {
    return {
      center: track,
      ...this.neighbors(track),
      phase: CoverPhase.Idle,
      revision: this.nextIdentifier(),
      motion: null,
      busy: false,
    };
  }

  private center(track: PlaybackTrackView | null): void {
    this.cancelTimeout?.();
    this.cancelTimeout = null;
    this.selection = null;
    this.buttonRequest = null;
    this.dragOffsetPixels = CoverGesturePolicy.centeredOffsetPixels;
    this.publish(this.centeredScene(track));
  }

  private change(
    origin: PlaybackTrackView,
    target: PlaybackTrackView,
    direction: CoverDirection,
    startOffsetPixels: number,
  ): void {
    this.cancelTimeout?.();
    this.cancelTimeout = null;
    this.selection = { origin, target, direction, animationFinished: false };
    const endOffsetPixels =
      this.stepPixels *
      (direction === CoverDirection.Next
        ? CoverGesturePolicy.nextSign
        : CoverGesturePolicy.previousSign);
    const remainingFraction =
      Math.abs(endOffsetPixels - startOffsetPixels) / this.stepPixels;
    const durationMilliseconds = Math.max(
      CoverGesturePolicy.minimumDurationMilliseconds,
      Math.min(
        CoverGesturePolicy.transitionDurationMilliseconds,
        remainingFraction * CoverGesturePolicy.transitionDurationMilliseconds,
      ),
    );
    this.publish({
      ...this.scene,
      center: origin,
      previous:
        direction === CoverDirection.Previous
          ? target
          : this.neighbors(origin).previous,
      next:
        direction === CoverDirection.Next
          ? target
          : this.neighbors(origin).next,
      phase: CoverPhase.Changing,
      busy: true,
      motion: {
        identifier: this.nextIdentifier(),
        startOffsetPixels,
        endOffsetPixels,
        durationMilliseconds,
      },
    });
  }

  private returnToCenter(): void {
    const activeIdentifier =
      this.scene.motion?.identifier ?? this.scene.revision;
    this.cancelTimeout?.();
    this.cancelTimeout = null;
    this.selection = null;
    this.dependencies.stopOffset(startOffsetPixels => {
      if (
        this.disposed ||
        activeIdentifier !==
          (this.scene.motion?.identifier ?? this.scene.revision)
      )
        return;
      this.publish({
        ...this.scene,
        phase: CoverPhase.Returning,
        busy: true,
        motion: {
          identifier: this.nextIdentifier(),
          startOffsetPixels,
          endOffsetPixels: CoverGesturePolicy.centeredOffsetPixels,
          durationMilliseconds: CoverGesturePolicy.returnDurationMilliseconds,
        },
      });
    });
  }

  private publish(scene: CoverScene): void {
    if (this.disposed) return;
    this.scene = scene;
    for (const listener of this.listeners) listener();
  }
}

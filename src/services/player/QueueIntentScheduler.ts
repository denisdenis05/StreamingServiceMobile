export enum QueueIntentKind {
  Replacement = 'replacement',
  PreparedAppend = 'preparedAppend',
  Edit = 'edit',
}

export const QueueIntentPolicy = Object.freeze({
  supersededMessage: 'The queue operation was superseded by a newer playback request.',
});

export class QueueIntentSupersededError extends Error {
  constructor() { super(QueueIntentPolicy.supersededMessage); }
}

export class QueueIntentCancellation {
  private cancelled = false;
  private resolveCancellation!: () => void;
  private readonly cancellation = new Promise<void>(resolve => { this.resolveCancellation = resolve; });

  isCurrent = (): boolean => !this.cancelled;

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.resolveCancellation();
  }

  requireCurrent(): void {
    if (this.cancelled) throw new QueueIntentSupersededError();
  }

  async waitFor<Result>(operation: Promise<Result>): Promise<Result> {
    const result = await Promise.race([operation, this.cancellation.then(() => {
      throw new QueueIntentSupersededError();
    })]);
    this.requireCurrent();
    return result;
  }
}

interface ScheduledQueueIntent {
  readonly owner: object;
  readonly kind: QueueIntentKind;
  readonly cancellation: QueueIntentCancellation;
}

export class QueueIntentScheduler {
  private pendingCommit: Promise<unknown> = Promise.resolve();
  private readonly intents = new Set<ScheduledQueueIntent>();

  enqueue<Result>(owner: object, kind: QueueIntentKind,
    operation: (cancellation: QueueIntentCancellation) => Promise<Result>): Promise<Result> {
    const cancellation = new QueueIntentCancellation();
    const intent = { owner, kind, cancellation };
    this.intents.add(intent);
    const commit = this.pendingCommit.then(async () => {
      cancellation.requireCurrent();
      return cancellation.waitFor(operation(cancellation));
    });
    this.pendingCommit = commit.catch(() => undefined);
    const result = cancellation.waitFor(commit);
    void result.finally(() => { this.intents.delete(intent); }).catch(() => undefined);
    return result;
  }

  cancelAll(): void {
    for (const intent of this.intents) intent.cancellation.cancel();
  }

  cancelOwner(owner: object): void {
    for (const intent of this.intents) {
      if (intent.owner === owner) intent.cancellation.cancel();
    }
  }

  cancelPreparation(): void {
    for (const intent of this.intents) {
      if (intent.kind === QueueIntentKind.Replacement || intent.kind === QueueIntentKind.PreparedAppend) {
        intent.cancellation.cancel();
      }
    }
  }
}

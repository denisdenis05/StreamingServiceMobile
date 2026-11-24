import { CommandResultStatus } from 'streaming-service-player';
import type { CommandResult, PlayerError } from 'streaming-service-player';

export const QueueCommandFailurePolicy = Object.freeze({
  conflictMessage: 'The native queue changed before the edit could be applied. Refresh the queue and try again.',
  rejectedMessage: 'The native player could not apply the queue operation.',
  dependencyMessage: 'The queue required by this operation was not committed.',
  invalidIdentifierMessage: 'Queue operations require nonempty occurrence identifiers.',
  duplicateIdentifierMessage: 'Batch removal requires unique occurrence identifiers.',
  invalidSeekMessage: 'The seek position must be a nonnegative finite number of seconds.',
  unknownOutcomeMessage: 'The native queue command outcome is unknown. Replace or clear the queue before making further edits.',
  emptyIdentifierLength: 0,
  minimumPositionSeconds: 0,
});

export class QueueCommandOutcomeUnknownError extends Error {
  constructor() { super(QueueCommandFailurePolicy.unknownOutcomeMessage); }
}

export class QueueCommandFailure extends Error {
  readonly status: CommandResult['status'];
  readonly errorCode: PlayerError['code'] | undefined;

  constructor(result: Exclude<CommandResult, { readonly status: CommandResultStatus.Applied }>) {
    super(result.status === CommandResultStatus.Conflict
      ? QueueCommandFailurePolicy.conflictMessage : QueueCommandFailurePolicy.rejectedMessage);
    this.status = result.status;
    this.errorCode = result.status === CommandResultStatus.Rejected ? result.error.code : undefined;
  }
}

import type { PlaybackTrack } from './PlaybackTrack';
import { QueueIntentSupersededError } from './QueueIntentScheduler';
export enum PlaybackQueueChangeKind {
  Replace = 'replace',
  Append = 'append',
  Select = 'select',
  Remove = 'remove',
  Move = 'move',
  Clear = 'clear',
}
export interface PlaybackQueueChangeRequest {
  readonly kind: PlaybackQueueChangeKind;
  readonly tracks: readonly PlaybackTrack[];
  readonly selectedRecordingIdentifier?: string;
  readonly isCurrent: () => boolean;
  readonly acknowledgeAuthorityRelease?: () => Promise<void>;
}
export interface PlaybackQueueChangeReceipt {
  committed(): Promise<void>;
}
export interface PlaybackQueueChangeLifecycle {
  prepare(
    request: PlaybackQueueChangeRequest,
  ): Promise<PlaybackQueueChangeReceipt>;
}
export const LocalQueueChangeReceipt: PlaybackQueueChangeReceipt =
  Object.freeze({ async committed() {} });
export const LocalQueueChangeLifecycle: PlaybackQueueChangeLifecycle =
  Object.freeze({
    async prepare() {
      return LocalQueueChangeReceipt;
    },
  });
export class PlaybackQueueChangeLifecycleRegistry
  implements PlaybackQueueChangeLifecycle
{
  private attachment: {
    readonly lifecycle: PlaybackQueueChangeLifecycle;
  } | null = null;
  attach(lifecycle: PlaybackQueueChangeLifecycle): () => void {
    const attachment = { lifecycle };
    this.attachment = attachment;
    return () => {
      if (this.attachment === attachment) this.attachment = null;
    };
  }
  async prepare(
    request: PlaybackQueueChangeRequest,
  ): Promise<PlaybackQueueChangeReceipt> {
    const attachment = this.attachment;
    if (attachment === null) return LocalQueueChangeReceipt;
    const current = () => this.attachment === attachment && request.isCurrent();
    const receipt = await attachment.lifecycle.prepare({
      ...request,
      isCurrent: current,
    });
    if (!current()) throw new QueueIntentSupersededError();
    return {
      committed: async () => {
        if (current()) await receipt.committed();
      },
    };
  }
}
export const playbackQueueChanges = new PlaybackQueueChangeLifecycleRegistry();

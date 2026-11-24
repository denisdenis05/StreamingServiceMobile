import { AssetCachePolicy, AssetDownload, AssetDownloadResult } from './AssetCache';
const TransferDeadlinePolicy = Object.freeze({ timeoutMessage: 'The asset transfer exceeded its time limit.' });
export interface AssetTransferTimer { schedule(callback: () => void, milliseconds: number): () => void }
export function boundAssetTransfer(transfer: AssetDownload, maximumMilliseconds: number, timer: AssetTransferTimer): AssetDownload {
  let settled = false;
  let cancelTimer = () => {};
  let resolveResult!: (result: AssetDownloadResult) => void;
  let rejectResult!: (failure: unknown) => void;
  const result = new Promise<AssetDownloadResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const fail = (failure: unknown) => {
    if (settled) return;
    settled = true; cancelTimer(); rejectResult(failure);
  };
  cancelTimer = timer.schedule(() => {
    if (settled) return;
    try { transfer.cancel(); } catch {} finally { fail(new Error(TransferDeadlinePolicy.timeoutMessage)); }
  }, maximumMilliseconds);
  void transfer.result.then(response => {
    if (settled) return;
    settled = true; cancelTimer(); resolveResult(response);
  }, fail);
  return { result, cancel() {
    if (settled) return;
    try { transfer.cancel(); } catch {} finally { fail(new Error(AssetCachePolicy.canceledMessage)); }
  } };
}

import { boundAssetTransfer } from './AssetTransferDeadline';
import { imageHeaderDimensions } from './ImageHeaderDimensions';
import RNFS from 'react-native-fs';
import { Image } from 'react-native';
import { AssetCache, AssetCachePolicy, AssetCacheConfiguration, AssetCacheDependencies, AssetDownloadResult } from './AssetCache';
const NativeAssetPolicy = Object.freeze({ initialCount: 0, countIncrement: 1, separator: '-',
  connectionTimeoutMilliseconds: 15000, readTimeoutMilliseconds: 30000, progressIntervalMilliseconds: 250,
  maximumImageTransferMilliseconds: 120000, maximumAudioTransferMilliseconds: 1800000,
  maximumImagePixels: 16000000, maximumImageHeaderBytes: 262144, base64Encoding: 'base64', identityRadix: 36, unknownLength: 0, textPrefixBytes: 64,
  asciiEncoding: 'ascii', contentTypeHeader: 'content-type', contentLengthHeader: 'content-length',
  missingFileCode: 'ENOENT', unspecifiedFileCode: 'EUNSPECIFIED', emptyText: '', imagePrefix: 'image/', audioPrefix: 'audio/', videoPrefix: 'video/',
  binaryContentType: 'application/octet-stream', flacContentType: 'application/flac', oggContentType: 'application/ogg',
  imageFailure: 'The file is not a supported image.', audioFailure: 'The file is not a supported audio download.' });
let sequence: number = NativeAssetPolicy.initialCount;
export const assetCacheEvents: { latest: import('./AssetCache').AssetCacheEvent | null; subscribe(listener: (event: import('./AssetCache').AssetCacheEvent) => void): () => void } = {
  latest: null, subscribe(listener) { observers.add(listener); return () => observers.delete(listener); },
};
const observers = new Set<(event: import('./AssetCache').AssetCacheEvent) => void>();
export function recordAssetCacheEvent(event: import('./AssetCache').AssetCacheEvent): void {
  assetCacheEvents.latest = event;
  for (const observer of observers) { try { observer(event); } catch {} }
}
const filesystem: AssetCacheDependencies['filesystem'] = {
  async ensureDirectory(path) { await RNFS.mkdir(path); },
  async information(path) {
    try { const information = await RNFS.stat(path); return { path, size: information.size,
      modifiedMilliseconds: new Date(information.mtime).getTime(), isFile: information.isFile() }; } catch (failure) { if (missingFile(failure)) return null; throw failure; }
  },
  async list(path) {
    try { return (await RNFS.readDir(path)).map(information => ({ path: information.path, size: information.size,
      modifiedMilliseconds: information.mtime?.getTime() ?? NativeAssetPolicy.initialCount, isFile: information.isFile() })); } catch (failure) { if (missingFile(failure)) return []; throw failure; }
  },
  read: path => RNFS.readFile(path, AssetCachePolicy.encoding),
  write: (path, value) => RNFS.writeFile(path, value, AssetCachePolicy.encoding),
  async move(source, destination) {
    await removeFile(destination);
    await RNFS.moveFile(source, destination);
  },
  remove: removeFile,
  checksum: path => RNFS.hash(path, AssetCachePolicy.hashAlgorithm),
};
function missingFile(failure: unknown): boolean {
  return typeof failure === 'object' && failure !== null && 'code' in failure && failure.code === NativeAssetPolicy.missingFileCode;
}
async function removeFile(path: string): Promise<void> {
  if (!await RNFS.exists(path)) return;
  try { await RNFS.unlink(path); }
  catch (failure) {
    if (missingFile(failure)) return;
    if (typeof failure === 'object' && failure !== null && 'code' in failure
      && failure.code === NativeAssetPolicy.unspecifiedFileCode && !await RNFS.exists(path)) return;
    throw failure;
  }
}
function contentHeader(headers: Record<string, string | number>, name: string): string {
  const key = Object.keys(headers).find(header => header.toLowerCase() === name);
  return key === undefined ? NativeAssetPolicy.emptyText : String(headers[key]);
}
function download(request: Parameters<AssetCacheDependencies['download']>[0], destination: string, maximumBytes: number) {
  let expectedBytes: number = NativeAssetPolicy.unknownLength; let contentType: string = NativeAssetPolicy.emptyText;
  let exceeded = false;
  sequence += NativeAssetPolicy.countIncrement;
  const privateDestination = destination + NativeAssetPolicy.separator + Date.now().toString(NativeAssetPolicy.identityRadix)
    + NativeAssetPolicy.separator + sequence.toString(NativeAssetPolicy.identityRadix) + AssetCachePolicy.temporarySuffix;
  const transfer = RNFS.downloadFile({ fromUrl: request.address, toFile: privateDestination,
    headers: request.headers === undefined ? {} : { ...request.headers },
    connectionTimeout: NativeAssetPolicy.connectionTimeoutMilliseconds, readTimeout: NativeAssetPolicy.readTimeoutMilliseconds,
    progressInterval: NativeAssetPolicy.progressIntervalMilliseconds,
    begin(response) {
      expectedBytes = Number(contentHeader(response.headers, NativeAssetPolicy.contentLengthHeader)) || response.contentLength;
      contentType = contentHeader(response.headers, NativeAssetPolicy.contentTypeHeader).toLowerCase();
      if (expectedBytes > maximumBytes) { exceeded = true; RNFS.stopDownload(transfer.jobId); }
    },
    progress(response) { if (response.bytesWritten > maximumBytes) { exceeded = true; RNFS.stopDownload(transfer.jobId); } },
  });
  const nativeResult = transfer.promise.then(response => {
    if (exceeded) throw new Error(AssetCachePolicy.invalidMessage);
    return { status: response.statusCode, bytes: response.bytesWritten, expectedBytes, contentType };
  });
  const operation = { result: nativeResult, cancel() { RNFS.stopDownload(transfer.jobId); } };
  const deliver = async (response: AssetDownloadResult) => {
    if (response.status === AssetCachePolicy.successStatus) await filesystem.move(privateDestination, destination);
    return response;
  };
  return { ...operation, privateDestination, nativeResult, deliver };
}
async function validateImage(path: string, response: AssetDownloadResult): Promise<void> {
  if (response.contentType && !response.contentType.startsWith(NativeAssetPolicy.imagePrefix)
    && !response.contentType.startsWith(NativeAssetPolicy.binaryContentType)) throw new Error(NativeAssetPolicy.imageFailure);
  const header = imageHeaderDimensions(await RNFS.read(path, NativeAssetPolicy.maximumImageHeaderBytes,
    NativeAssetPolicy.initialCount, NativeAssetPolicy.base64Encoding));
  if (header.width <= NativeAssetPolicy.initialCount || header.height <= NativeAssetPolicy.initialCount
    || header.width * header.height > NativeAssetPolicy.maximumImagePixels) throw new Error(NativeAssetPolicy.imageFailure);
  await new Promise<void>((resolve, reject) => Image.getSize(AssetCachePolicy.filePrefix + path, (width, height) => {
    if (width > NativeAssetPolicy.initialCount && height > NativeAssetPolicy.initialCount
      && width * height <= NativeAssetPolicy.maximumImagePixels) resolve(); else reject(new Error(NativeAssetPolicy.imageFailure));
  }, reject));
}
async function validateAudio(path: string, response: AssetDownloadResult): Promise<void> {
  if (response.contentType && ![NativeAssetPolicy.audioPrefix, NativeAssetPolicy.videoPrefix, NativeAssetPolicy.binaryContentType,
    NativeAssetPolicy.flacContentType, NativeAssetPolicy.oggContentType].some(prefix => response.contentType.startsWith(prefix))) {
    throw new Error(NativeAssetPolicy.audioFailure);
  }
  const prefix = await RNFS.read(path, NativeAssetPolicy.textPrefixBytes, NativeAssetPolicy.initialCount, NativeAssetPolicy.asciiEncoding);
  if (/^\s*(?:<!doctype|<html|<\?xml|\{|\[)/i.test(prefix)) throw new Error(NativeAssetPolicy.audioFailure);
}
export function createNativeAssetCache(configuration: AssetCacheConfiguration, image: boolean): AssetCache {
  return new AssetCache({ filesystem, download(request, destination, maximumBytes) {
    const transfer = download(request, destination, maximumBytes);
    const bounded = boundAssetTransfer(transfer, image ? NativeAssetPolicy.maximumImageTransferMilliseconds
      : NativeAssetPolicy.maximumAudioTransferMilliseconds, { schedule(callback, milliseconds) {
        const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer);
      } });
    const result = bounded.result.then(transfer.deliver);
    void Promise.allSettled([transfer.nativeResult, result]).then(() => removeFile(transfer.privateDestination))
      .catch(() => recordAssetCacheEvent({ kind: 'failure', identity: transfer.privateDestination, elapsedMilliseconds: NativeAssetPolicy.initialCount }));
    return { result, cancel: bounded.cancel };
  }, delay(milliseconds) {
    let rejectDelay!: (failure: unknown) => void;
    let timer: ReturnType<typeof setTimeout>;
    const result = new Promise<void>((resolve, reject) => { rejectDelay = reject; timer = setTimeout(resolve, milliseconds); });
    return { result, cancel() { clearTimeout(timer); rejectDelay(new Error(AssetCachePolicy.canceledMessage)); } };
  }, validate: image ? validateImage : validateAudio,
    nowMilliseconds: () => Date.now(), nextIdentifier() {
      sequence += NativeAssetPolicy.countIncrement;
      return NativeAssetPolicy.separator + Date.now().toString(NativeAssetPolicy.identityRadix)
        + NativeAssetPolicy.separator + sequence.toString(NativeAssetPolicy.identityRadix);
    }, report: recordAssetCacheEvent,
  }, configuration);
}

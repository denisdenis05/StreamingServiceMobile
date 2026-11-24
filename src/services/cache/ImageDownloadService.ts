import RNFS from 'react-native-fs';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders';
import { AssetCachePolicy, AssetLease, AssetRequest } from './assets/AssetCache';
import { assetIdentity } from './assets/AssetIdentity';
import { createNativeAssetCache, recordAssetCacheEvent } from './assets/NativeAssetCache';
import { clearImageEntries } from './CacheDatabase';
export type CoverTier = 'verySmall' | 'small' | 'full';
export interface CoverUrls { cover?: string; smallCover?: string; verySmallCover?: string }
const ImageCachePolicy = Object.freeze({ directory: '/image-assets-v2', legacyDirectory: '/image-cache',
  maximumRecentRequests: 1000, publicScope: 'public-image', headerScopeSeparator: ':', keySeparator: ':', emptyText: '',
  fallbackFull: Object.freeze<CoverTier[]>(['full', 'small', 'verySmall']),
  fallbackSmall: Object.freeze<CoverTier[]>(['small', 'verySmall', 'full']),
  fallbackVerySmall: Object.freeze<CoverTier[]>(['verySmall', 'small', 'full']) });
const cache = createNativeAssetCache({ directory: RNFS.CachesDirectoryPath + ImageCachePolicy.directory,
  maximumBytes: AssetCachePolicy.maximumImageBytes, byteBudget: AssetCachePolicy.byteBudget,
  maximumAgeMilliseconds: AssetCachePolicy.maximumAgeMilliseconds,
  maximumParallelDownloads: AssetCachePolicy.maximumParallelDownloads, verifyChecksum: false }, true);
const lastRequests = new Map<string, AssetRequest>();
const requestsByPath = new Map<string, AssetRequest>();
function tiers(tier: CoverTier): readonly CoverTier[] {
  return tier === 'full' ? ImageCachePolicy.fallbackFull : tier === 'small' ? ImageCachePolicy.fallbackSmall : ImageCachePolicy.fallbackVerySmall;
}
export function imageAddress(tier: CoverTier, urls: CoverUrls): string | null {
  for (const candidate of tiers(tier)) {
    const address = candidate === 'full' ? urls.cover : candidate === 'small' ? urls.smallCover : urls.verySmallCover;
    if (address && address !== PLACEHOLDER_ALBUM_COVER) return address;
  }
  return null;
}
export function imageRequest(address: string, headers?: Readonly<Record<string, string>>): AssetRequest {
  const capturedHeaders = headers === undefined ? undefined : { ...headers };
  const representation = capturedHeaders === undefined ? ImageCachePolicy.emptyText
    : assetIdentity(JSON.stringify(Object.entries(capturedHeaders).sort(([previous], [next]) => previous.localeCompare(next))));
  return { address, scope: ImageCachePolicy.publicScope + ImageCachePolicy.headerScopeSeparator + representation,
    ...(capturedHeaders === undefined ? {} : { headers: capturedHeaders }) };
}
export function getLocalPathForTier(releaseId: string, tier: CoverTier, urls?: CoverUrls, headers?: Readonly<Record<string, string>>): string | null {
  const key = releaseId + ImageCachePolicy.keySeparator + tier;
  const address = urls === undefined ? null : imageAddress(tier, urls);
  if (urls !== undefined && address === null) return null;
  const request = address === null ? lastRequests.get(key) : imageRequest(address, headers);
  return request === undefined ? null : cache.peek(request);
}
export function getBestAvailableLocalPath(releaseId: string, urls?: CoverUrls, headers?: Readonly<Record<string, string>>): string | null {
  for (const tier of ImageCachePolicy.fallbackVerySmall) {
    const path = getLocalPathForTier(releaseId, tier, urls, headers); if (path !== null) return path;
  }
  return null;
}
export function requestImage(releaseId: string, tier: CoverTier, urls: CoverUrls,
  headers?: Readonly<Record<string, string>>, priority: number = AssetCachePolicy.visiblePriority): AssetLease {
  const address = imageAddress(tier, urls);
  if (address === null) return { result: Promise.resolve(PLACEHOLDER_ALBUM_COVER), cancel() {} };
  const request = imageRequest(address, headers);
  const key = releaseId + ImageCachePolicy.keySeparator + tier;
  const path = AssetCachePolicy.filePrefix + cache.path(request);
  requestsByPath.delete(path); requestsByPath.set(path, request);
  while (requestsByPath.size > ImageCachePolicy.maximumRecentRequests) {
    const oldest = requestsByPath.keys().next().value;
    if (oldest === undefined) break;
    requestsByPath.delete(oldest);
  }
  lastRequests.delete(key); lastRequests.set(key, request);
  while (lastRequests.size > ImageCachePolicy.maximumRecentRequests) {
    const oldest = lastRequests.keys().next().value;
    if (oldest === undefined) break;
    lastRequests.delete(oldest);
  }
  return cache.acquire(request, priority);
}
export async function getOrDownloadForTier(releaseId: string, tier: CoverTier, urls: CoverUrls): Promise<string> {
  const lease = requestImage(releaseId, tier, urls);
  try { return await lease.result; } finally { lease.cancel(); }
}
export function invalidateImage(address: string, headers?: Readonly<Record<string, string>>, displayedAddress?: string): Promise<void> {
  const displayedRequest = displayedAddress === undefined ? undefined : requestsByPath.get(displayedAddress);
  return cache.invalidate(displayedRequest ?? imageRequest(address, headers));
}
export function imageDisplayed(address: string, elapsedMilliseconds: number, headers?: Readonly<Record<string, string>>, displayedAddress?: string): void {
  const displayedRequest = displayedAddress === undefined ? undefined : requestsByPath.get(displayedAddress);
  recordAssetCacheEvent({ kind: 'displayed', identity: cache.identity(displayedRequest ?? imageRequest(address, headers)), elapsedMilliseconds });
}
export function getImageCacheDirectory(): string { return RNFS.CachesDirectoryPath + ImageCachePolicy.directory; }
export async function clearImageCache(): Promise<void> {
  lastRequests.clear(); requestsByPath.clear(); await cache.clear(); await retireLegacyImageCache();
}
export async function retireLegacyImageCache(): Promise<void> {
  await clearImageEntries();
  try { await RNFS.unlink(RNFS.CachesDirectoryPath + ImageCachePolicy.legacyDirectory); } catch {}
}

import RNFS from 'react-native-fs';
import { AssetCache, AssetCachePolicy, AssetLease, AssetRequest } from './assets/AssetCache';
import { assetIdentity } from './assets/AssetIdentity';
import { createNativeAssetCache } from './assets/NativeAssetCache';
export interface AudioCacheScope { readonly accountIdentifier: string; readonly serverAddress: string }
const AudioCachePolicy = Object.freeze({ directory: '/audio-assets-v2/', invalidScope: 'An authenticated audio cache scope is required.',
  partialHeader: 'range', partialFailure: 'Partial requests cannot create complete offline tracks.' });
const caches = new Map<string, AssetCache>();
function scopeIdentity(scope: AudioCacheScope): string {
  if (!scope.accountIdentifier || !scope.serverAddress) throw new Error(AudioCachePolicy.invalidScope);
  return assetIdentity(JSON.stringify([scope.serverAddress, scope.accountIdentifier]));
}
function cacheFor(scope: AudioCacheScope): AssetCache {
  const identity = scopeIdentity(scope); let cache = caches.get(identity);
  if (cache === undefined) {
    cache = createNativeAssetCache({ directory: RNFS.CachesDirectoryPath + AudioCachePolicy.directory + identity,
      maximumBytes: AssetCachePolicy.maximumAudioBytes, byteBudget: AssetCachePolicy.maximumAudioBytes,
      maximumAgeMilliseconds: AssetCachePolicy.maximumAgeMilliseconds, maximumParallelDownloads: AssetCachePolicy.maximumParallelDownloads,
      verifyChecksum: true, evictExisting: false }, false);
    caches.set(identity, cache);
  }
  return cache;
}
function requestFor(address: string, scope: AudioCacheScope, headers?: Readonly<Record<string, string>>): AssetRequest {
  return { address, scope: scopeIdentity(scope), ...(headers === undefined ? {} : { headers }) };
}
export function getAccountAudioCacheDirectory(scope: AudioCacheScope): string {
  return RNFS.CachesDirectoryPath + AudioCachePolicy.directory + scopeIdentity(scope);
}
export function getCacheFilePath(address: string, scope: AudioCacheScope): string { return cacheFor(scope).path(requestFor(address, scope)); }
export async function findCachedTrackAddress(address: string, scope: AudioCacheScope): Promise<string | null> {
  return cacheFor(scope).find(requestFor(address, scope));
}
export async function isTrackCached(address: string, scope: AudioCacheScope): Promise<boolean> {
  return await findCachedTrackAddress(address, scope) !== null;
}
export function requestTrackDownload(address: string, headers: Readonly<Record<string, string>>, scope: AudioCacheScope): AssetLease {
  if (Object.keys(headers).some(header => header.toLowerCase() === AudioCachePolicy.partialHeader)) throw new Error(AudioCachePolicy.partialFailure);
  return cacheFor(scope).acquire(requestFor(address, scope, headers), AssetCachePolicy.prefetchPriority);
}
export async function cacheTrack(address: string, headers: Readonly<Record<string, string>>, scope: AudioCacheScope): Promise<string> {
  const lease = requestTrackDownload(address, headers, scope);
  try { return (await lease.result).substring(AssetCachePolicy.filePrefix.length); } finally { lease.cancel(); }
}
export async function clearAccountAudioCache(scope: AudioCacheScope): Promise<void> {
  await cacheFor(scope).clear(); await retireLegacyAudioCache();
}
export async function retireLegacyAudioCache(): Promise<void> {
  const legacyDirectory = '/audio-cache';
  try { await RNFS.unlink(RNFS.CachesDirectoryPath + legacyDirectory); } catch {}
}

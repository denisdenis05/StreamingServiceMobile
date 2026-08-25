import RNFS from 'react-native-fs';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders';
import { getImageEntry, setImageEntry } from './CacheDatabase';

export type CoverTier = 'verySmall' | 'small' | 'full';

export interface CoverUrls {
    cover?: string;
    smallCover?: string;
    verySmallCover?: string;
}

const IMAGE_CACHE_DIRECTORY = `${RNFS.CachesDirectoryPath}/image-cache`;
let cacheDirectoryReady = false;

async function ensureCacheDirectory(): Promise<void> {
    if (cacheDirectoryReady) return;
    const exists = await RNFS.exists(IMAGE_CACHE_DIRECTORY);
    if (!exists) await RNFS.mkdir(IMAGE_CACHE_DIRECTORY);
    cacheDirectoryReady = true;
}

function extractExtensionFromUrl(url: string): string {
    const match = url.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
    return match ? match[1] : 'jpg';
}

async function downloadToFile(sourceUrl: string, destinationPath: string): Promise<boolean> {
    const tempPath = `${destinationPath}_downloading`;
    try {
        const result = await RNFS.downloadFile({
            fromUrl: sourceUrl,
            toFile: tempPath,
            connectionTimeout: 30000,
            readTimeout: 30000,
        }).promise;
        if (result.statusCode === 200) {
            await RNFS.moveFile(tempPath, destinationPath);
            return true;
        }
        await RNFS.unlink(tempPath).catch(() => {});
        return false;
    } catch {
        await RNFS.unlink(tempPath).catch(() => {});
        return false;
    }
}

// In-flight dedup: key = `${releaseId}:${tier}`
const inFlight = new Map<string, Promise<string>>();

function storedPathForTier(
    entry: ReturnType<typeof getImageEntry>,
    tier: CoverTier,
): string {
    if (!entry) return '';
    if (tier === 'full') return entry.localPath || '';
    if (tier === 'small') return entry.smallCoverLocalPath || '';
    return entry.verySmallCoverLocalPath || '';
}

function urlForTier(tier: CoverTier, urls: CoverUrls): string | undefined {
    if (tier === 'full') return urls.cover;
    if (tier === 'small') return urls.smallCover;
    return urls.verySmallCover;
}

export function getLocalPathForTier(releaseId: string, tier: CoverTier): string | null {
    if (!releaseId) return null;
    const entry = getImageEntry(releaseId);
    const path = storedPathForTier(entry, tier);
    return path ? `file://${path}` : null;
}

export function getBestAvailableLocalPath(releaseId: string): string | null {
    if (!releaseId) return null;
    const entry = getImageEntry(releaseId);
    if (!entry) return null;
    if (entry.localPath) return `file://${entry.localPath}`;
    if (entry.smallCoverLocalPath) return `file://${entry.smallCoverLocalPath}`;
    if (entry.verySmallCoverLocalPath) return `file://${entry.verySmallCoverLocalPath}`;
    return null;
}

async function _downloadForTier(
    releaseId: string,
    tier: CoverTier,
    urls: CoverUrls,
): Promise<string> {
    const url = urlForTier(tier, urls);
    if (!url || url === PLACEHOLDER_ALBUM_COVER) return url || PLACEHOLDER_ALBUM_COVER;

    await ensureCacheDirectory();
    const ext = extractExtensionFromUrl(url);
    const localPath = `${IMAGE_CACHE_DIRECTORY}/${releaseId}_${tier}.${ext}`;

    const downloaded = await downloadToFile(url, localPath);
    if (downloaded) {
        const existing = getImageEntry(releaseId);
        setImageEntry(releaseId, {
            releaseId,
            coverUrl: urls.cover || existing?.coverUrl || url,
            localPath: tier === 'full' ? localPath : (existing?.localPath || ''),
            smallCoverLocalPath: tier === 'small' ? localPath : (existing?.smallCoverLocalPath || ''),
            verySmallCoverLocalPath: tier === 'verySmall' ? localPath : (existing?.verySmallCoverLocalPath || ''),
            downloadedAt: Date.now(),
        });
        return `file://${localPath}`;
    }
    return url;
}

export async function getOrDownloadForTier(
    releaseId: string,
    tier: CoverTier,
    urls: CoverUrls,
): Promise<string> {
    if (!releaseId) return urlForTier(tier, urls) || PLACEHOLDER_ALBUM_COVER;

    const existing = getImageEntry(releaseId);
    if (existing && urls.cover && existing.coverUrl && existing.coverUrl !== urls.cover) {
        // Cover URL changed — invalidate all tiers
        setImageEntry(releaseId, {
            ...existing,
            coverUrl: urls.cover,
            localPath: '',
            smallCoverLocalPath: '',
            verySmallCoverLocalPath: '',
        });
    } else {
        const cached = getLocalPathForTier(releaseId, tier);
        if (cached) return cached;
    }

    const key = `${releaseId}:${tier}`;
    const inflight = inFlight.get(key);
    if (inflight) return inflight;

    const promise = _downloadForTier(releaseId, tier, urls).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
}

export async function clearImageCache(): Promise<void> {
    const exists = await RNFS.exists(IMAGE_CACHE_DIRECTORY);
    if (exists) await RNFS.unlink(IMAGE_CACHE_DIRECTORY);
    cacheDirectoryReady = false;
}

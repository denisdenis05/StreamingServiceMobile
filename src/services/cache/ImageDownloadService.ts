import RNFS from 'react-native-fs';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders';
import { getImageEntry, setImageEntry } from './CacheDatabase';
import { CachedImageEntry } from './CacheModels';

const IMAGE_CACHE_DIRECTORY = `${RNFS.CachesDirectoryPath}/image-cache`;

let cacheDirectoryReady = false;

async function ensureCacheDirectory(): Promise<void> {
    if (cacheDirectoryReady) {
        return;
    }
    const exists = await RNFS.exists(IMAGE_CACHE_DIRECTORY);
    if (!exists) {
        await RNFS.mkdir(IMAGE_CACHE_DIRECTORY);
    }
    cacheDirectoryReady = true;
}

function buildLocalFileName(releaseId: string, suffix: string): string {
    return `${releaseId}_${suffix}`;
}

function extractExtensionFromUrl(url: string): string {
    const extensionMatch = url.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
    if (extensionMatch) {
        return extensionMatch[1];
    }
    return 'jpg';
}

async function downloadToFile(
    sourceUrl: string,
    destinationPath: string
): Promise<boolean> {
    const temporaryPath = `${destinationPath}_downloading`;
    try {
        const result = await RNFS.downloadFile({
            fromUrl: sourceUrl,
            toFile: temporaryPath,
            connectionTimeout: 30000,
            readTimeout: 30000,
        }).promise;

        if (result.statusCode === 200) {
            await RNFS.moveFile(temporaryPath, destinationPath);
            return true;
        }

        await RNFS.unlink(temporaryPath).catch(() => { });
        return false;
    } catch {
        await RNFS.unlink(temporaryPath).catch(() => { });
        return false;
    }
}

export function getLocalImagePath(releaseId: string): string | null {
    if (!releaseId) {
        return null;
    }
    const entry = getImageEntry(releaseId);
    if (!entry || !entry.localPath) {
        return null;
    }
    return `file://${entry.localPath}`;
}

export function getVerySmallCoverPath(releaseId: string): string | null {
    if (!releaseId) {
        return null;
    }
    const entry = getImageEntry(releaseId);
    if (!entry || !entry.verySmallCoverLocalPath) {
        return null;
    }
    return `file://${entry.verySmallCoverLocalPath}`;
}

function shouldRecache(
    existingEntry: CachedImageEntry,
    newCoverUrl: string
): boolean {
    return existingEntry.coverUrl !== newCoverUrl;
}

export async function getOrDownloadImage(
    releaseId: string,
    coverUrl: string,
    verySmallCoverUrl?: string
): Promise<string> {
    if (!releaseId || !coverUrl || coverUrl === PLACEHOLDER_ALBUM_COVER) {
        return coverUrl || PLACEHOLDER_ALBUM_COVER;
    }

    const existingEntry = getImageEntry(releaseId);

    if (existingEntry && !shouldRecache(existingEntry, coverUrl)) {
        if (existingEntry.localPath) {
            return `file://${existingEntry.localPath}`;
        }
    }

    await ensureCacheDirectory();

    let verySmallCoverLocalPath = existingEntry?.verySmallCoverLocalPath || '';

    if (
        verySmallCoverUrl &&
        verySmallCoverUrl !== PLACEHOLDER_ALBUM_COVER &&
        !verySmallCoverLocalPath
    ) {
        const verySmallExtension = extractExtensionFromUrl(verySmallCoverUrl);
        const verySmallFileName = buildLocalFileName(releaseId, 'verysmall');
        const verySmallPath = `${IMAGE_CACHE_DIRECTORY}/${verySmallFileName}.${verySmallExtension}`;

        const verySmallDownloaded = await downloadToFile(
            verySmallCoverUrl,
            verySmallPath
        );
        if (verySmallDownloaded) {
            verySmallCoverLocalPath = verySmallPath;

            setImageEntry(releaseId, {
                releaseId,
                coverUrl,
                localPath: '',
                verySmallCoverLocalPath,
                downloadedAt: Date.now(),
            });
        }
    }

    const fullExtension = extractExtensionFromUrl(coverUrl);
    const fullFileName = buildLocalFileName(releaseId, 'full');
    const fullPath = `${IMAGE_CACHE_DIRECTORY}/${fullFileName}.${fullExtension}`;

    const fullDownloaded = await downloadToFile(coverUrl, fullPath);

    if (fullDownloaded) {
        setImageEntry(releaseId, {
            releaseId,
            coverUrl,
            localPath: fullPath,
            verySmallCoverLocalPath,
            downloadedAt: Date.now(),
        });
        return `file://${fullPath}`;
    }

    if (verySmallCoverLocalPath) {
        return `file://${verySmallCoverLocalPath}`;
    }

    return coverUrl;
}

export async function downloadVerySmallCoverOnly(
    releaseId: string,
    coverUrl: string,
    verySmallCoverUrl: string
): Promise<string> {
    if (
        !verySmallCoverUrl ||
        verySmallCoverUrl === PLACEHOLDER_ALBUM_COVER
    ) {
        return verySmallCoverUrl || PLACEHOLDER_ALBUM_COVER;
    }

    const existingEntry = getImageEntry(releaseId);
    if (existingEntry?.verySmallCoverLocalPath) {
        return `file://${existingEntry.verySmallCoverLocalPath}`;
    }

    await ensureCacheDirectory();

    const extension = extractExtensionFromUrl(verySmallCoverUrl);
    const fileName = buildLocalFileName(releaseId, 'verysmall');
    const localPath = `${IMAGE_CACHE_DIRECTORY}/${fileName}.${extension}`;

    const downloaded = await downloadToFile(verySmallCoverUrl, localPath);

    if (downloaded) {
        setImageEntry(releaseId, {
            releaseId,
            coverUrl,
            localPath: existingEntry?.localPath || '',
            verySmallCoverLocalPath: localPath,
            downloadedAt: Date.now(),
        });
        return `file://${localPath}`;
    }

    return verySmallCoverUrl;
}

export async function clearImageCache(): Promise<void> {
    const exists = await RNFS.exists(IMAGE_CACHE_DIRECTORY);
    if (exists) {
        await RNFS.unlink(IMAGE_CACHE_DIRECTORY);
    }
    cacheDirectoryReady = false;
}

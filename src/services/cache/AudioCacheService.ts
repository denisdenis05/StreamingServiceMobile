import RNFS from 'react-native-fs';

const AUDIO_CACHE_DIRECTORY = `${RNFS.CachesDirectoryPath}/audio-cache`;

async function ensureCacheDirectory(): Promise<void> {
    const exists = await RNFS.exists(AUDIO_CACHE_DIRECTORY);
    if (!exists) {
        await RNFS.mkdir(AUDIO_CACHE_DIRECTORY);
    }
}

function extractIdFromUrl(url: string): string {
    const match = url.match(/id=([a-zA-Z0-9-]+)/);
    return match ? match[1] : 'unknown';
}

export function getCacheFilePath(url: string): string {
    const fileName = extractIdFromUrl(url);
    return `${AUDIO_CACHE_DIRECTORY}/${fileName}.mp3`;
}

export async function isTrackCached(url: string): Promise<boolean> {
    const path = getCacheFilePath(url);
    return RNFS.exists(path);
}

export async function cacheTrack(
    url: string,
    headers: any
): Promise<string> {
    await ensureCacheDirectory();
    const path = getCacheFilePath(url);

    const alreadyCached = await RNFS.exists(path);
    if (alreadyCached) {
        try {
            const stat = await RNFS.stat(path);
            if (stat.size > 0) {
                return path;
            }
            await RNFS.unlink(path).catch(() => { });
        } catch {
            await RNFS.unlink(path).catch(() => { });
        }
    }

    try {
        const result = await RNFS.downloadFile({
            fromUrl: url,
            toFile: path,
            headers,
            connectionTimeout: 60000,
            readTimeout: 120000,
            background: true,
            discretionary: false,
        }).promise;

        if (result.statusCode >= 200 && result.statusCode < 300) {
            const stat = await RNFS.stat(path);
            if (stat.size > 0) {
                return path;
            }
            await RNFS.unlink(path).catch(() => { });
            throw new Error(`Downloaded file is empty for ${url}`);
        }

        await RNFS.unlink(path).catch(() => { });
        throw new Error(`Failed to cache track, server returned status ${result.statusCode} for ${url}`);
    } catch (downloadError: any) {
        await RNFS.unlink(path).catch(() => { });
        if (downloadError.message?.includes('Failed to cache track') || downloadError.message?.includes('Downloaded file is empty')) {
            throw downloadError;
        }
        throw new Error(`Failed to download track: ${downloadError.message}`);
    }
}

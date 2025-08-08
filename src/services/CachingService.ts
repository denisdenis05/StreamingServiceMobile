import RNFS from 'react-native-fs';

const CACHE_DIR = `${RNFS.CachesDirectoryPath}/audio-cache`;

async function ensureCacheDir() {
  const exists = await RNFS.exists(CACHE_DIR);
  if (!exists) {
    await RNFS.mkdir(CACHE_DIR);
  }
}

function extractIdFromUrl(url: string): string {
  const match = url.match(/id=([a-zA-Z0-9-]+)/);
  return match ? match[1] : 'unknown';
}

export function getCacheFilePath(url: string) {
  const fileName = extractIdFromUrl(url);
  return `${CACHE_DIR}/${fileName}.mp3`;
}

export async function isTrackCached(url: string) {
  const path = getCacheFilePath(url);
  return RNFS.exists(path);
}

export async function cacheTrack(url: string) {
  await ensureCacheDir();
  const path = getCacheFilePath(url);
  if (await RNFS.exists(path)) return path;

  const result = await RNFS.downloadFile({ fromUrl: url, toFile: path })
    .promise;
  if (result.statusCode === 200) {
    return path;
  } else {
    throw new Error('Failed to cache track');
  }
}

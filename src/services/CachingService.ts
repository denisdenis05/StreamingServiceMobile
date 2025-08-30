import RNFS from 'react-native-fs';
import { PLACEHOLDER_ALBUM_COVER } from '../constants/placeholders.tsx';

const AUDIO_CACHE_DIR = `${RNFS.CachesDirectoryPath}/audio-cache`;
const IMAGE_CACHE_DIR = `${RNFS.CachesDirectoryPath}/image-cache`;

async function ensureCacheDir(dir: string) {
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

function getFileNameFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `img_${Math.abs(hash).toString()}`;
}

function extractIdFromUrl(url: string): string {
  const match = url.match(/id=([a-zA-Z0-9-]+)/);
  return match ? match[1] : 'unknown';
}

export function getCacheFilePath(url: string) {
  const fileName = extractIdFromUrl(url);
  return `${AUDIO_CACHE_DIR}/${fileName}.mp3`;
}

export async function isTrackCached(url: string) {
  const path = getCacheFilePath(url);
  return RNFS.exists(path);
}

export async function cacheTrack(url: string, headers: any) {
  await ensureCacheDir(AUDIO_CACHE_DIR);
  const path = getCacheFilePath(url);
  if (await RNFS.exists(path)) return path;

  const result = await RNFS.downloadFile({
    fromUrl: url,
    toFile: path,
    headers,
  }).promise;
  if (result.statusCode === 200) {
    return path;
  } else {
    throw new Error('Failed to cache track');
  }
}

export function getImageCacheFilePath(imageUrl: string): string {
  const fileExtensionMatch = imageUrl.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);
  const extension = fileExtensionMatch ? fileExtensionMatch[1] : 'jpg'; // Default to jpg
  const fileName = getFileNameFromUrl(imageUrl);
  return `${IMAGE_CACHE_DIR}/${fileName}.${extension}`;
}

export async function isImageCached(imageUrl: string): Promise<boolean> {
  const path = getImageCacheFilePath(imageUrl);
  return RNFS.exists(path);
}

export async function cacheImage(imageUrl: string): Promise<string> {
  if (!imageUrl || imageUrl === PLACEHOLDER_ALBUM_COVER) {
    return imageUrl;
  }

  await ensureCacheDir(IMAGE_CACHE_DIR);
  const path = getImageCacheFilePath(imageUrl);

  if (await RNFS.exists(path)) {
    return `file://${path}`;
  }

  try {
    const result = await RNFS.downloadFile({
      fromUrl: imageUrl,
      toFile: path,
    }).promise;

    if (result.statusCode === 200) {
      return `file://${path}`;
    } else {
      console.warn(
        `Failed to cache image from ${imageUrl}. Status code: ${result.statusCode}`
      );
      return imageUrl;
    }
  } catch (error) {
    console.error(`Error caching image ${imageUrl}:`, error);
    return imageUrl;
  }
}

export async function clearImageCache(): Promise<void> {
  const exists = await RNFS.exists(IMAGE_CACHE_DIR);
  if (exists) {
    await RNFS.unlink(IMAGE_CACHE_DIR);
    console.log('Image cache cleared.');
  }
}

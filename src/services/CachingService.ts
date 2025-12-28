import RNFS from 'react-native-fs';
import { PLACEHOLDER_ALBUM_COVER } from '../constants/placeholders.tsx';
import { AxiosInstance } from 'axios';
import { Buffer } from 'buffer';

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
    connectionTimeout: 30000,
    readTimeout: 30000,
  }).promise;
  if (result.statusCode === 200) {
    return path;
  } else {
    throw new Error('Failed to cache track');
  }
}

async function findCachedImageFile(fileName: string): Promise<string | null> {
  const extensions = ['jpg', 'png', 'jpeg', 'gif', 'webp'];
  for (const ext of extensions) {
    const path = `${IMAGE_CACHE_DIR}/${fileName}.${ext}`;
    if (await RNFS.exists(path)) {
      return path;
    }
  }
  return null;
}

export async function isImageCached(imageUrl: string): Promise<boolean> {
  if (!imageUrl || imageUrl === PLACEHOLDER_ALBUM_COVER) return false;
  const fileName = getFileNameFromUrl(imageUrl);
  const cachedPath = await findCachedImageFile(fileName);
  return cachedPath !== null;
}

export async function getCachedImage(imageUrl: string): Promise<string | null> {
  if (!imageUrl || imageUrl === PLACEHOLDER_ALBUM_COVER) return null;
  const fileName = getFileNameFromUrl(imageUrl);
  const cachedPath = await findCachedImageFile(fileName);
  return cachedPath ? `file://${cachedPath}` : null;
}

async function cacheImageInternal(imageUrl: string): Promise<string> {
  if (!imageUrl || imageUrl === PLACEHOLDER_ALBUM_COVER) {
    return imageUrl;
  }

  await ensureCacheDir(IMAGE_CACHE_DIR);
  const fileName = getFileNameFromUrl(imageUrl);

  const existingPath = await findCachedImageFile(fileName);
  if (existingPath) {
    return `file://${existingPath}`;
  }

  const tempPath = `${IMAGE_CACHE_DIR}/${fileName}_temp`;

  try {
    const result = await RNFS.downloadFile({
      fromUrl: imageUrl,
      toFile: tempPath,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      connectionTimeout: 30000,
      readTimeout: 30000,
    }).promise;

    if (result.statusCode === 200) {
      let extension = 'jpg';
      const fileExtensionMatch = imageUrl.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);
      if (fileExtensionMatch) {
        extension = fileExtensionMatch[1];
      }

      const finalPath = `${IMAGE_CACHE_DIR}/${fileName}.${extension}`;
      await RNFS.moveFile(tempPath, finalPath);

      return `file://${finalPath}`;
    } else {
      console.warn(
        `Failed to cache image from ${imageUrl}. Status code: ${result.statusCode}`
      );
      await RNFS.unlink(tempPath).catch(() => { });
      return imageUrl;
    }
  } catch (error) {
    console.error(`Error caching image ${imageUrl}:`, error);
    await RNFS.unlink(tempPath).catch(() => { });
    return imageUrl;
  }
}

export async function cacheImageWithApi(
  imageUrl: string,
  api?: AxiosInstance
): Promise<string> {
  if (!imageUrl || imageUrl === PLACEHOLDER_ALBUM_COVER) {
    return imageUrl;
  }

  await ensureCacheDir(IMAGE_CACHE_DIR);
  const fileName = getFileNameFromUrl(imageUrl);

  const existingPath = await findCachedImageFile(fileName);
  if (existingPath) {
    return `file://${existingPath}`;
  }

  if (!api) {
    return cacheImageInternal(imageUrl);
  }

  try {
    const response = await api.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    let extension = 'jpg';
    const contentType = response.headers['content-type'];
    if (contentType) {
      const typeMatch = contentType.match(/image\/([a-z]+)/);
      if (typeMatch) {
        extension = typeMatch[1] === 'jpeg' ? 'jpg' : typeMatch[1];
      }
    } else {
      const fileExtensionMatch = imageUrl.match(/\.([0-9a-z]+)(?:[\?#]|$)/i);
      if (fileExtensionMatch) {
        extension = fileExtensionMatch[1];
      }
    }

    const finalPath = `${IMAGE_CACHE_DIR}/${fileName}.${extension}`;

    const base64Data = Buffer.from(response.data, 'binary').toString('base64');

    await RNFS.writeFile(finalPath, base64Data, 'base64');

    return `file://${finalPath}`;
  } catch (error) {
    console.error(`Error caching image with API ${imageUrl}:`, error);
    return cacheImageInternal(imageUrl);
  }
}

export async function clearImageCache(): Promise<void> {
  const exists = await RNFS.exists(IMAGE_CACHE_DIR);
  if (exists) {
    await RNFS.unlink(IMAGE_CACHE_DIR);
    console.log('Image cache cleared.');
  }
}

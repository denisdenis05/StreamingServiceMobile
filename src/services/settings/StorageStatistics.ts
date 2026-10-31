export const StorageStatisticsPolicy = Object.freeze({
  emptyBytes: 0,
  maximumDirectoryEntries: 10000,
  invalidReadingMessage: 'Storage information is unavailable.',
});
export interface StorageDirectoryEntry {
  readonly size: number;
  readonly isFile: () => boolean;
}
export interface StorageStatisticsFilesystem {
  exists(directory: string): Promise<boolean>;
  readDirectory(directory: string): Promise<readonly StorageDirectoryEntry[]>;
}
export async function directoryStorageBytes(
  filesystem: StorageStatisticsFilesystem,
  directory: string,
): Promise<number> {
  if (!(await filesystem.exists(directory)))
    return StorageStatisticsPolicy.emptyBytes;
  const entries = await filesystem.readDirectory(directory);
  if (entries.length > StorageStatisticsPolicy.maximumDirectoryEntries)
    throw new Error(StorageStatisticsPolicy.invalidReadingMessage);
  let bytes = StorageStatisticsPolicy.emptyBytes;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < StorageStatisticsPolicy.emptyBytes ||
      !Number.isSafeInteger(bytes + entry.size)
    ) {
      throw new Error(StorageStatisticsPolicy.invalidReadingMessage);
    }
    bytes += entry.size;
  }
  return bytes;
}

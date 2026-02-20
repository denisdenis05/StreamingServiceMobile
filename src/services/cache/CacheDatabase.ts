import { createMMKV, MMKV } from 'react-native-mmkv';
import { Recording } from '../../constants/types';
import {
    CachedImageEntry,
    CachedRecordingListEntry,
    CollectionType,
} from './CacheModels';

let storage: MMKV | null = null;

function getStorage(): MMKV | null {
    if (storage) {
        return storage;
    }
    try {
        storage = createMMKV({ id: 'streaming-service-cache' });
        return storage;
    } catch {
        return null;
    }
}

function imageKey(releaseId: string): string {
    return `image:${releaseId}`;
}

function recordingListKey(
    collectionId: string,
    collectionType: CollectionType
): string {
    return `recordings:${collectionType}:${collectionId}`;
}

export function getImageEntry(
    releaseId: string
): CachedImageEntry | null {
    if (!releaseId) {
        return null;
    }
    const db = getStorage();
    if (!db) {
        return null;
    }
    try {
        const raw = db.getString(imageKey(releaseId));
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as CachedImageEntry;
    } catch {
        return null;
    }
}

export function setImageEntry(
    releaseId: string,
    entry: CachedImageEntry
): void {
    if (!releaseId) {
        return;
    }
    const db = getStorage();
    if (!db) {
        return;
    }
    try {
        db.set(imageKey(releaseId), JSON.stringify(entry));
    } catch {
        return;
    }
}

export function hasImage(releaseId: string): boolean {
    if (!releaseId) {
        return false;
    }
    const db = getStorage();
    if (!db) {
        return false;
    }
    try {
        return db.contains(imageKey(releaseId));
    } catch {
        return false;
    }
}

export function getRecordingList(
    collectionId: string,
    collectionType: CollectionType
): CachedRecordingListEntry | null {
    if (!collectionId) {
        return null;
    }
    const db = getStorage();
    if (!db) {
        return null;
    }
    try {
        const raw = db.getString(
            recordingListKey(collectionId, collectionType)
        );
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as CachedRecordingListEntry;
    } catch {
        return null;
    }
}

export function setRecordingList(
    collectionId: string,
    collectionType: CollectionType,
    recordings: Recording[]
): void {
    if (!collectionId) {
        return;
    }
    const db = getStorage();
    if (!db) {
        return;
    }
    try {
        const entry: CachedRecordingListEntry = {
            collectionId,
            collectionType,
            recordings,
            fetchedAt: Date.now(),
        };
        db.set(
            recordingListKey(collectionId, collectionType),
            JSON.stringify(entry)
        );
    } catch {
        return;
    }
}

export function clearAllCache(): void {
    const db = getStorage();
    if (!db) {
        return;
    }
    try {
        db.clearAll();
    } catch {
        return;
    }
}

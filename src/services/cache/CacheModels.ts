import { Recording } from '../../constants/types';

export interface CachedImageEntry {
    releaseId: string;
    coverUrl: string;
    localPath: string;
    smallCoverLocalPath: string;
    verySmallCoverLocalPath: string;
    downloadedAt: number;
}

export type CollectionType = 'album' | 'playlist';

export interface CachedRecordingListEntry {
    collectionId: string;
    collectionType: CollectionType;
    recordings: Recording[];
    fetchedAt: number;
}

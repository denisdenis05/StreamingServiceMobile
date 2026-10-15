import CollectionViewer from '../../components/CollectionViewer';
import {
  PLACEHOLDER_ALBUM_COVER,
} from '../../constants/placeholders.tsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Recording } from '../../constants/types.tsx';
import { catalogPlaybackMapping } from '../../services/NativeAudioRuntime';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { useApi } from '../../hooks/useApi.ts';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions, ActionItem } from '../../constants/navigation.tsx';
import { invalidateCache } from '../../services/DataProvider.tsx';
import {
  getRecordingList,
  setRecordingList,
} from '../../services/cache/CacheDatabase';
import LibraryIcon from '../../../assets/icons/libraryIcon.tsx';

function recordingListsAreEqual(
  listA: Recording[],
  listB: Recording[]
): boolean {
  if (listA.length !== listB.length) {
    return false;
  }
  for (let index = 0; index < listA.length; index++) {
    if (
      listA[index].id !== listB[index].id ||
      listA[index].title !== listB[index].title ||
      listA[index].cover !== listB[index].cover ||
      listA[index].isLiked !== listB[index].isLiked ||
      listA[index].releaseId !== listB[index].releaseId
    ) {
      return false;
    }
  }
  return true;
}

const AlbumViewer = ({ navigation, route }: any) => {
  const { albumId, albumTitle, albumArtist, albumCover, albumSmallCover, albumVerySmallCover } = route.params;
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const { playTracks } = useMusicQueue();
  const [fetched, setFetched] = useState(false);
  const [isAlbumSaved, setIsAlbumSaved] = useState(false);
  const api = useApi();
  const [albumMenuVisible, setAlbumMenuVisible] = useState(false);
  const [songMenuVisible, setSongMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);

  useEffect(() => {
    const cachedEntry = getRecordingList(albumId, 'album');
    if (cachedEntry && cachedEntry.recordings.length > 0) {
      setRecordings(cachedEntry.recordings);
      setFetched(true);
    }

    api
      .get(`Metadata/get-recordings?albumId=${albumId}`)
      .then(res => {
        const freshRecordings: Recording[] = res.data;
        if (!cachedEntry || !recordingListsAreEqual(cachedEntry.recordings, freshRecordings)) {
          setRecordings(freshRecordings);
          setRecordingList(albumId, 'album', freshRecordings);
        }
        setFetched(true);
      })
      .catch(() => setFetched(true));

    api
      .get(`Library/albums/${albumId}/saved`)
      .then(res => setIsAlbumSaved(res.data.isSaved))
      .catch(() => {});
  }, []);

  const handlePlayFromRecording = useCallback((recordingIndex: number) => {
    const tracks = recordings.map(recording => catalogPlaybackMapping.map(recording, albumId));
    void playTracks(tracks, recordingIndex);
    navigation.navigate('Playing', {});
  }, [recordings, albumId, playTracks, navigation]);
  const FirstAlbumEntryIndex = 0;
  const handlePlayAlbum = useCallback(() => handlePlayFromRecording(FirstAlbumEntryIndex), [handlePlayFromRecording]);

  const handleToggleLibrary = useCallback(async () => {
    try {
      const res = await api.post(`Library/albums/${albumId}`);
      const { isSaved } = res.data;
      setIsAlbumSaved(isSaved);
      invalidateCache('library');
    } catch (error) {
      console.error('Failed to toggle album in library:', error);
    }
  }, [api, albumId]);

  const albumContextOptions = useMemo<ActionItem[]>(() => [
    {
      label: isAlbumSaved ? 'Remove from library' : 'Add to library',
      icon: LibraryIcon,
      onClick: (_nav, params) => params?.onToggleLibrary?.(),
    },
    ...menuOptions,
  ], [isAlbumSaved]);

  const handleAlbumMorePress = useCallback((event: any) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setAlbumMenuVisible(true);
    setSelectedRecordingIds(recordings.map(r => r.id));
  }, [recordings]);

  const handleSongMorePress = useCallback((event: any, recording: Recording) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setSongMenuVisible(true);
    setSelectedRecordingIds([recording.id]);
  }, []);

  return (
    <>
      <CollectionViewer
        navigation={navigation}
        title={albumTitle}
        subtitle={albumArtist}
        cover={albumCover}
        releaseId={albumId}
        smallCover={albumSmallCover}
        verySmallCover={albumVerySmallCover}
        songs={recordings}
        onPlay={handlePlayAlbum}
        onMorePress={handleAlbumMorePress}
        onSongPlay={handlePlayFromRecording}
        onSongMorePress={handleSongMorePress}
        isLoading={!fetched}
        emptyMessage="Album temporarily unavailable, check again in a few minutes"
      />
      {albumMenuVisible && (
        <ContextMenu
          visible={albumMenuVisible}
          onClose={() => setAlbumMenuVisible(false)}
          options={albumContextOptions}
          position={menuPosition}
          navigation={navigation}
          params={{
            recordingIds: selectedRecordingIds,
            songs: recordings.filter(r => selectedRecordingIds.includes(r.id)),
            albumId,
            albumTitle,
            albumCover,
            albumArtist,
            onToggleLibrary: handleToggleLibrary,
          }}
        />
      )}
      {songMenuVisible && (
        <ContextMenu
          visible={songMenuVisible}
          onClose={() => setSongMenuVisible(false)}
          options={menuOptions}
          position={menuPosition}
          navigation={navigation}
          params={{
            recordingIds: selectedRecordingIds,
            songs: recordings.filter(r => selectedRecordingIds.includes(r.id)),
            albumId,
            albumTitle,
            albumCover,
            albumArtist,
          }}
        />
      )}
    </>
  );
};

export default AlbumViewer;

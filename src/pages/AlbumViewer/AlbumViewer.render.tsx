import CollectionViewer from '../../components/CollectionViewer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Recording } from '../../constants/types.tsx';
import { catalogPlaybackMapping } from '../../services/NativeAudioRuntime';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { useApi } from '../../hooks/useApi.ts';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions, ActionItem } from '../../constants/navigation.tsx';
import { invalidateCache } from '../../services/DataProvider.tsx';
import LibraryIcon from '../../../assets/icons/libraryIcon.tsx';
import { useCollectionRecordings, CollectionRecordingPolicy } from '../../hooks/useCollectionRecordings';
import { useDataScope } from '../../services/DataProvider';

const AlbumViewer = ({ navigation, route }: any) => {
  const { albumId, albumTitle, albumArtist, albumCover, albumSmallCover, albumVerySmallCover } = route.params;
  const { recordings, loading, error, retry } = useCollectionRecordings(albumId, CollectionRecordingPolicy.album);
  const scope = useDataScope();
  const { playTracks } = useMusicQueue();
  const [isAlbumSaved, setIsAlbumSaved] = useState(false);
  const api = useApi();
  const [albumMenuVisible, setAlbumMenuVisible] = useState(false);
  const [songMenuVisible, setSongMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);

  useEffect(() => {
    const cancellation = new AbortController();
    setIsAlbumSaved(false);
    void api.get(`Library/albums/${albumId}/saved`, { signal: cancellation.signal })
      .then(response => { if (!cancellation.signal.aborted) setIsAlbumSaved(response.data.isSaved); })
      .catch(() => undefined);
    return () => cancellation.abort();
  }, [api, albumId, scope]);

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
    } catch {
      console.warn(AlbumMessages.saveFailed);
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
        isLoading={loading}
        errorMessage={error}
        onRetry={retry}
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

const AlbumMessages = Object.freeze({ saveFailed: 'Album library changes could not be saved.' });

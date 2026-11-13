import { RecommendationModes, RecommendationRoutes } from '../../services/recommendations/RecommendationContracts';
import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi.ts';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { Recording } from '../../constants/types.tsx';
import CollectionViewer from '../../components/CollectionViewer';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';
import { useCollectionRecordings, CollectionRecordingPolicy } from '../../hooks/useCollectionRecordings';
import { notifyLibraryChanged } from '../../services/LibraryChanges';

const PlaylistViewer = ({ navigation, route }: any) => {
  const { playlistId, playlistTitle, playlistOwner, playlistCover, isOwner } =
    route.params;
  const { recordings, loading, error, loadMore, retry } = useCollectionRecordings(
    playlistId, CollectionRecordingPolicy.playlist,
  );
  const { playPlaylist } = useMusicQueue();
  const api = useApi();
  const [currentCover, setCurrentCover] = useState(playlistCover);
  useEffect(() => {
    const controller = new AbortController();
    setCurrentCover(playlistCover);
    void api.get<{ cover: string }>('Library/playlists/' + encodeURIComponent(playlistId) + '/artwork', { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted && response.data.cover) setCurrentCover(response.data.cover); }).catch(() => undefined);
    return () => controller.abort();
  }, [api, playlistId, playlistCover, recordings]);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>(
    []
  );
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [contextMenuOptions, setContextMenuOptions] = useState(menuOptions);

  const FirstPlaylistEntryIndex = 0;
  const handlePlayFromRecording = useCallback((recordingIndex: number) => {
    void playPlaylist(playlistId, recordingIndex, recordings[recordingIndex]?.id);
    navigation.navigate('Playing', {});
  }, [playlistId, recordings, playPlaylist, navigation]);
  const handlePlayPlaylist = useCallback(() => handlePlayFromRecording(FirstPlaylistEntryIndex), [handlePlayFromRecording]);

  const handlePlaylistMore = useCallback((event: any) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setContextMenuOptions([
      { label: 'Smart shuffle', icon: () => null, onClick: () => navigation.navigate(RecommendationRoutes.screen, { mode: RecommendationModes.smartShuffle, playlistId }) },
      { label: 'Playlist radio', icon: () => null, onClick: () => navigation.navigate(RecommendationRoutes.screen, { mode: RecommendationModes.playlistRadio, playlistId }) },
      ...(isOwner ? [{
      label: 'Edit Playlist',
      icon: () => null,
      onClick: () => navigation.navigate('CreatePlaylist', { playlistId, initialName: playlistTitle }),
    }] : [])] as any);
    setMenuVisible(true);
  }, [isOwner, navigation, playlistId, playlistTitle]);

  const handleSongMorePress = useCallback((event: any, recording: Recording) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });

    let options = [...menuOptions];
    if (isOwner) {
      options = options.filter(o => o.label !== 'Add to playlist');
      options.push({
        label: 'Add to another playlist',
        icon: menuOptions.find(o => o.label === 'Add to playlist')?.icon || (() => null),
        onClick: (nav: any, params: any) => {
          menuOptions.find(o => o.label === 'Add to playlist')?.onClick(nav, params);
        },
      });
      options.push({
        label: 'Remove from playlist',
        icon: () => null,
        onClick: async () => {
          try {
            setMutationError(null);
            await api.delete(`library/playlists/${playlistId}/recordings/${recording.id}`);
            notifyLibraryChanged();
          } catch {
            setMutationError(PlaylistMessages.removeFailed);
          }
        },
      });
    }
    setContextMenuOptions(options);
    setMenuVisible(true);
    setSelectedRecordingIds([recording.id]);
    setSelectedRecording(recording);
  }, [isOwner, api, playlistId]);

  return (
    <>
      <CollectionViewer
        navigation={navigation}
        title={playlistTitle}
        subtitle={playlistOwner}
        cover={currentCover}
        songs={recordings}
        onPlay={handlePlayPlaylist}
        onMorePress={handlePlaylistMore}
        onSongPlay={handlePlayFromRecording}
        onSongMorePress={handleSongMorePress}
        isLoading={loading}
        errorMessage={mutationError ?? error}
        onRetry={error ? retry : undefined}
        onEndReached={loadMore}
        emptyMessage="Playlist is empty"
      />
      {menuVisible && (
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          options={contextMenuOptions}
          position={menuPosition}
          navigation={navigation}
          params={{
            recordingIds: selectedRecordingIds,
            songs: recordings.filter(r => selectedRecordingIds.includes(r.id)),
            albumId: selectedRecording?.releaseId || '',
            albumTitle: selectedRecording?.releaseTitle || '',
            albumCover: selectedRecording?.cover || '',
            albumArtist: selectedRecording?.artistName || '',
          }}
        />
      )}
    </>
  );
};

export default PlaylistViewer;

const PlaylistMessages = Object.freeze({ removeFailed: 'The song could not be removed. Try the playlist menu again.' });

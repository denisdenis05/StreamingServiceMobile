import { RecommendationModes, RecommendationRoutes } from '../../services/recommendations/RecommendationContracts';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi.ts';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { Recording } from '../../constants/types.tsx';
import CollectionViewer from '../../components/CollectionViewer';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';
import { useCollectionRecordings, CollectionRecordingPolicy } from '../../hooks/useCollectionRecordings';
import { notifyLibraryChanged } from '../../services/LibraryChanges';
import { useRecommendationPlaylist } from '../../hooks/useRecommendationPlaylist';
import type { RecommendationRequest } from '../../services/recommendations/RecommendationContracts';

const PlaylistViewer = ({ navigation, route }: any) => {
  const { playlistId, playlistTitle, playlistOwner, playlistCover, isOwner } =
    route.params ?? {};
  const request = useMemo(() => route.params?.recommendation?.request ??
    (route.params?.mode ? route.params as RecommendationRequest :
      route.name === RecommendationRoutes.screen ? { mode: RecommendationModes.daily } : undefined), [route.name, route.params]);
  const recommended = useRecommendationPlaylist(request, route.params?.recommendation);
  const saved = useCollectionRecordings(
    playlistId ?? '', CollectionRecordingPolicy.playlist, !request,
  );
  const recordings: Recording[] = request ? (recommended.preview?.page.tracks ?? []).map(track => ({ ...track, cover: track.cover ?? '' })) : saved.recordings;
  const loading = request ? recommended.loading : saved.loading;
  const error = request ? recommended.error : saved.error;
  const title = playlistTitle ?? recommendationTitles[request?.mode ?? ''] ?? 'Recommended playlist';
  const { playPlaylist } = useMusicQueue();
  const api = useApi();
  const [currentCover, setCurrentCover] = useState(playlistCover);
  useEffect(() => {
    const controller = new AbortController();
    setCurrentCover(playlistCover);
    if (request) return () => controller.abort();
    void api.get<{ cover: string }>('Library/playlists/' + encodeURIComponent(playlistId) + '/artwork', { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted && response.data.cover) setCurrentCover(response.data.cover); }).catch(() => undefined);
    return () => controller.abort();
  }, [api, playlistId, playlistCover, saved.recordings, request]);
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
    if (request) {
      void recommended.play(recordingIndex).then(started => { if (started) navigation.navigate('Playing', {}); });
      return;
    }
    void playPlaylist(playlistId, recordingIndex, recordings[recordingIndex]?.id);
    navigation.navigate('Playing', {});
  }, [playlistId, recordings, playPlaylist, navigation, recommended, request]);
  const handlePlayPlaylist = useCallback(() => handlePlayFromRecording(FirstPlaylistEntryIndex), [handlePlayFromRecording]);

  const handlePlaylistMore = useCallback((event: any) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    if (request) {
      setContextMenuOptions([
        ...(!recommended.preview?.savedPlaylistId && recommended.preview?.page.tracks.length && !recommended.saving ? [{ label: 'Save as playlist', icon: () => null, onClick: async () => {
          const result = await recommended.save(title);
          if (result) navigation.navigate('PlaylistViewer', { playlistId: result.id, playlistTitle: result.name, playlistCover: result.cover, playlistOwner: '', isOwner: true });
        } }] : []),
        ...(!recommended.saving ? [{ label: recommended.preview?.dailyVersion ? 'Regenerate today' : 'New selection', icon: () => null,
          onClick: () => recommended.reload(recommended.preview?.dailyVersion ?? undefined) }] : []),
      ] as any);
      setMenuVisible(true);
      return;
    }
    setContextMenuOptions([
      { label: 'Smart shuffle', icon: () => null, onClick: () => navigation.navigate(RecommendationRoutes.screen, { mode: RecommendationModes.smartShuffle, playlistId }) },
      { label: 'Playlist radio', icon: () => null, onClick: () => navigation.navigate(RecommendationRoutes.screen, { mode: RecommendationModes.playlistRadio, playlistId }) },
      ...(isOwner ? [{
      label: 'Edit Playlist',
      icon: () => null,
      onClick: () => navigation.navigate('CreatePlaylist', { playlistId, initialName: playlistTitle }),
    }] : [])] as any);
    setMenuVisible(true);
  }, [isOwner, navigation, playlistId, playlistTitle, recommended, request, title]);

  const handleSongMorePress = useCallback((event: any, recording: Recording) => {
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });

    let options = [...menuOptions];
    if (isOwner && !request) {
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
  }, [isOwner, api, playlistId, request]);

  return (
    <>
      <CollectionViewer
        navigation={navigation}
        title={title}
        subtitle={playlistOwner ?? recommended.preview?.page.explanation ?? ''}
        cover={request ? recommended.preview?.cover ?? playlistCover ?? '' : currentCover}
        songs={recordings}
        onPlay={handlePlayPlaylist}
        onMorePress={handlePlaylistMore}
        onSongPlay={handlePlayFromRecording}
        onSongMorePress={handleSongMorePress}
        isLoading={loading}
        errorMessage={mutationError ?? error}
        onRetry={error ? (request ? () => void recommended.reload() : saved.retry) : undefined}
        onEndReached={request ? undefined : saved.loadMore}
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
const recommendationTitles: Record<string, string> = {
  [RecommendationModes.daily]: "Today's playlist", [RecommendationModes.calm]: 'Take it easy',
  [RecommendationModes.energy]: 'Pick up the pace', [RecommendationModes.instrumental]: 'Mostly instrumental',
  [RecommendationModes.smartShuffle]: 'Smart shuffle', [RecommendationModes.songRadio]: 'Song radio',
  [RecommendationModes.artistRadio]: 'Artist radio', [RecommendationModes.playlistRadio]: 'Playlist radio',
};

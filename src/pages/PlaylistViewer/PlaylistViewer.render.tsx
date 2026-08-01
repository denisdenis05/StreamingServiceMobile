import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi.ts';
import { useAuth } from '../../hooks/AuthContext.tsx';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { Recording } from '../../constants/types.tsx';
import { Track } from 'react-native-track-player';
import {
  TEMPORARY_API_URL,
  PLACEHOLDER_ALBUM_COVER,
} from '../../constants/placeholders.tsx';
import CollectionViewer from '../../components/CollectionViewer';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';
import {
  getRecordingList,
  setRecordingList,
} from '../../services/cache/CacheDatabase';
import { cacheTrack } from '../../services/cache/AudioCacheService';

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

const PlaylistViewer = ({ navigation, route }: any) => {
  const { playlistId, playlistTitle, playlistOwner, playlistCover, isOwner } =
    route.params;
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const { replaceQueue, playTrackAtIndex, queue } = useMusicQueue();
  const [shouldPlayFromStart, setShouldPlayFromStart] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [fetched, setFetched] = useState(false);
  const api = useApi();
  const { token } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>(
    []
  );
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [contextMenuOptions, setContextMenuOptions] = useState(menuOptions);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const cachedEntry = getRecordingList(playlistId, 'playlist');
    if (cachedEntry && cachedEntry.recordings.length > 0) {
      setRecordings(cachedEntry.recordings);
      setFetched(true);
    }

    fetchRecordingsFromServer(1);
  }, []);

  useEffect(() => {
    if (recordings.length > 0 && token) {
      const firstRecording = recordings[0];
      const streamUrl = `${TEMPORARY_API_URL}Stream?id=${firstRecording.id}`;
      cacheTrack(streamUrl, { Authorization: `Bearer ${token}` }).catch(() => { });
    }
  }, [recordings, token]);

  const fetchRecordingsFromServer = useCallback((pageNumber: number) => {
    if (pageNumber === 1) setFetched(false);
    else setIsLoadingMore(true);

    api
      .get(`Library/playlists/${playlistId}/recordings?page=${pageNumber}&pageSize=${PAGE_SIZE}`)
      .then(res => {
        const freshRecordings: Recording[] = res.data;

        if (pageNumber === 1) {
          const cachedEntry = getRecordingList(playlistId, 'playlist');
          if (!cachedEntry || !recordingListsAreEqual(cachedEntry.recordings, freshRecordings)) {
            setRecordings(freshRecordings);
            setRecordingList(playlistId, 'playlist', freshRecordings);
          }
        } else {
          setRecordings(previous => {
            const combined = [...previous, ...freshRecordings];
            setRecordingList(playlistId, 'playlist', combined);
            return combined;
          });
        }

        if (freshRecordings.length < PAGE_SIZE) setHasMore(false);
        setFetched(true);
        setIsLoadingMore(false);
      })
      .catch(err => {
        console.error('Failed to fetch playlist recordings:', err);
        setFetched(true);
        setIsLoadingMore(false);
      });
  }, [api, playlistId]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRecordingsFromServer(nextPage);
  }, [hasMore, isLoadingMore, page, fetchRecordingsFromServer]);

  useEffect(() => {
    if (shouldPlayFromStart) {
      playTrackAtIndex(startIndex);
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const handlePlayPlaylist = useCallback(() => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${TEMPORARY_API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      releaseId: recording.releaseId || '',
      mediaId: recording.id,
      artwork: recording.cover || PLACEHOLDER_ALBUM_COVER,
      headers: { Authorization: `Bearer ${token}` },
      playlistId: playlistId,
      isLiked: recording.isLiked,
    }));
    setStartIndex(0);
    replaceQueue(tracks);
    setShouldPlayFromStart(true);
    navigation.navigate('Playing', {});
  }, [recordings, token, playlistId, replaceQueue, navigation]);

  const handlePlayFromRecording = useCallback((recordingIndex: number) => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${TEMPORARY_API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      releaseId: recording.releaseId || '',
      mediaId: recording.id,
      artwork: recording.cover || PLACEHOLDER_ALBUM_COVER,
      headers: { Authorization: `Bearer ${token}` },
      playlistId: playlistId,
      isLiked: recording.isLiked,
    }));
    setStartIndex(recordingIndex);
    replaceQueue(tracks);
    setShouldPlayFromStart(true);
    navigation.navigate('Playing', {});
  }, [recordings, token, playlistId, replaceQueue, navigation]);

  const handlePlaylistMore = useCallback((event: any) => {
    if (!isOwner) return;
    setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    setContextMenuOptions([{
      label: 'Edit Playlist',
      icon: () => null,
      onClick: () => navigation.navigate('CreatePlaylist', { playlistId, initialName: playlistTitle }),
    }] as any);
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
            await api.delete(`library/playlists/${playlistId}/recordings/${recording.id}`);
            setRecordings(previous => {
              const updated = previous.filter(r => r.id !== recording.id);
              setRecordingList(playlistId, 'playlist', updated);
              return updated;
            });
          } catch (err) {
            console.error('Failed to remove song from playlist:', err);
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
        cover={playlistCover}
        songs={recordings}
        onPlay={handlePlayPlaylist}
        onMorePress={isOwner ? handlePlaylistMore : undefined}
        onSongPlay={handlePlayFromRecording}
        onSongMorePress={handleSongMorePress}
        isLoading={!fetched || isLoadingMore}
        onEndReached={handleLoadMore}
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

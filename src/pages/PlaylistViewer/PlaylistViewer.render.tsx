import React, { useEffect, useState } from 'react';
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
  const [contextMenuOptions, setContextMenuOptions] = useState(menuOptions);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  const fetchRecordings = (pageNum: number) => {
    if (pageNum === 1) setFetched(false);
    else setIsLoadingMore(true);

    api
      .get(`Library/playlists/${playlistId}/recordings?page=${pageNum}&pageSize=${PAGE_SIZE}`)
      .then(res => {
        const newRecordings = res.data;
        if (pageNum === 1) {
          setRecordings(newRecordings);
        } else {
          setRecordings(prev => [...prev, ...newRecordings]);
        }

        if (newRecordings.length < PAGE_SIZE) {
          setHasMore(false);
        }

        setFetched(true);
        setIsLoadingMore(false);
      })
      .catch(err => {
        console.error('Failed to fetch playlist recordings:', err);
        setFetched(true);
        setIsLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchRecordings(1);
  }, []);

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchRecordings(nextPage);
  };

  useEffect(() => {
    if (shouldPlayFromStart) {
      playTrackAtIndex(startIndex);
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const handlePlayPlaylist = () => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${TEMPORARY_API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
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
  };

  const handlePlayFromRecording = (recordingIndex: number) => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${TEMPORARY_API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
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
  };

  const handlePlaylistMore = (event: any) => {
    if (isOwner) {
      setMenuPosition({
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      });

      const options = [
        {
          label: 'Edit Playlist',
          icon: () => null,
          onClick: () =>
            navigation.navigate('CreatePlaylist', {
              playlistId,
              initialName: playlistTitle,
            }),
        },
      ];
      setContextMenuOptions(options as any);
      setMenuVisible(true);
    }
  };

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
        onSongMorePress={(event: any, recording: Recording) => {
          setMenuPosition({
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          });

          let options = [...menuOptions];
          if (isOwner) {
            options = options.filter(o => o.label !== 'Add to playlist');
            options.push({
              label: 'Add to another playlist',
              icon:
                menuOptions.find(o => o.label === 'Add to playlist')?.icon ||
                (() => null),
              onClick: (nav, params) => {
                menuOptions
                  .find(o => o.label === 'Add to playlist')
                  ?.onClick(nav, params);
              },
            });
            options.push({
              label: 'Remove from playlist',
              icon: () => null,
              onClick: async () => {
                try {
                  await api.delete(
                    `library/playlists/${playlistId}/recordings/${recording.id}`
                  );
                  setRecordings(prev =>
                    prev.filter(r => r.id !== recording.id)
                  );
                } catch (err) {
                  console.error('Failed to remove song from playlist:', err);
                }
              },
            });
          }
          setContextMenuOptions(options);
          setMenuVisible(true);
          setSelectedRecordingIds([recording.id]);
        }}
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
            songs: recordings.filter(r => selectedRecordingIds.includes(r.id))
          }}
        />
      )}
    </>
  );
};

export default PlaylistViewer;

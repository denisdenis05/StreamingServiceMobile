import CollectionViewer from '../../components/CollectionViewer';
import {
  PLACEHOLDER_ALBUM_COVER,
  TEMPORARY_API_URL,
} from '../../constants/placeholders.tsx';
import { useEffect, useState } from 'react';
import { Recording } from '../../constants/types.tsx';
import { Track } from 'react-native-track-player';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { useApi } from '../../hooks/useApi.ts';
import { useAuth } from '../../hooks/AuthContext.tsx';
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
      listA[index].isLiked !== listB[index].isLiked
    ) {
      return false;
    }
  }
  return true;
}

const AlbumViewer = ({ navigation, route }: any) => {
  const { albumId, albumTitle, albumArtist, albumCover } = route.params;
  const [startIndex, setStartIndex] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const { replaceQueue, playTrackAtIndex, queue } = useMusicQueue();
  const [shouldPlayFromStart, setShouldPlayFromStart] = useState(false);
  const [fetched, setFetched] = useState(false);
  const api = useApi();
  const { token } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>(
    []
  );

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
      .catch(err => {
        console.error('Failed to fetch recordings:', err);
        setFetched(true);
      });
  }, []);

  useEffect(() => {
    if (recordings.length > 0 && token) {
      const firstRecording = recordings[0];
      const streamUrl = `${TEMPORARY_API_URL}Stream?id=${firstRecording.id}`;
      cacheTrack(streamUrl, { Authorization: `Bearer ${token}` }).catch(() => { });
    }
  }, [recordings, token]);

  useEffect(() => {
    if (shouldPlayFromStart) {
      playTrackAtIndex(startIndex);
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const handlePlayAlbum = () => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${TEMPORARY_API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      mediaId: recording.id,
      artwork: recording.cover || PLACEHOLDER_ALBUM_COVER,
      headers: { Authorization: `Bearer ${token}` },
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
      isLiked: recording.isLiked,
    }));

    setStartIndex(recordingIndex);
    replaceQueue(tracks);
    setShouldPlayFromStart(true);

    navigation.navigate('Playing', {});
  };

  return (
    <>
      <CollectionViewer
        navigation={navigation}
        title={albumTitle}
        subtitle={albumArtist}
        cover={albumCover}
        songs={recordings}
        onPlay={handlePlayAlbum}
        onMorePress={(event: any) => {
          setMenuPosition({
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          });
          setMenuVisible(true);
          setSelectedRecordingIds(recordings.map(r => r.id));
        }}
        onSongPlay={handlePlayFromRecording}
        onSongMorePress={(event: any, recording: Recording) => {
          setMenuPosition({
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          });
          setMenuVisible(true);
          setSelectedRecordingIds([recording.id]);
        }}
        isLoading={!fetched}
        emptyMessage="Album temporarily unavailable, check again in a few minutes"
      />
      {menuVisible && (
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          options={menuOptions}
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

export default AlbumViewer;

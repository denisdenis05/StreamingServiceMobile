import {
  AlbumCover,
  ContentContainer,
  HeaderContainer,
  RecordingsContainer,
  SongAuthor,
  SongDescriptorContainer,
  SongDetailsContainer,
  SongTitle,
} from './AlbumViewer.style.tsx';
import ArrowLeftIcon from '../../../assets/icons/arrowLeftIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import PlaylistSong from '../../components/PlaylistSong';
import { useEffect, useState } from 'react';
import { Recording } from '../../constants/types.tsx';
import { Track } from 'react-native-track-player';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { HeaderTitle } from '../Home/Home.style.tsx';
import Config from 'react-native-config';
import { useApi } from '../../hooks/useApi.ts';
import { useAuth } from '../../hooks/AuthContext.tsx';
import ContextMenu from '../../components/ContextMenu/ContextMenu.render.tsx';
import { menuOptions } from '../../constants/navigation.tsx';
import MoreIcon from '../../../assets/icons/moreIcon.tsx';

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
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);

  useEffect(() => {
    api
      .get(`Metadata/get-recordings?albumId=${albumId}`)
      .then(res => {
        setRecordings(res.data);
        setFetched(true);
      })
      .catch(err => {
        console.error('Failed to fetch recordings:', err);
      });
  }, []);

  useEffect(() => {
    if (shouldPlayFromStart) {
      playTrackAtIndex(startIndex);
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const handlePlayAlbum = () => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${Config.API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      mediaId: recording.id,
      artwork: recording.cover || PLACEHOLDER_ALBUM_COVER,
      headers: { Authorization: `Bearer ${token}` },
    }));
    setStartIndex(0);
    replaceQueue(tracks);
    setShouldPlayFromStart(true);

    navigation.navigate('Playing', {});
  };

  const handlePlayFromRecording = (recordingIndex: number) => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${Config.API_URL}Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      mediaId: recording.id,
      artwork: recording.cover || PLACEHOLDER_ALBUM_COVER,
      headers: { Authorization: `Bearer ${token}` },
    }));

    setStartIndex(recordingIndex);
    replaceQueue(tracks);
    setShouldPlayFromStart(true);

    navigation.navigate('Playing', {});
  };

  return (
    <ContentContainer>
      <HeaderContainer>
        <ArrowLeftIcon height={25} onPress={navigation.goBack} />
      </HeaderContainer>
      <AlbumCover source={{ uri: albumCover || PLACEHOLDER_ALBUM_COVER }} />
      <SongDetailsContainer>
        <SongDescriptorContainer>
          <SongTitle>{albumTitle}</SongTitle>
          <SongAuthor>{albumArtist}</SongAuthor>
        </SongDescriptorContainer>
        <PlayIcon height={25} onPress={handlePlayAlbum} />
        <MoreIcon
          height={25}
          onPress={(event: any) => {
            setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
            setMenuVisible(true);
            setSelectedRecordingIds(recordings.map(r => r.id));
          }}
        />
      </SongDetailsContainer>
      <RecordingsContainer>
        {recordings.length > 0 ? (
          recordings.map((recording: Recording, index: number) => (
            <PlaylistSong
              key={recording.id.toString()}
              navigation={navigation}
              songId={recording.id}
              songTitle={recording.title}
              songAuthor={recording.artistName}
              albumId={albumId}
              albumTitle={albumTitle}
              albumCover={recording.cover}
              playAction={() => {
                handlePlayFromRecording(index);
              }}
              onMorePress={(event: any) => {
                setMenuPosition({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
                setMenuVisible(true);
                setSelectedRecordingIds([recording.id]);
              }}
            />
          ))
        ) : fetched ? (
          <HeaderTitle>
            Album temporarily unavailable, check again in a few minutes
          </HeaderTitle>
        ) : null}
      </RecordingsContainer>
      {menuVisible && (
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          options={menuOptions}
          position={menuPosition}
          navigation={navigation}
          params={{ recordingIds: selectedRecordingIds }}
        />
      )}
    </ContentContainer>
  );
};

export default AlbumViewer;

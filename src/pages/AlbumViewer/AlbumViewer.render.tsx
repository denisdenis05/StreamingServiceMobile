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
import axios from 'axios';
import { Recording } from '../../constants/types.tsx';
import { Track } from 'react-native-track-player';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { HeaderTitle } from '../Home/Home.style.tsx';
import { API_URL } from '@env';

const AlbumViewer = ({ navigation, route }: any) => {
  const { albumId, albumTitle, albumArtist, albumCover } = route.params;
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const { replaceQueue, playQueueFromStart, queue } = useMusicQueue();
  const [shouldPlayFromStart, setShouldPlayFromStart] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    axios
      .get(`${API_URL}/Metadata/get-recordings?albumId=${albumId}`)
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
      playQueueFromStart();
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const handlePlayAlbum = () => {
    const tracks: Track[] = recordings.map(recording => ({
      id: recording.id,
      url: `${API_URL}/Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      mediaId: recording.id,
      artwork: recording.cover,
    }));
    replaceQueue(tracks);
    setShouldPlayFromStart(true);

    navigation.navigate('Playing', {});
  };

  const handlePlayFromRecording = (recordingIndex: number) => {
    const tracks: Track[] = recordings.slice(recordingIndex).map(recording => ({
      id: recording.id,
      url: `${API_URL}/Stream?id=${recording.id}`,
      title: recording.title,
      artist: recording.artistName,
      album: recording.releaseTitle,
      mediaId: recording.id,
      artwork: recording.cover,
    }));

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
            />
          ))
        ) : fetched ? (
          <HeaderTitle>
            Album temporarily unavailable, check again in a few minutes
          </HeaderTitle>
        ) : null}
      </RecordingsContainer>
    </ContentContainer>
  );
};

export default AlbumViewer;

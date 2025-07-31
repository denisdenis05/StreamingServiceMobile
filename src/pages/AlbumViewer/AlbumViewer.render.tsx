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
import { addTrack, resetQueue } from '../../services/AudioPlayerService.ts';
import PlaylistSong from '../../components/PlaylistSong';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Recording } from '../../constants/types.tsx';
import { play } from 'react-native-track-player/lib/src/trackPlayer';

const AlbumViewer = ({ navigation, route }: any) => {
  const { albumId, albumTitle, albumArtist } = route.params;
  const [recordings, setRecordings] = useState<Recording[]>([]);

  useEffect(() => {
    axios
      .get(
        `http://192.168.1.137:5068/Metadata/get-recordings?albumId=${albumId}`
      )
      .then(res => {
        setRecordings(res.data);
      })
      .catch(err => {
        console.error('Failed to fetch recordings:', err);
      });
  }, []);

  const handlePlayAlbum = () => {
    recordings.forEach(recording => {
      resetQueue();
      addTrack({
        id: 'audio1',
        url: `http://192.168.1.137:5068/Stream?id=${recording.id}`,
        title: recording.title,
        artist: recording.artistName,
        album: recording.releaseTitle,
        mediaId: recording.id,
        artwork: PLACEHOLDER_ALBUM_COVER,
      });
      play();
    });

    navigation.navigate('Playing', {});
  };

  return (
    <ContentContainer>
      <HeaderContainer>
        <ArrowLeftIcon height={25} onPress={navigation.goBack} />
      </HeaderContainer>
      <AlbumCover source={{ uri: PLACEHOLDER_ALBUM_COVER }} />
      <SongDetailsContainer>
        <SongDescriptorContainer>
          <SongTitle>{albumTitle}</SongTitle>
          <SongAuthor>{albumArtist}</SongAuthor>
        </SongDescriptorContainer>
        <PlayIcon height={25} onPress={handlePlayAlbum} />
      </SongDetailsContainer>
      <RecordingsContainer>
        {recordings.map((recording: Recording) => (
          <PlaylistSong
            key={recording.id.toString()}
            navigation={navigation}
            songId={recording.id}
            songTitle={recording.title}
            songAuthor={recording.artistName}
            albumId={albumId}
            albumTitle={albumTitle}
          />
        ))}
      </RecordingsContainer>
    </ContentContainer>
  );
};

export default AlbumViewer;

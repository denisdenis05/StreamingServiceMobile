import {
  CardAuthor,
  CardContainer,
  CardTitle,
  MainContainer,
  MusicCard,
} from './PlaylistSong.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import { useMusicQueue } from '../../../MusicProvider.tsx';
import { useEffect, useState } from 'react';

const PlaylistSong = ({
  navigation,
  songId,
  songTitle,
  songAuthor,
  albumTitle,
}: {
  navigation: any;
  songId: any;
  songTitle: any;
  songAuthor: any;
  albumId: any;
  albumTitle: any;
}) => {
  const { replaceQueue, playQueueFromStart, queue } = useMusicQueue();
  const [shouldPlayFromStart, setShouldPlayFromStart] = useState(false);

  useEffect(() => {
    if (shouldPlayFromStart) {
      playQueueFromStart();
      setShouldPlayFromStart(false);
    }
  }, [queue]);

  const handleCardClick = () => {
    replaceQueue([
      {
        id: 'audio1',
        url: `http://192.168.1.14:5068/Stream?id=${songId}`,
        title: songTitle,
        artist: songAuthor,
        album: albumTitle,
        mediaId: songId,
        artwork: PLACEHOLDER_ALBUM_COVER,
      },
    ]);
    setShouldPlayFromStart(true);
    navigation.navigate('Playing', {});
  };

  return (
    <MainContainer>
      <CardContainer>
        <MusicCard
          onPress={() => {
            handleCardClick();
          }}
        >
          <CardTitle>{songTitle}</CardTitle>
          <CardAuthor>{songAuthor}</CardAuthor>
        </MusicCard>
      </CardContainer>
    </MainContainer>
  );
};

export default PlaylistSong;

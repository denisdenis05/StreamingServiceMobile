import React from 'react';
import {
  AlbumCover,
  CardAuthor,
  CardContainer,
  CardTitle,
  MainContainer,
  MusicCard,
  TextContainer,
} from './PlaylistSong.style.tsx';
import MoreIcon from '../../../assets/icons/moreIcon.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import { colors, iconSizes } from '../../constants/styling.tsx';

const PlaylistSong = React.memo(({
  songTitle,
  songAuthor,
  playAction,
  onMorePress,
  albumCover,
}: {
  navigation: any;
  songId: any;
  songTitle: any;
  songAuthor: any;
  albumId: any;
  albumTitle: any;
  albumCover: string;
  playAction: any;
  onMorePress: (event: any) => void;
}) => {
  return (
    <MainContainer>
      <CardContainer>
        <MusicCard onPress={playAction}>
          <AlbumCover source={{ uri: albumCover || PLACEHOLDER_ALBUM_COVER }} />
          <TextContainer>
            <CardTitle numberOfLines={1}>{songTitle}</CardTitle>
            <CardAuthor numberOfLines={1}>{songAuthor}</CardAuthor>
          </TextContainer>
        </MusicCard>
        <MoreIcon height={iconSizes.sm} onPress={onMorePress} fill={colors.normalText} />
      </CardContainer>
    </MainContainer>
  );
});

export default PlaylistSong;

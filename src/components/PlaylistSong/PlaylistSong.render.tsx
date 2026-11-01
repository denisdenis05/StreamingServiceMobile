import React from 'react';
import { View } from 'react-native';
import HeartIcon from '../../../assets/icons/heartIcon';
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
import { colors, iconSizes } from '../../constants/styling.tsx';

const PlaylistSong = React.memo(({
  isLiked,
  songTitle,
  songAuthor,
  playAction,
  onMorePress,
  albumCover,
  releaseId,
  smallCover,
  verySmallCover,
}: {
  navigation: any;
  songId: any;
  isLiked?: boolean;
  songTitle: any;
  songAuthor: any;
  albumId: any;
  albumTitle: any;
  albumCover: string;
  releaseId?: string;
  smallCover?: string;
  verySmallCover?: string;
  playAction: any;
  onMorePress: (event: any) => void;
}) => {
  return (
    <MainContainer>
      <CardContainer>
        <MusicCard onPress={playAction}>
          <AlbumCover
            releaseId={releaseId}
            cover={albumCover}
            smallCover={smallCover}
            verySmallCover={verySmallCover}
          />
          <TextContainer>
            <CardTitle numberOfLines={1}>{songTitle}</CardTitle>
            <CardAuthor numberOfLines={1}>{songAuthor}</CardAuthor>
          </TextContainer>
        </MusicCard>
        {isLiked && <View accessible accessibilityLabel={PlaylistSongCopy.liked}>
          <HeartIcon height={iconSizes.sm} fill={colors.accentPrimary} />
        </View>}
        <MoreIcon height={iconSizes.sm} onPress={onMorePress} fill={colors.normalText} />
      </CardContainer>
    </MainContainer>
  );
});

export default PlaylistSong;

const PlaylistSongCopy = Object.freeze({ liked: 'Liked song' });

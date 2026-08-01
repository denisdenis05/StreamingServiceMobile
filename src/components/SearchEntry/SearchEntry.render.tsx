import React from 'react';
import {
  AlbumCover,
  CardAuthor,
  CardTitle,
  MainContainer,
  MusicCard,
  albumCoverRadius,
  albumCoverSize,
} from './SearchEntry.style.tsx';
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import SkeletonLoader from '../SkeletonLoader/SkeletonLoader.tsx';
import { View } from 'react-native';

import MoreIcon from '../../../assets/icons/moreIcon.tsx';
import { colors, iconSizes, typography } from '../../constants/styling.tsx';

const SearchEntry = React.memo(({
  songTitle,
  songAuthor,
  albumCover,
  onPressAction,
  onMorePress,
}: {
  songTitle: any;
  songAuthor: any;
  albumCover: string;
  onPressAction: any;
  onMorePress?: (event: any) => void;
}) => {
  return (
    <MainContainer>
      <AlbumCover source={{ uri: albumCover || PLACEHOLDER_ALBUM_COVER }} />
      <MusicCard
        onPress={() => {
          onPressAction();
        }}
      >
        <CardTitle>{songTitle}</CardTitle>
        <CardAuthor>{songAuthor}</CardAuthor>
      </MusicCard>
      {onMorePress && <MoreIcon height={iconSizes.sm} onPress={onMorePress} fill={colors.normalText} />}
    </MainContainer>
  );
});

export default SearchEntry;

export const SearchEntrySkeleton = () => {
  return (
    <MainContainer>
      <SkeletonLoader width={albumCoverSize} height={albumCoverSize} borderRadius={albumCoverRadius} />
      <View style={{ flex: 1, gap: 5, justifyContent: 'center' }}>
        <SkeletonLoader width={150} height={typography.itemTitle} />
        <SkeletonLoader width={100} height={typography.secondary} />
      </View>
    </MainContainer>
  );
};

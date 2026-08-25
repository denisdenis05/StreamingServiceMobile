import React from 'react';
import { View } from 'react-native';
import { colors, iconSizes } from '../../constants/styling.tsx';
import {
  ActionsContainer,
  AlbumCover,
  ContentContainer,
  ControlsContainer,
  HeaderContainer,
  LineContainer,
  RecordingsContainer,
  MainScrollContainer,
  SongAuthor,
  SongDescriptorContainer,
  SongDetailsContainer,
  SongTitle,
} from './CollectionViewer.style.tsx';
import ArrowLeftIcon from '../../../assets/icons/arrowLeftIcon.tsx';
import PlayIcon from '../../../assets/icons/playIcon.tsx';
import PlaylistSong from '../PlaylistSong';
import MoreIcon from '../../../assets/icons/moreIcon.tsx';
import DownloadIcon from '../../../assets/icons/downloadIcon.tsx';
import { HeaderTitle } from '../../pages/Home/Home.style.tsx';
import { Recording } from '../../constants/types.tsx';
import PlayingOverlay from '../PlayingOverlay';
import { useMusicQueue } from '../../../MusicProvider.tsx';

interface CollectionViewerProps {
  navigation: any;
  title: string;
  subtitle: string;
  cover: string;
  releaseId?: string;
  smallCover?: string;
  verySmallCover?: string;
  songs: Recording[];
  onPlay: () => void;
  onMorePress?: (event: any) => void;
  onSongPlay: (index: number) => void;
  onSongMorePress: (event: any, song: Recording) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  onEndReached?: () => void;
}

const CollectionViewer: React.FC<CollectionViewerProps> = ({
  navigation,
  title,
  subtitle,
  cover,
  releaseId,
  smallCover,
  verySmallCover,
  songs,
  onPlay,
  onMorePress,
  onSongPlay,
  onSongMorePress,
  isLoading,
  emptyMessage = 'Collection temporarily unavailable',
  onEndReached,
}) => {
  const { queueLength } = useMusicQueue();
  const hasPlayingOverlay = queueLength > 0;

  const handleScroll = ({ nativeEvent }: any) => {
    if (!onEndReached) return;

    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const paddingToBottom = 200;

    if (
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom
    ) {
      onEndReached();
    }
  };

  return (
    <ContentContainer>
      <MainScrollContainer onScroll={handleScroll} scrollEventThrottle={400}>
        <HeaderContainer>
          <ArrowLeftIcon height={iconSizes.md} onPress={navigation.goBack} fill={colors.normalText} />
        </HeaderContainer>
        <AlbumCover
            releaseId={releaseId}
            cover={cover}
            smallCover={smallCover}
            verySmallCover={verySmallCover}
          />
        <SongDetailsContainer>
          <SongDescriptorContainer>
            <SongTitle>{title}</SongTitle>
            <SongAuthor>{subtitle}</SongAuthor>
          </SongDescriptorContainer>
        </SongDetailsContainer>
        <LineContainer>
          <ActionsContainer>
            <DownloadIcon height={iconSizes.sm} fill={colors.normalText} />
          </ActionsContainer>
          <ControlsContainer>
            {onMorePress && <MoreIcon height={iconSizes.sm} onPress={onMorePress} fill={colors.normalText} />}
            <PlayIcon height={iconSizes.sm} onPress={onPlay} fill={colors.accentPrimary} />
          </ControlsContainer>
        </LineContainer>
        <RecordingsContainer>
          {songs.length > 0 ? (
            songs.map((recording: Recording, index: number) => (
              <PlaylistSong
                key={recording.id.toString()}
                navigation={navigation}
                songId={recording.id}
                songTitle={recording.title}
                songAuthor={recording.artistName}
                albumId={''}
                albumTitle={recording.releaseTitle}
                albumCover={recording.cover}
                releaseId={recording.releaseId}
                smallCover={recording.smallCover}
                verySmallCover={recording.verySmallCover}
                playAction={() => onSongPlay(index)}
                onMorePress={(event: any) => onSongMorePress(event, recording)}
              />
            ))
          ) : !isLoading ? (
            <SongTitle>{emptyMessage}</SongTitle>
          ) : null}
          {isLoading && songs.length > 0 && (
            <SongTitle>Loading more...</SongTitle>
          )}
        </RecordingsContainer>
        {hasPlayingOverlay && <View style={{ height: 90 }} />}
      </MainScrollContainer>
      {hasPlayingOverlay && <PlayingOverlay navigation={navigation} bottomOffset={20} />}
    </ContentContainer>
  );
};

export default CollectionViewer;

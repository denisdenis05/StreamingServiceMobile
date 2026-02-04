import React, { useState } from 'react';
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
import { PLACEHOLDER_ALBUM_COVER } from '../../constants/placeholders.tsx';
import PlaylistSong from '../PlaylistSong';
import MoreIcon from '../../../assets/icons/moreIcon.tsx';
import DownloadIcon from '../../../assets/icons/downloadIcon.tsx';
import { HeaderTitle } from '../../pages/Home/Home.style.tsx';
import { Recording } from '../../constants/types.tsx';

interface CollectionViewerProps {
  navigation: any;
  title: string;
  subtitle: string;
  cover: string;
  songs: Recording[];
  onPlay: () => void;
  onMorePress?: (event: any) => void;
  onSongPlay: (index: number) => void;
  onSongMorePress: (event: any, song: Recording) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

const CollectionViewer: React.FC<CollectionViewerProps> = ({
  navigation,
  title,
  subtitle,
  cover,
  songs,
  onPlay,
  onMorePress,
  onSongPlay,
  onSongMorePress,
  isLoading,
  emptyMessage = 'Collection temporarily unavailable',
}) => {
  return (
    <ContentContainer>
      <MainScrollContainer>
        <HeaderContainer>
          <ArrowLeftIcon height={15} onPress={navigation.goBack} />
        </HeaderContainer>
        <AlbumCover source={{ uri: cover || PLACEHOLDER_ALBUM_COVER }} />
        <SongDetailsContainer>
          <SongDescriptorContainer>
            <SongTitle>{title}</SongTitle>
            <SongAuthor>{subtitle}</SongAuthor>
          </SongDescriptorContainer>
        </SongDetailsContainer>
        <LineContainer>
          <ActionsContainer>
            <DownloadIcon height={15} />
          </ActionsContainer>
          <ControlsContainer>
            {onMorePress && <MoreIcon height={15} onPress={onMorePress} />}
            <PlayIcon height={15} onPress={onPlay} />
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
                playAction={() => onSongPlay(index)}
                onMorePress={(event: any) => onSongMorePress(event, recording)}
              />
            ))
          ) : !isLoading ? (
            <HeaderTitle>{emptyMessage}</HeaderTitle>
          ) : null}
        </RecordingsContainer>
      </MainScrollContainer>
    </ContentContainer>
  );
};

export default CollectionViewer;

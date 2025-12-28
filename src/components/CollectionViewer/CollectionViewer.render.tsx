import React, { useState } from 'react';
import {
  AlbumCover,
  ContentContainer,
  ControlsContainer,
  HeaderContainer,
  RecordingsContainer,
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
      <HeaderContainer>
        <ArrowLeftIcon height={25} onPress={navigation.goBack} />
      </HeaderContainer>
      <AlbumCover source={{ uri: cover || PLACEHOLDER_ALBUM_COVER }} />
      <SongDetailsContainer>
        <SongDescriptorContainer>
          <SongTitle>{title}</SongTitle>
          <SongAuthor>{subtitle}</SongAuthor>
        </SongDescriptorContainer>
        <ControlsContainer>
          {onMorePress && <MoreIcon height={25} onPress={onMorePress} />}
          <PlayIcon height={25} onPress={onPlay} />
        </ControlsContainer>
      </SongDetailsContainer>
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
    </ContentContainer>
  );
};

export default CollectionViewer;

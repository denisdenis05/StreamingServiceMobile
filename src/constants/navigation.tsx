import HomeIcon from '../../assets/icons/homeIcon.tsx';
import SearchIcon from '../../assets/icons/searchIcon.tsx';
import LibraryIcon from '../../assets/icons/libraryIcon.tsx';
import CreateIcon from '../../assets/icons/createIcon.tsx';

import MusicNoteIcon from '../../assets/icons/musicNoteIcon.tsx';

type NavLabel = 'Home' | 'Search' | 'Library' | 'Create';

export interface NavigationButton {
  label: NavLabel;
  icon: React.ComponentType<{ height: number; fill?: string }>;
}

export interface ActionItem {
  label: string;
  icon: React.ComponentType<{ height: number }>;
  onClick: (navigation: any, params?: any) => void;
}

export const navigationButtons: NavigationButton[] = [
  { label: 'Home', icon: HomeIcon },
  { label: 'Search', icon: SearchIcon },
  { label: 'Library', icon: LibraryIcon },
  { label: 'Create', icon: CreateIcon },
];

export const createActionButtons: ActionItem[] = [
  {
    label: 'Create a Playlist',
    icon: MusicNoteIcon,
    onClick: navigation => {
      navigation.navigate('CreatePlaylist');
    },
  },
];

export const menuOptions: ActionItem[] = [
  {
    label: 'Add to playlist',
    icon: MusicNoteIcon,
    onClick: (navigation, params) => {
      navigation.navigate('AddToPlaylist', {
        recordingIds: params?.recordingIds || [],
        songs: params?.songs || []
      });
    },
  },
  {
    label: 'Go to album',
    icon: LibraryIcon,
    onClick: (navigation, params) => {
      if (params?.albumId) {
        const albumParams = {
          albumId: params.albumId,
          albumTitle: params?.albumTitle || '',
          albumCover: params?.albumCover || '',
          albumArtist: params?.albumArtist || '',
        };
        const currentRoute = navigation.getState()?.routes?.slice(-1)[0];
        if (currentRoute?.name === 'AlbumViewer') {
          navigation.replace('AlbumViewer', albumParams);
        } else {
          navigation.navigate('AlbumViewer', albumParams);
        }
      }
    },
  },
];

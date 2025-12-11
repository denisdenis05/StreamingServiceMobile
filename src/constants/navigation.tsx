import HomeIcon from '../../assets/icons/homeIcon.tsx';
import SearchIcon from '../../assets/icons/searchIcon.tsx';
import LibraryIcon from '../../assets/icons/libraryIcon.tsx';
import CreateIcon from '../../assets/icons/createIcon.tsx';

import MusicNoteIcon from '../../assets/icons/musicNoteIcon.tsx';

type NavLabel = 'Home' | 'Search' | 'Library' | 'Create';

export interface NavigationButton {
  label: NavLabel;
  icon: React.ComponentType<{ height: number }>;
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
      navigation.navigate('AddToPlaylist', { recordingIds: params?.recordingIds || [] });
    },
  },
];

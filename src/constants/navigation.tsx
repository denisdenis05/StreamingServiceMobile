import HomeIcon from '../../assets/icons/homeIcon.tsx';
import SearchIcon from '../../assets/icons/searchIcon.tsx';
import LibraryIcon from '../../assets/icons/libraryIcon.tsx';
import CreateIcon from '../../assets/icons/createIcon.tsx';

type NavLabel = 'Home' | 'Search' | 'Library' | 'Create';

export interface NavigationButton {
  label: NavLabel;
  icon: React.ComponentType<{ height: number }>;
}

export const navigationButtons: NavigationButton[] = [
  { label: 'Home', icon: HomeIcon },
  { label: 'Search', icon: SearchIcon },
  { label: 'Library', icon: LibraryIcon },
  { label: 'Create', icon: CreateIcon },
];

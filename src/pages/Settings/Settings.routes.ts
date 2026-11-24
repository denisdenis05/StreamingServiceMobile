export const SettingsRoutes = Object.freeze({
  main: 'Settings',
  account: 'AccountSettings',
  lastFm: 'LastFmSettings',
  spotify: 'SpotifySettings',
  likedSongs: 'LikedSongsSettings',
  playback: 'PlaybackSettings',
  storage: 'StorageSettings',
  about: 'AboutSettings',
  library: 'Library',
});
export interface SettingsNavigation {
  navigate(route: string): void;
  goBack(): void;
}

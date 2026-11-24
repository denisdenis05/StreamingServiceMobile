import ArtistPage from './src/pages/Artist/Artist.render';
import { ArtistRoutes } from './src/pages/Artist/ArtistNavigation';
import React, { useCallback, useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppState, StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Home from './src/pages/Home';
import { RecommendationRoutes } from './src/services/recommendations/RecommendationContracts';
import Playing from './src/pages/Playing';
import AlbumViewer from './src/pages/AlbumViewer';
import Search from './src/pages/Search';
import Login from './src/pages/Login';
import DefaultText from './src/components/DefaultText';
import { setupPlayer } from './src/services/AudioPlayerService.ts';
import { MusicProvider } from './MusicProvider.tsx';
import { AuthProvider, useAuth } from './src/hooks/AuthContext.tsx';
import DeepLinkHandler, { DeepLinkEvents } from './src/services/DeepLinkHandler.ts';
import { colors } from './src/constants/styling.tsx';
import Profile from './src/pages/Profile';
import CreatePlaylist from './src/pages/CreatePlaylist';
import AddToPlaylist from './src/pages/AddToPlaylist';
import Library from './src/pages/Library/Library.render.tsx';
import PlaylistViewer from './src/pages/PlaylistViewer/PlaylistViewer.render.tsx';
import SpotifyJam from './src/pages/SpotifyJam/SpotifyJam.render';
import { SpotifyJamRoute } from './src/pages/SpotifyJam/SpotifyJam.copy';
import { spotifyMobile } from './src/services/SpotifyMobileService';
import { SpotifyAuthorizationNavigation } from './src/services/spotify/SpotifyAuthorizationNavigation';

import Settings from './src/pages/Settings/Settings.render';
import LikedSongsSettings from './src/pages/Settings/LikedSongsSettings.render';
import SpotifySettings from './src/pages/Settings/SpotifySettings.render';
import LastFmSettings from './src/pages/Settings/LastFmSettings.render';
import AboutSettings from './src/pages/Settings/AboutSettings.render';
import AccountSettings from './src/pages/Settings/AccountSettings.render';
import PlaybackSettings from './src/pages/Settings/PlaybackSettings.render';
import StorageSettings from './src/pages/Settings/StorageSettings.render';
import { SettingsRoutes } from './src/pages/Settings/Settings.routes';
import { lastFmSettings } from './src/services/settings/SettingsRuntime';

const Stack = createNativeStackNavigator();

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    alignSelf: 'center',
    maxWidth: '85%',
    shadowColor: '#2A2420',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
  },
  title: {
    color: colors.normalText,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  message: {
    color: colors.slightlyTransparentText,
    marginTop: 2,
    fontSize: 12,
    textAlign: 'center',
  },
});

export const CustomToast = ({ text1, text2 }: any) => (
  <View style={styles.container}>
    {text1 && <DefaultText style={styles.title}>{text1}</DefaultText>}
    {text2 && <DefaultText style={styles.message}>{text2}</DefaultText>}
  </View>
);

// --- Inner app component, hooks safe here ---
const InnerApp = () => {
  const { isLoggedIn, isRestored, accountIdentifier } = useAuth();
  const authorizationNavigation = useRef<SpotifyAuthorizationNavigation | null>(null);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  if (authorizationNavigation.current === null) authorizationNavigation.current = new SpotifyAuthorizationNavigation(
    () => navigationRef.current?.navigate(SpotifyJamRoute as never));
  const showResumedAuthorization = useCallback(() => {
    authorizationNavigation.current?.update(spotifyMobile.getSnapshot().authenticationAction,
      navigationRef.current?.isReady() === true, isLoggedIn && isRestored);
  }, [isLoggedIn, isRestored]);
  useEffect(() => {
    showResumedAuthorization();
    return spotifyMobile.subscribe(showResumedAuthorization);
  }, [showResumedAuthorization]);

  useEffect(() => {
    lastFmSettings.setAccount(isLoggedIn ? accountIdentifier : null);
    return () => lastFmSettings.setAccount(null);
  }, [accountIdentifier, isLoggedIn]);

  useEffect(() => {
    const ActiveApplicationState = 'active';
    const ApplicationStateChangeEvent = 'change';
    const PlayingRoute = 'Playing';
    const unsubscribe = DeepLinkHandler.addListener((eventType, eventData) => {
      if (eventType === DeepLinkEvents.lastFmCallback) void lastFmSettings.complete(eventData.token);
      if (eventType === DeepLinkEvents.lastFmFailure) lastFmSettings.authorizationFailed();
      if (eventType === DeepLinkEvents.notification) navigationRef.current?.navigate(PlayingRoute as never);
    });
    const applicationListener = AppState.addEventListener(ApplicationStateChangeEvent, applicationState => {
      if (applicationState === ActiveApplicationState) void lastFmSettings.refresh();
    });
    return () => { unsubscribe(); applicationListener.remove(); };
  }, []);

  const PlayerStartupFailureMessage = 'Audio player initialization failed.';
  useEffect(() => {
    void setupPlayer().catch(() => console.warn(PlayerStartupFailureMessage));
  }, []);

  const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={Login} />
    </Stack.Navigator>
  );

  const MainStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name={RecommendationRoutes.screen} component={PlaylistViewer} />
      <Stack.Screen name="Search" component={Search} />
      <Stack.Screen name={ArtistRoutes.screen} component={ArtistPage} />
      <Stack.Screen
        name="Playing"
        component={Playing}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="CreatePlaylist"
        component={CreatePlaylist}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="AddToPlaylist"
        component={AddToPlaylist}
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="AlbumViewer"
        component={AlbumViewer}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="PlaylistViewer"
        component={PlaylistViewer}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Library" component={Library} />
      <Stack.Screen name={SpotifyJamRoute} component={SpotifyJam} />
      <Stack.Screen name={SettingsRoutes.main} component={Settings} />
      <Stack.Screen name={SettingsRoutes.likedSongs} component={LikedSongsSettings} />
      <Stack.Screen name={SettingsRoutes.spotify} component={SpotifySettings} />
      <Stack.Screen name={SettingsRoutes.account} component={AccountSettings} />
      <Stack.Screen name={SettingsRoutes.lastFm} component={LastFmSettings} />
      <Stack.Screen name={SettingsRoutes.playback} component={PlaybackSettings} />
      <Stack.Screen name={SettingsRoutes.storage} component={StorageSettings} />
      <Stack.Screen name={SettingsRoutes.about} component={AboutSettings} />

      <Stack.Screen
        name="Profile"
        component={Profile}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );

  return (
    <NavigationContainer ref={navigationRef} onReady={showResumedAuthorization}>
      {isRestored && (isLoggedIn ? <MainStack /> : <AuthStack />)}
      <Toast config={{ message: CustomToast }} />
    </NavigationContainer>
  );
};

const App = () => (
  <SafeAreaProvider>
    <AuthProvider>
      <MusicProvider>
        <InnerApp />
      </MusicProvider>
    </AuthProvider>
  </SafeAreaProvider>
);

export default App;

import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Home from './src/pages/Home';
import Playing from './src/pages/Playing';
import AlbumViewer from './src/pages/AlbumViewer';
import Search from './src/pages/Search';
import Login from './src/pages/Login';
import DefaultText from './src/components/DefaultText';
import { setupPlayer } from './src/services/AudioPlayerService.ts';
import { MusicProvider } from './MusicProvider.tsx';
import { AuthProvider, useAuth } from './src/hooks/AuthContext.tsx';
import { useApi } from './src/hooks/useApi.ts';
import DeepLinkHandler from './src/services/DeepLinkHandler.ts';
import { colors } from './src/constants/styling.tsx';
import Profile from './src/pages/Profile';
import CreatePlaylist from './src/pages/CreatePlaylist';
import AddToPlaylist from './src/pages/AddToPlaylist';
import Library from './src/pages/Library/Library.render.tsx';
import PlaylistViewer from './src/pages/PlaylistViewer/PlaylistViewer.render.tsx';

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
  const api = useApi();
  const { isLoggedIn } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Deep link listener
  useEffect(() => {
    const unsubscribe = DeepLinkHandler.addListener(async (type, data) => {
      if (type === 'lastfm_callback') {
        const { token } = data;

        try {
          await api.post('lastfm/connect', { token });
        } catch (err) {
          console.error('Failed to register Last.fm account', err);
        }
      } else if (type === 'notification_click') {
        if (navigationRef.current) {
          navigationRef.current.navigate('Playing' as never);
        }
      }
    });

    return () => unsubscribe();
  }, [api]);

  // Initialize player
  useEffect(() => {
    const initializePlayer = async () => {
      try {
        await setupPlayer();
        console.log('Track Player initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Track Player:', error);
      }
    };

    initializePlayer();
  }, []);

  const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={Login} />
    </Stack.Navigator>
  );

  const MainStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="Search" component={Search} />
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
      <Stack.Screen
        name="Profile"
        component={Profile}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );

  return (
    <NavigationContainer ref={navigationRef}>
      {isLoggedIn ? <MainStack /> : <AuthStack />}
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

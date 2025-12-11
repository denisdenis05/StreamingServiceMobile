import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';

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

const Stack = createNativeStackNavigator();

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20,
    borderRadius: 12,
    marginRight: 12,
    alignSelf: 'flex-end',
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    borderColor: colors.normalText,
    borderWidth: 2,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
  },
  message: {
    color: '#fff',
    marginTop: 2,
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
  const api = useApi(); // ✅ safe, inside provider tree
  const { isLoggedIn } = useAuth();

  // Deep link listener
  useEffect(() => {
    const unsubscribe = DeepLinkHandler.addListener(async (type, data) => {
      console.log('baaaaaaaaaaaaaaaaaaaaaaaa');
      console.log(type);
      if (type === 'lastfm_callback') {
        const { token } = data;
        console.log('Last.fm callback token:', token);

        try {
          await api.post('lastfm/connect', { token });
        } catch (err) {
          console.error('Failed to register Last.fm account', err);
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
        name="AlbumViewer"
        component={AlbumViewer}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Profile"
        component={Profile}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );

  return (
    <NavigationContainer>
      {isLoggedIn ? <MainStack /> : <AuthStack />}
      <Toast config={{ message: CustomToast }} />
    </NavigationContainer>
  );
};

const App = () => (
  <AuthProvider>
    <MusicProvider>
      <InnerApp />
    </MusicProvider>
  </AuthProvider>
);

export default App;

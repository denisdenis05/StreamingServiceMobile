import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from './src/pages/Home';
import Playing from './src/pages/Playing';
import { setupPlayer } from './src/services/AudioPlayerService.ts';
import AlbumViewer from './src/pages/AlbumViewer';
import { MusicProvider } from './MusicProvider.tsx';
import Search from './src/pages/Search';

const Stack = createNativeStackNavigator();

const App = () => {
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
  return (
    <MusicProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={Home}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Search"
            component={Search}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Playing"
            component={Playing}
            options={{
              presentation: 'modal',
              headerShown: false,
              animation: 'slide_from_bottom',
              gestureEnabled: true,
              gestureDirection: 'vertical',
            }}
          />
          <Stack.Screen
            name="AlbumViewer"
            component={AlbumViewer}
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </MusicProvider>
  );
};

export default App;

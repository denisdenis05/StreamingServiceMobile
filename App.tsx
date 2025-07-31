import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from './src/pages/Home';
import Playing from './src/pages/Playing';
import { setupPlayer } from './src/services/AudioPlayerService.ts';
import AlbumViewer from './src/pages/AlbumViewer';

const Stack = createNativeStackNavigator();

const App = () => {
  useEffect(() => {
    setupPlayer();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={Home}
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
  );
};

export default App;

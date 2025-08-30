import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from './src/pages/Home';
import Playing from './src/pages/Playing';
import { setupPlayer } from './src/services/AudioPlayerService.ts';
import AlbumViewer from './src/pages/AlbumViewer';
import { MusicProvider } from './MusicProvider.tsx';
import Search from './src/pages/Search';
import { AuthProvider, useAuth } from './src/hooks/AuthContext.tsx';
import Login from './src/pages/Login';
import Toast from 'react-native-toast-message';
import { StyleSheet, View } from 'react-native';
import DefaultText from './src/components/DefaultText';
import { colors } from './src/constants/styling.tsx';

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

export const CustomToast = ({ text1, text2 }: any) => {
  return (
    <View style={styles.container}>
      {text1 ? <DefaultText style={styles.title}>{text1}</DefaultText> : null}
      {text2 ? <DefaultText style={styles.message}>{text2}</DefaultText> : null}
    </View>
  );
};

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

  const AppNavigator = () => {
    const { isLoggedIn } = useAuth();

    const AuthStack = () => (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="Login"
          component={Login}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );

    const MainStack = () => (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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
    );

    return isLoggedIn ? <MainStack /> : <AuthStack />;
  };

  return (
    <AuthProvider>
      <MusicProvider>
        <NavigationContainer>
          <AppNavigator />
          <Toast config={{ message: CustomToast }} />
        </NavigationContainer>
      </MusicProvider>
    </AuthProvider>
  );
};

export default App;

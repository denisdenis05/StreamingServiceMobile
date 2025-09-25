import PageContainer from '../../components/PageContainer';
import { ContentContainer, LastFmButton } from './Profile.style.tsx';
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi.ts';
import { Alert, Linking } from 'react-native';

const Profile = ({ navigation, route }: { navigation: any; route: any }) => {
  const [lastFmConnected, setLastFmConnected] = useState(false);
  const [lastFmLoading, setLastFmLoading] = useState(false);
  const api = useApi();

  useEffect(() => {
    checkLastFmStatus();
  }, []);

  const checkLastFmStatus = async () => {
    try {
      const response = await api.get('lastfm/status');
      setLastFmConnected(response.data.connected);
    } catch (error) {
      console.error('Error checking Last.fm status:', error);
    }
  };

  const handleLastFmConnect = async () => {
    if (lastFmConnected) {
      Alert.alert(
        'Last.fm Connected',
        'Your Last.fm account is already connected. Would you like to disconnect?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: handleLastFmDisconnect,
          },
        ]
      );
      return;
    }

    try {
      setLastFmLoading(true);

      const response = await api.get('lastfm/auth-url');
      const { authUrl } = response.data;

      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);

        Alert.alert(
          'Complete Authorization',
          'Please complete the Last.fm authorization in your browser, then return to the app.',
          [
            {
              text: "I've completed authorization",
              onPress: () => {
                // Check status again after user claims they've completed auth
                setTimeout(() => {
                  checkLastFmStatus();
                }, 1000);
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Cannot open Last.fm authorization URL');
      }
    } catch (error) {
      console.error('Error connecting to Last.fm:', error);
      Alert.alert('Error', 'Failed to connect to Last.fm. Please try again.');
    } finally {
      setLastFmLoading(false);
    }
  };

  const handleLastFmDisconnect = async () => {
    try {
      setLastFmLoading(true);
      await api.delete('lastfm/disconnect');
      setLastFmConnected(false);
      Alert.alert('Success', 'Last.fm account disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting Last.fm:', error);
      Alert.alert('Error', 'Failed to disconnect Last.fm account');
    } finally {
      setLastFmLoading(false);
    }
  };

  return (
    <PageContainer>
      <ContentContainer>
        <LastFmButton
          connected={lastFmConnected}
          loading={lastFmLoading}
          onPress={handleLastFmConnect}
        />
      </ContentContainer>
    </PageContainer>
  );
};

export default Profile;

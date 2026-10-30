import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import './src/services/SpotifyIntegration';
import { executeSpotifyBackgroundAuthentication } from './src/services/SpotifyBackgroundAuthenticationHeadless';
import { SpotifyBackgroundAuthenticationPolicy } from './src/services/spotify/SpotifyBackgroundAuthenticationTask';
import { executeSpotifyBackgroundRecording } from './src/services/SpotifyBackgroundRecordingHeadless';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('StreamingServiceSpotifyRecording', () => async data => {
  if (typeof data?.requestIdentifier !== 'string') return;
  await executeSpotifyBackgroundRecording(data.requestIdentifier);
});

AppRegistry.registerHeadlessTask(SpotifyBackgroundAuthenticationPolicy.taskName, () => async taskData => {
  if (typeof taskData?.requestIdentifier !== SpotifyBackgroundAuthenticationPolicy.stringType) return;
  await executeSpotifyBackgroundAuthentication(taskData.requestIdentifier);
});

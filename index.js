import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import './src/services/SpotifyIntegration';
import { executeSpotifyBackgroundRecording } from './src/services/SpotifyBackgroundRecordingHeadless';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('StreamingServiceSpotifyRecording', () => async data => {
  if (typeof data?.requestIdentifier !== 'string') return;
  await executeSpotifyBackgroundRecording(data.requestIdentifier);
});

import { authenticationSession } from './AuthenticationService';
import { SpotifyIntegrationConnection } from './spotify/SpotifyIntegrationConnection';
import { AppState } from 'react-native';

const ApplicationActiveState = 'active';
const ApplicationStateChangeEvent = 'change';

export const spotifyIntegration = new SpotifyIntegrationConnection(authenticationSession);
spotifyIntegration.setActive(AppState.currentState === ApplicationActiveState);
const applicationStateObservation = AppState.addEventListener(ApplicationStateChangeEvent,
  state => spotifyIntegration.setActive(state === ApplicationActiveState));

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
module.hot?.dispose(() => { applicationStateObservation.remove(); spotifyIntegration.dispose(); });

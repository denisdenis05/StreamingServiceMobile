import { NativeModules } from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { SpotifyProofKeyGenerator, SpotifyProofKey } from 'streaming-service-spotify-jam';
import { SpotifyLoginBrowserAdapter } from './spotify/SpotifyLoginBrowser';

interface SpotifyProofKeyNative { generate(): Promise<SpotifyProofKey>; }
const ProofKeyModuleName = 'SpotifyProofKey';
export const spotifyProofKeys: SpotifyProofKeyGenerator = { async generate() {
  const implementation = NativeModules[ProofKeyModuleName] as SpotifyProofKeyNative | undefined;
  if (!implementation) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  return implementation.generate();
} };
export const spotifyLoginBrowser = new SpotifyLoginBrowserAdapter({
  isAvailable: () => InAppBrowser.isAvailable(),
  openAuthorization: (address, redirectAddress) => InAppBrowser.openAuth(address, redirectAddress),
  closeAuthorization: () => InAppBrowser.closeAuth(),
});

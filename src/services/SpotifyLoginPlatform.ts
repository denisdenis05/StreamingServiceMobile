import { Linking, NativeModules, Platform } from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { IntegrationFailure, IntegrationFailureCode, SystemScheduler } from 'streaming-service-spotify-jam';
import type { SpotifyProofKeyGenerator, SpotifyProofKey } from 'streaming-service-spotify-jam';
import { SpotifyLoginBrowserAdapter } from './spotify/SpotifyLoginBrowser';

interface SpotifyProofKeyNative { generate(): Promise<SpotifyProofKey>; }
const ProofKeyModuleName = 'SpotifyProofKey';
export const spotifyProofKeys: SpotifyProofKeyGenerator = { async generate() {
  const implementation = NativeModules[ProofKeyModuleName] as SpotifyProofKeyNative | undefined;
  if (!implementation) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  return implementation.generate();
} };
const BrowserPlatformPolicy = Object.freeze({ android: 'android', urlEvent: 'url', forceCloseOnRedirection: true } as const);
export const spotifyLoginBrowser = new SpotifyLoginBrowserAdapter({
  isAvailable: () => InAppBrowser.isAvailable(),
  openAuthorization: (address, redirectAddress) => Platform.OS === BrowserPlatformPolicy.android
    ? InAppBrowser.open(address, { forceCloseOnRedirection: BrowserPlatformPolicy.forceCloseOnRedirection })
    : InAppBrowser.openAuth(address, redirectAddress),
  closeAuthorization: () => { if (Platform.OS === BrowserPlatformPolicy.android) InAppBrowser.close(); else InAppBrowser.closeAuth(); },
  ...(Platform.OS === BrowserPlatformPolicy.android ? {
    observeRedirects(listener: (address: string) => void) {
      const observation = Linking.addEventListener(BrowserPlatformPolicy.urlEvent, event => listener(event.url));
      return () => observation.remove();
    },
    readInitialAddress: () => Linking.getInitialURL(),
  } : {}),
}, new SystemScheduler());

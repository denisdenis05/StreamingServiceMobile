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
interface SpotifyAuthorizationReturnNative { read(): Promise<string | null>; clear(): Promise<void>; }
const AuthorizationReturnModuleName = 'SpotifyAuthorizationReturn';
function authorizationReturnNative(): SpotifyAuthorizationReturnNative | undefined {
  return NativeModules[AuthorizationReturnModuleName] as SpotifyAuthorizationReturnNative | undefined;
}
export async function readSpotifyAuthorizationReturn(): Promise<string | null> {
  if (Platform.OS === BrowserPlatformPolicy.android) {
    const retained = await authorizationReturnNative()?.read();
    if (retained !== null && retained !== undefined) return retained;
  }
  return Linking.getInitialURL();
}
export const spotifyLoginBrowser = new SpotifyLoginBrowserAdapter({
  isAvailable: () => InAppBrowser.isAvailable(),
  openAuthorization: (address, redirectAddress) => Platform.OS === BrowserPlatformPolicy.android
    ? InAppBrowser.open(address, { forceCloseOnRedirection: BrowserPlatformPolicy.forceCloseOnRedirection })
    : InAppBrowser.openAuth(address, redirectAddress),
  closeAuthorization: () => { if (Platform.OS === BrowserPlatformPolicy.android) InAppBrowser.close(); else InAppBrowser.closeAuth(); },
  ...(Platform.OS === BrowserPlatformPolicy.android ? {
    prepareAuthorization: async () => { await authorizationReturnNative()?.clear(); },
    observeRedirects(listener: (address: string) => void) {
      const observation = Linking.addEventListener(BrowserPlatformPolicy.urlEvent, event => listener(event.url));
      return () => observation.remove();
    },
    readInitialAddress: readSpotifyAuthorizationReturn,
  } : {}),
}, new SystemScheduler());

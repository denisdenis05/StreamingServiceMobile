import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { authenticationSession } from './AuthenticationService';
import { normalizeSpotifyListeningCountry, SpotifyListeningCountryStore } from './spotify/SpotifyListeningCountryStore';

export const SpotifyCountryPlatformPolicy = Object.freeze({
  moduleName: 'SpotifyProofKey',
  storagePrefix: 'spotify-listening-country:',
  defaultRegion: 'US',
  localeRegion: /[-_]([A-Za-z]{2})(?:$|[-_])/,
  firstCapture: 1,
});

export function spotifyDeviceRegion(nativeRegion: string | null, locale: string): string {
  return normalizeSpotifyListeningCountry(nativeRegion)
    || normalizeSpotifyListeningCountry(SpotifyCountryPlatformPolicy.localeRegion.exec(locale)?.[SpotifyCountryPlatformPolicy.firstCapture] ?? null)
    || SpotifyCountryPlatformPolicy.defaultRegion;
}

function deviceRegion(): string {
  let locale: string = SpotifyCountryPlatformPolicy.defaultRegion;
  try { locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch {}
  const native = NativeModules[SpotifyCountryPlatformPolicy.moduleName] as { readonly deviceRegion?: string } | undefined;
  return spotifyDeviceRegion(native?.deviceRegion ?? null, locale);
}

export const spotifyListeningCountry = new SpotifyListeningCountryStore({
  deviceRegion,
  read: accountIdentifier => AsyncStorage.getItem(SpotifyCountryPlatformPolicy.storagePrefix + encodeURIComponent(accountIdentifier)),
  write: (accountIdentifier, country) => AsyncStorage.setItem(SpotifyCountryPlatformPolicy.storagePrefix + encodeURIComponent(accountIdentifier), country),
});

function accountChanged(): void {
  const account = authenticationSession.getSnapshot();
  void spotifyListeningCountry.setAccount(account.isLoggedIn ? account.accountIdentifier : null);
}
const unsubscribe = authenticationSession.subscribe(accountChanged);
accountChanged();

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
module.hot?.dispose(unsubscribe);

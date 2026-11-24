import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { SpotifyConnectNative } from './spotify/SpotifyConnectStore';

const Policy = Object.freeze({ android: 'android', moduleName: 'SpotifyConnectSession', eventName: 'SpotifyConnectSessionEvent' } as const);

export function spotifyConnectNative(): SpotifyConnectNative | null {
  return Platform.OS === Policy.android ? NativeModules[Policy.moduleName] as SpotifyConnectNative | undefined ?? null : null;
}

export function observeSpotifyConnect(listener: (event: unknown) => void): () => void {
  const native = spotifyConnectNative();
  if (native === null) return () => undefined;
  const events = new NativeEventEmitter(native as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]);
  const subscription = events.addListener(Policy.eventName, listener);
  return () => subscription.remove();
}

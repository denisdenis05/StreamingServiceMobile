import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { SpotifyHostingNative } from './spotify/SpotifyHostingStore';
const Policy = Object.freeze({ android: 'android', moduleName: 'SpotifyJamPlayback', eventName: 'SpotifyJamHostingChanged', nativeModuleIndex: 0 } as const);
export function spotifyHostingNative(): SpotifyHostingNative | null {
  return Platform.OS === Policy.android ? NativeModules[Policy.moduleName] as SpotifyHostingNative | undefined ?? null : null;
}
export function observeSpotifyHosting(listener: (event: unknown) => void): () => void {
  const native = spotifyHostingNative();
  if (native === null) return () => undefined;
  const emitter = new NativeEventEmitter(native as unknown as ConstructorParameters<typeof NativeEventEmitter>[typeof Policy.nativeModuleIndex]);
  const subscription = emitter.addListener(Policy.eventName, listener);
  return () => subscription.remove();
}

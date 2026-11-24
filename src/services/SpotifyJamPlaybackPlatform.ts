import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { SpotifyJamPlaybackNative } from './spotify/SpotifyJamPlaybackProtocol';

export const SpotifyJamPlaybackPlatformPolicy = Object.freeze({ android: 'android', moduleName: 'SpotifyJamPlayback',
  eventName: 'SpotifyJamPlaybackChanged', nativeModuleParameterIndex: 0 } as const);

export function spotifyJamPlaybackNative(): SpotifyJamPlaybackNative | null {
  return Platform.OS === SpotifyJamPlaybackPlatformPolicy.android
    ? NativeModules[SpotifyJamPlaybackPlatformPolicy.moduleName] as SpotifyJamPlaybackNative | undefined ?? null : null;
}

export function observeSpotifyJamPlayback(listener: (event: unknown) => void): () => void {
  const native = spotifyJamPlaybackNative();
  if (native === null) return () => undefined;
  const emitter = new NativeEventEmitter(native as unknown as ConstructorParameters<typeof NativeEventEmitter>[typeof SpotifyJamPlaybackPlatformPolicy.nativeModuleParameterIndex]);
  const subscription = emitter.addListener(SpotifyJamPlaybackPlatformPolicy.eventName, listener);
  return () => subscription.remove();
}

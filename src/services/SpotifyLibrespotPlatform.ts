import { NativeModules, Platform } from 'react-native';
import { SpotifyLibrespotAuthentication } from './spotify/SpotifyLibrespotAuthentication';
import type { SpotifyLibrespotNative } from './spotify/SpotifyLibrespotAuthentication';

const PlatformPolicy = Object.freeze({ android: 'android', moduleName: 'SpotifyLibrespotSession',
  requestPrefix: 'librespot-session-', initialSequence: 0, sequenceIncrement: 1 });
let sequence = PlatformPolicy.initialSequence;

export const spotifyLibrespotAuthentication = new SpotifyLibrespotAuthentication({
  native: () => Platform.OS === PlatformPolicy.android ? NativeModules[PlatformPolicy.moduleName] as SpotifyLibrespotNative | undefined ?? null : null,
  nextRequestIdentifier: () => {
    sequence += PlatformPolicy.sequenceIncrement;
    return PlatformPolicy.requestPrefix + sequence;
  },
});

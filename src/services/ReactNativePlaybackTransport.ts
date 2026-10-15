import { NativeEventEmitter, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';
import type { NativePlayerTransport } from 'streaming-service-player';

type PlaybackModule = TurboModule & Omit<NativePlayerTransport, 'subscribe'> & {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};
const PlaybackModuleName = 'StreamingPlayer';
const PlaybackEventName = 'StreamingPlayerStateChanged';
const playbackModule = TurboModuleRegistry.getEnforcing<PlaybackModule>(PlaybackModuleName);
const emitter = new NativeEventEmitter(playbackModule);
export const reactNativePlaybackTransport: NativePlayerTransport = {
  initialize: () => playbackModule.initialize(),
  configureMediaServer: (address, token) => playbackModule.configureMediaServer(address, token),
  clearSession: () => playbackModule.clearSession(),
  registerMediaSource: payload => playbackModule.registerMediaSource(payload),
  releaseMediaSource: identifier => playbackModule.releaseMediaSource(identifier),
  registerMediaCredential: payload => playbackModule.registerMediaCredential(payload),
  updateMediaCredential: (identifier, payload) => playbackModule.updateMediaCredential(identifier, payload),
  releaseMediaCredential: identifier => playbackModule.releaseMediaCredential(identifier),
  executeCommand: payload => playbackModule.executeCommand(payload),
  getSnapshot: () => playbackModule.getSnapshot(),
  subscribe(listener) { const subscription = emitter.addListener(PlaybackEventName, listener); return () => subscription.remove(); },
};

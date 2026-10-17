import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlaybackNativeSessionOwnership, PlaybackNativeSessionReceipt } from './player/PlaybackNativeSessionOwnership';
const PlaybackOwnershipStoragePolicy = Object.freeze({ key: 'streaming.playback.native-owner.v1', valueType: 'string' });
export const playbackNativeSessionStorage: PlaybackNativeSessionOwnership = {
  async read() {
    const serialized = await AsyncStorage.getItem(PlaybackOwnershipStoragePolicy.key);
    if (serialized === null) return null;
    try {
      const receipt = JSON.parse(serialized) as PlaybackNativeSessionReceipt;
      return [receipt.serverAddress, receipt.accountIdentifier, receipt.engineEpoch, receipt.authenticationEpoch]
        .every(value => typeof value === PlaybackOwnershipStoragePolicy.valueType && value.trim()) ? { serverAddress: receipt.serverAddress, accountIdentifier: receipt.accountIdentifier,
          engineEpoch: receipt.engineEpoch, authenticationEpoch: receipt.authenticationEpoch } : null;
    } catch { return null; }
  },
  write: receipt => AsyncStorage.setItem(PlaybackOwnershipStoragePolicy.key, JSON.stringify({ serverAddress: receipt.serverAddress,
    accountIdentifier: receipt.accountIdentifier, engineEpoch: receipt.engineEpoch, authenticationEpoch: receipt.authenticationEpoch })),
  clear: () => AsyncStorage.removeItem(PlaybackOwnershipStoragePolicy.key),
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { RepeatMode } from 'streaming-service-player';
import { TEMPORARY_API_URL } from '../../constants/placeholders';
import { authenticationSession } from '../AuthenticationService';
import { audioRuntime, playbackApplication } from '../NativeAudioRuntime';
import { getAccountAudioCacheDirectory } from '../cache/AudioCacheService';
import {
  clearImageCache,
  getImageCacheDirectory,
} from '../cache/ImageDownloadService';
import { assetIdentity } from '../cache/assets/AssetIdentity';
import { PlaybackSettingsService } from './PlaybackSettingsService';
import { ProfilePreferencesService } from './ProfilePreferencesService';
import { StorageSettingsService } from './StorageSettingsService';
import { directoryStorageBytes } from './StorageStatistics';
const SettingsStoragePolicy = Object.freeze({
  profileKeyPrefix: 'profile-display-name.v1.',
});
function accountIdentifier(): string | null {
  const account = authenticationSession.getSnapshot();
  return account.isLoggedIn ? account.accountIdentifier : null;
}
function profileNameKey(account: string): string {
  return (
    SettingsStoragePolicy.profileKeyPrefix +
    assetIdentity(JSON.stringify([TEMPORARY_API_URL, account]))
  );
}
export const profilePreferences = new ProfilePreferencesService({
  accountIdentifier,
  subscribeAccount: authenticationSession.subscribe,
  readName: account => AsyncStorage.getItem(profileNameKey(account)),
  writeName: (account, displayName) =>
    AsyncStorage.setItem(profileNameKey(account), displayName),
});
export const playbackSettings = new PlaybackSettingsService({
  accountIdentifier,
  read() {
    const snapshot = audioRuntime.state.getSnapshot();
    return {
      ready: playbackApplication.getSnapshot().ready && snapshot !== null,
      shuffled: snapshot?.shuffled ?? false,
      repeatMode: snapshot?.repeatMode ?? RepeatMode.Off,
      externallyControlled:
        snapshot?.externalAuthorityIdentifier !== null &&
        snapshot?.externalAuthorityIdentifier !== undefined,
    };
  },
  subscribe(listener) {
    const subscriptions = [
      authenticationSession.subscribe(listener),
      audioRuntime.state.subscribe(listener),
      playbackApplication.subscribe(listener),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  },
  whenReady: () => playbackApplication.whenReady(),
  refresh: async () => {
    await audioRuntime.state.refresh();
  },
  setShuffle: enabled => audioRuntime.setShuffle(enabled),
  setRepeat: mode => audioRuntime.setRepeat(mode),
});
const StorageFilesystem = Object.freeze({
  exists: RNFS.exists,
  readDirectory: RNFS.readDir,
});
export const storageSettings = new StorageSettingsService({
  accountIdentifier,
  subscribeAccount: authenticationSession.subscribe,
  async read(account) {
    const [imageCacheBytes, audioCacheBytes, filesystem] = await Promise.all([
      directoryStorageBytes(StorageFilesystem, getImageCacheDirectory()),
      directoryStorageBytes(
        StorageFilesystem,
        getAccountAudioCacheDirectory({
          accountIdentifier: account,
          serverAddress: TEMPORARY_API_URL,
        }),
      ),
      RNFS.getFSInfo(),
    ]);
    return {
      imageCacheBytes,
      audioCacheBytes,
      availableBytes: Math.floor(filesystem.freeSpace),
    };
  },
  clearImages: clearImageCache,
});

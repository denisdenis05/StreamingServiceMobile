import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotifyCredentialOwnership } from 'streaming-service-spotify-jam';
import { SpotifySecureCredentialStorage } from './spotify/SpotifySecureCredentialStorage';

const RevocationPolicy = Object.freeze({ keySuffix: '.revoked', revokedValue: 'revoked' });
const AuthorizationStoragePrefix = 'StreamingService.SpotifyAuthorization.';
const LibrespotStoragePrefix = 'StreamingService.SpotifyLibrespot.';
const nativeStorage = {
  async read(service: string) {
    const result = await Keychain.getGenericPassword({ service, cloudSync: false });
    return result === false ? null : { username: result.username, password: result.password };
  },
  async write(service: string, owner: string, serialized: string) {
    return Boolean(await Keychain.setGenericPassword(owner, serialized, { service,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH, cloudSync: false }));
  },
  clear: (service: string) => Keychain.resetGenericPassword({ service, cloudSync: false }),
};
const revocations = {
  isRevoked: async (service: string) => await AsyncStorage.getItem(service + RevocationPolicy.keySuffix) === RevocationPolicy.revokedValue,
  revoke: (service: string) => AsyncStorage.setItem(service + RevocationPolicy.keySuffix, RevocationPolicy.revokedValue),
  allow: (service: string) => AsyncStorage.removeItem(service + RevocationPolicy.keySuffix),
};

export const spotifyCredentialOwnership = new SpotifyCredentialOwnership(new SpotifySecureCredentialStorage(nativeStorage, revocations));
export const spotifyAuthorizationOwnership = new SpotifyCredentialOwnership(new SpotifySecureCredentialStorage(nativeStorage, revocations, AuthorizationStoragePrefix));
export const spotifyLibrespotOwnership = new SpotifyCredentialOwnership(new SpotifySecureCredentialStorage(nativeStorage, revocations, LibrespotStoragePrefix));

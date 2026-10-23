import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotifyCredentialOwnership } from 'streaming-service-spotify-jam';
import { SpotifySecureCredentialStorage } from './spotify/SpotifySecureCredentialStorage';

const RevocationPolicy = Object.freeze({ keySuffix: '.revoked', revokedValue: 'revoked' });
const platformStorage = new SpotifySecureCredentialStorage({
  async read(service) {
    const result = await Keychain.getGenericPassword({ service, cloudSync: false });
    return result === false ? null : { username: result.username, password: result.password };
  },
  async write(service, owner, serialized) {
    return Boolean(await Keychain.setGenericPassword(owner, serialized, { service,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH, cloudSync: false }));
  },
  clear: service => Keychain.resetGenericPassword({ service, cloudSync: false }),
}, {
  isRevoked: async service => await AsyncStorage.getItem(service + RevocationPolicy.keySuffix) === RevocationPolicy.revokedValue,
  revoke: service => AsyncStorage.setItem(service + RevocationPolicy.keySuffix, RevocationPolicy.revokedValue),
  allow: service => AsyncStorage.removeItem(service + RevocationPolicy.keySuffix),
});

export const spotifyCredentialOwnership = new SpotifyCredentialOwnership(platformStorage);

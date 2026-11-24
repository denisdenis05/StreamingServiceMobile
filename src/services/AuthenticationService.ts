import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager from '@react-native-cookies/cookies';
import axios from 'axios';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { ApplicationAuthenticationSession } from './player/ApplicationAuthenticationSession';

export const AuthenticationStoragePolicy = Object.freeze({
  tokenKey: 'auth_token', loggedInKey: 'auth_isLoggedIn', storedTrue: 'true', storedFalse: 'false',
  refreshRoute: 'authentication/refresh-token', authorizationHeader: 'Authorization', bearerPrefix: 'Bearer ',
  timeoutMilliseconds: 15000, failureMessage: 'Authentication storage or refresh failed.',
});
const refreshClient = axios.create({ baseURL: TEMPORARY_API_URL, withCredentials: true,
  timeout: AuthenticationStoragePolicy.timeoutMilliseconds });
export const authenticationSession = new ApplicationAuthenticationSession({
  async read() {
    const [token, loggedIn] = await Promise.all([AsyncStorage.getItem(AuthenticationStoragePolicy.tokenKey),
      AsyncStorage.getItem(AuthenticationStoragePolicy.loggedInKey)]);
    return { token, isLoggedIn: loggedIn === AuthenticationStoragePolicy.storedTrue };
  },
  async write(state) {
    if (state.token === null) await AsyncStorage.removeItem(AuthenticationStoragePolicy.tokenKey);
    else await AsyncStorage.setItem(AuthenticationStoragePolicy.tokenKey, state.token);
    await AsyncStorage.setItem(AuthenticationStoragePolicy.loggedInKey,
      state.isLoggedIn ? AuthenticationStoragePolicy.storedTrue : AuthenticationStoragePolicy.storedFalse);
    if (!state.isLoggedIn) await CookieManager.clearAll();
  },
}, async token => {
  const response = await refreshClient.post<{ token?: string }>(AuthenticationStoragePolicy.refreshRoute, undefined,
    { headers: { [AuthenticationStoragePolicy.authorizationHeader]: AuthenticationStoragePolicy.bearerPrefix + token } });
  return response.data.token ?? null;
}, () => console.warn(AuthenticationStoragePolicy.failureMessage));

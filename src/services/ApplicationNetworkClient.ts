import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import CookieManager from '@react-native-cookies/cookies';
import { Platform } from 'react-native';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { authenticationSession, AuthenticationStoragePolicy } from './AuthenticationService';

const NetworkPolicy = Object.freeze({
  unauthorizedStatus: 401, authenticationPrefix: 'authentication/', loginRoute: 'authentication/login',
  registerRoute: 'authentication/register', androidPlatform: 'android', stringType: 'string',
});
interface CredentialScope { readonly accountIdentifier: string; readonly token: string; }
interface AccountRequest extends InternalAxiosRequestConfig {
  hasRetriedAuthentication?: boolean;
  accountIdentifier?: string | null;
}
export function createApplicationNetworkClient(scope: CredentialScope | null = null) {
  let capturedToken = scope?.token ?? null;
  const instance = axios.create({ baseURL: TEMPORARY_API_URL, withCredentials: true,
    timeout: AuthenticationStoragePolicy.timeoutMilliseconds });
  instance.interceptors.request.use(async configuration => {
    await authenticationSession.restore();
    const state = authenticationSession.getSnapshot();
    if (scope === null || state.accountIdentifier === scope.accountIdentifier) capturedToken = state.token;
    const request = configuration as AccountRequest;
    request.accountIdentifier = scope?.accountIdentifier ?? state.accountIdentifier;
    if (capturedToken !== null) request.headers.set(AuthenticationStoragePolicy.authorizationHeader,
      AuthenticationStoragePolicy.bearerPrefix + capturedToken);
    return request;
  });
  instance.interceptors.response.use(async response => {
    if (scope === null && [NetworkPolicy.loginRoute, NetworkPolicy.registerRoute].some(route => route === response.config.url)) {
      const request = response.config as AccountRequest;
      const token: unknown = response.data?.token;
      if (typeof token === NetworkPolicy.stringType && request.accountIdentifier === authenticationSession.getSnapshot().accountIdentifier) {
        await authenticationSession.login(token as string);
        if (Platform.OS === NetworkPolicy.androidPlatform) await CookieManager.flush();
      }
    }
    return response;
  }, async (failure: unknown) => {
    if (!axios.isAxiosError(failure)) return Promise.reject(failure);
    const request = failure.config as AccountRequest | undefined;
    if (request === undefined || request.url?.startsWith(NetworkPolicy.authenticationPrefix)
      || failure.response?.status !== NetworkPolicy.unauthorizedStatus || request.hasRetriedAuthentication
      || request.accountIdentifier !== authenticationSession.getSnapshot().accountIdentifier) return Promise.reject(failure);
    request.hasRetriedAuthentication = true;
    const current = authenticationSession.getSnapshot();
    const authorization = request.headers.get(AuthenticationStoragePolicy.authorizationHeader);
    if (current.token !== null && authorization !== AuthenticationStoragePolicy.bearerPrefix + current.token) return instance(request);
    const token = await authenticationSession.refresh();
    if (token === null || request.accountIdentifier !== authenticationSession.getSnapshot().accountIdentifier) return Promise.reject(failure);
    return instance(request);
  });
  return instance;
}

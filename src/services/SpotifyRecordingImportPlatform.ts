import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { RecordingImportMatcher } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { SpotifyRecordingImportMatcher } from './spotify/SpotifyRecordingImportMatcher';

const ImportPlatformPolicy = Object.freeze({ route: 'Library/playlists/preview-import' });
let accountLifetime: object = Object.freeze({});
let previousAccount = authenticationSession.getSnapshot();
const unsubscribe = authenticationSession.subscribe(() => {
  const account = authenticationSession.getSnapshot();
  if (account.accountIdentifier !== previousAccount.accountIdentifier || account.isLoggedIn !== previousAccount.isLoggedIn) {
    accountLifetime = Object.freeze({});
  }
  previousAccount = account;
});
export function createSpotifyRecordingImportMatcher(baseAddress: string, accountIdentifier: string, token: string): RecordingImportMatcher {
  if (baseAddress !== TEMPORARY_API_URL) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  const capturedLifetime = accountLifetime;
  const client = createApplicationNetworkClient({ accountIdentifier, token });
  return new SpotifyRecordingImportMatcher({
    isCurrent: () => {
      const account = authenticationSession.getSnapshot();
      return accountLifetime === capturedLifetime && account.isLoggedIn && account.accountIdentifier === accountIdentifier;
    },
    async preview(tracks, cancellation) {
      const response = await client.post<unknown>(ImportPlatformPolicy.route, tracks, { signal: cancellation });
      return response.data;
    },
  });
}

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
module.hot?.dispose(unsubscribe);

import { IntegrationFailure, IntegrationFailureCode, QueryableRecordingCatalog, RecordingNamespace, StreamingServiceRecordingQuery } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { SpotifyLibraryCatalogQuery } from './spotify/SpotifyLibraryCatalogQuery';
import { SpotifyObservedRecordingStore } from './spotify/SpotifyObservedRecordingStore';
import { spotifyRecordingRequestFailure } from './spotify/SpotifyRecordingRequestFailure';

const RecordingCatalogPlatformPolicy = Object.freeze({ identityPrefix: 'streaming-service:' });
function currentScope(): string | null {
  const account = authenticationSession.getSnapshot();
  return account.isLoggedIn && account.accountIdentifier !== null
    ? JSON.stringify([TEMPORARY_API_URL, account.accountIdentifier]) : null;
}
export const spotifyObservedRecordings = new SpotifyObservedRecordingStore({ getScope: currentScope });
const unsubscribe = spotifyObservedRecordings.observeScope(authenticationSession.subscribe);

export function createSpotifyRecordingCatalog(baseAddress: string, accountIdentifier: string, token: string): QueryableRecordingCatalog {
  const scope = spotifyObservedRecordings.captureScope();
  const expectedScope = JSON.stringify([baseAddress, accountIdentifier]);
  const client = createApplicationNetworkClient({ accountIdentifier, token });
  const isCurrent = () => {
    const account = authenticationSession.getSnapshot();
    return account.isLoggedIn && account.accountIdentifier === accountIdentifier
      && spotifyObservedRecordings.captureScope() === scope;
  };
  const read = async (address: string, cancellation: AbortSignal): Promise<unknown> => {
    if (!isCurrent()) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    try {
      const response = await client.get<unknown>(address, { signal: cancellation });
      if (!isCurrent()) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      return response.data;
    } catch (failure) { throw spotifyRecordingRequestFailure(failure, cancellation); }
  };
  const query = new SpotifyLibraryCatalogQuery(baseAddress, {
    primary: new StreamingServiceRecordingQuery(baseAddress, { read }), read, isCurrent,
    observedRecordings: () => scope?.identifier === expectedScope ? spotifyObservedRecordings.read() : [],
  });
  return new QueryableRecordingCatalog(RecordingCatalogPlatformPolicy.identityPrefix + baseAddress, RecordingNamespace.Local, query);
}

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
module.hot?.dispose(unsubscribe);

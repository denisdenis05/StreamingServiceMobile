import { FetchHttpExecutor, IntegrationFailure, IntegrationFailureCode, MemoryAssociationStore,
  QueryableRecordingCatalog, RecordingNamespace, SpotifyLoginSession, StreamingServiceRecordingQuery, SystemScheduler } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { spotifyIntegration } from './SpotifyIntegration';
import { SpotifyMobileController } from './spotify/SpotifyMobileController';
import { SpotifyMobileGateway } from './spotify/SpotifyMobileGateway';
import { FetchSpotifyInvitationReader, SpotifyInvitationResolver } from './spotify/SpotifyInvitationResolver';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { spotifyLoginBrowser, spotifyProofKeys } from './SpotifyLoginPlatform';
import { SpotifyRecordingQueueStore } from './spotify/SpotifyRecordingQueueStore';

const MobileCompositionPolicy = Object.freeze({ identifierRadix: 36, initialSequence: 0, sequenceIncrement: 1,
  identifierSeparator: '-', catalogPrefix: 'streaming-service:', invalidIdentifierMessage: 'Spotify command sequence exhausted.' });
const clock = { nowMilliseconds: () => Date.now() };
const requests = new FetchHttpExecutor(new SystemScheduler());
const gateway = new SpotifyMobileGateway(requests);
const invitationResolver = new SpotifyInvitationResolver(new FetchSpotifyInvitationReader(fetch, new SystemScheduler()));
const identifierPrefix = Date.now().toString(MobileCompositionPolicy.identifierRadix) + MobileCompositionPolicy.identifierSeparator
  + Math.random().toString(MobileCompositionPolicy.identifierRadix);
let sequence = MobileCompositionPolicy.initialSequence;
function nextIdentifier(): string {
  sequence += MobileCompositionPolicy.sequenceIncrement;
  if (!Number.isSafeInteger(sequence)) throw new Error(MobileCompositionPolicy.invalidIdentifierMessage);
  return identifierPrefix + MobileCompositionPolicy.identifierSeparator + sequence;
}

export const spotifyMobile = new SpotifyMobileController({
  account: authenticationSession, gateway, clock, nextIdentifier,
  createLogin: configuration => new SpotifyLoginSession({ configuration, proofKeys: spotifyProofKeys,
    browser: spotifyLoginBrowser, requests, clock,
    resolveAccount: async (accessToken, cancellation) => (await gateway.inspectLogin(accessToken, cancellation)).accountIdentifier }),
  connect(identity, credentials, selection) {
    const account = authenticationSession.getSnapshot();
    if (account.accountIdentifier === null || account.token === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    const client = createApplicationNetworkClient({ accountIdentifier: account.accountIdentifier, token: account.token });
    const recordingQuery = new StreamingServiceRecordingQuery(TEMPORARY_API_URL, { async read(address, cancellation) {
      try {
        const response = await client.get<unknown>(address, { signal: cancellation });
        if (cancellation.aborted || authenticationSession.getSnapshot().accountIdentifier !== account.accountIdentifier) {
          throw new IntegrationFailure(IntegrationFailureCode.Superseded);
        }
        return response.data;
      } catch (failure) {
        if (failure instanceof IntegrationFailure) throw failure;
        throw new IntegrationFailure(cancellation.aborted ? IntegrationFailureCode.Canceled : IntegrationFailureCode.Network);
      }
    } });
    return spotifyIntegration.connect({ accountIdentifier: identity.accountIdentifier, credentials,
      endpoints: { resolveServiceOrigin: async () => identity.serviceOrigin },
      recordings: new QueryableRecordingCatalog(MobileCompositionPolicy.catalogPrefix + TEMPORARY_API_URL,
        RecordingNamespace.Local, recordingQuery), associations: new MemoryAssociationStore(), requests, clock,
      experimentalMembership: true, enableHostedQueue: true }, selection).sessions;
  },
  disconnect: () => spotifyIntegration.disconnect(),
  resolveInvitation: (invitation, cancellation) => invitationResolver.resolve(invitation, cancellation),
});

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
export const spotifyRecordingQueue = new SpotifyRecordingQueueStore({
  getCoordinator: () => spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime?.recordingQueue ?? null : null,
  subscribeConnection: spotifyMobile.subscribe, nextIdentifier,
});
module.hot?.dispose(() => { spotifyRecordingQueue.dispose(); spotifyMobile.dispose(); });

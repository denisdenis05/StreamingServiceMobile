import { FetchHttpExecutor, IntegrationFailure, IntegrationFailureCode, MemoryAssociationStore, LibrespotDeviceAuthorization, JamJoinMode,
  QueryableRecordingCatalog, RecordingNamespace, SpotifyLoginSession,
  StreamingServiceRecordingQuery, SystemScheduler } from 'streaming-service-spotify-jam';
import type { SpotifyLoginConfiguration, SpotifyLoginCredentialStore, SpotifyLoginStage } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';
import { spotifyIntegration } from './SpotifyIntegration';
import { SpotifyMobileController, SpotifyMobileOperation } from './spotify/SpotifyMobileController';
import { SpotifyMobileGateway } from './spotify/SpotifyMobileGateway';
import { FetchSpotifyInvitationReader, SpotifyInvitationResolver } from './spotify/SpotifyInvitationResolver';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { spotifyLoginBrowser, spotifyProofKeys, readSpotifyAuthorizationReturn } from './SpotifyLoginPlatform';
import { SpotifyRecordingQueueStore } from './spotify/SpotifyRecordingQueueStore';
import { SpotifyHostedQueueStore } from './spotify/SpotifyHostedQueueStore';
import { SpotifyMembershipStore } from './spotify/SpotifyMembershipStore';
import { spotifyCredentialOwnership, spotifyAuthorizationOwnership, spotifyLibrespotOwnership, spotifyDeviceAuthorizationOwnership } from './SpotifySecureLoginStorage';
import { spotifyLibrespotAuthentication, openSpotifyVerificationPage } from './SpotifyLibrespotPlatform';
import { SpotifyLoginProviders } from './spotify/SpotifyLoginProviders';
import { SpotifyAuthorizationStartup } from './spotify/SpotifyAuthorizationStartup';
import { SpotifyMobilePolicy } from './spotify/SpotifyMobilePolicy';
import { SpotifyNativePlaybackOutput } from './spotify/SpotifyNativePlaybackOutput';
import { SpotifyPlaybackFollowerStore } from './spotify/SpotifyPlaybackFollowerStore';
import { SpotifyPlaybackCommandStore } from './spotify/SpotifyPlaybackCommandStore';
import { SpotifyConnectStore, SpotifyConnectStatus } from './spotify/SpotifyConnectStore';
import { spotifyConnectNative, observeSpotifyConnect } from './SpotifyConnectPlatform';
import { sharedPlaybackNative, playbackApplication } from './NativeAudioRuntime';
import { AppState, Linking } from 'react-native';

const MobileCompositionPolicy = Object.freeze({ identifierRadix: 36, initialSequence: 0, sequenceIncrement: 1,
  identifierSeparator: '-', catalogPrefix: 'streaming-service:', invalidIdentifierMessage: 'Spotify command sequence exhausted.',
  urlEvent: 'url' } as const);
const clock = { nowMilliseconds: () => Date.now() };
const requests = new FetchHttpExecutor(new SystemScheduler());
const playbackClockSource = globalThis as unknown as { readonly performance: { now(): number } };
const playbackClock = { nowMonotonicMilliseconds: () => playbackClockSource.performance.now() };
const gateway = new SpotifyMobileGateway(requests);
const invitationResolver = new SpotifyInvitationResolver(new FetchSpotifyInvitationReader(fetch, new SystemScheduler()));
const identifierPrefix = Date.now().toString(MobileCompositionPolicy.identifierRadix) + MobileCompositionPolicy.identifierSeparator
  + Math.random().toString(MobileCompositionPolicy.identifierRadix);
let sequence = MobileCompositionPolicy.initialSequence;
function createLogin(configuration: SpotifyLoginConfiguration, credentialStore: SpotifyLoginCredentialStore,
  authorizationStore: SpotifyLoginCredentialStore, progress?: (stage: SpotifyLoginStage) => void): SpotifyLoginSession {
  return new SpotifyLoginSession({ configuration, proofKeys: spotifyProofKeys, browser: spotifyLoginBrowser, requests, clock, credentialStore,
    authorizationStore, ...(progress === undefined ? {} : { onProgress: progress }),
    resolveAccount: async (accessToken, cancellation) => (await gateway.inspectLogin(accessToken, cancellation)).accountIdentifier });
}
const loginProviders = new SpotifyLoginProviders({ librespot: spotifyLibrespotOwnership, oauth: spotifyCredentialOwnership,
  authorization: spotifyAuthorizationOwnership, deviceAuthorization: spotifyDeviceAuthorizationOwnership,
  createDeviceAuthorization: (accountIdentifier, observer, progress) => new LibrespotDeviceAuthorization({ requests, clock,
    scheduler: new SystemScheduler(), authorizationStore: spotifyDeviceAuthorizationOwnership.acquire(accountIdentifier),
    bootstrap: (accessToken, cancellation) => spotifyLibrespotAuthentication.bootstrap(accessToken, cancellation),
    openVerificationPage: openSpotifyVerificationPage, ...(observer === undefined ? {} : { onAuthorization: observer }),
    ...(progress === undefined ? {} : { onProgress: progress }) }),
  authentication: spotifyLibrespotAuthentication, clock, createBrowserLogin: createLogin });
function nextIdentifier(): string {
  sequence += MobileCompositionPolicy.sequenceIncrement;
  if (!Number.isSafeInteger(sequence)) throw new Error(MobileCompositionPolicy.invalidIdentifierMessage);
  return identifierPrefix + MobileCompositionPolicy.identifierSeparator + sequence;
}

export const spotifyConnect = new SpotifyConnectStore({ native: spotifyConnectNative, observe: observeSpotifyConnect, nextIdentifier,
  membershipChanged: () => {
    const runtime = spotifyIntegration.runtime;
    if (runtime) void runtime.membership.refresh().catch(() => undefined);
  },
});

export const spotifyMobile = new SpotifyMobileController({
  nativeConnection: spotifyConnect,
  authorizationReturnStatus: () => spotifyLoginBrowser.getReturnStatus(),
  account: authenticationSession, gateway, clock, nextIdentifier,
  membershipRefreshed: () => spotifyIntegration.resumeObserversAfterMembership(),
  connectNative: (provider, accountIdentifier, cancellation) => {
    if (provider.getNativeSessionCredential) void spotifyConnect.attach(provider, accountIdentifier, cancellation).catch(() => undefined);
  },
  nativeDeviceIdentifier: mode => {
    const connection = spotifyConnect.getSnapshot();
    return mode === JamJoinMode.Control && connection.status === SpotifyConnectStatus.Ready ? connection.deviceIdentifier : null;
  },
  createLogin(configuration, progress) {
    const account = authenticationSession.getSnapshot();
    if (!account.isLoggedIn || account.accountIdentifier === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    return loginProviders.createBrowserLogin(account.accountIdentifier, configuration, progress);
  },
  createLibrespotLogin(input, progress) {
    const account = authenticationSession.getSnapshot();
    if (!account.isLoggedIn || account.accountIdentifier === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    return loginProviders.createLibrespot(account.accountIdentifier, input, progress);
  },
  createDeviceLogin(progress, observer) {
    const account = authenticationSession.getSnapshot();
    if (!account.isLoggedIn || account.accountIdentifier === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    return loginProviders.createDeviceLogin(account.accountIdentifier, progress, observer);
  },
  openVerificationPage: openSpotifyVerificationPage,
  async restoreLogin(accountIdentifier, cancellation, progress, observer) {
    return loginProviders.restore(accountIdentifier, cancellation, progress, observer);
  },
  async resumeLogin(accountIdentifier, cancellation, progress) {
    return loginProviders.resume(accountIdentifier, cancellation, progress);
  },
  async forgetSavedLogin(accountIdentifier) {
    await loginProviders.forget(accountIdentifier);
  },
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
      endpoints: { resolveServiceOrigin: cancellation => identity.serviceOrigin === null
        ? gateway.resolveServiceOrigin(cancellation) : Promise.resolve(identity.serviceOrigin) },
      recordings: new QueryableRecordingCatalog(MobileCompositionPolicy.catalogPrefix + TEMPORARY_API_URL,
        RecordingNamespace.Local, recordingQuery), associations: new MemoryAssociationStore(), requests, clock,
      experimentalMembership: true, enableHostedQueue: true, enableHostedQueueObservation: true,
      enableMembershipObservation: true, membershipRequestIdentifiers: nextIdentifier, enableHostedPlaybackCommands: true,
      scheduler: new SystemScheduler(), playbackClock }, selection).sessions;
  },
  disconnect: () => spotifyIntegration.disconnect(),
  resolveInvitation: (invitation, cancellation) => invitationResolver.resolve(invitation, cancellation),
});

const authorizationStartup = new SpotifyAuthorizationStartup({
  account: authenticationSession, controller: spotifyMobile, redirectAddress: SpotifyMobilePolicy.authorizationRedirectAddress,
  isAuthorizing: () => spotifyLoginBrowser.isAuthorizing(),
  redirects: { readInitialAddress: readSpotifyAuthorizationReturn, observe(listener) {
    const observation = Linking.addEventListener(MobileCompositionPolicy.urlEvent, event => listener(event.url));
    return () => observation.remove();
  } },
});
authorizationStartup.start();

declare const module: { readonly hot?: { dispose(callback: () => void): void } };
export const spotifyRecordingQueue = new SpotifyRecordingQueueStore({
  getCoordinator: () => spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime?.recordingQueue ?? null : null,
  subscribeConnection: spotifyMobile.subscribe, nextIdentifier,
});
export const spotifyHostedQueue = new SpotifyHostedQueueStore({
  getObserver: () => spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime?.hostedQueue ?? null : null,
  subscribeConnection: spotifyMobile.subscribe,
});
export const spotifyMembership = new SpotifyMembershipStore({
  getObserver: () => spotifyMobile.getSnapshot().connected && spotifyMobile.getSnapshot().operation !== SpotifyMobileOperation.Connecting
    ? spotifyIntegration.runtime?.membership ?? null : null,
  subscribeConnection: spotifyMobile.subscribe,
});
export const spotifyPlaybackFollower = new SpotifyPlaybackFollowerStore({
  getRuntime: () => spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime : null,
  subscribeConnection: spotifyMobile.subscribe, clock: playbackClock, scheduler: new SystemScheduler(), nextIdentifier,
  output: new SpotifyNativePlaybackOutput({ native: sharedPlaybackNative, clock: playbackClock, nextIdentifier,
    whenReady: () => playbackApplication.whenReady(),
    resolveRecording: async (identifier, cancellation) => {
      const runtime = spotifyIntegration.runtime;
      if (!runtime) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      const song = await runtime.lookupRecording(identifier, cancellation);
      if (runtime !== spotifyIntegration.runtime) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
      return song;
    },
  }),
});
const PlaybackApplicationState = Object.freeze({ changeEvent: 'change', active: 'active' } as const);
export const spotifyPlaybackCommands = new SpotifyPlaybackCommandStore({
  getRuntime: () => spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime : null,
  subscribeConnection: spotifyMobile.subscribe, nextIdentifier,
});
const stopPlaybackOnBackground = AppState.addEventListener(PlaybackApplicationState.changeEvent,
  state => { if (state !== PlaybackApplicationState.active) void spotifyPlaybackFollower.stop().catch(() => undefined); });
module.hot?.dispose(() => {
  void spotifyConnect.detach().catch(() => undefined);
  authorizationStartup.dispose();
  spotifyPlaybackCommands.dispose();
  stopPlaybackOnBackground.remove(); void spotifyPlaybackFollower.dispose().catch(() => undefined);
  spotifyMembership.dispose(); spotifyHostedQueue.dispose(); spotifyRecordingQueue.dispose(); spotifyMobile.dispose();
});

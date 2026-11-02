import { spotifyMatchingDiagnostic, SpotifyMatchingDiagnosticTag } from './spotify/SpotifyMatchingDiagnostic';
import { MatchStatus, FetchHttpExecutor, IntegrationFailure, IntegrationFailureCode, MemoryAssociationStore, LibrespotDeviceAuthorization, JamJoinMode,
  SpotifyLoginSession, SpotifyConnectPlaybackCommandProtocol, SpotifyConnectSharedStateVerifier, SpotifyConnectQueueProtocol, SpotifyConnectPlaybackReader, SpotifyConnectHostedQueueReader,
  SystemScheduler } from 'streaming-service-spotify-jam';
import type { SpotifyLoginConfiguration, SpotifyLoginCredentialStore, SpotifyLoginStage } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createSpotifyRecordingCatalog, spotifyObservedRecordings } from './SpotifyRecordingCatalogPlatform';
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
import { SpotifySavedConnectionStartup } from './spotify/SpotifySavedConnectionStartup';
import { SpotifyObservedRecordingDuration } from './spotify/SpotifyObservedRecordingDuration';
import { SpotifyMobilePolicy } from './spotify/SpotifyMobilePolicy';
export { spotifyListeningCountry } from './SpotifyListeningCountryPlatform';
import { SpotifyNativePlaybackOutput } from './spotify/SpotifyNativePlaybackOutput';
import { SpotifyPlaybackFollowerStore } from './spotify/SpotifyPlaybackFollowerStore';
import { SpotifyNativeFollowerStore } from './spotify/SpotifyNativeFollowerStore';
import { captureSpotifyNativeFollowerContext } from './spotify/SpotifyNativeFollowerContext';
import { SpotifyPlaybackController } from './spotify/SpotifyPlaybackController';
import { spotifyJamPlaybackNative, observeSpotifyJamPlayback } from './SpotifyJamPlaybackPlatform';
import { SpotifyPlaybackCommandStore } from './spotify/SpotifyPlaybackCommandStore';
import { SpotifyConnectStore, SpotifyConnectStatus } from './spotify/SpotifyConnectStore';
import { spotifyConnectNative, observeSpotifyConnect } from './SpotifyConnectPlatform';
import { sharedPlaybackNative, playbackApplication, audioRuntime } from './NativeAudioRuntime';
import { AppState, Linking } from 'react-native';

import { SpotifyHostingStore } from './spotify/SpotifyHostingStore';
import { captureSpotifyHostingQueue } from './spotify/SpotifyHostingQueue';
import { spotifyHostingNative, observeSpotifyHosting } from './SpotifyHostingPlatform';

const MobileHostingEmptyHost = '';
const MobileCompositionPolicy = Object.freeze({ identifierRadix: 36, initialSequence: 0, sequenceIncrement: 1,
  identifierSeparator: '-', invalidIdentifierMessage: 'Spotify command sequence exhausted.',
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

export const spotifyConnect = new SpotifyConnectStore({ clock: playbackClock, native: spotifyConnectNative, observe: observeSpotifyConnect, nextIdentifier,
  membershipChanged: () => {
    const runtime = spotifyIntegration.runtime;
    if (runtime) void runtime.membership.refresh().catch(() => undefined);
  },
});

export const spotifyMobile = new SpotifyMobileController({
  nativeConnection: spotifyConnect,
  nativeDevices: (accountIdentifier, cancellation) => spotifyConnect.readDevices(accountIdentifier, cancellation),
  authorizationReturnStatus: () => spotifyLoginBrowser.getReturnStatus(),
  account: authenticationSession, gateway, clock, nextIdentifier,
  membershipRefreshed: () => spotifyIntegration.resumeObserversAfterMembership(),
  prepareSharedStateRecovery: sessions => {
    const runtime = spotifyIntegration.runtime;
    if (!runtime || runtime.sessions !== sessions) return () => undefined;
    const completePlayback = spotifyPlaybackCommands.prepareSharedStateRecovery(runtime);
    const completeRecording = spotifyRecordingQueue.prepareSharedStateRecovery(runtime.recordingQueue);
    return () => {
      if (runtime !== spotifyIntegration.runtime || runtime.sessions !== sessions) return;
      completePlayback();
      completeRecording();
    };
  },
  shutdownNative: () => spotifyConnect.shutdown(),
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
    return spotifyIntegration.connect({ accountIdentifier: identity.accountIdentifier, credentials,
      endpoints: { resolveServiceOrigin: cancellation => identity.serviceOrigin === null
        ? gateway.resolveServiceOrigin(cancellation) : Promise.resolve(identity.serviceOrigin) },
      recordings: createSpotifyRecordingCatalog(TEMPORARY_API_URL, account.accountIdentifier, account.token),
      associations: new MemoryAssociationStore(), requests, clock,
      experimentalMembership: true, enableHostedQueue: true, enableHostedQueueObservation: true,
      enableMembershipObservation: true, membershipRequestIdentifiers: nextIdentifier, enableHostedPlaybackCommands: true,
      scheduler: new SystemScheduler(), playbackClock,
      ...(selection.useNativeConnect ? {
        sharedStateVerifier: new SpotifyConnectSharedStateVerifier(spotifyConnect, identity.accountIdentifier),
        connectMetadata: spotifyConnect, connectSearch: spotifyConnect,
        guestObservationVerifier: spotifyConnect, guestCommandVerifier: spotifyConnect,
        hostedQueueReader: new SpotifyConnectHostedQueueReader(spotifyConnect, spotifyConnect, identity.accountIdentifier),
        playbackReader: new SpotifyConnectPlaybackReader(spotifyConnect, identity.accountIdentifier),
        queueProtocol: new SpotifyConnectQueueProtocol(spotifyConnect, identity.accountIdentifier, nextIdentifier),
        playbackCommandProtocol: new SpotifyConnectPlaybackCommandProtocol(spotifyConnect, identity.accountIdentifier),
      } : {}),
    }, selection).sessions;
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
const savedConnectionStartup = new SpotifySavedConnectionStartup({
  account: authenticationSession, controller: spotifyMobile, authorizationReady: authorizationStartup,
});
savedConnectionStartup.start();

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
const foregroundPlaybackFollower = new SpotifyPlaybackFollowerStore({
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
function nativePlaybackContext(getConnection: (accountIdentifier: string) => Readonly<{ handle: number; generation: number }> | null) {
  const runtime = spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime : null;
  return captureSpotifyNativeFollowerContext({ useNativeConnection: spotifyIntegration.usesNativeConnect,
    session: runtime?.sessions.getSnapshot() ?? null, applicationAccount: authenticationSession.getSnapshot(),
    baseAddress: TEMPORARY_API_URL, getConnection });
}
const nativePlaybackFollower = new SpotifyNativeFollowerStore({
  native: spotifyJamPlaybackNative(), observe: observeSpotifyJamPlayback,
  getApplicationAccount: authenticationSession.getSnapshot, subscribeApplicationAccount: authenticationSession.subscribe,
  whenPlayerReady: () => playbackApplication.whenReady(), nextIdentifier,
  acknowledgeOwnership: (context, identity, isCurrent) => audioRuntime.authentication.adoptNativeSession({
    serverAddress: context.baseAddress, accountIdentifier: context.streamingServiceAccountIdentifier,
    engineEpoch: identity.engineEpoch, authenticationEpoch: identity.authenticationEpoch,
  }, isCurrent),
  getContext: () => nativePlaybackContext(accountIdentifier => spotifyConnect.getPlaybackConnection(accountIdentifier)),
  getRecoveryContext: () => nativePlaybackContext(accountIdentifier => spotifyConnect.getRecoveringPlaybackConnection(accountIdentifier)),
  subscribeConnection: listener => {
    const stopMobile = spotifyMobile.subscribe(listener);
    const stopConnect = spotifyConnect.subscribe(listener);
    return () => { stopMobile(); stopConnect(); };
  },
});
export const spotifyPlaybackFollower: SpotifyPlaybackController = new SpotifyPlaybackController({ native: nativePlaybackFollower,
  foreground: foregroundPlaybackFollower, useNative: () => spotifyIntegration.usesNativeConnect, stopHosting: () => spotifyHosting.stop() });
const observedRecordingDuration = new SpotifyObservedRecordingDuration({ store: spotifyObservedRecordings, player: sharedPlaybackNative });
export const spotifyHosting: SpotifyHostingStore = new SpotifyHostingStore({
  native: spotifyHostingNative(), observe: observeSpotifyHosting,
  getContext: () => {
    const state = spotifyMobile.getSnapshot();
    const account = authenticationSession.getSnapshot();
    const session = state.session?.session;
    const connection = state.session?.accountIdentifier ? spotifyConnect.getPlaybackConnection(state.session?.accountIdentifier) : null;
    const device = spotifyConnect.getSnapshot().deviceIdentifier;
    if (!spotifyIntegration.usesNativeConnect || !state.connected || !session?.ownedByCurrentAccount || !session.active
      || !account.isLoggedIn || account.accountIdentifier === null || !state.session?.accountIdentifier || !connection || !device) return null;
    return Object.freeze({ streamingServiceAccountIdentifier: account.accountIdentifier, baseAddress: TEMPORARY_API_URL,
      spotifyAccountIdentifier: state.session?.accountIdentifier, jamSessionIdentifier: session.identifier, deviceIdentifier: device,
      previousHostDeviceIdentifier: session.hostDeviceIdentifier ?? MobileHostingEmptyHost, ...connection });
  },
  getAccessToken: () => authenticationSession.getSnapshot().token,
  subscribeConnection: listener => {
    const subscriptions = [spotifyMobile.subscribe(listener), spotifyConnect.subscribe(listener), authenticationSession.subscribe(listener)];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  },
  whenPlayerReady: () => playbackApplication.whenReady(),
  captureQueue: async () => {
    await observedRecordingDuration.capture();
    return captureSpotifyHostingQueue(sharedPlaybackNative);
  },
  translate: async (identifier, market, cancellation) => {
    const runtime = spotifyIntegration.runtime;
    if (!runtime) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
    const result = await runtime.translateToSpotify(identifier, market, cancellation);
    if (runtime !== spotifyIntegration.runtime) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    console.info(SpotifyMatchingDiagnosticTag, JSON.stringify(spotifyMatchingDiagnostic(result)));
    if (result.status !== MatchStatus.Matched || !result.selected) throw new IntegrationFailure(result.failure ?? IntegrationFailureCode.NotFound);
    return result.selected.identifier;
  },
  stopFollowing: () => spotifyPlaybackFollower.stop(),
});
const PlaybackApplicationState = Object.freeze({ changeEvent: 'change', active: 'active' } as const);
export const spotifyPlaybackCommands = new SpotifyPlaybackCommandStore({
  getRuntime: () => spotifyMobile.getSnapshot().connected ? spotifyIntegration.runtime : null,
  subscribeConnection: spotifyMobile.subscribe, nextIdentifier,
});
spotifyPlaybackFollower.setActive(AppState.currentState === PlaybackApplicationState.active);
const playbackApplicationState = AppState.addEventListener(PlaybackApplicationState.changeEvent,
  state => spotifyPlaybackFollower.setActive(state === PlaybackApplicationState.active));
module.hot?.dispose(() => {
  void spotifyConnect.dispose().catch(() => undefined);
  spotifyHosting.dispose();
  authorizationStartup.dispose();
  savedConnectionStartup.dispose();
  spotifyPlaybackCommands.dispose();
  playbackApplicationState.remove(); void spotifyPlaybackFollower.dispose().catch(() => undefined);
  spotifyMembership.dispose(); spotifyHostedQueue.dispose(); spotifyRecordingQueue.dispose(); spotifyMobile.dispose();
});

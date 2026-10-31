import {
  HostedPlaybackCommandKind,
  IntegrationFailure,
  IntegrationFailureCode,
  JamConnectionStatus,
  JamJoinMode,
} from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { spotifyIntegration } from './SpotifyIntegration';
import {
  spotifyConnect,
  spotifyHosting,
  spotifyMobile,
  spotifyPlaybackCommands,
  spotifyPlaybackFollower,
} from './SpotifyMobileService';
import { spotifyListeningCountry } from './SpotifyListeningCountryPlatform';
import {
  playbackQueueChanges,
  PlaybackQueueChangeKind,
} from './player/PlaybackQueueChangeLifecycle';
import { SpotifyPlayerJamController } from './spotify/SpotifyPlayerJamController';
import type { SpotifyPlayerJamConnection } from './spotify/SpotifyPlayerJamController';
const PlayerJamScopePolicy = Object.freeze({ emptyDescriptor: null });
function identity(): string | null {
  const account = authenticationSession.getSnapshot();
  const mobile = spotifyMobile.getSnapshot();
  if (!account.isLoggedIn || account.accountIdentifier === null || !mobile.connected || !mobile.session?.accountIdentifier)
    return null;
  return JSON.stringify([account.accountIdentifier, mobile.session.accountIdentifier]);
}
function nativeReady(): boolean {
  const mobile = spotifyMobile.getSnapshot();
  return identity() !== null && spotifyIntegration.usesNativeConnect
    && !!mobile.session?.accountIdentifier
    && spotifyConnect.getPlaybackConnection(mobile.session.accountIdentifier) !== null;
}
async function membership(operation: () => Promise<boolean>): Promise<void> {
  const expectedIdentity = identity();
  if (expectedIdentity === null) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
  const accepted = await operation();
  if (identity() !== expectedIdentity) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  if (!accepted) throw new IntegrationFailure(spotifyMobile.getSnapshot().failure ?? IntegrationFailureCode.Network);
}
function connection(): SpotifyPlayerJamConnection | null {
  const mobile = spotifyMobile.getSnapshot();
  const snapshot = mobile.session;
  const session = snapshot?.session;
  const account = authenticationSession.getSnapshot();
  if (
    !mobile.connected ||
    !account.isLoggedIn ||
    account.accountIdentifier === null ||
    !snapshot?.accountIdentifier ||
    !session?.active ||
    (snapshot.status !== JamConnectionStatus.Ready &&
      snapshot.status !== JamConnectionStatus.Operating)
  )
    return null;
  const native = spotifyIntegration.usesNativeConnect;
  const descriptor = native
    ? spotifyConnect.getPlaybackConnection(snapshot.accountIdentifier) ??
      spotifyConnect.getRecoveringPlaybackConnection(snapshot.accountIdentifier)
    : PlayerJamScopePolicy.emptyDescriptor;
  return {
    scopeIdentifier: JSON.stringify([
      account.accountIdentifier,
      snapshot.accountIdentifier,
      session.identifier,
      descriptor,
    ]),
    owned: session.ownedByCurrentAccount,
    admitted: session.participants.some(
      participant => participant.identifier === snapshot.accountIdentifier,
    ),
    native: native && descriptor !== null,
    hasHost: !!session.hostDeviceIdentifier,
  };
}
function refreshSharedQueue(): void {
  const runtime = spotifyIntegration.runtime;
  if (runtime) void runtime.hostedQueue.refresh().catch(() => undefined);
}
async function remote(operation: () => Promise<void>): Promise<void> {
  const runtime = spotifyIntegration.runtime;
  if (!runtime)
    throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
  await operation();
  if (runtime !== spotifyIntegration.runtime)
    throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  const snapshot = spotifyPlaybackCommands.getSnapshot();
  if (snapshot.failure !== null || snapshot.uncertain)
    throw new IntegrationFailure(
      snapshot.failure ?? IntegrationFailureCode.UnknownOutcome,
    );
  refreshSharedQueue();
}
export const playerJam = new SpotifyPlayerJamController({
  getConnection: connection,
  getIdentity: identity,
  getCanCreate: () => nativeReady() && !spotifyMobile.getSnapshot().session?.session?.active,
  getCanJoin: nativeReady,
  createJam: () => membership(() => spotifyMobile.createSession()),
  joinJam: invitation => membership(() => spotifyMobile.joinSession(invitation, JamJoinMode.Control)),
  listeningCountry: spotifyListeningCountry,
  getHosting: spotifyHosting.getSnapshot,
  getFollowing: spotifyPlaybackFollower.getSnapshot,
  remoteControlsAvailable: () =>
    spotifyPlaybackCommands.getSnapshot().available &&
    !spotifyPlaybackCommands.getSnapshot().uncertain,
  subscribe(listener) {
    const subscriptions = [
      authenticationSession.subscribe(listener),
      spotifyMobile.subscribe(listener),
      spotifyConnect.subscribe(listener),
      spotifyHosting.subscribe(listener),
      spotifyPlaybackFollower.subscribe(listener),
      spotifyPlaybackCommands.subscribe(listener),
      spotifyListeningCountry.subscribe(listener),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  },
  startHosting: market => spotifyHosting.start(market),
  stopHosting: () => spotifyHosting.stop(),
  startFollowing: market => spotifyPlaybackFollower.start(market),
  stopFollowing: () => spotifyPlaybackFollower.stop(),
  prepareRecordings: identifiers =>
    spotifyHosting.prepareRecordings(identifiers),
  publishLocalChanges: () => spotifyHosting.publishLocalChanges(),
  remoteControl: kind => remote(() => spotifyPlaybackCommands.execute(kind)),
  remoteSeek: seconds => remote(() => spotifyPlaybackCommands.seek(seconds)),
});
const removeQueueLifecycle = playbackQueueChanges.attach({
  async prepare(request) {
    const committed = await playerJam.prepareQueueChange(
      request.tracks.map(track => track.recordingIdentifier),
      request.isCurrent,
      request.kind === PlaybackQueueChangeKind.Clear,
    );
    return { committed };
  },
});
export const PlayerJamControls = Object.freeze({
  play: HostedPlaybackCommandKind.Play,
  pause: HostedPlaybackCommandKind.Pause,
  next: HostedPlaybackCommandKind.Next,
  previous: HostedPlaybackCommandKind.Previous,
});
declare const module: {
  readonly hot?: { dispose(callback: () => void): void };
};
module.hot?.dispose(() => {
  removeQueueLifecycle();
  playerJam.dispose();
});

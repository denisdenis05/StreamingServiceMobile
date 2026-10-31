import { JamConnectionStatus } from 'streaming-service-spotify-jam';
import type { JamSnapshot } from 'streaming-service-spotify-jam';
import type { SpotifyJamPlaybackContext } from './SpotifyJamPlaybackProtocol';
export interface SpotifyNativeFollowerContextInput {
  readonly useNativeConnection: boolean;
  readonly session: JamSnapshot | null;
  readonly applicationAccount: Readonly<{ isLoggedIn: boolean; accountIdentifier: string | null }>;
  readonly baseAddress: string;
  readonly getConnection: (accountIdentifier: string) => Readonly<{ handle: number; generation: number }> | null;
}
export function captureSpotifyNativeFollowerContext(input: SpotifyNativeFollowerContextInput): SpotifyJamPlaybackContext | null {
  const snapshot = input.session; const account = input.applicationAccount; const session = snapshot?.session;
  if (!input.useNativeConnection || !snapshot || snapshot.accountIdentifier === null || snapshot.status !== JamConnectionStatus.Ready
    || !session || !session.active || !session.hostDeviceIdentifier || !account.isLoggedIn || account.accountIdentifier === null) return null;
  if (!session.ownedByCurrentAccount && !session.participants.some(participant => participant.identifier === snapshot.accountIdentifier)) return null;
  const connection = input.getConnection(snapshot.accountIdentifier);
  return connection === null ? null : Object.freeze({ streamingServiceAccountIdentifier: account.accountIdentifier,
    baseAddress: input.baseAddress, spotifyAccountIdentifier: snapshot.accountIdentifier,
    jamSessionIdentifier: session.identifier, hostDeviceIdentifier: session.hostDeviceIdentifier, ...connection });
}

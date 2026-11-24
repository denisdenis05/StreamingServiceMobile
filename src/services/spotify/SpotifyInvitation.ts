import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import { SpotifyMobilePolicy } from './SpotifyMobilePolicy';
import { URL } from 'react-native-url-polyfill';

export function spotifyInvitationToken(invitation: string): string {
  const input = invitation.trim();
  if (!input || input.length > SpotifyMobilePolicy.maximumInvitationCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  let token = input;
  if (input.startsWith(SpotifyMobilePolicy.spotifyInvitationPrefix)) token = input.slice(SpotifyMobilePolicy.spotifyInvitationPrefix.length);
  else if (input.includes(SpotifyMobilePolicy.slash)) {
    let address: URL;
    try { address = new URL(input); } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
    if (address.protocol !== SpotifyMobilePolicy.secureProtocol || address.hostname !== SpotifyMobilePolicy.spotifyHost
      || address.username || address.password || address.port) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    const prefix = [SpotifyMobilePolicy.socialSessionPath, SpotifyMobilePolicy.jamPath].find(path => address.pathname.startsWith(path));
    if (prefix === undefined) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    try { token = decodeURIComponent(address.pathname.slice(prefix.length)); }
    catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
  }
  if (token.length > SpotifyMobilePolicy.maximumIdentifierCharacters || token === SpotifyMobilePolicy.dotPath
    || token === SpotifyMobilePolicy.parentPath || !SpotifyMobilePolicy.invitationTokenPattern.test(token)) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
  return token;
}

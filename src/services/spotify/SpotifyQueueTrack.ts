import { URL } from 'react-native-url-polyfill';
import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';

const QueueTrackPolicy = Object.freeze({ identifierPattern: /^[A-Za-z0-9]{22}$/, trackPrefix: 'spotify:track:',
  protocol: 'https:', hostname: 'open.spotify.com', pathPattern: /^\/track\/([A-Za-z0-9]{22})\/?$/,
  identifierPosition: 1 });

export function spotifyQueueTrackIdentifier(reference: string): string {
  const value = reference.trim();
  if (QueueTrackPolicy.identifierPattern.test(value)) return value;
  if (value.startsWith(QueueTrackPolicy.trackPrefix)) {
    const identifier = value.slice(QueueTrackPolicy.trackPrefix.length);
    if (QueueTrackPolicy.identifierPattern.test(identifier)) return identifier;
  }
  try {
    const address = new URL(value);
    const match = QueueTrackPolicy.pathPattern.exec(address.pathname);
    const identifier = match?.[QueueTrackPolicy.identifierPosition];
    if (address.protocol === QueueTrackPolicy.protocol && address.hostname === QueueTrackPolicy.hostname
      && !address.username && !address.password && !address.port && identifier) return identifier;
  } catch {}
  throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
}

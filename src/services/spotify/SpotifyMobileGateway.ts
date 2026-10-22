import { HttpMethod, IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { HttpExecutor } from 'streaming-service-spotify-jam';
import { SpotifyMobilePolicy } from './SpotifyMobilePolicy';
import { URL } from 'react-native-url-polyfill';

export interface SpotifyMobileIdentity {
  readonly accountIdentifier: string;
  readonly displayName: string;
  readonly serviceOrigin: string;
}

export interface SpotifyMobileDevice {
  readonly identifier: string;
  readonly name: string;
  readonly active: boolean;
}

export interface SpotifyAccountGateway {
  inspect(accessToken: string, cancellation: AbortSignal): Promise<SpotifyMobileIdentity>;
  devices(accessToken: string, cancellation: AbortSignal): Promise<readonly SpotifyMobileDevice[]>;
}

export function spotifyObject(value: unknown): Record<string, unknown> {
  if (typeof value !== SpotifyMobilePolicy.objectType || value === null || Array.isArray(value)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  return value as Record<string, unknown>;
}

export function spotifyText(value: unknown): string {
  if (typeof value !== SpotifyMobilePolicy.stringType || !(value as string).trim()) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  return value as string;
}

export class SpotifyMobileGateway implements SpotifyAccountGateway {
  constructor(private readonly requests: HttpExecutor) {}

  async inspect(accessToken: string, cancellation: AbortSignal): Promise<SpotifyMobileIdentity> {
    const profileAddress = new URL(SpotifyMobilePolicy.profileAddress);
    profileAddress.searchParams.set(SpotifyMobilePolicy.operationParameter, SpotifyMobilePolicy.profileOperation);
    profileAddress.searchParams.set(SpotifyMobilePolicy.variablesParameter, JSON.stringify({}));
    profileAddress.searchParams.set(SpotifyMobilePolicy.extensionsParameter, JSON.stringify({ persistedQuery: {
      version: SpotifyMobilePolicy.persistedQueryVersion, sha256Hash: SpotifyMobilePolicy.profileQueryHash } }));
    const [profileValue, resolverValue] = await Promise.all([
      this.read(profileAddress.toString(), accessToken, cancellation),
      this.read(SpotifyMobilePolicy.resolverAddress, null, cancellation),
    ]);
    const profile = spotifyObject(spotifyObject(spotifyObject(spotifyObject(profileValue).data).me).profile);
    const resolved = spotifyObject(resolverValue);
    if (!Array.isArray(resolved.spclient)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    const host = spotifyText(resolved.spclient[SpotifyMobilePolicy.firstPosition]);
    let origin: URL;
    try { origin = new URL(SpotifyMobilePolicy.secureProtocol + SpotifyMobilePolicy.slash + SpotifyMobilePolicy.slash + host); }
    catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse); }
    if (!origin.hostname.endsWith(SpotifyMobilePolicy.serviceSuffix) || origin.username || origin.password
      || origin.port || origin.pathname !== SpotifyMobilePolicy.slash || origin.search || origin.hash) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    const accountIdentifier = spotifyText(profile.username);
    const displayName = typeof profile.name === SpotifyMobilePolicy.stringType && (profile.name as string).trim()
      ? profile.name as string : accountIdentifier;
    return Object.freeze({ accountIdentifier, displayName, serviceOrigin: origin.origin });
  }

  async devices(accessToken: string, cancellation: AbortSignal): Promise<readonly SpotifyMobileDevice[]> {
    const response = spotifyObject(await this.read(SpotifyMobilePolicy.devicesAddress, accessToken, cancellation));
    if (!Array.isArray(response.devices)) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    const seen = new Set<string>();
    return Object.freeze(response.devices.slice(SpotifyMobilePolicy.firstPosition, SpotifyMobilePolicy.maximumDevices).flatMap(value => {
      const device = spotifyObject(value);
      if (device.id === null || device.id === undefined || device.is_restricted === true) return [];
      const identifier = spotifyText(device.id);
      if (seen.has(identifier)) return [];
      seen.add(identifier);
      if (typeof device.is_active !== SpotifyMobilePolicy.booleanType) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      return [Object.freeze({ identifier, name: typeof device.name === SpotifyMobilePolicy.stringType
        ? device.name as string : SpotifyMobilePolicy.unknownDeviceName, active: device.is_active as boolean })];
    }));
  }

  private async read(address: string, accessToken: string | null, cancellation: AbortSignal): Promise<unknown> {
    const headers: Record<string, string> = { [SpotifyMobilePolicy.acceptHeader]: SpotifyMobilePolicy.jsonMediaType };
    if (accessToken !== null) headers[SpotifyMobilePolicy.authorizationHeader] = SpotifyMobilePolicy.bearerPrefix + accessToken;
    const response = await this.requests.execute({ address, method: HttpMethod.Read, headers, cancellation });
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    if (response.status >= SpotifyMobilePolicy.successfulMinimumStatus && response.status <= SpotifyMobilePolicy.successfulMaximumStatus) return response.body;
    const failure = response.status === SpotifyMobilePolicy.unauthorizedStatus ? IntegrationFailureCode.Unauthorized
      : response.status === SpotifyMobilePolicy.forbiddenStatus ? IntegrationFailureCode.Forbidden
      : response.status === SpotifyMobilePolicy.rateLimitedStatus ? IntegrationFailureCode.RateLimited
      : response.status === SpotifyMobilePolicy.missingStatus ? IntegrationFailureCode.NotFound : IntegrationFailureCode.Network;
    throw new IntegrationFailure(failure, response.retryAfterSeconds);
  }
}

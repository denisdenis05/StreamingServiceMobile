import { IntegrationFailure, IntegrationFailureCode, SharedPlaybackStatus } from 'streaming-service-spotify-jam';
import type { SharedPlaybackSnapshot } from 'streaming-service-spotify-jam';
import type { URL as ParsedAddress } from 'react-native-url-polyfill';

export interface SpotifyJamPlaybackContext {
  readonly streamingServiceAccountIdentifier: string;
  readonly baseAddress: string;
  readonly spotifyAccountIdentifier: string;
  readonly jamSessionIdentifier: string;
  readonly hostDeviceIdentifier: string;
  readonly handle: number;
  readonly generation: number;
}

export interface SpotifyJamPlaybackConfiguration extends SpotifyJamPlaybackContext {
  readonly market: string;
  readonly accessToken: string;
}

export interface SpotifyJamPlaybackNative {
  startFollowing(identifier: string, serializedConfiguration: string): Promise<string>;
  stopFollowing(): Promise<void>;
  getSnapshot(): Promise<string>;
  updateApplicationAccount(accountIdentifier: string | null, accessToken: string | null): Promise<void>;
}

export interface SpotifyJamPlaybackObservation extends SpotifyJamPlaybackContext {
  readonly identifier: string;
  readonly market: string;
  readonly nativeHandoff: boolean;
  readonly terminal: boolean;
  readonly playerIdentity: SpotifyJamPlaybackPlayerIdentity | null;
  readonly snapshot: SharedPlaybackSnapshot;
}

export interface SpotifyJamPlaybackPlayerIdentity {
  readonly engineEpoch: string;
  readonly authenticationEpoch: string;
}

export const SpotifyJamPlaybackPolicy = Object.freeze({ maximumSnapshotCharacters: 131072,
  maximumIdentifierCharacters: 2048, maximumRequestIdentifierCharacters: 128, firstIdentifier: 1,
  maximumTokenCharacters: 65536, stringType: 'string', objectType: 'object', booleanType: 'boolean', numberType: 'number', secureProtocol: 'https:',
  identifierPattern: /^[^\s\u0000-\u001f\u007f]+$/, marketPattern: /^[A-Z]{2}$/ } as const);

enum NativeStatus {
  Detached = 'Detached', Waiting = 'Waiting', Resolving = 'Resolving', Preparing = 'Preparing',
  Following = 'Following', Buffering = 'Buffering', Stale = 'Stale', Unavailable = 'Unavailable',
  Suspended = 'Suspended', Failed = 'Failed',
}

const Statuses: Readonly<Record<NativeStatus, SharedPlaybackStatus>> = Object.freeze({
  [NativeStatus.Detached]: SharedPlaybackStatus.Detached, [NativeStatus.Waiting]: SharedPlaybackStatus.Waiting,
  [NativeStatus.Resolving]: SharedPlaybackStatus.Resolving, [NativeStatus.Preparing]: SharedPlaybackStatus.Preparing,
  [NativeStatus.Following]: SharedPlaybackStatus.Following, [NativeStatus.Buffering]: SharedPlaybackStatus.Buffering,
  [NativeStatus.Stale]: SharedPlaybackStatus.Stale, [NativeStatus.Unavailable]: SharedPlaybackStatus.Unavailable,
  [NativeStatus.Suspended]: SharedPlaybackStatus.Detached, [NativeStatus.Failed]: SharedPlaybackStatus.Failed,
});

const Failures: Readonly<Record<string, IntegrationFailureCode>> = Object.freeze({
  InvalidInput: IntegrationFailureCode.InvalidInput, InvalidObservation: IntegrationFailureCode.InvalidResponse,
  SourceUnavailable: IntegrationFailureCode.Network, AuthorizationRequired: IntegrationFailureCode.Unauthorized,
  RecordingUnavailable: IntegrationFailureCode.NotFound, AmbiguousRecording: IntegrationFailureCode.NotFound,
  Unsupported: IntegrationFailureCode.Unsupported, Superseded: IntegrationFailureCode.Superseded,
  Cancelled: IntegrationFailureCode.Canceled, LocalSuspended: IntegrationFailureCode.Canceled,
  PlayerUnavailable: IntegrationFailureCode.Network, UnknownOutcome: IntegrationFailureCode.UnknownOutcome,
  Capacity: IntegrationFailureCode.Backpressure,
});

export const EmptySpotifyPlaybackSnapshot: SharedPlaybackSnapshot = Object.freeze({ status: SharedPlaybackStatus.Detached,
  identity: null, occurrenceIdentifier: null, recordingIdentifier: null, sequence: null, driftMilliseconds: null, failure: null });

export function validateSpotifyPlaybackIdentifier(value: unknown, maximumCharacters: number = SpotifyJamPlaybackPolicy.maximumIdentifierCharacters): string {
  if (typeof value !== SpotifyJamPlaybackPolicy.stringType || !(value as string).length || (value as string).length > maximumCharacters
    || !SpotifyJamPlaybackPolicy.identifierPattern.test(value as string)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  return value as string;
}

export function validateSpotifyPlaybackContext(context: SpotifyJamPlaybackContext): void {
  [context.streamingServiceAccountIdentifier, context.spotifyAccountIdentifier, context.jamSessionIdentifier,
    context.hostDeviceIdentifier].forEach(value => validateSpotifyPlaybackIdentifier(value));
  if (![context.handle, context.generation].every(value => Number.isSafeInteger(value) && value >= SpotifyJamPlaybackPolicy.firstIdentifier)) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
  let address: ParsedAddress;
  try { address = new URL(context.baseAddress) as ParsedAddress; } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
  if (address.protocol !== SpotifyJamPlaybackPolicy.secureProtocol || address.username || address.password || address.search || address.hash) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
}

export function sameSpotifyPlaybackContext(first: SpotifyJamPlaybackContext, second: SpotifyJamPlaybackContext): boolean {
  return first.streamingServiceAccountIdentifier === second.streamingServiceAccountIdentifier && first.baseAddress === second.baseAddress
    && first.spotifyAccountIdentifier === second.spotifyAccountIdentifier && first.jamSessionIdentifier === second.jamSessionIdentifier
    && first.hostDeviceIdentifier === second.hostDeviceIdentifier && first.handle === second.handle && first.generation === second.generation;
}

export function decodeSpotifyJamPlayback(serialized: unknown): SpotifyJamPlaybackObservation | null {
  try {
    if (typeof serialized !== SpotifyJamPlaybackPolicy.stringType || (serialized as string).length > SpotifyJamPlaybackPolicy.maximumSnapshotCharacters) throw new Error();
    const value: unknown = JSON.parse(serialized as string);
    if (value === null || typeof value !== SpotifyJamPlaybackPolicy.objectType || Array.isArray(value)) throw new Error();
    const response = value as Record<string, unknown>;
    if (response.status === NativeStatus.Detached && response.identifier === null && response.nativeHandoff === false) return null;
    const context: SpotifyJamPlaybackContext = { streamingServiceAccountIdentifier: response.streamingServiceAccountIdentifier as string,
      baseAddress: response.baseAddress as string, spotifyAccountIdentifier: response.spotifyAccountIdentifier as string,
      jamSessionIdentifier: response.jamSessionIdentifier as string, hostDeviceIdentifier: response.hostDeviceIdentifier as string,
      handle: response.handle as number, generation: response.generation as number };
    validateSpotifyPlaybackContext(context);
    const identifier = validateSpotifyPlaybackIdentifier(response.identifier, SpotifyJamPlaybackPolicy.maximumRequestIdentifierCharacters);
    if (typeof response.market !== SpotifyJamPlaybackPolicy.stringType || !SpotifyJamPlaybackPolicy.marketPattern.test(response.market as string)
      || !Object.values(NativeStatus).includes(response.status as NativeStatus) || typeof response.nativeHandoff !== SpotifyJamPlaybackPolicy.booleanType) throw new Error();
    const nativeStatus = response.status as NativeStatus;
    if (response.nativeHandoff && [NativeStatus.Failed, NativeStatus.Suspended, NativeStatus.Detached].includes(nativeStatus)) throw new Error();
    const playerIdentity = response.playerEngineEpoch === null && response.playerAuthenticationEpoch === null ? null : Object.freeze({
      engineEpoch: validateSpotifyPlaybackIdentifier(response.playerEngineEpoch),
      authenticationEpoch: validateSpotifyPlaybackIdentifier(response.playerAuthenticationEpoch),
    });
    if (response.nativeHandoff && playerIdentity === null) throw new Error();
    const occurrenceIdentifier = response.occurrenceIdentifier === null ? null : validateSpotifyPlaybackIdentifier(response.occurrenceIdentifier);
    const recordingIdentifier = response.recordingIdentifier === null ? null : validateSpotifyPlaybackIdentifier(response.recordingIdentifier);
    if (response.driftMilliseconds !== null && (typeof response.driftMilliseconds !== SpotifyJamPlaybackPolicy.numberType || !Number.isFinite(response.driftMilliseconds))) throw new Error();
    if (response.failure !== null && (typeof response.failure !== SpotifyJamPlaybackPolicy.stringType || !Object.prototype.hasOwnProperty.call(Failures, response.failure as string))) throw new Error();
    const failure = nativeStatus === NativeStatus.Suspended ? null : response.failure === null ? null : Failures[response.failure as string]!;
    const snapshot = Object.freeze({ status: Statuses[nativeStatus], identity: Object.freeze({ accountIdentifier: context.spotifyAccountIdentifier,
      sessionIdentifier: context.jamSessionIdentifier, authorityIdentifier: context.hostDeviceIdentifier }), occurrenceIdentifier,
      recordingIdentifier, sequence: null, driftMilliseconds: response.driftMilliseconds as number | null, failure });
    return Object.freeze({ ...context, identifier, market: response.market as string, nativeHandoff: response.nativeHandoff as boolean,
      terminal: nativeStatus === NativeStatus.Failed || nativeStatus === NativeStatus.Suspended, playerIdentity, snapshot });
  } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse); }
}

import { IntegrationFailureCode } from 'streaming-service-spotify-jam';

export const SpotifyMobilePolicy = Object.freeze({
  authorizationRedirectAddress: 'streamingservicespotify://callback',
  oauthProfileAddress: 'https://api.spotify.com/v1/me',
  profileAddress: 'https://api-partner.spotify.com/pathfinder/v1/query', devicesAddress: 'https://api.spotify.com/v1/me/player/devices',
  profileOperation: 'profileAttributes', profileQueryHash: '53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced',
  operationParameter: 'operationName', variablesParameter: 'variables', extensionsParameter: 'extensions', persistedQueryVersion: 1,
  resolverAddress: 'https://apresolve.spotify.com/?type=spclient', secureProtocol: 'https:', serviceSuffix: '-spclient.spotify.com',
  authorizationHeader: 'authorization', bearerPrefix: 'Bearer ', acceptHeader: 'accept', jsonMediaType: 'application/json',
  readMethod: 'GET', successfulMinimumStatus: 200, successfulMaximumStatus: 299, unauthorizedStatus: 401,
  forbiddenStatus: 403, rateLimitedStatus: 429, missingStatus: 404, stringType: 'string', booleanType: 'boolean', objectType: 'object',
  maximumDevices: 50, firstPosition: 0, emptyCount: 0, sequenceIncrement: 1, maximumTokenCharacters: 16384,
  temporaryConnectionLifetimeMilliseconds: 1800000, maximumIdentifierCharacters: 512, maximumInvitationCharacters: 4096,
  invitationTokenPattern: /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/, bearerPattern: /^Bearer\s+/i,
  spotifyInvitationPrefix: 'spotify:socialsession:', spotifyHost: 'open.spotify.com',
  socialSessionPath: '/socialsession/', jamPath: '/jam/', slash: '/', emptyText: '',
  whitespacePattern: /\s/, dotPath: '.', parentPath: '..', unknownDeviceName: 'Spotify device',
});

export const SpotifyFailureMessages: Readonly<Record<IntegrationFailureCode, string>> = Object.freeze({
  [IntegrationFailureCode.CredentialStorage]: 'Saved Spotify login could not be accessed. Unlock the device or sign in again.',
  [IntegrationFailureCode.InvalidInput]: 'Check the client ID, song link, device or Jam invitation and try again.',
  [IntegrationFailureCode.InvalidResponse]: 'Spotify returned an unexpected response. Refresh before trying another action.',
  [IntegrationFailureCode.Canceled]: 'The request was cancelled.',
  [IntegrationFailureCode.Superseded]: 'The connection changed. Try again with the current account.',
  [IntegrationFailureCode.Unauthorized]: 'Spotify authorization expired or was rejected. Log in again.',
  [IntegrationFailureCode.NativeSessionRejected]: 'Spotify rejected the native session. Sign in again. Stage: native-session.',
  [IntegrationFailureCode.NativeTokenRejected]: 'Spotify rejected the native token exchange. Sign in again. Stage: native-token.',
  [IntegrationFailureCode.Forbidden]: 'Spotify did not allow that action. Check your account, approved permissions and Jam role.',
  [IntegrationFailureCode.NotFound]: 'Spotify could not find that Jam or device. Check the invitation and try again.',
  [IntegrationFailureCode.RateLimited]: 'Spotify is limiting requests. Wait before trying again.',
  [IntegrationFailureCode.Network]: 'Spotify could not be reached. Check your connection and try again.',
  [IntegrationFailureCode.Deadline]: 'Spotify took too long to respond. Try refreshing the session.',
  [IntegrationFailureCode.Unsupported]: 'That operation is not available for this connection.',
  [IntegrationFailureCode.UnknownOutcome]: 'The action may have reached Spotify. Refresh shared state before another change. If unavailable, reconnect without repeating the action.',
  [IntegrationFailureCode.Backpressure]: 'Spotify is busy or limiting requests. Wait before trying again.',
});

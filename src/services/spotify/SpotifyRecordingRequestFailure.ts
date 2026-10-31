import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';

export const SpotifyRecordingRequestPolicy = Object.freeze({
  numberType: 'number',
  minimumStatus: 100,
  maximumStatus: 599,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  deadline: 408,
  rateLimited: 429,
});

export function spotifyRecordingHttpStatus(failure: unknown): number | null {
  try {
    const status = (failure as { readonly response?: { readonly status?: unknown } } | null)?.response?.status;
    if (typeof status !== SpotifyRecordingRequestPolicy.numberType) return null;
    const numericStatus = status as number;
    return Number.isSafeInteger(numericStatus) && numericStatus >= SpotifyRecordingRequestPolicy.minimumStatus
      && numericStatus <= SpotifyRecordingRequestPolicy.maximumStatus ? numericStatus : null;
  } catch { return null; }
}

export function spotifyRecordingRequestFailure(failure: unknown, cancellation: AbortSignal): IntegrationFailure {
  if (cancellation.aborted) return new IntegrationFailure(IntegrationFailureCode.Canceled);
  if (failure instanceof IntegrationFailure) return failure;
  const status = spotifyRecordingHttpStatus(failure);
  const code = status === SpotifyRecordingRequestPolicy.unauthorized ? IntegrationFailureCode.Unauthorized
    : status === SpotifyRecordingRequestPolicy.forbidden ? IntegrationFailureCode.Forbidden
    : status === SpotifyRecordingRequestPolicy.notFound ? IntegrationFailureCode.NotFound
    : status === SpotifyRecordingRequestPolicy.deadline ? IntegrationFailureCode.Deadline
    : status === SpotifyRecordingRequestPolicy.rateLimited ? IntegrationFailureCode.RateLimited
    : IntegrationFailureCode.Network;
  return new IntegrationFailure(code);
}

import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { Scheduler } from 'streaming-service-spotify-jam';
import { URL } from 'react-native-url-polyfill';
import { spotifyInvitationToken } from './SpotifyInvitation';
import { SpotifyMobilePolicy } from './SpotifyMobilePolicy';

const ShortInvitationHosts = Object.freeze({ shortLink: 'spotify.link', applicationLink: 'spotify.app.link' });
const ResponseInvitationHosts = Object.freeze({ ...ShortInvitationHosts, webPlayer: 'open.spotify.com' });
export const SpotifyInvitationPolicy = Object.freeze({
  shortHosts: Object.freeze(Object.values(ShortInvitationHosts)), responseHosts: Object.freeze(Object.values(ResponseInvitationHosts)),
  credentials: 'omit', redirect: 'follow', method: 'GET', deadlineMilliseconds: 15000,
  maximumPageCharacters: 1048576, singleCandidateCount: 1, emptyCount: 0, firstPosition: 0,
  candidatePattern: /https:\/\/open\.spotify\.com\/socialsession\/[A-Za-z0-9_~-][A-Za-z0-9._~-]{0,511}(?=[?&#"'\s<>]|$)/g,
  abortEvent: 'abort', successfulMinimumStatus: 200, successfulMaximumStatus: 299,
} as const);

export interface SpotifyInvitationPage {
  readonly address: string;
  readonly text: string;
}
export interface SpotifyInvitationReader {
  read(address: string, cancellation: AbortSignal): Promise<SpotifyInvitationPage>;
}
export interface SpotifyInvitationRequest {
  readonly method: string;
  readonly credentials: typeof SpotifyInvitationPolicy.credentials;
  readonly redirect: typeof SpotifyInvitationPolicy.redirect;
  readonly signal: AbortSignal;
}
export interface SpotifyInvitationResponse {
  readonly url: string;
  readonly status: number;
  text(): Promise<string>;
}
export type SpotifyInvitationFetch = (address: string, options: SpotifyInvitationRequest) => Promise<SpotifyInvitationResponse>;

function trustedInvitationAddress(input: string, hosts: readonly string[]): URL {
  let address: URL;
  try { address = new URL(input); } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
  if (address.protocol !== SpotifyMobilePolicy.secureProtocol || !hosts.includes(address.hostname)
    || address.username || address.password || address.port || input.length > SpotifyMobilePolicy.maximumInvitationCharacters) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
  return address;
}

export class SpotifyInvitationResolver {
  constructor(private readonly pages: SpotifyInvitationReader) {}

  async resolve(invitation: string, cancellation: AbortSignal): Promise<string> {
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    try { return spotifyInvitationToken(invitation); } catch {}
    const address = trustedInvitationAddress(invitation.trim(), SpotifyInvitationPolicy.shortHosts);
    const page = await this.pages.read(address.toString(), cancellation);
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    trustedInvitationAddress(page.address, SpotifyInvitationPolicy.responseHosts);
    if (page.text.length > SpotifyInvitationPolicy.maximumPageCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    try { return spotifyInvitationToken(page.address); } catch {}
    const candidates = new Set([...page.text.matchAll(SpotifyInvitationPolicy.candidatePattern)]
      .map(match => spotifyInvitationToken(match[SpotifyInvitationPolicy.firstPosition]!)));
    if (candidates.size !== SpotifyInvitationPolicy.singleCandidateCount) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
    return candidates.values().next().value!;
  }
}

export class FetchSpotifyInvitationReader implements SpotifyInvitationReader {
  constructor(private readonly request: SpotifyInvitationFetch, private readonly scheduler: Scheduler) {}

  async read(address: string, cancellation: AbortSignal): Promise<SpotifyInvitationPage> {
    trustedInvitationAddress(address, SpotifyInvitationPolicy.shortHosts);
    if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timedOut = false;
    cancellation.addEventListener(SpotifyInvitationPolicy.abortEvent, abort, { once: true });
    const cancelDeadline = this.scheduler.schedule(SpotifyInvitationPolicy.deadlineMilliseconds, () => { timedOut = true; controller.abort(); });
    try {
      const response = await this.request(address, { method: SpotifyInvitationPolicy.method, credentials: SpotifyInvitationPolicy.credentials,
        redirect: SpotifyInvitationPolicy.redirect, signal: controller.signal });
      trustedInvitationAddress(response.url, SpotifyInvitationPolicy.responseHosts);
      if (response.status < SpotifyInvitationPolicy.successfulMinimumStatus || response.status > SpotifyInvitationPolicy.successfulMaximumStatus) {
        throw new IntegrationFailure(response.status === SpotifyMobilePolicy.rateLimitedStatus
          ? IntegrationFailureCode.RateLimited : IntegrationFailureCode.NotFound);
      }
      const text = await response.text();
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      if (timedOut) throw new IntegrationFailure(IntegrationFailureCode.Deadline);
      if (text.length > SpotifyInvitationPolicy.maximumPageCharacters) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
      return Object.freeze({ address: response.url, text });
    } catch (failure) {
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      if (timedOut) throw new IntegrationFailure(IntegrationFailureCode.Deadline);
      if (failure instanceof IntegrationFailure) throw failure;
      throw new IntegrationFailure(IntegrationFailureCode.Network);
    } finally {
      cancelDeadline();
      cancellation.removeEventListener(SpotifyInvitationPolicy.abortEvent, abort);
      controller.abort();
    }
  }
}

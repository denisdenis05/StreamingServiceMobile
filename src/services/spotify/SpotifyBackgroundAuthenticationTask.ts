import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { Scheduler } from 'streaming-service-spotify-jam';
import type { URL as ParsedAddress } from 'react-native-url-polyfill';

export interface SpotifyBackgroundAuthenticationJob {
  readonly requestIdentifier: string;
  readonly streamingServiceAccountIdentifier: string;
  readonly spotifyAccountIdentifier: string;
  readonly jamSessionIdentifier: string;
  readonly hostDeviceIdentifier: string;
  readonly handle: number;
  readonly generation: number;
  readonly baseAddress: string;
}
export interface SpotifyBackgroundAuthenticationAccount {
  readonly accountIdentifier: string | null;
  readonly token: string | null;
  readonly isLoggedIn: boolean;
}
export interface SpotifyBackgroundAuthenticationDependencies {
  readonly baseAddress: string;
  readonly claim: (requestIdentifier: string) => Promise<SpotifyBackgroundAuthenticationJob | null>;
  readonly isPending: (requestIdentifier: string) => Promise<boolean>;
  readonly complete: (job: SpotifyBackgroundAuthenticationJob, token: string) => Promise<void>;
  readonly fail: (requestIdentifier: string) => Promise<void>;
  readonly restoreAccount: () => Promise<void>;
  readonly refreshAccount: () => Promise<void>;
  readonly currentAccount: () => SpotifyBackgroundAuthenticationAccount;
  readonly scheduler: Scheduler;
}
export const SpotifyBackgroundAuthenticationPolicy = Object.freeze({ taskName: 'StreamingServiceSpotifyAuthentication',
  timeoutMilliseconds: 30000, maximumIdentifierCharacters: 512, minimumIdentifierCharacters: 1, firstIdentity: 1,
  stringType: 'string', objectType: 'object', abortEvent: 'abort', secureProtocol: 'https:', controlPattern: /[\u0000-\u0020\u007f]/ } as const);
function validIdentifier(value: unknown): value is string {
  return typeof value === SpotifyBackgroundAuthenticationPolicy.stringType
    && (value as string).length >= SpotifyBackgroundAuthenticationPolicy.minimumIdentifierCharacters
    && (value as string).length <= SpotifyBackgroundAuthenticationPolicy.maximumIdentifierCharacters
    && !SpotifyBackgroundAuthenticationPolicy.controlPattern.test(value as string);
}
function address(value: string): string {
  let parsed: ParsedAddress;
  try { parsed = new URL(value) as ParsedAddress; } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
  if (parsed.protocol !== SpotifyBackgroundAuthenticationPolicy.secureProtocol || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
  return parsed.toString();
}
function capture(requestIdentifier: string, value: SpotifyBackgroundAuthenticationJob, baseAddress: string): SpotifyBackgroundAuthenticationJob {
  if (!value || typeof value !== SpotifyBackgroundAuthenticationPolicy.objectType || Array.isArray(value)
    || value.requestIdentifier !== requestIdentifier || ![value.requestIdentifier, value.streamingServiceAccountIdentifier,
      value.spotifyAccountIdentifier, value.jamSessionIdentifier, value.hostDeviceIdentifier].every(validIdentifier)
    || ![value.handle, value.generation].every(identity => Number.isSafeInteger(identity) && identity >= SpotifyBackgroundAuthenticationPolicy.firstIdentity)
    || address(value.baseAddress) !== address(baseAddress)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  return Object.freeze({ requestIdentifier, streamingServiceAccountIdentifier: value.streamingServiceAccountIdentifier,
    spotifyAccountIdentifier: value.spotifyAccountIdentifier, jamSessionIdentifier: value.jamSessionIdentifier,
    hostDeviceIdentifier: value.hostDeviceIdentifier, handle: value.handle, generation: value.generation, baseAddress: value.baseAddress });
}
export class SpotifyBackgroundAuthenticationTask {
  constructor(private readonly dependencies: SpotifyBackgroundAuthenticationDependencies) {}

  async execute(requestIdentifier: string, cancellation?: AbortSignal): Promise<void> {
    if (!validIdentifier(requestIdentifier)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    let rejectDeadline: (failure: IntegrationFailure) => void = () => undefined;
    const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
    const abort = () => rejectDeadline(new IntegrationFailure(IntegrationFailureCode.Canceled));
    const wait = <Response>(operation: Promise<Response>): Promise<Response> => Promise.race([operation, deadline]);
    let cancelTimer: () => void = () => undefined;
    let claimed = false;
    void deadline.catch(() => undefined);
    try {
      cancelTimer = this.dependencies.scheduler.schedule(SpotifyBackgroundAuthenticationPolicy.timeoutMilliseconds,
        () => rejectDeadline(new IntegrationFailure(IntegrationFailureCode.Deadline)));
      cancellation?.addEventListener(SpotifyBackgroundAuthenticationPolicy.abortEvent, abort, { once: true });
      if (cancellation?.aborted) { abort(); await deadline; }
      const supplied = await wait(this.dependencies.claim(requestIdentifier));
      if (supplied === null) return;
      claimed = true;
      const job = capture(requestIdentifier, supplied, this.dependencies.baseAddress);
      await wait(this.dependencies.restoreAccount());
      await wait(this.requireCurrent(job));
      await wait(this.dependencies.refreshAccount());
      await wait(this.requireCurrent(job));
      const account = this.dependencies.currentAccount();
      if (account.token === null || !account.isLoggedIn || account.accountIdentifier !== job.streamingServiceAccountIdentifier) {
        throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      }
      await wait(this.dependencies.complete(job, account.token));
    } catch {
      if (claimed) { try { await wait(this.dependencies.fail(requestIdentifier)); } catch {} }
    } finally {
      cancelTimer();
      cancellation?.removeEventListener(SpotifyBackgroundAuthenticationPolicy.abortEvent, abort);
    }
  }

  private async requireCurrent(job: SpotifyBackgroundAuthenticationJob): Promise<void> {
    const before = this.dependencies.currentAccount();
    if (!before.isLoggedIn || before.accountIdentifier !== job.streamingServiceAccountIdentifier
      || !await this.dependencies.isPending(job.requestIdentifier)) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    const after = this.dependencies.currentAccount();
    if (!after.isLoggedIn || after.accountIdentifier !== job.streamingServiceAccountIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
}

import { IntegrationFailure, IntegrationFailureCode } from 'streaming-service-spotify-jam';
import type { Scheduler } from 'streaming-service-spotify-jam';
import type { URL as ParsedAddress } from 'react-native-url-polyfill';
export interface SpotifyBackgroundHostingJob {
  readonly requestIdentifier: string;
  readonly streamingServiceAccountIdentifier: string;
  readonly spotifyAccountIdentifier: string;
  readonly jamSessionIdentifier: string;
  readonly hostDeviceIdentifier: string;
  readonly handle: number;
  readonly generation: number;
  readonly baseAddress: string;
  readonly market: string;
  readonly recordingIdentifier: string;
}
export interface SpotifyBackgroundHostingDependencies {
  readonly claim: (identifier: string) => Promise<SpotifyBackgroundHostingJob | null>;
  readonly isPending: (identifier: string) => Promise<boolean>;
  readonly complete: (identifier: string, track: string) => Promise<void>;
  readonly fail: (identifier: string) => Promise<void>;
  readonly restoreAccount: () => Promise<void>;
  readonly currentAccountIdentifier: () => string | null;
  readonly match: (job: SpotifyBackgroundHostingJob, cancellation: AbortSignal) => Promise<string | null>;
  readonly scheduler: Scheduler;
}
export const SpotifyBackgroundHostingPolicy = Object.freeze({ taskName: 'StreamingServiceSpotifyHostingRecording', timeoutMilliseconds: 30000,
  maximumIdentifierCharacters: 512, identifierPattern: /^[^\s\u0000-\u001f\u007f]+$/, trackPattern: /^[A-Za-z0-9]{22}$/,
  marketPattern: /^[A-Z]{2}$/, firstIdentifier: 1, secureProtocol: 'https:', abortEvent: 'abort', stringType: 'string' } as const);
export class SpotifyBackgroundHostingTask {
  constructor(private readonly dependencies: SpotifyBackgroundHostingDependencies) {}
  async execute(identifier: string): Promise<void> {
    const cancellation = new AbortController();
    let claimed = false;
    const cancel = this.dependencies.scheduler.schedule(SpotifyBackgroundHostingPolicy.timeoutMilliseconds, () => cancellation.abort());
    try {
      const job = await this.wait(this.dependencies.claim(identifier), cancellation.signal);
      if (!job) return;
      claimed = true; this.validate(identifier, job);
      await this.wait(this.dependencies.restoreAccount(), cancellation.signal);
      await this.requireCurrent(job, cancellation.signal);
      const track = await this.wait(this.dependencies.match(job, cancellation.signal), cancellation.signal);
      await this.requireCurrent(job, cancellation.signal);
      if (!track || !SpotifyBackgroundHostingPolicy.trackPattern.test(track)) throw new IntegrationFailure(IntegrationFailureCode.NotFound);
      await this.wait(this.dependencies.complete(identifier, track), cancellation.signal);
    } catch {
      if (claimed) try { await this.wait(this.dependencies.fail(identifier), cancellation.signal); } catch { return; }
    } finally { cancel(); cancellation.abort(); }
  }
  private validate(identifier: string, job: SpotifyBackgroundHostingJob): void {
    if (identifier !== job.requestIdentifier || ![job.requestIdentifier, job.streamingServiceAccountIdentifier, job.spotifyAccountIdentifier,
      job.jamSessionIdentifier, job.hostDeviceIdentifier, job.recordingIdentifier].every(value => typeof value === SpotifyBackgroundHostingPolicy.stringType
        && value.length <= SpotifyBackgroundHostingPolicy.maximumIdentifierCharacters && SpotifyBackgroundHostingPolicy.identifierPattern.test(value))
      || ![job.handle, job.generation].every(value => Number.isSafeInteger(value) && value >= SpotifyBackgroundHostingPolicy.firstIdentifier)
      || !SpotifyBackgroundHostingPolicy.marketPattern.test(job.market)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    const address = new URL(job.baseAddress) as ParsedAddress;
    if (address.protocol !== SpotifyBackgroundHostingPolicy.secureProtocol || address.username || address.password || address.hash || address.search) {
      throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    }
  }
  private async requireCurrent(job: SpotifyBackgroundHostingJob, cancellation: AbortSignal): Promise<void> {
    if (cancellation.aborted || this.dependencies.currentAccountIdentifier() !== job.streamingServiceAccountIdentifier
      || !await this.wait(this.dependencies.isPending(job.requestIdentifier), cancellation)
      || this.dependencies.currentAccountIdentifier() !== job.streamingServiceAccountIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }
  private wait<Response>(operation: Promise<Response>, cancellation: AbortSignal): Promise<Response> {
    if (cancellation.aborted) { void operation.catch(() => undefined); return Promise.reject(new IntegrationFailure(IntegrationFailureCode.Canceled)); }
    return new Promise((resolve, reject) => {
      const abort = () => reject(new IntegrationFailure(IntegrationFailureCode.Canceled));
      cancellation.addEventListener(SpotifyBackgroundHostingPolicy.abortEvent, abort, { once: true });
      operation.then(value => { cancellation.removeEventListener(SpotifyBackgroundHostingPolicy.abortEvent, abort); resolve(value); },
        failure => { cancellation.removeEventListener(SpotifyBackgroundHostingPolicy.abortEvent, abort); reject(failure); });
    });
  }
}

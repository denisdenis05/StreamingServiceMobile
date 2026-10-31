import { CandidateRanker, IntegrationFailure, IntegrationFailureCode, MatchStatus, TrackTranslator,
  decodeSpotifyConnectMetadata } from 'streaming-service-spotify-jam';
import type { AssociationStore, CatalogSearch, RecordingCatalog, Scheduler, SpotifyCatalog, SpotifySong } from 'streaming-service-spotify-jam';
import type { URL as ParsedAddress } from 'react-native-url-polyfill';

export interface SpotifyBackgroundRecordingJob {
  readonly requestIdentifier: string;
  readonly streamingServiceAccountIdentifier: string;
  readonly spotifyAccountIdentifier: string;
  readonly jamSessionIdentifier: string;
  readonly hostDeviceIdentifier: string;
  readonly handle: number;
  readonly generation: number;
  readonly spotifyTrackIdentifier: string;
  readonly market: string;
  readonly baseAddress: string;
  readonly metadata: unknown;
}

export type SpotifyBackgroundRecordingResult =
  | { readonly status: 'matched'; readonly recordingIdentifier: string; readonly title: string; readonly artist: string }
  | { readonly status: 'unavailable' | 'ambiguous' };

export interface SpotifyBackgroundRecordingDependencies {
  readonly claim: (requestIdentifier: string) => Promise<SpotifyBackgroundRecordingJob | null>;
  readonly isPending: (requestIdentifier: string) => Promise<boolean>;
  readonly complete: (requestIdentifier: string, result: SpotifyBackgroundRecordingResult) => Promise<void>;
  readonly fail: (requestIdentifier: string, failure: IntegrationFailureCode) => Promise<void>;
  readonly restoreAccount: () => Promise<void>;
  readonly currentAccountIdentifier: () => string | null;
  readonly recordings: (job: SpotifyBackgroundRecordingJob) => RecordingCatalog;
  readonly associations: (job: SpotifyBackgroundRecordingJob) => AssociationStore;
  readonly synchronizePlayerAuthentication: (job: SpotifyBackgroundRecordingJob, cancellation: AbortSignal) => Promise<void>;
  readonly scheduler: Scheduler;
}

export const SpotifyBackgroundRecordingPolicy = Object.freeze({ timeoutMilliseconds: 30000,
  maximumIdentifierCharacters: 512, firstIdentifier: 1, firstPosition: 0, singleSong: 1,
  stringType: 'string', objectType: 'object', abortEvent: 'abort', trackPattern: /^[A-Za-z0-9]{22}$/, marketPattern: /^[A-Z]{2}$/,
  controlPattern: /[\u0000-\u0020\u007f]/, secureProtocol: 'https:', matched: 'matched', unavailable: 'unavailable', ambiguous: 'ambiguous' } as const);
const FailureCodes = new Set<string>(Object.values(IntegrationFailureCode));

class BackgroundMetadataCatalog implements SpotifyCatalog {
  constructor(private readonly song: SpotifySong) {}
  async lookup(identifier: string, _market: string, cancellation: AbortSignal): Promise<SpotifySong | null> {
    checkCancellation(cancellation);
    return identifier === this.song.identifier ? this.song : null;
  }
  async search(_search: CatalogSearch, _market: string, cancellation: AbortSignal): Promise<readonly SpotifySong[]> {
    checkCancellation(cancellation);
    throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  }
}

function checkCancellation(cancellation: AbortSignal): void {
  if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
}
function identifier(value: unknown): value is string {
  return typeof value === SpotifyBackgroundRecordingPolicy.stringType && (value as string).length >= SpotifyBackgroundRecordingPolicy.firstIdentifier
    && (value as string).length <= SpotifyBackgroundRecordingPolicy.maximumIdentifierCharacters
    && !SpotifyBackgroundRecordingPolicy.controlPattern.test(value as string);
}
function validateJob(requestIdentifier: string, job: SpotifyBackgroundRecordingJob): void {
  let address: ParsedAddress;
  try { address = new URL(job.baseAddress) as ParsedAddress; } catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidInput); }
  if (address.protocol !== SpotifyBackgroundRecordingPolicy.secureProtocol || address.username || address.password
    || address.search || address.hash) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  if (typeof job !== SpotifyBackgroundRecordingPolicy.objectType || job === null || Array.isArray(job)
    || job.requestIdentifier !== requestIdentifier || ![job.requestIdentifier, job.streamingServiceAccountIdentifier,
    job.spotifyAccountIdentifier, job.jamSessionIdentifier, job.hostDeviceIdentifier].every(identifier)
    || ![job.handle, job.generation].every(value => Number.isSafeInteger(value) && value >= SpotifyBackgroundRecordingPolicy.firstIdentifier)
    || !identifier(job.spotifyTrackIdentifier) || !SpotifyBackgroundRecordingPolicy.trackPattern.test(job.spotifyTrackIdentifier)
    || typeof job.market !== SpotifyBackgroundRecordingPolicy.stringType || !SpotifyBackgroundRecordingPolicy.marketPattern.test(job.market)) {
    throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
  }
}

function captureJob(requestIdentifier: string, supplied: SpotifyBackgroundRecordingJob): { readonly job: SpotifyBackgroundRecordingJob; readonly song: SpotifySong } {
  validateJob(requestIdentifier, supplied);
  const songs = decodeSpotifyConnectMetadata(supplied.metadata, supplied.handle, supplied.generation, [supplied.spotifyTrackIdentifier]);
  if (songs.length !== SpotifyBackgroundRecordingPolicy.singleSong) throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse);
  const song = songs[SpotifyBackgroundRecordingPolicy.firstPosition]!;
  const metadata = Object.freeze({ handle: supplied.handle, generation: supplied.generation, tracks: Object.freeze([
    Object.freeze({ spotifyTrackIdentifier: song.identifier, title: song.title, artistNames: song.artistNames,
      durationMilliseconds: song.durationMilliseconds, recordingCodes: song.recordingCodes }),
  ]) });
  return Object.freeze({ song, job: Object.freeze({ requestIdentifier: supplied.requestIdentifier,
    streamingServiceAccountIdentifier: supplied.streamingServiceAccountIdentifier, spotifyAccountIdentifier: supplied.spotifyAccountIdentifier,
    jamSessionIdentifier: supplied.jamSessionIdentifier, hostDeviceIdentifier: supplied.hostDeviceIdentifier,
    handle: supplied.handle, generation: supplied.generation, spotifyTrackIdentifier: supplied.spotifyTrackIdentifier,
    market: supplied.market, baseAddress: supplied.baseAddress, metadata }) });
}

export class SpotifyBackgroundRecordingTask {
  constructor(private readonly dependencies: SpotifyBackgroundRecordingDependencies) {}

  async execute(requestIdentifier: string, cancellation?: AbortSignal): Promise<void> {
    if (!identifier(requestIdentifier)) throw new IntegrationFailure(IntegrationFailureCode.InvalidInput);
    const controller = new AbortController();
    let cancellationFailure = IntegrationFailureCode.Canceled;
    const abort = () => controller.abort();
    cancellation?.addEventListener(SpotifyBackgroundRecordingPolicy.abortEvent, abort, { once: true });
    if (cancellation?.aborted) controller.abort();
    let cancelTimer: () => void = () => undefined;
    let claimed = false;
    try {
      cancelTimer = this.dependencies.scheduler.schedule(SpotifyBackgroundRecordingPolicy.timeoutMilliseconds, () => {
        cancellationFailure = IntegrationFailureCode.Deadline; controller.abort();
      });
      checkCancellation(controller.signal);
      const suppliedJob = await this.wait(this.dependencies.claim(requestIdentifier), controller.signal);
      checkCancellation(controller.signal);
      if (suppliedJob === null) return;
      claimed = true;
      const { job, song } = captureJob(requestIdentifier, suppliedJob);
      await this.wait(this.dependencies.restoreAccount(), controller.signal);
      await this.requireCurrent(job, controller.signal);
      await this.wait(this.dependencies.synchronizePlayerAuthentication(job, controller.signal), controller.signal);
      await this.requireCurrent(job, controller.signal);
      const translator = new TrackTranslator(this.dependencies.recordings(job), new BackgroundMetadataCatalog(song),
        new CandidateRanker(), this.dependencies.associations(job));
      const result = await this.wait(translator.toRecording(job.spotifyTrackIdentifier, job.market, controller.signal), controller.signal);
      await this.requireCurrent(job, controller.signal);
      if (result.status === MatchStatus.Failed) throw new IntegrationFailure(result.failure ?? IntegrationFailureCode.Network);
      await this.wait(this.dependencies.synchronizePlayerAuthentication(job, controller.signal), controller.signal);
      await this.requireCurrent(job, controller.signal);
      const selected = result.selected;
      const response: SpotifyBackgroundRecordingResult = result.status === MatchStatus.Matched && selected !== null
        ? Object.freeze({ status: SpotifyBackgroundRecordingPolicy.matched, recordingIdentifier: selected.identifier,
          title: selected.title, artist: selected.author })
        : Object.freeze({ status: result.status === MatchStatus.Ambiguous ? SpotifyBackgroundRecordingPolicy.ambiguous : SpotifyBackgroundRecordingPolicy.unavailable });
      await this.wait(this.dependencies.complete(requestIdentifier, response), controller.signal);
    } catch (failure) {
      const code = controller.signal.aborted ? cancellationFailure
        : failure instanceof IntegrationFailure && FailureCodes.has(failure.code) ? failure.code : IntegrationFailureCode.Network;
      if (claimed) {
        const alreadyAborted = controller.signal.aborted;
        const retire = async () => {
          if (alreadyAborted) await this.dependencies.fail(requestIdentifier, code);
          else if (await this.dependencies.isPending(requestIdentifier) && !controller.signal.aborted) await this.dependencies.fail(requestIdentifier, code);
        };
        const retirement = retire();
        try { await this.wait(retirement, controller.signal); }
        catch { if (!controller.signal.aborted) throw new IntegrationFailure(IntegrationFailureCode.Network); }
      }
    } finally {
      cancelTimer();
      cancellation?.removeEventListener(SpotifyBackgroundRecordingPolicy.abortEvent, abort);
      controller.abort();
    }
  }

  private async requireCurrent(job: SpotifyBackgroundRecordingJob, cancellation: AbortSignal): Promise<void> {
    checkCancellation(cancellation);
    if (this.dependencies.currentAccountIdentifier() !== job.streamingServiceAccountIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    if (!await this.wait(this.dependencies.isPending(job.requestIdentifier), cancellation)) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
    checkCancellation(cancellation);
    if (this.dependencies.currentAccountIdentifier() !== job.streamingServiceAccountIdentifier) throw new IntegrationFailure(IntegrationFailureCode.Superseded);
  }

  private wait<Response>(response: Promise<Response>, cancellation: AbortSignal): Promise<Response> {
    if (cancellation.aborted) {
      void response.catch(() => undefined);
      return Promise.reject(new IntegrationFailure(IntegrationFailureCode.Canceled));
    }
    return new Promise<Response>((resolve, reject) => {
      const complete = (value: Response) => {
        cancellation.removeEventListener(SpotifyBackgroundRecordingPolicy.abortEvent, abort);
        resolve(value);
      };
      const fail = (failure: unknown) => {
        cancellation.removeEventListener(SpotifyBackgroundRecordingPolicy.abortEvent, abort);
        reject(failure);
      };
      const abort = () => fail(new IntegrationFailure(IntegrationFailureCode.Canceled));
      cancellation.addEventListener(SpotifyBackgroundRecordingPolicy.abortEvent, abort, { once: true });
      response.then(complete, fail);
    });
  }
}

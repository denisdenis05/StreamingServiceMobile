import { NativeModules } from 'react-native';
import { CandidateRanker, MatchStatus, IntegrationFailure, IntegrationFailureCode, SystemScheduler, copySpotifyConnectSearch, decodeSpotifyConnectSearch } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createSpotifyRecordingCatalog } from './SpotifyRecordingCatalogPlatform';
import { SpotifyBackgroundHostingTask } from './spotify/SpotifyBackgroundHostingTask';
import type { SpotifyBackgroundHostingJob } from './spotify/SpotifyBackgroundHostingTask';
interface HostingNative {
  claimHostingRecording(identifier: string): Promise<string | null>;
  isHostingRecordingPending(identifier: string): Promise<boolean>;
  completeHostingRecording(identifier: string, track: string): Promise<void>;
  failHostingRecording(identifier: string): Promise<void>;
  searchHostingRecording(identifier: string, serialized: string): Promise<string>;
}
const Policy = Object.freeze({ moduleName: 'SpotifyJamPlayback' } as const);
export async function executeSpotifyBackgroundHosting(identifier: string): Promise<void> {
  const native = NativeModules[Policy.moduleName] as HostingNative | undefined;
  if (!native) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  const task = new SpotifyBackgroundHostingTask({
    async claim(requestIdentifier) {
      const serialized = await native.claimHostingRecording(requestIdentifier);
      return serialized === null ? null : JSON.parse(serialized) as SpotifyBackgroundHostingJob;
    },
    isPending: requestIdentifier => native.isHostingRecordingPending(requestIdentifier),
    complete: (requestIdentifier, track) => native.completeHostingRecording(requestIdentifier, track),
    fail: requestIdentifier => native.failHostingRecording(requestIdentifier),
    async restoreAccount() { await authenticationSession.restore(); },
    currentAccountIdentifier: () => authenticationSession.getSnapshot().accountIdentifier,
    async match(job, cancellation) {
      const account = authenticationSession.getSnapshot();
      if (account.accountIdentifier !== job.streamingServiceAccountIdentifier || !account.isLoggedIn || !account.token) throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      const catalog = createSpotifyRecordingCatalog(job.baseAddress, account.accountIdentifier, account.token);
      const source = await catalog.lookup(job.recordingIdentifier, cancellation);
      if (!source || source.identifier !== job.recordingIdentifier) return null;
      const ranker = new CandidateRanker();
      const query = copySpotifyConnectSearch({ title: source.title, author: source.author, limit: ranker.policy.maximumCandidates }, job.market);
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      const serialized = await native.searchHostingRecording(job.requestIdentifier, JSON.stringify(query));
      const candidates = decodeSpotifyConnectSearch(JSON.parse(serialized), job.handle, job.generation, query.limit);
      const result = ranker.rank(source, candidates);
      return result.status === MatchStatus.Matched ? result.selected?.identifier ?? null : null;
    }, scheduler: new SystemScheduler(),
  });
  await task.execute(identifier);
}

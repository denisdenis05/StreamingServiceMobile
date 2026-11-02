import { NativeModules } from 'react-native';
import { CandidateRanker, MatchStatus, TrackTranslator, MemoryAssociationStore, IntegrationFailure, IntegrationFailureCode, SystemScheduler, copySpotifyConnectSearch, decodeSpotifyConnectSearch } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { createSpotifyRecordingImportMatcher } from './SpotifyRecordingImportPlatform';
import { createSpotifyRecordingCatalog } from './SpotifyRecordingCatalogPlatform';
import { SpotifyBackgroundHostingTask } from './spotify/SpotifyBackgroundHostingTask';
import type { SpotifyBackgroundHostingJob } from './spotify/SpotifyBackgroundHostingTask';
interface HostingNative {
  claimHostingRecording(identifier: string): Promise<string | null>;
  isHostingRecordingPending(identifier: string): Promise<boolean>;
  completeHostingRecording(identifier: string, track: string): Promise<void>;
  failHostingRecording(identifier: string, code: IntegrationFailureCode): Promise<void>;
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
    fail: (requestIdentifier, code) => native.failHostingRecording(requestIdentifier, code),
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
      const translator = new TrackTranslator({
        identity: catalog.identity, namespace: catalog.namespace,
        async lookup(identifier, suppliedCancellation) {
          if (suppliedCancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
          return identifier === source.identifier ? source : null;
        },
        search: (search, suppliedCancellation) => catalog.search(search, suppliedCancellation),
      }, {
        async lookup(identifier, _market, suppliedCancellation) {
          if (suppliedCancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
          return candidates.find(candidate => candidate.identifier === identifier) ?? null;
        },
        async search(_search, _market, suppliedCancellation) {
          if (suppliedCancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
          return candidates;
        },
      }, ranker, new MemoryAssociationStore(),
      createSpotifyRecordingImportMatcher(job.baseAddress, account.accountIdentifier, account.token));
      const result = await translator.toSpotify(job.recordingIdentifier, job.market, cancellation);
      if (result.status === MatchStatus.Failed) throw new IntegrationFailure(result.failure ?? IntegrationFailureCode.Network);
      return result.status === MatchStatus.Matched ? result.selected?.identifier ?? null : null;
    }, scheduler: new SystemScheduler(),
  });
  await task.execute(identifier);
}

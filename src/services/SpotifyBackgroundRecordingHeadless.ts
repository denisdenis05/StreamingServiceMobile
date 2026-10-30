import { NativeModules } from 'react-native';
import { IntegrationFailure, IntegrationFailureCode, MemoryAssociationStore, QueryableRecordingCatalog,
  RecordingNamespace, StreamingServiceRecordingQuery, SystemScheduler } from 'streaming-service-spotify-jam';
import type { SpotifyBackgroundRecordingJob } from './spotify/SpotifyBackgroundRecordingTask';
import { SpotifyBackgroundRecordingTask } from './spotify/SpotifyBackgroundRecordingTask';
import { authenticationSession } from './AuthenticationService';
import { createApplicationNetworkClient } from './ApplicationNetworkClient';

interface SpotifyJamPlaybackRecordingNative {
  claimRecording(requestIdentifier: string): Promise<string | null>;
  isRecordingPending(requestIdentifier: string): Promise<boolean>;
  completeRecording(requestIdentifier: string, serialized: string): Promise<void>;
  failRecording(requestIdentifier: string, code: IntegrationFailureCode): Promise<void>;
  synchronizePlayerAuthentication(requestIdentifier: string, accountIdentifier: string, accessToken: string): Promise<void>;
}

const HeadlessPolicy = Object.freeze({ moduleName: 'SpotifyJamPlayback', catalogPrefix: 'streaming-service:',
  authorizationHeader: 'Authorization', bearerPrefix: 'Bearer ' } as const);

const associations = new MemoryAssociationStore();

export async function executeSpotifyBackgroundRecording(requestIdentifier: string): Promise<void> {
  const native = NativeModules[HeadlessPolicy.moduleName] as SpotifyJamPlaybackRecordingNative | undefined;
  if (native === undefined) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  const task = new SpotifyBackgroundRecordingTask({
    claim: async identifier => {
      const serialized = await native.claimRecording(identifier);
      if (serialized === null) return null;
      try { return JSON.parse(serialized) as SpotifyBackgroundRecordingJob; }
      catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse); }
    },
    isPending: identifier => native.isRecordingPending(identifier),
    complete: (identifier, result) => native.completeRecording(identifier, JSON.stringify(result)),
    fail: (identifier, failure) => native.failRecording(identifier, failure),
    async restoreAccount() { await authenticationSession.restore(); },
    currentAccountIdentifier: () => authenticationSession.getSnapshot().accountIdentifier,
    recordings: job => {
      const state = authenticationSession.getSnapshot();
      if (!state.isLoggedIn || state.accountIdentifier !== job.streamingServiceAccountIdentifier || state.token === null) {
        throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      }
      const client = createApplicationNetworkClient({ accountIdentifier: state.accountIdentifier, token: state.token });
      const query = new StreamingServiceRecordingQuery(job.baseAddress, { async read(address, cancellation) {
        if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
        try {
          const response = await client.get<unknown>(address, { signal: cancellation });
          if (cancellation.aborted || authenticationSession.getSnapshot().accountIdentifier !== job.streamingServiceAccountIdentifier) {
            throw new IntegrationFailure(IntegrationFailureCode.Superseded);
          }
          return response.data;
        } catch (failure) {
          if (failure instanceof IntegrationFailure) throw failure;
          throw new IntegrationFailure(cancellation.aborted ? IntegrationFailureCode.Canceled : IntegrationFailureCode.Network);
        }
      } });
      return new QueryableRecordingCatalog(HeadlessPolicy.catalogPrefix + job.baseAddress, RecordingNamespace.Local, query);
    },
    associations: () => associations,
    async synchronizePlayerAuthentication(job, cancellation) {
      if (cancellation.aborted) throw new IntegrationFailure(IntegrationFailureCode.Canceled);
      const state = authenticationSession.getSnapshot();
      if (!state.isLoggedIn || state.accountIdentifier !== job.streamingServiceAccountIdentifier || state.token === null) {
        throw new IntegrationFailure(IntegrationFailureCode.Unauthorized);
      }
      await native.synchronizePlayerAuthentication(job.requestIdentifier, state.accountIdentifier, state.token);
    },
    scheduler: new SystemScheduler(),
  });
  await task.execute(requestIdentifier);
}

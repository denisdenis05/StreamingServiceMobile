import { NativeModules } from 'react-native';
import { IntegrationFailure, IntegrationFailureCode, MemoryAssociationStore, SystemScheduler } from 'streaming-service-spotify-jam';
import type { SpotifyBackgroundRecordingJob } from './spotify/SpotifyBackgroundRecordingTask';
import { SpotifyBackgroundRecordingTask } from './spotify/SpotifyBackgroundRecordingTask';
import { authenticationSession } from './AuthenticationService';
import { createSpotifyRecordingCatalog } from './SpotifyRecordingCatalogPlatform';

interface SpotifyJamPlaybackRecordingNative {
  claimRecording(requestIdentifier: string): Promise<string | null>;
  isRecordingPending(requestIdentifier: string): Promise<boolean>;
  completeRecording(requestIdentifier: string, serialized: string): Promise<void>;
  failRecording(requestIdentifier: string, code: IntegrationFailureCode): Promise<void>;
  synchronizePlayerAuthentication(requestIdentifier: string, accountIdentifier: string, accessToken: string): Promise<void>;
}

const HeadlessPolicy = Object.freeze({ moduleName: 'SpotifyJamPlayback',
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
      return createSpotifyRecordingCatalog(job.baseAddress, state.accountIdentifier, state.token);
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

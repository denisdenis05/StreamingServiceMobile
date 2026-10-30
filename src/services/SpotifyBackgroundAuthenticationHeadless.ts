import { NativeModules } from 'react-native';
import { IntegrationFailure, IntegrationFailureCode, SystemScheduler } from 'streaming-service-spotify-jam';
import { authenticationSession } from './AuthenticationService';
import { TEMPORARY_API_URL } from '../constants/placeholders';
import { SpotifyBackgroundAuthenticationTask } from './spotify/SpotifyBackgroundAuthenticationTask';
import type { SpotifyBackgroundAuthenticationJob } from './spotify/SpotifyBackgroundAuthenticationTask';

interface SpotifyAuthenticationNative {
  claimAuthentication(requestIdentifier: string): Promise<string | null>;
  isAuthenticationPending(requestIdentifier: string): Promise<boolean>;
  completeAuthentication(requestIdentifier: string, accountIdentifier: string, token: string): Promise<void>;
  failAuthentication(requestIdentifier: string): Promise<void>;
}
const NativeModuleName = 'SpotifyJamPlayback';

export async function executeSpotifyBackgroundAuthentication(requestIdentifier: string): Promise<void> {
  const native = NativeModules[NativeModuleName] as SpotifyAuthenticationNative | undefined;
  if (!native) throw new IntegrationFailure(IntegrationFailureCode.Unsupported);
  const task = new SpotifyBackgroundAuthenticationTask({
    baseAddress: TEMPORARY_API_URL,
    async claim(identifier) {
      const serialized = await native.claimAuthentication(identifier);
      if (serialized === null) return null;
      try { return JSON.parse(serialized) as SpotifyBackgroundAuthenticationJob; }
      catch { throw new IntegrationFailure(IntegrationFailureCode.InvalidResponse); }
    },
    isPending: identifier => native.isAuthenticationPending(identifier),
    complete: (job, token) => native.completeAuthentication(job.requestIdentifier, job.streamingServiceAccountIdentifier, token),
    fail: identifier => native.failAuthentication(identifier),
    async restoreAccount() { await authenticationSession.restore(); },
    async refreshAccount() { await authenticationSession.refresh(); },
    currentAccount: authenticationSession.getSnapshot,
    scheduler: new SystemScheduler(),
  });
  await task.execute(requestIdentifier);
}

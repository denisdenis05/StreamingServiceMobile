import { SpotifyHostingQueueIssue, SpotifyHostingQueuePolicy } from './SpotifyHostingQueue';
import { SpotifyHostingFailureStage } from './SpotifyHostingStore';
import { IntegrationFailureCode } from 'streaming-service-spotify-jam';
import { SpotifyFailureMessages } from './SpotifyMobilePolicy';
export const SpotifyHostingFailureDetailMessages = Object.freeze({
  catalogRequestRejected: 'Spotify rejected the song catalog request. You can still play music locally in this app.',
});
export const SpotifyHostingFailureMessages: Readonly<Record<SpotifyHostingFailureStage, string>> = Object.freeze({
  [SpotifyHostingFailureStage.Validation]: 'Could not validate sharing for this Jam.',
  [SpotifyHostingFailureStage.Cleanup]: 'Could not stop the previous shared playback.',
  [SpotifyHostingFailureStage.PlayerReadiness]: 'The local player is not ready to share.',
  [SpotifyHostingFailureStage.QueueCapture]: 'Could not read the current player queue.',
  [SpotifyHostingFailureStage.CatalogMatching]: 'Could not match the player queue with Spotify recordings.',
  [SpotifyHostingFailureStage.QueueValidation]: 'The player queue changed before sharing started.',
  [SpotifyHostingFailureStage.Authentication]: 'Could not confirm the Spotify connection for sharing.',
  [SpotifyHostingFailureStage.NativeActivation]: 'Spotify did not confirm this player as the shared host.',
  [SpotifyHostingFailureStage.Observation]: 'Could not read the current sharing state.',
  [SpotifyHostingFailureStage.Publication]: 'Could not publish the player state to Spotify.',
  [SpotifyHostingFailureStage.RecordingPreparation]: 'Could not prepare the new songs for sharing.',
  [SpotifyHostingFailureStage.Stop]: 'Could not confirm that sharing stopped.',
});

export const SpotifyHostingQueueIssueMessages: Readonly<Record<SpotifyHostingQueueIssue, string>> = Object.freeze({
  [SpotifyHostingQueueIssue.EmptyQueue]: 'Choose a song from your library before starting sharing.',
  [SpotifyHostingQueueIssue.CapacityExceeded]: `Shorten your player queue to ${SpotifyHostingQueuePolicy.maximumEntries} songs or fewer before starting sharing.`,
  [SpotifyHostingQueueIssue.ExternalAuthority]: 'Stop following Spotify before sharing this player queue.',
});
export function spotifyHostingQueueIssueMessage(queueIssue: SpotifyHostingQueueIssue | null | undefined): string | null {
  return queueIssue === undefined || queueIssue === null ? null : SpotifyHostingQueueIssueMessages[queueIssue] ?? null;
}
export function spotifyHostingFailureDetail(
  stage: SpotifyHostingFailureStage | null | undefined,
  failure: IntegrationFailureCode | null,
): string | null {
  if (failure === null) return null;
  if (failure === IntegrationFailureCode.InvalidInput &&
    (stage === SpotifyHostingFailureStage.CatalogMatching || stage === SpotifyHostingFailureStage.RecordingPreparation))
    return SpotifyHostingFailureDetailMessages.catalogRequestRejected;
  return SpotifyFailureMessages[failure];
}

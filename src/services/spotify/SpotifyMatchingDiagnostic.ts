import { MatchEvidence, MatchStatus } from 'streaming-service-spotify-jam';
import type { MatchResult } from 'streaming-service-spotify-jam';

export const SpotifyMatchingDiagnosticTag = 'SpotifyMatch';
export function spotifyMatchingDiagnostic(result: MatchResult) {
  const candidates = result.candidates;
  return Object.freeze({
    status: Object.values(MatchStatus).includes(result.status) ? result.status : MatchStatus.Failed,
    candidateCount: candidates.length,
    acceptableCount: candidates.filter(candidate => candidate.acceptable).length,
    titleMatchCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Title)).length,
    artistMatchCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Artist)).length,
    durationMatchCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Duration)).length,
    versionConflictCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.VersionConflict)).length,
  });
}

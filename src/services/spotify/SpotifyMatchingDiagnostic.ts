import { ArtistCreditSource, CandidateRanker, MatchEvidence, MatchStatus } from 'streaming-service-spotify-jam';
import type { CatalogSong, MatchResult } from 'streaming-service-spotify-jam';

export const SpotifyMatchingDiagnosticTag = 'SpotifyMatch';
const DiagnosticPolicy = Object.freeze({ joinedArtistCredits: /\b(?:feat|ft|featuring)\b|[,;&]/i });
export function spotifyMatchingDiagnostic(result: MatchResult, source?: CatalogSong) {
  const candidates = result.candidates;
  const sourceArtists = source?.artistNames?.length ? source.artistNames : source ? [source.author] : [];
  const titleCandidates = candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Title));
  const ranker = new CandidateRanker();
  return Object.freeze({
    status: Object.values(MatchStatus).includes(result.status) ? result.status : MatchStatus.Failed,
    candidateCount: candidates.length,
    acceptableCount: candidates.filter(candidate => candidate.acceptable).length,
    titleMatchCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Title)).length,
    artistMatchCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Artist)).length,
    durationMatchCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.Duration)).length,
    versionConflictCount: candidates.filter(candidate => candidate.evidence.includes(MatchEvidence.VersionConflict)).length,
    ...(source ? {
      releaseCreditOnly: source.artistCreditSource === ArtistCreditSource.Release,
      sourceArtistCount: sourceArtists.length,
      sourceHasJoinedArtistCredits: sourceArtists.some(artist => DiagnosticPolicy.joinedArtistCredits.test(artist)),
      titleCandidateArtistCounts: titleCandidates.map(candidate => candidate.song.artistNames?.length ?? [candidate.song.author].length),
      titleCandidateSharedArtistCounts: titleCandidates.map(candidate => sourceArtists.filter(artist =>
        ranker.rank({ ...source, author: artist, artistNames: [artist] }, [candidate.song]).candidates
          .some(scored => scored.evidence.includes(MatchEvidence.Artist))).length),
    } : {}),
  });
}

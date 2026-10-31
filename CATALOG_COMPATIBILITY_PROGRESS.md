# Retain verified recording duration during catalog queries — 2026-10-31

Source audit found that bounded legacy search reconstructed id/title/artist but
lost actual duration already observed for the same scoped recording. The unchanged
matching ranker consequently kept a known matching recording ambiguous. A deployed
primary response with missing duration also discarded the known observation.

The query now supplements missing duration only when recording identifier, title
and artist all equal a real current scoped observation or retained candidate.
Present primary duration always wins. Primary artist-credit provenance, artist
names and other matching evidence remain intact; release-only artist credit is
still rejected by conservative matching. Unknown future songs receive no duration.
No match threshold, authority guard, request retry or catalog capability probe changed.

## Feature tests

`tools/spotify-library-catalog.test.cjs` covers actual observed duration producing
a Matched result with the real CandidateRanker, unknown future metadata remaining
Ambiguous, identifier/title/artist conflicts preventing borrowed duration, present
primary duration winning, exact cached evidence and missing primary duration with
release-credit ambiguity preserved. Existing cancellation, account scope retirement,
auth failures, bounds, malformed DTO and cache eviction cases also passed.

Executed `npx tsc --project tsconfig.spotify.json && node --test
tools/spotify-library-catalog.test.cjs`: TypeScript passed; all 19 cases passed.
`git diff --check` passed. No device, process, production deployment or credential
operation was performed. These deterministic results do not prove live host activation.

## Contract audit and remaining prerequisite

The existing Server recording-catalog lookup/search routes, serialized identifier,
title, author, artistNames, durationMilliseconds and artistCreditSource match the
library query. Native search sends the actual account country and validates actual
Spotify identifiers, duration, artist fields, restrictions and response bounds.
No source mismatch justifies changing these contracts in this chapter.

The legacy Metadata controller has bounded database search, album-recording lookup,
suggestions and a full-catalog endpoint. It has no recording-ID metadata lookup.
The adapter continues using only bounded database search; the full-catalog path is
not used. The new recording-catalog route still needs deployment for reliable full
metadata, including unseen future songs.

Cold restoration may leave the observed raw metadata store empty. Player queue pages
contain titles/artists, but PlaybackTrackMapper can synthesize Untitled/Unknown
Artist and the page has no provenance field. This chapter does not promote those
fields to recording evidence or fetch arbitrary album/full-catalog routes. A cold
restored song without actual observed metadata remains unsupported by the legacy
fallback until actual raw selection or the deployed primary endpoint supplies it.
Server user-owned appsettings and .idea changes were inspected and preserved.

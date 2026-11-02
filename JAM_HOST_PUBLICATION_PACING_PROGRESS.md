# Native host publication pacing

Updated 2026-11-02.

## Reproduced source issue

`SpotifyHostCoordinator` published the entire native queue every second even
when paused without changes. Every local notification also requested another
publication; notifications received during pending work forced an immediate
second identical publication. These PUTs do not help Spotify project normal
playback position because the publication includes its actual sample time and
playback state.

The live host reached Sharing this player, then failed during Publication with
RateLimited. Excessive publication was reproduced in source. The actual origin
of that live category is not established by this chapter; safe native request
purpose/status/Retry-After diagnostics belong to the parent integration chapter.

## Implementation

Local sampling remains once per second. A separate publication cadence compares
actual queue order, occurrence, cursor revisions, playback flags, duration,
relevant recording mappings and position discontinuities. Sample timestamps and
normal playing progression do not cause publications. Paused position remains
stable; natural progression stops at the actual track duration.

Successful activation/publication starts a ten-second heartbeat, shorter than
the fifteen-second retained native receipt limit. No preflight or publication
is issued for an unchanged sample before that heartbeat. Actual local changes
still request immediate work, while duplicate notifications and identical
followups behind an in-flight sample coalesce. Accepted incoming commands still
publish their command provenance. Only successful publication advances the
cadence; failed or uncertain mutations are never retried. RateLimited retains
the existing stop, safe pause and withdrawal path.

The position discontinuity tolerance is one second. Playback/control revisions
also trigger publication immediately, so explicit seeks do not depend on that
tolerance. The cadence owns immutable queue/mapping copies and uses caller
supplied monotonic timestamps.

## Feature tests

- `SpotifyHostPublicationCadenceTest`: first publication, paused heartbeat exact
  boundary, normal progression, discontinuity boundary and reverse seek, stalled
  progression, accepted-command receipt, semantic queue/state/cursor/duration
  changes, relevant versus unused mappings, successful heartbeat reset, clock
  regression and track-end position clamping.
- `SpotifyHostCoordinatorTest`: unchanged paused samples avoid both preflight and
  PUT until heartbeat, duplicate notifications coalesce, local pause publishes
  immediately, natural playback avoids per-sample PUT, duplicate in-flight
  followup coalesces, and RateLimited stops without mutation replay.
- Existing coordinator lifecycle, mapping/preparation, withdrawal, sequence,
  superseded host and unknown outcome tests remain passing.

## Source verification

`./android/gradlew -p android :app:testDebugUnitTest -x
:app:buildSpotifyLibrespot --no-daemon --console=plain` passed: 471 tests in 34
suites, zero failures/errors/skips. Targeted coordinator/cadence execution also
passed before the full suite. `git diff --check` passed.

These checks compile/test Kotlin with injected collaborators. This chapter made
no Spotify request, device action or APK. The parent must rebuild, install once,
observe actual publication request cadence and verify sustained host/device
visibility after honoring any observed Retry-After.

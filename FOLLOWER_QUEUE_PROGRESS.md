# Authoritative follower queue — 2026-10-31

The Android follower decodes the real current and up to 2,000 upcoming Spotify
occurrences from the same verified native playback read. It retains occurrence
order and repeated recordings without inventing occurrence identifiers. Structural
or unsupported upcoming items and entries without actual occurrence identifiers
are omitted; duplicate occurrence identifiers and excessive/malformed queues fail.

Current playback takes priority. The follower prepares its matched current
recording immediately, including any already matched repeated occurrences. It
resolves remaining future recordings while the current recording follows Spotify.
The completed mapped future queue is published under the actual player lease and
cursor. A queue update retaining the same current occurrence reuses the current
match and does not send a local pause. The Player external-authority replacement
path preserves the actual current position and intent for the same recording;
new current recordings still prepare paused before following the latest source.

A missing or ambiguous current match holds playback as unavailable. Missing or
ambiguous future recordings are omitted without advancing the current recording.
Upcoming failed resolutions are omitted for that native projection; actual account
or scope failure terminates it. New queue observations cancel pending old matches;
late completions cannot publish retired projections. Native Dealer source changes
and periodic freshness reconciliation continue in the retained background owner.
Player natural completion remains paused under external authority, even when
future entries are visible. Unknown playback mutation outcomes are not retried.

The JavaScript adapter also supports atomic bounded queue preparation. The library
Connect playback reader forwards actual queue revision and upcoming occurrences;
the shared synchronizer starts current playback before resolving the future queue
in the background. Legacy readers without authoritative occurrence data retain
current-only targets. No browser occurrence identities are fabricated for future
entries. Library and adapter cancellation and player cursor checks remain active.

| Behavior | Dedicated tests |
| --- | --- |
| Ordered real occurrences, duplicate identity rejection, missing identities, structural items, malformed and oversized upcoming responses | `SpotifyConnectObservationDecoderTest` |
| Repeated tracks resolved once, immediate current playback, queue refresh without pause, canceled future matches, missing future entries and no local automatic advancement | `SpotifyNativeFollowerCoordinatorTest` |
| Native lease, scope, cursor and cancellation behavior | `SpotifyPlayerServicePortTest` |
| Atomic JS output, actual occurrence order, queue cursor, cancellation and missing local recording | `tools/spotify-shared-playback.test.cjs` |
| JS target bound/capture, repeated occurrences, queue changes, missing future matches, unsupported output and prompt supersession | SpotifyJam `tests/shared-playback.test.mjs` and `tests/connect-observation.test.mjs` |

## Verification

Focused JVM suites passed 88 cases using
`./android/gradlew -p android :app:testDebugUnitTest -x :app:buildSpotifyLibrespot
--tests com.streamingservice.spotify.SpotifyNativeFollowerCoordinatorTest
--tests com.streamingservice.spotify.SpotifyConnectObservationDecoderTest
--tests com.streamingservice.spotify.SpotifyPlayerServicePortTest --no-daemon
--console=plain` (17 seconds). After current-priority refinement the owning session
reported the complete app and Player JVM run passing in 24 seconds, including the
new oversized/latency cases and Player same-current preservation.

After current-priority refinement, library `npm test` passed architecture checks,
TypeScript and all 652 cases. Focused `node --test tests/shared-playback.test.mjs
tests/connect-observation.test.mjs` passed 58 cases. Mobile
`node node_modules/typescript/bin/tsc --project tsconfig.spotify.json` and
`node --test tools/spotify-shared-playback.test.cjs` passed 41 adapter/store cases.
Both repository `git diff --check` commands passed. Logs are temporary
`/tmp/follower-library-final-complete.log` and
`/tmp/follower-mobile-final-complete.log`; the owning session retains combined
integration evidence separately.

No adb command, live Spotify read, actual pairing, second-account check or audible
playback check was performed by this implementation agent. Source checks do not
prove device queue propagation, background execution or synchronization timing.

## Future lookup failure isolation

A future resolver rejection or failed result no longer stops already following
current audio in the shared JavaScript synchronizer. It stops additional future
requests for that queue projection and retains a bounded partial queue. The
snapshot exposes `upcomingQueuePending`, `upcomingQueueFailure` and
`unavailableUpcomingCount`; a Following status describes current audio and does
not assert a complete future queue. Native following exposes the same three queue fields through its actual wire
snapshot and leaves the current playback failure null. Future lookup failure
stops remaining unresolved future requests for that projection.
Actual native authorization or scope loss still retires following. Current match
failures continue to hold current playback unavailable.

Resolution cancellation belongs to its actual controller: an old completion
clears the shared cancellation slot only if it still owns it. Every background
projection rechecks the latest actual queue before writing state or publishing.
The current-priority/supersession regressions exercise cancellation despite an
uncooperative old future resolver.

`npm test` in SpotifyJam passed source checks, TypeScript and 652 cases after this
fix. The dedicated shared playback file passed 50 cases. Mobile Spotify TypeScript
and shared adapter/store tests passed all 41 cases. Added JVM regressions
`futureLookupFailureRetainsCurrentPlaybackAndReportsPartialQueueWithoutRetrying`
and `partialUpcomingDiagnosticsDoNotReplaceTheCurrentPlaybackFailure`
awaits the owning session's final Gradle run; no Gradle command was issued for
this follow-up while the root session builds. Logs:
`/tmp/future-failure-all-library.log` and `/tmp/future-failure-mobile.log`.
Native wire decoding validates pending flags, known failure codes and counts
from zero through 2,000; no metadata or raw errors enter queue diagnostics. Older
Following snapshots carrying RecordingUnavailable migrate that reason into the
queue failure field. Mobile Spotify TypeScript and native-store/shared-playback
suites passed 83 cases after wire alignment (`/tmp/queue-wire-mobile-tests.log`).

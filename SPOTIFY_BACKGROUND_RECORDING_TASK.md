# Bounded background recording matching — 2026-10-27

The broker, Android headless dispatch and app/native control handoff are now
composed. Device sign-in routes explicit following to the native runtime;
background continuation requires its real player ownership acknowledgement and
the app's verified player-epoch receipt. `SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md`
records the current tests and lifecycle gaps. API addresses with a path are
accepted, matching native configuration; insecure or credential/query/fragment
addresses are rejected before account restore or catalog requests.

SpotifyBackgroundRecordingTask implements the asynchronous matching operation
needed by the native follower. It claims a native request exactly once, captures
validated identities and exact private metadata before awaiting account restore,
and uses the library TrackTranslator/CandidateRanker with the app recording
catalog and injected confirmed associations. A missing title/artist/duration
match remains unavailable or ambiguous; the task does not pick an arbitrary
candidate or introduce a second matching algorithm.

The request includes both accounts, Jam, host, native handle/generation, actual
Spotify track and selected market. Native metadata must match those identifiers.
Account and native pending-request guards run around asynchronous boundaries.
Player authentication is synchronized before and after catalog requests so a
server JWT renewed during matching can reach the native player before preparing
audio. The task owns no Spotify credential and does not require a mounted view.

A30-second injected deadline and external cancellation abort waiting promptly,
even for uncooperative requests. Late completion cannot publish a match. Native
pending guards suppress stale completion/failure into a replacement job. Only
safe IntegrationFailureCode values are reported; unexpected reporting errors
also lose their private diagnostics. The native resolver must independently bound
and retire jobs, including a claim response lost after native acceptance.

| Behavior | Dedicated verification |
| --- | --- |
| Unseen matching, ambiguity, evidence/duration rejection and confirmed association validation | tools/spotify-background-recording.test.cjs |
| Account/ownership replacement, duplicate/native retired jobs and immutable metadata capture | Same suite |
| Cancellation, deadline, invalid native identity/metadata, safe failure and authentication synchronization | Same suite |
| Resolver authorization/scope failure terminates native following without repeated matching | SpotifyNativeFollowerCoordinatorTest.kt |

The19 dedicated Node cases pass and are included in npm run test:spotify. Full
mobile verification passed364 Node and92 Jest cases; strict Spotify and full
application TypeScript compilation passed. The new resolver-failure native case
passed in the26-case coordinator suite. The prior complete JVM check passed187
cases before this additional test; no new full JVM aggregate is claimed here.

The original chapter tested matching logic independently. Native pending-job
broker, Headless JS registration and scoped app handoff are now integrated.
Production catalog access, token renewal, screen suspension and physical audio
are not proved by these tests. AppState stopping remains for browser following
and native startup before ownership acknowledgement. Background playback is
implemented behind the native handoff guard and awaits physical verification.

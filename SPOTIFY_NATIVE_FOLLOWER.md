# Native follower and verified source — 2026-10-27

Implemented an autonomous, injected native follower coordinator around the real
existing player service port. Identity includes both accounts, Jam, host,
connection handle/generation and player engine/authentication epochs. It polls
native source state without screen timers, claims a lease only after a fresh
verified observation and prepares each actual Spotify occurrence paused. New
occurrences pause before matching; repeated songs keep distinct occurrences.
Source reads continue while matching is pending, and completion uses the latest
current target rather than a captured old position.

Actual output readiness, duration, buffering, interruption, seekability, source
uncertainty/freshness and drift gate playback. Explicit authority renewal follows newly successful verified
reads; sampling alone never renews. Output decisions also require a still-fresh
current target. Network failure holds output; authorization rejection
stops polling and requires another explicit start. A local safety pause is a
terminal suspension for that handoff; timers cannot reclaim/resume it. Expiry
requires a second fresh observation and an atomic main-executor expired-lease
recovery. That operation rechecks suspension before releasing/claiming so a user
pause between samples cannot be lost. Canceled dispatched acquisition compensates
the exact private lease before returning; late results cannot leak authority.

SpotifyConnectVerifiedFollowerSource performs current membership before and
after the JNI playback read. It verifies actual native account, Jam, active host
and role. Guest membership requires the authenticated participant ID. Account
replacement/cancellation before or during native work prevents publication.
Only the playback JNI bracket defines the Android clock anchor; membership
latency is not silently added to the source position. Malformed native replies
retain safe errors and never become a claim that the account left.

| Functionality | Dedicated tests |
| --- | --- |
| Native following, actual player commands/readiness/duration, repeated occurrences, pending matching/latest target, failure/ambiguity, clocks/drift, stale/canceled/account/host work, safety pause and expiry | SpotifyNativeFollowerCoordinatorTest.kt:25 cases using the actual StreamingPlaybackCoordinator with injected output |
| Verified membership/read/membership, guest identity, changed host/Jam/account, cancellation, exact elapsed bracket, strict types and safe failure | SpotifyConnectVerifiedFollowerSourceTest.kt:12 cases |
| Native lease/command ownership including atomic expiry recovery, canceled claim compensation and postdispatch authentication uncertainty | SpotifyPlayerServicePortTest.kt:35 cases |
| Actual player service binding lifecycle | SpotifyPlayerServiceBindingTest.kt:8 existing cases |

Focused application/test Kotlin compilation passed72 selected follower/source/
port cases. The complete Android Debug JVM suite passed187 cases. The updated
native dispatcher/membership bridge passed184 Rust cases and actual JNI loading;
diagnostic example8 passed. Logs are under build/spotify-jam. No physical audio,
headless matching, complete background service or cross-account success is
inferred from these host tests.

## Required composition

These components are not yet enabled by the screen. The app still needs the
actual scoped native runtime/handoff and full unseen-song recording resolver.
Reuse the existing conservative matcher and StreamingService authentication
renewal in bounded background tasks. A preload cache alone is insufficient.
Resolve actual private metadata, preserve ambiguity and unavailable states, and
reject stale task completion across every account/Jam/generation change.

Native account teardown must retire following before grant erasure, and service
state/configured credentials must survive React recreation with deliberate
account replacement. StreamingService token refresh must reach the existing
native player while keeping same-account authority. Keep AppState stopping
protection until the native handoff is acknowledged. Validate foreground queue
observation contention, wake behavior, network loss, lock screen, expiry and
physical audio timing before declaring background synchronization complete.
App-led hosting additionally needs initial activation and accepted incoming
player actions with real state publication. iOS native login remains deferred.

The delivered APK remains the 4231657 checkpoint documented in SPOTIFY_JAM_APK.md;
it predates this coordinator/verified-source chapter.

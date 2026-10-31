# Hosting continuation — 2026-10-31

Read the current checkpoints in SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md and
SPOTIFY_APP_HOSTING.md before the historical sections. This chapter continues
source implementation without using a phone or a live Spotify session.

## Completed source changes

Native host startup now preserves the known SpotifyConnectFailureCode category
through a CompletionException or ExecutionException. Previously SpotifyHostRuntime
replaced every startup failure with host-startup-failed, which the bridge safely
reduced to Network. Unknown exceptions still expose no private message or fields.
Invalid startup scope is rejected as Superseded. This fixes a source error-reporting
path; it does not establish the cause of the earlier populated-queue phone failure.

Actual native connection retirement now waits for already submitted player token
writes before releasing the service binding. Repeated retirement, and ordinary
stop followed by retirement, share one binding-release result. A failed unbind is
retained as a failed barrier and is not retried. The session revokes observation
and command handling before waiting for cleanup.

Queue capture now verifies that the confirmation snapshot still has no external
authority and still describes the same current occurrence and queue size. The
current occurrence must exist in the captured real queue. Matching cursor values
alone cannot authorize a contradictory queue snapshot. Integer and existing size
bounds remain enforced before catalog matching.

The explicit JavaScript start action now requires an actual Hosting response with
the captured accounts, Jam, device, handle, native generation and both actual player
epochs. A stopped or foreign startup response becomes InvalidResponse instead of
leaving the action stuck in Starting or accepting mismatched player ownership.

## Feature tests and results

| Feature | Dedicated coverage |
| --- | --- |
| Every known safe startup category through completion wrapping; private unknown failure stays private | SpotifyHostRuntimeTest.startupRejectionsPreserveEveryKnownSafeNativeFailureThroughCompletionWrappers; unknownStartupRejectionsNeverExposePrivateErrorDetails |
| In-flight authentication finishes before connection release; repeated retirement unbinds once | SpotifyHostNativeSessionTest.connectionRetirementWaitsForAnAlreadySubmittedAuthenticationWriteBeforeUnbinding; repeatedConnectionRetirementSharesOneBindingRelease; ordinaryStopAndActualConnectionRetirementShareOneBindingRelease |
| Authority acquisition, contradictory current occurrence/count, absent current occurrence | tools/spotify-hosting-queue.test.cjs |
| Actual startup acknowledgement and captured player/native identity | tools/spotify-hosting.test.cjs |

Before implementation, the focused JVM run completed 26 tests with exactly three
new failures. The queue run completed six tests with exactly three new failures.
The startup acknowledgement run added two tests and both failed before the fix.
The additional unknown-failure privacy test already passed and preserves that
existing guarantee.

Final focused commands:

- `./android/gradlew -p android :app:testDebugUnitTest --tests '*SpotifyHost*Test' -x :app:buildSpotifyLibrespot --no-daemon --console=plain`: passed 144 cases in 13 hosting suites. This compiles Android app Kotlin against the existing native artifacts; it does not rebuild Rust or package an APK.
- `npx tsc --project tsconfig.spotify.json`: passed.
- `node --test tools/spotify-hosting.test.cjs tools/spotify-hosting-queue.test.cjs tools/spotify-background-hosting.test.cjs`: passed 58 cases.
- `git diff --check`: passed.
- `npx tsc --noEmit`: failed during concurrent Profile/Settings implementation because SettingsServices was not yet present and profile-settings-screen.test.tsx supplied ReactNode to a ReactElement parameter. No hosting TypeScript error was reported. The root integration must rerun this after those files are complete.

Detailed local command output is in /tmp/hosting-regression-before.log,
/tmp/hosting-regression-after.log, /tmp/hosting-queue-before.log,
/tmp/hosting-ack-before.log, /tmp/hosting-javascript-after.log and
/tmp/hosting-typescript.log. Temporary logs are not committed artifacts.

## Remaining live gates

No device actions, live search, pairing, session retirement, playback mutation or
uncertain mutation retry was performed. The known read-only native search result
is still backpressure, without a proven HTTP status or root cause. This chapter
cannot claim successful live local-to-Spotify matching, app-led audio, Android
screen-lock/background/reconnect/token-renewal acceptance or guest permission.
A second account remains necessary for cross-account admission and shared audio
acceptance. Native process-death recovery is outside the retained-runtime design.
The earlier APK does not contain this chapter; package it after source integration
when requested, and keep physical verification separate.

Recommended chapter: Preserve host startup failures and fence hosting cleanup.
No commit or staging was performed in the shared working tree.

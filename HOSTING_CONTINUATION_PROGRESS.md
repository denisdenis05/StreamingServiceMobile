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

## Hosting failure stages and Android emulator packaging — 2026-10-31

Hosting snapshots now identify fixed safe failure stages independently from the
existing safe failure categories. JavaScript distinguishes validation, cleanup,
player readiness, queue capture, catalog matching, queue revalidation,
authentication and native activation. Native observations preserve only the typed
stage allowlist; unknown values become Observation without exposing raw text.
The native host reports activation, publication, background catalog matching and
cleanup stages. Coordinator failure classification now unwraps nested Java
completion/execution wrappers while preventing cause cycles, preserving the
actual known Spotify failure category instead of replacing it with a player
failure. This source defect does not establish the cause of the reported phone
Network error.

The Android Spotify library builder accepts arm64-v8a and x86_64 individually or
together. Each ABI uses its own Rust target, NDK compiler, environment and output
folder. Unsupported or duplicate ABIs fail explicitly. Gradle includes the selected
architectures in task inputs so switching from an ARM build cannot reuse an
up-to-date native task without producing the emulator library.

Feature mapping: `tools/spotify-hosting.test.cjs` covers safe phase reporting,
privacy, authentication and queue changes; `SpotifyHostCoordinatorTest` covers
wrapped activation errors and publication/cleanup stages;
`SpotifyHostSnapshotProtocolTest` covers typed native serialization;
`tools/test-spotify-android-build.py` covers individual/combined ABI delivery and
unsupported/duplicate rejection using injected Cargo invocations.

Ran `python3 tools/test-spotify-android-build.py`: 3 passed. Ran
`npx tsc --project tsconfig.spotify.json && node --test
tools/spotify-hosting.test.cjs`: TypeScript passed and 57 tests passed. Native JVM
execution and real emulator packaging are handled by the integrated session.
These changes neither establish catalog access nor prove audio playback.

Integrated review added two regression cases: a delayed native stopped snapshot
and a later membership refresh cannot erase a newer hosting failure/stage. Native
poll reads are fenced by their captured state; actual native events remain
authoritative. Focused hosting tests now pass 59 cases.

## Actionable host queue capture failures — 2026-10-31

Queue capture now distinguishes three safe local issues: no selected song or empty
queue, more than 80 occurrences, and existing external playback ownership. The
store retains only its locally typed allowlisted queue issue alongside the
existing Unsupported code and capture stage. Raw rejection fields cannot supply
UI text. Invalid lengths and missing recording/occurrence identities remain
InvalidResponse. The queue must still pass the existing cursor, ownership,
occurrence and membership revalidation before hosting.

Dedicated tests: `spotify-hosting-queue.test.cjs` covers empty/current absence,
capacity overflow and exact-bound acceptance, external ownership, malformed lengths
and malformed recording identities. `spotify-hosting.test.cjs` covers each safe
issue reaching the snapshot and rejection of untrusted issue fields.
`npx tsc --project tsconfig.spotify.json` passed;
`node --test tools/spotify-hosting-queue.test.cjs tools/spotify-hosting.test.cjs`
passed all 76 cases. UI copy and emulator verification are integrated by the
owning session. No live catalog or playback outcome is inferred from these tests.

## Catalog compatibility adapter — 2026-10-31

`SpotifyLibraryCatalogQuery` wraps the primary recording catalog with bounded
compatibility for existing authenticated library search. Primary lookup remains
first; a missing identifier can use only exact-ID metadata already observed in
the actual local queue or bounded real-candidate cache. Primary search switches to
`Metadata/search/db` only after a typed NotFound from the real search request,
without probing capability or downloading the full catalog. Unauthorized,
forbidden, network and backpressure failures do not activate fallback. The existing
RecordingResponse DTO supplies actual id/title/artistName; its absent duration is
left absent. No match or identifier is manufactured.

Every request passes the caller's cancellation signal through the injected
account-authenticated reader. Scope changes permanently retire the adapter and
clear its cache; stale/canceled completions cannot cache their candidates. Search
requests use one page of at most 80 candidates and retain at most 256 recordings.
Root composition supplies current real observed queue metadata and account scope.
The adapter has no server deployment or device side effects.

Dedicated `tools/spotify-library-catalog.test.cjs` covers primary success,
exact-ID observed lookup, verified search absence, bounded authenticated request,
legacy auth failures, cancellation, changed scope/stale completion, malformed DTO
rejection and cache eviction. Ran `npx tsc --project tsconfig.spotify.json` and
`node --test tools/spotify-library-catalog.test.cjs`: 12 cases passed. Actual
production catalog matching and host playback still require the integrated live
check after composition and packaging.

## Delayed local queue receipt failures — 2026-10-31

The player Jam controller now checks the captured player intent and Jam scope
again before displaying a failed publication or queue-clear withdrawal. A request
that already reached native code still rejects to its original caller; a late
failure cannot replace the status of a newer Jam or a newer player action. No
publication, withdrawal or local mutation is retried.

Feature map: `tools/spotify-player-jam.test.cjs` has dedicated deferred regressions
for publication failure after Jam replacement, withdrawal failure after Jam
replacement, and publication failure after a newer action has already failed.
All three tests failed before the fix. The existing active publication failure
test continues to check that the original safe failure remains visible.

Verification: `npx tsc --project tsconfig.spotify.json` passed.
`node --test tools/spotify-player-jam.test.cjs tools/spotify-hosting.test.cjs
tools/spotify-hosting-queue.test.cjs` passed 115 tests. This chapter uses source
checks only; no emulator, Spotify session, deployment or playback request ran.
Actual activation/publication, audible playback and cross-account/background
acceptance remain unverified.

## Bounded headless hosting failure cleanup — 2026-10-31

The hosting recording task now bounds its native failure acknowledgement with the
same cancellation signal and 30-second deadline as claim, matching and completion.
Previously a failed or expired match could remain pending forever if the native
failure bridge never settled. The native failure request is still submitted once;
late bridge settlement is consumed, and an expired match never completes a track.
The native broker retains ownership of its own deadline and job retirement.

Feature map: `tools/spotify-background-hosting.test.cjs` separately covers a
nonsettling native failure acknowledgement after an ordinary matching failure and
after a matching deadline. Both regressions failed before the change.
`npx tsc --project tsconfig.spotify.json` passed;
`node --test tools/spotify-background-hosting.test.cjs` passed all 8 cases.
No device, emulator, live session or deployment operation was performed.

## Initial hosting with an existing Connect device — 2026-11-01

A new owned Jam may have no assigned Jam host while the account still has an
active Spotify Connect device. Preflight previously required that device to be
empty as well, preventing explicit app activation. For an actually empty Jam
host, preflight now captures the fresh actual Connect device in its clock anchor.
Rust activation still checks that exact captured device, sequence and native
scope. Both membership reads still require the same owned active Jam and empty
host. A known Jam host still requires an exact Connect-device match; a host
appearing during the read is rejected. No membership or takeover guard was removed.

`SpotifyHostNativeTransportTest` independently models membership host and active
Connect device. Dedicated tests cover actual prior-device capture, another host
acquiring membership during the read and mismatch for a known Jam host. The agent
reproduced two failures before the fix. A concurrent focused Gradle run encountered
an output-file collision, so it is not counted as a passing result. Root's final
sequential full native run passed 454 app and 289 Player JVM cases, zero failures.
The native change was included in the subsequent x86 release build and successful
adb update; live activation is checked separately after installation.

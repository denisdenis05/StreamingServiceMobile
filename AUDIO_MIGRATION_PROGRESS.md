# Audio migration progress

## Branch and scope

Branch: `feat/streaming-service-player-audio-migration`.

Replace RNTP with the sibling StreamingServicePlayer package on Android and iOS. The user requires stopping and asking when a migration or build problem occurs. Apply the project quality skill to player work. Keep audio commands independent of Last.fm requests and capture reporting session identity before asynchronous operations.

## Completed — 2026-10-13

The RNTP fork prefers an FFmpeg software audio renderer. The user approved preserving this behavior before migration. Player commit `46a05c3` adds the same Jellyfin decoder dependency, extension renderer preference and platform decoder initialization fallback. Its Android host checks passed 185 tests: 40 core and 145 player. Four dedicated renderer tests cover preference, fallback, factory preservation and actual FFmpeg renderer class availability. Native library loading and device format playback are unverified.

The mobile app declares `streaming-service-player` as a local dependency at `file:../StreamingServicePlayer`. Both repositories must be checked out next to each other. The lockfile records the workspace link. Metro watches the sibling player and resolves React and React Native through the mobile installation.

`npm run prepare:player` compiles the player and generates native specifications. The Android, iOS and Metro startup scripts run preparation first. Dependency installation used offline mode with lifecycle scripts disabled; explicit preparation completed successfully.

`npm run test:player-integration` passed seven tests covering dependency declaration, installation location, Metro observation, dependency resolution, shared React and React Native paths, and compiled Android/Apple adapter exports. The script runs Node directly so the installed Node runner reports the individual cases.

React Native CLI configuration detects the Android `StreamingPlayerPackage`, `StreamingServicePlayerSpec` Codegen module and iOS `StreamingServicePlayer.podspec`. This verifies discovery, not successful native compilation or runtime registration.

## Android packaging — passed

The user approved fixing the Codegen configuration and requested integration tests. Player commit `00975ab` now provides its own package manifest and prepared specification directory explicitly to React Native's Gradle tasks. A linked package root previously produced an empty schema, and the nested Android directory caused the plugin to read the mobile manifest. Three player tests reproduce directory-discovery behavior and verify both linked and canonical prepared directories.

Validation on 2026-10-13:

| Command | Result |
| --- | --- |
| `npm run test:player-android-build` | Eight tests passed. Deletes the ignored prepared specification, performs a clean actual Gradle library build, verifies schema/module/all native methods, Java namespace, C++/CMake output and AAR compiled bridge/player classes. |
| `npm run test:player-android-app` | Eleven tests passed. Builds the actual Android debug APK and verifies Java/C++ autolinking, FFmpeg and linked application modules for each of four configured ABIs, and the packaged playback service/foreground permission. |
| `npm run test:player-integration` | Seven workspace/Metro/package-export tests passed. |
| From android, `./gradlew :streaming-service-player:testDebugUnitTest --no-daemon -Pkotlin.compiler.execution.strategy=in-process` | 185 native unit tests passed with no failures/errors/skips. |
| From the player, `npm test` | 300 TypeScript/tooling tests passed, including three Codegen directory-discovery tests. |

Run the two Gradle integration scripts sequentially; they share the Android build tree. They may download dependencies and compile Kotlin in process, avoiding the daemon's marker directory outside the writable roots. Android analytics emits a nonfatal warning about its read-only settings directory.

The debug APK exists at `android/app/build/outputs/apk/debug/app-debug.apk`. It includes both player packages while RNTP remains the selected runtime. No device installation, native playback, decoder loading, network/range scenario or performance result is claimed.

### Earlier Codegen failure

The online build reached Kotlin compilation after downloading dependencies, but schema generation returned no modules. NativeStreamingPlayerSpec and dependent overrides were missing. The user-approved configuration fix resolves that failure.

### Previous environment failures

Command attempted from `android`:

```sh
./gradlew :streaming-service-player:assembleDebug --offline --no-daemon
```

The initial attempt failed because the Gradle wrapper could not write its lock file in the read-only `/home/denis/.gradle/wrapper/dists` directory. The user subsequently added `/home/denis/.gradle` to this session's writable roots. A temporary-file write/delete check passed.

After the user requested continuation, the same build command was retried. The wrapper lock failure is resolved, but Gradle now exits before compilation while creating `FileLockContentionHandler`, reporting `Could not determine a usable wildcard IP for this machine.` No Android library or app package was produced. The user authorized investigation. Retrying with `--stacktrace` traced the failure to `NetworkInterface.getNetworkInterfaces`, with `java.net.SocketException: Operation not permitted (Socket creation failed)`. Independent Python UDP socket checks for `0.0.0.0`, `127.0.0.1` and `::` each failed with `PermissionError: [Errno 1] Operation not permitted` during socket creation. The session blocks local sockets as well as remote networking. Writable cache access does not remove that restriction, and offline/no-daemon flags do not avoid Gradle lock-coordination networking. Native packaging requires a session that permits sockets or a build from the user's normal terminal. No Gradle or application code changes were made to work around the restriction.

RNTP remains the selected runtime. Its audio service, playback-service registration and UI hooks have not been switched. The new package is available for integration, but no new audio engine is initialized by the application yet.

## Task dismissal and session registration — host tests passed

The user selected stopping audio when dismissing the app card from Recent apps. The player callback now stops the coordinator and active requests, clears Media3's prepared timeline and stops the service, retaining the logical queue. Going Home or switching apps does not invoke this callback. Eleven dedicated new unit cases cover action ordering, cleanup after errors, timeline invalidation/projection restoration, retained queue and media-request cancellation. Gradle's actual unit task passed all 196 tests with zero failures/errors/skips. No new APK or device dismissal scenario was run for this revision.

The user approved fixing Media3 session registration. The service now registers its owned session before custom binding and safely unregisters/releases it on destruction. Seven Robolectric tests execute the real service against Android framework shadows, checking ownership, the missing-registration path, cleanup, recreation, dismissal and binding without stopping playback. Gradle passed 203 tests with no failures/errors/skips; the eight clean AAR and eleven APK integration checks passed again. The player TypeScript/tooling suite passed 300 tests after its Codegen fixtures were isolated from the shared prepared-specification directory. Physical notification visibility, real Recent-app dismissal and sound remain untested. This resolves the previous registration blocker.

## Resume after the user's decision

1. Continue the mobile adapter/source mapping and native queue projection. Registration and task-dismissal logic now pass host lifecycle/build checks; retain device checks as a separate gate.
2. Add a focused mobile player adapter, using platform transports and native queue revisions. Read `StreamingServicePlayer/MEDIA_SOURCES.md` and `SOURCE_WIRE_CONTRACT.md` first.
3. Connect authentication changes to native configuration. Clear the native session on logout/account change; rotate same-account tokens without resetting playback.
4. Map catalog tracks and existing managed cache files into native queue entries, preserving occurrence identifiers and separate UI metadata.
5. Replace the RNTP audio service, playback-service registration and React queue ownership together. Keep one engine active. Preserve recommendation fetching and asynchronous Last.fm reporting.
6. Replace RNTP progress/state hooks and track types in the controls and album/playlist screens.
7. Test queue edits, repeat/shuffle, cached playback, rapid track changes, seeking, stale completion handling and reporting independence. Record any deliberate behavior changes.
8. Verify Android app packaging and device playback, then iOS pod integration and the documented xtool/device workflow. Compilation and host tests do not establish playback correctness.

Native background credential renewal, persistent history accounting, process recovery and measured format/performance parity remain player limitations. Do not silently claim those capabilities during migration.

## Mobile adapter foundations — completed

Added the pure adapter components under `src/services/player` without switching the selected runtime:

- PlaybackTrackMapper converts catalog tracks, readable managed cache files, local files, exact signed URLs, headers and POST-resolved source configurations into native preparation data. Caller metadata and request definitions are captured before asynchronous work. Public track views and queue metadata omit source addresses, authentication headers and request bodies. Catalog tracks use the native server credentials; arbitrary URLs do not use the legacy catalog cache.
- NativePlayerCommandDispatcher shares initialization, preserves command submission order, constructs contexts from current native epochs/revisions, retries queue conflicts with new request identifiers up to a finite limit, and refuses retries across engine/account changes. Session clear bypasses pending command completion and invalidates queued work and late receipts. Initial cursor values are copied rather than retaining a mutable returned object.
- NativeQueueProjection reads native playback-order pages with a limit of 100 entries. It rejects conflicting/malformed/foreign-session pages and duplicate occurrence identifiers, discards stale read completions, reuses unchanged queue views and invalidates pending reads on clear. It does not mutate or determine the native playback order.

`npm run test:player-mobile` performs strict focused TypeScript compilation, then passes 47 deterministic tests: 19 track/source mapping, 14 command dispatch and 14 native queue projection cases. The focused compiler output is ignored under `.build/audio-migration`. These are injected adapter tests, not React Native runtime integration or device playback tests.

## Reporting compatibility gap — resolved in the event chapter

The existing AudioPlayerService handles RNTP's PlaybackActiveTrackChanged and RemoteSeek events for PlaybackTracker session creation and seek reporting. The shared replacement facade currently delivers only State events, and its Android bridge wraps every observed native snapshot as a State event. Although the public contract defines EntryChanged with reasons, that path is not delivered by the implemented facade/backend. There is also no explicit seek/position-discontinuity event carrying the affected entry and previous/new positions.

State snapshots can show a position reset on the same occurrence, but cannot reliably distinguish natural repeat, explicit restart and a remote seek. Heuristics would change the app's reporting behavior. Work stopped for the user's decision before adding native event contracts/implementation or switching AudioPlayerService, playback-service registration or UI hooks. RNTP remains selected.

The user approved adding those events. The completed chapter below supersedes this pause. Native persistent listening/history and background renewal remain separate limits.


## Native events and mobile reporting — completed

Both player backends now deliver ordered EntryChanged and Seeked events. Entry-change reasons distinguish selection, next, previous/restart, natural advance/repeat, removal and clear. Replayed/stale commands do not emit duplicate events. The Android service/bridge forwards complete envelopes, and the shared facade exposes supported event types. Read sibling player PLAYBACK_EVENTS.md for the complete timing contract.

Added NativePlaybackReporting under src/services/player. It establishes ownership from an authoritative snapshot and rejects raw events from other engine/account epochs, older sequences and duplicates. Entry changes stop the previous tracker immediately. Listening accounting begins only on a matching Playing snapshot with Play intent, pauses during buffering/resolution/pause, and stops when the queue ends or playback stops. Seek events update the captured current tracker without starting a new session. Metadata and cursor values passed to session creation are copied.

All reporting operations run independently of audio commands. The adapter never waits for an HTTP request. Synchronous exceptions, rejected promises and delayed responses cannot replace the current tracker. The existing PlaybackTracker continues to preserve HTTP report ordering in its background queue.

`npm run test:player-mobile` passed strict focused TypeScript compilation and 73 deterministic checks: 47 existing adapter cases, 22 reporting cases and four integration cases composing NativePlaybackReporting with transpiled production PlaybackTracker/PlaybackReportingQueue source and injected HTTP, clock and timers. Integration cases hold an old session-start request open while selecting/seeking a new track, resolve it late, reject it, and switch accounts. They verify captured session/account identifiers and interval cleanup. These are host component integration checks, not React Native/device execution or live Last.fm calls.

Player checks passed: 310 TypeScript/tooling, 224 Android unit/lifecycle and 255 Swift host tests; Apple SDK module compilation; actual unsigned xtool release harness packaging. The eight clean Android AAR and eleven Android APK integration checks passed after the changes, including linked modules, all configured ABIs and packaged service/permission. RNTP remains selected; these adapter components are not yet composed into AudioPlayerService or the UI.

## Source-capacity compatibility issue — resolved by queue ownership

The next queue-composition step exposes a source budget mismatch. Native logical queues allow 10,000 entries, but both source registries allow only 256 registered handles. Ordinary uncached catalog entries use recording identifiers directly. Each distinct cached local file, exact URL or resolver configuration needs a registered source handle. Queue references and active transport leases prevent releasing an in-use handle.

Consequently, a queue with more than 256 distinct cached files cannot be prepared this way. Preparing replacement sources while the old queue still owns many handles can also exhaust the budget before the atomic replacement command. Clearing the old queue first would interrupt playback; falling back to catalog streams would change cached/offline behavior. Neither change was made. Existing native source-capacity and in-use-release tests verify the constraints.

Per the user's stop-and-ask instruction, runtime composition pauses for a decision on extending source management to support large cached queues and queue replacement. Completed event/reporting work can be reviewed independently. Resume after that decision with source ownership/cleanup, authentication readiness, native observation, one-engine composition and UI changes. Keep device playback, persistent background listening accounting and iOS React Native host integration as separate gates.


## Queue-owned source preparation — completed

The user approved source-management extension. The native registries now separate manual registrations from Queue ownership, admit a current and staged 10,000-source queue under shared 32 MiB configuration accounting, and retire old queue-owned handles after their final occurrence/transfer. Unused staged sources still expire after five minutes. Resolved POST registrations retain a separate bound. Native capabilities report ownership support and limits. See sibling player SOURCE_MANAGEMENT.md.

NativeQueueSourcePreparation prepares candidate handles before the atomic queue command. It captures epochs, metadata, headers and bodies, validates the logical queue length and aggregate configuration budget, copies supported fields only, and rejects duplicate/mismatched occurrences. A selection predicate fences obsolete work. Failed/conflicted/superseded results and exceptions release staged handles; cleanup continues after errors. Candidate preparation has its own serialized chain, so rapid selections clean canceled handles before staging the next candidate. Audio commands remain on their separate dispatcher. PlaybackMediaConfiguration supplies the shared deep copier used by the mapper and preparer.

Checks: strict focused TypeScript compilation; `npm run test:player-mobile` passed its existing 73 cases; `node tools/player-source-preparation.test.cjs` passed 24 additional cases. The latter includes an actual NativePlayerCommandDispatcher integration case completing an audio command while source registration remains pending. The user's unrelated package scripts, dependency lock changes, patches and removed declaration were preserved; the new preparation suite is invoked separately.

Player checks passed: 327 TypeScript/tooling, 247 Android unit/lifecycle, 274 Swift host; Apple SDK compilation; unsigned xtool release packaging; eight clean Android AAR integration checks. Physical audio, cached-file playback and large-queue performance remain unverified. RNTP remains the selected app runtime.

The separate server subagent completed NuGet restore, vulnerability query and transitive inventory. No known advisories were reported across six projects and 129 unique resolved package/version pairs. Server DEPENDENCY_AUDIT.md records exact commands, versions and coverage limits; existing server configuration edits were preserved.

### Confirmed behavior and next composition

The user confirmed that Next under Repeat Song must restart the current song, and removal of the current track must continue with its next surviving track. Native removal already matches. Align manual Next in all queue reducers and coordinator tests before switching the app. Then compose source/metadata ownership, authentication readiness, native observation/reporting, the one-engine audio facade and UI actions. Candidate metadata must be available by occurrence before native events arrive, without turning React into the queue authority. Preserve the native staging epochs across command retries and keep preparation/reporting out of the audio command chain.

## Confirmed controls — implemented in the native player

Next now restarts the current entry under Repeat Song on both platforms, including a one-entry queue. Native snapshots allow that action at the last entry. The new occurrence is reported with reason Next, while natural repeats retain reason Repeated. The experimental reducers now expose advance(state) without a redundant natural-completion flag; coordinators own the cause. Active removal already follows the user's choice to continue to its next surviving entry, with the existing wrap/end rules when none follows. Play/pause intent remains preserved.

Final player checks for this chapter passed: 327 TypeScript/tooling, 248 Android unit/lifecycle, 275 Swift host cases; Apple SDK compilation and unsigned xtool release packaging; eight clean Android AAR integration checks. The full app/APK build failed in MMKV as detailed below. Mobile focused tests passed 73 existing cases plus 24 source-preparation cases. Native sound, lock-screen actions and real cached playback remain untested.

Player source management is committed as 4981963; mobile preparation/copier work as 98795d6; the separate server audit report as b2357f4. Resume runtime composition using the settled repeat/removal policies. RNTP remains active until AudioPlayerService, registration and UI hooks are switched together. Preserve the user's unrelated dependency/patch changes and server configuration edits.


## Current app build failure — awaiting the user

`npm run test:player-android-app` attempted the actual Gradle app build and failed at :react-native-mmkv:compileDebugKotlin. Installed MMKV is 4.3.2, installed Nitro Modules is 0.33.9. MMKV's generated HybridMMKVPlatformContextSpec expects HybridObject.CxxPart and initHybrid/createCxxPart; the installed Nitro base class lacks that API. Errors are CxxPart unresolved and overrides nothing, plus the resulting return-type exposure error. The eleven APK checks failed from their shared build prerequisite; none passed on this revision. An existing APK is not evidence of a current build.

This is separate from the player library: its 248 unit/lifecycle cases and eight clean AAR integration checks passed. The user has pending dependency/lock/patch changes outside this task; those were preserved. No MMKV/Nitro version, generated source or patch was changed. Per the user's stop-and-ask rule, runtime composition pauses for a decision on investigating/fixing the version pairing. The server NuGet audit and source-management/control work are complete.

With approval: inspect the storage library's required Nitro generation/runtime pairing, make the smallest compatible dependency change with a regression check, build the full app again, then compose the native audio facade, auth/session lifecycle, observation, source metadata and UI together. Next repeats the same entry in Repeat Song; removing the active entry continues according to the settled native successor rules. These decisions need no repeat approval.

## MMKV and Nitro pairing — approved dependency fix

The user approved investigating and fixing the storage build failure. MMKV's official 4.2.0 release notes require Nitro Modules 0.35.0 or newer: https://github.com/margelo/react-native-mmkv/releases/tag/v4.2.0. Installed MMKV 4.3.2 declares Nitro and nitrogen 0.35.9 as its development generation dependencies. Pin MMKV to 4.3.2 and Nitro Modules to 0.35.9. The installed runtime now supplies the CxxPart, initHybrid and createCxxPart API expected by MMKV's generated Kotlin specification.

`node --test tools/player-storage-dependencies.test.cjs` passed five dedicated checks for manifest pins, lockfile versions, installed versions, generator/runtime pairing and the required Kotlin backing API. `npm run test:player-mobile` passed all 73 existing adapter/reporting checks after focused TypeScript compilation. `node tools/player-source-preparation.test.cjs` passed all 24 source preparation checks. `npm run test:player-android-app` built the actual debug APK and passed all eleven checks for player autolinking, native module linkage, FFmpeg/application libraries across four configured architectures and the packaged service/permission. The MMKV Kotlin build failure is resolved. These checks do not establish device storage or playback correctness, Metro bundling, or the iOS React Native host build.

Installation used `npm install --save-exact react-native-mmkv@4.3.2 react-native-nitro-modules@0.35.9 --ignore-scripts --cache /tmp/streaming-mmkv-nitro-npm-cache`. The user's pending dependency, security override and declaration changes remain in the working tree. Stage only the storage manifest pins and their two lock entries for this chapter. npm reported 62 advisory findings in the mobile dependency tree; no automatic audit fix was run. The separate server NuGet audit does not cover these mobile packages.

### Metro patch failure — awaiting the user

Running `npm run postinstall` failed because the existing, untracked `patches/metro+0.82.5.patch` cannot be parsed by patch-package 8.0.1. Its second hunk declares seven old/new lines but contains five. `npm run test:dependency-security` passed the empty-asset case and failed the PNG-dimension case with `getImageSize is not a function`. The working override selects image-size 2.x; Metro still imports it as a callable default export because the patch did not apply.

The patch was preserved. Per the user's stop-and-ask instruction, further migration implementation pauses for approval to repair the patch and rerun postinstall and both security regression tests. RNTP remains the active engine. Once that blocker is resolved, resume native controller composition, authentication readiness, source metadata ownership, event observation, reporting and UI migration with the settled repeat/removal behavior.

## Metro patch repair — completed

The user approved repairing the existing patch. Its Flow hunk now declares the five lines actually present. `npm run postinstall` applies metro@0.82.5 successfully. `npm run test:dependency-security` passes both PNG dimension parsing and empty-asset rejection. `node --test tools/player-metro-patch.test.cjs` passes two dedicated checks for exact hunk lengths and both named image-size imports. The new length test reproduces the malformed-hunk failure without relying on the installed node_modules copy.

The repaired patch depends on the user's pending image-size override and patch-package/postinstall configuration. Those changes, the removed image-colors declaration and the existing security test remain outside this chapter's staged changes. RNTP is still selected. Resume migration with native queue/controller composition; run a Metro bundle and Android integration again when the runtime and UI switch is complete.

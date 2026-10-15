# Audio migration progress

## Branch and scope

Branch: `feat/streaming-service-player-audio-migration`.

Replace RNTP with the sibling StreamingServicePlayer package on Android and iOS. The latest user instruction authorizes continuing the full migration without stopping for implementation choices. Commits were prohibited until after 17:23 Europe/Bucharest on 2026-10-15; the first commit in this chapter was made after 20:23 local. Earlier stop/no-commit statements below describe prior instructions. Apply the project quality skill to player work. Keep audio commands independent of Last.fm requests and capture reporting session identity before asynchronous operations.

## Current state — 2026-10-15

The app now uses StreamingServicePlayer for playback on both platform code paths. AudioPlayerService, album/playlist/search actions, Playing, the mini player and progress controls use PlaybackRuntime. RNTP imports, dependency/lock entry, startup service registration, playbackService.js and QueueEventEmitter.ts are removed. Native player prerequisite: StreamingServicePlayer commit a986902.

The rewritten queue is selected. Authentication restoration, shared refresh, account cleanup, managed cache lookup, public metadata, native observation, Last.fm accounting and one-batch suggestions are wired. Full playlist playback loads all pages before one atomic selection, with cancellation and a 10,000-entry limit. Background listening reports remain in memory.

Code/build migration is implemented. Physical-device playback and the real iOS React Native host remain unverified. The unsigned xtool harness validates shared Swift packaging, not the app's complete iOS CocoaPods/Codegen/Objective-C++/Hermes integration. No Android device was connected. Existing dependency-security edits were preserved separately; checks below used the current working dependency installation.

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

## Native queue and authentication composition — completed components

NativeQueueController composes the existing dispatcher, mapper and source preparation. Replacement selects the requested occurrence in one native command. Source capture, cache lookup and registration run outside the audio command chain. New selections, pause, stop, next, previous and clear cancel obsolete candidate preparation. Playback commands can finish while registration is pending. Queue retries retain the staging engine/account epochs and use fresh native command contexts. Rejected commands release staged handles and unobserved metadata. Selection/removal operate on occurrence identifiers, and shuffle/repeat remain native decisions.

PlaybackMetadataRegistry stages copied public metadata before commands can emit events. Native observation retains associations for cached recording identifiers, album identifiers and likes; queue reconciliation removes retired occurrences. Retention is bounded to one current and one staged maximum queue. Restored entries without an in-memory association expose their available native metadata; the registry does not invent a recording identifier for an opaque source. Durable reconstruction of those associations across JavaScript restarts remains unimplemented.

SharedNativePlayerObservation supplies one native event subscription to state and reporting consumers. NativePlaybackViewStore projects authoritative playback-order pages and publishes stable queue/control views. Progress events update PlayerStateStore separately without queue-control notifications or repeated page reads. Suspension hides the old account queue, stops local listening accounting and prevents late page completions or events from restoring it. Native snapshot/session changes fence queue reads and reporting.

PlaybackAccountIdentity reads the server token's subject for local account separation. It handles UTF-8 payloads, bounds decoding and rejects missing/malformed subjects with a fixed message. It does not authenticate or verify tokens; server authentication remains authoritative. PlaybackAuthenticationCoordinator waits for restoration, clears unknown/account-switched ownership, serializes credential changes, and preserves the queue/listening state on same-account token rotation. Account changes invalidate queued dispatcher commands immediately and cancel source preparation. Late credential completions cannot become the final active account. Failed transitions can be retried. The AuthContext readiness field and runtime wiring are still pending.

### Feature checks

| Component / behavior | Dedicated checks |
| --- | --- |
| Metadata capture, duplicate occurrences, uncertain receipts, rollback, retirement, clearing, native metadata updates, restoration and capacity | `tools/player-native-composition.test.cjs` |
| Single native subscription, separate subscription lifetimes, consumer exceptions and retry | `tools/player-native-composition.test.cjs` |
| Atomic replacement/selection, append, cancellation, stale source sessions, conflict retry and cleanup | `tools/player-native-composition.test.cjs` |
| Each playback command, seek conversion, shuffle restoration, repeat-one Next, active removal and clear | `tools/player-native-composition.test.cjs` |
| Native queue projection, progress isolation, active listening transitions, suspension, pending-read cancellation, epoch changes and disposal | `tools/player-native-composition.test.cjs` |
| Subject extraction, token rotation, UTF-8, redacted rejection and payload bounds | `tools/player-authentication.test.cjs` |
| Restoration, signed-out clearing, initial ownership, transition sharing, account changes, logout, late configuration, readiness, retry and queued-command invalidation | `tools/player-authentication.test.cjs` |

`./node_modules/.bin/tsc --project tsconfig.audio-migration.json` passed. `npm run test:player-mobile` passed its existing 73 checks, and `node tools/player-source-preparation.test.cjs` passed 24. `node --test tools/player-authentication.test.cjs tools/player-native-composition.test.cjs` passed 63 new checks: 17 authentication and 46 composition cases. Storage/patch structural regression checks passed seven cases; the existing image security suite passed its two cases after patch application. Composition tests use the production TypeScript queue reference model and injected native/event/cache collaborators. They do not run the Android service or a device. The previously completed eleven Android APK checks were not rerun for these unused JavaScript components.

### Full app type check — awaiting the user

Before modifying runtime startup, AuthContext or UI consumers, `./node_modules/.bin/tsc --noEmit --pretty false` failed with six existing errors. heartEmptyIcon.tsx and heartIcon.tsx pass an unsupported colorInterpolationFilters SVG filter prop; pauseIcon.tsx passes xmlns; ContextMenu's icon type omits its supplied fill prop; DeepLinkHandler's two URLSearchParams.get calls are absent from the React Native declaration. The same command after component implementation produced byte-for-byte identical diagnostics. Focused strict player adapter compilation is passing, but the complete app type check is not.

Per the user's stop-and-ask instruction, runtime/UI migration pauses for approval to fix those unrelated app type errors. RNTP is still active. No startup registration, existing audio hook or UI engine has been switched in this chapter.

After that decision: expose authentication restoration readiness, compose the native bridge/cache/reporting adapters with these components, preserve the suggestions flow with account/selection fences, replace AudioPlayerService and RNTP UI hooks together, and remove old playback-service registration. Then verify full app types, deterministic runtime/integration cases, a Metro bundle and the actual Android APK. Device playback, native background listening persistence and the iOS React Native host remain separate gates. Keep the user's pending package/lock security edits and removed declaration intact.

## App TypeScript errors — fixed, uncommitted

The user requested only these fixes, then a stop without committing. Removed the unsupported colorInterpolationFilters props from both heart icons and xmlns from the pause icon. ActionItem now declares the optional fill prop already supplied by ContextMenu. Added src/types/url-search-params.d.ts for URLSearchParams.get; the installed React Native implementation provides this method, but its global type declaration omits it. Deep-link runtime behavior was not changed.

`./node_modules/.bin/tsc --noEmit --pretty false` and `git diff --check` passed. These changes remain uncommitted. Runtime/UI migration was not resumed; RNTP remains active. The next migration steps above remain pending further instruction.

## Queue review — rewrite before runtime migration

The user requested a queue analysis before further integration. [QUEUE_REWRITE_REVIEW.md](QUEUE_REWRITE_REVIEW.md) records the reviewed source locations, inferred failure sequences, replacement-component gaps, target ownership, behavior decisions, implementation chapters and required regression cases.

Recommendation: completely replace the active mobile queue hook and its screen-level coordination. Keep the replacement player's native logical queue as authority and retain its tested canonical/playback-order semantics. The review found lost edits on shuffle restoration, stale prequeued removals, index-based misidentification, non-atomic screen-driven playback startup, commands bypassing serialization, missing active-path account cleanup and incomplete suggestion/error handling. Playing a playlist currently queues only loaded pages.

The new components also need work before wiring: reserve edit order before asynchronous mapping, distinguish queue identity from session epochs, define cancellation/rebase rules, avoid full paging on selection-only revisions, recover failed reads, retire metadata without relying on full UI projection, and avoid linear active-index searches on every progress update. Native page lookup/timeline reconciliation and large-candidate source preparation need measurement and targeted changes.

Updated next step: specify and rewrite the mobile queue layer, correct the reviewed adapter/native gaps, then resume authentication/runtime/UI composition. Proposed features such as atomic Insert Next, Clear Upcoming, configurable continuation and listening history are identified separately from confirmed behavior. Next in Repeat Song restarts the same song; active removal continues to the next surviving entry. No implementation changes or test runs were made for this analysis, and nothing was committed. Existing uncommitted TypeScript/dependency changes remain intact.

## Queue specification and command-layer rewrite — items 1 and 2 completed, uncommitted

The user authorized only work-list items 1 and 2 and explicitly prohibited commits. [QUEUE_BEHAVIOR.md](QUEUE_BEHAVIOR.md) defines ownership, occurrence/lifetime identities, ordering, candidate dependencies, control cancellation, conservative conflicts/unknown outcomes, retained native playback semantics, continuation/collection boundaries and the feature-to-test mapping.

NativeQueueController has been rewritten around QueueIntentScheduler. It reserves list/mode edit slots at acceptance before asynchronous cache/snapshot work. Append order is stable. Appends/mode edits accepted during replacement wait for its successful commit, and cannot fall through to the previous queue if it fails. Replacements and clear supersede earlier pending edits. Controls and explicit selection cancel candidate playback through a separate native command path; ordinary append can finish while paused. Source inputs and occurrence identifiers are captured at acceptance. Added atomic removeMany and stable-anchor move using existing native contracts.

Queue lifetimes distinguish desired from acknowledged committed ownership. They are local dependency tokens, not a newly implemented native queue identity. Session invalidation cancels pending work, and PlaybackAuthenticationCoordinator now calls the explicitly named invalidateSession method. cancelPendingReplacement is a separate integration port for native controls; it does not send another control or cancel ordinary appends.

Added queueCommandOnce to the dispatcher. This facade does not use automatic queue conflict retries. A changed revision during preparation rejects before mutation, with staged source cleanup. A lost/uncertain native outcome blocks later list/mode/selection edits rather than replaying them; explicit replacement or clear restores known ownership, while Pause/Stop remain available. Native rejections expose fixed messages with typed status/error code. A replacement already applied before cancellation remains authoritative when its receipt returns; cancellation does not restore the previous native queue. Late unused source registrations are consumed and released.

The existing RNTP hook, QueueEventEmitter, playback service and screen shouldPlayFromStart effects remain selected and unchanged. The new facade contains none of their index/prequeue/original-array coordination. Removing the legacy implementation occurs at the runtime/UI switch; partially wiring these components would exceed items 1 and 2.

### Checks

- `npm run test:player-mobile` passed focused strict compilation and all 230 deterministic host checks across ten suites. It now includes previously standalone source-preparation, composition and authentication suites plus the rewrite suites by default.
- New coverage: 56 queue rewrite cases, 11 intent scheduler cases and three single-attempt dispatcher cases. The existing composition suite was updated for prompt cancellation/late cleanup and the explicit no-retry conflict policy. Authentication tests cover the renamed session invalidation boundary.
- Cases cover slow/fast append ordering, replacement dependencies/failure, cancellation fairness, paused append, rapid replacement, captured identifiers/source input, duplicate recordings, batch removal, move/anchor failure, shuffle edits, repeat-one Next, paused active removal, stale revisions/accounts, unknown receipts/recovery and late handle cleanup. See QUEUE_BEHAVIOR.md for the mapping.
- `./node_modules/.bin/tsc --noEmit --pretty false` passed for the full app. `git diff --check` passed. No native code/protocol changed, so no Gradle, Swift, xtool, APK, Metro bundle or device check was rerun for this chapter. These are host command-component checks, not proof of audible playback or a performance gain.

No changes were staged or committed. Existing TypeScript fixes, dependency/lock/security edits and the removed declaration were preserved. The only new package script edit is the expanded test:player-mobile command.

### Resume at item 3

Correct native list/content revision and ownership/remote-control preconditions, lazy paging, failed-read recovery, metadata retirement and measured indexing/reconciliation/preparation costs. The current coarse native revision deliberately rejects some edits across selection changes. Remote Pause/Stop supersession, including redundant native actions, still needs native event/precondition design and runtime wiring; the cancellation port alone is not an atomic native intent guard. Then implement accepted optional queue features, wire authentication/cache/reporting/continuation, and switch UI/startup/system controls together. RNTP remains active; no Android/iOS runtime validation is claimed for this rewrite.

## Full runtime/UI migration — implemented

### Selected runtime

PlaybackRuntime composes the native bridge, serialized command dispatcher, queue intent scheduler, source preparation, metadata registry, state/control stores, reporting and authentication. The app uses one native event subscription. Progress selects primitive position/duration values independently of the music context. A native engine restart invalidates pending work, clears uncertain ownership and restores credentials before further playback.

ApplicationAuthenticationSession is shared by AuthContext, API clients and playback. Concurrent 401 responses share token refresh. Restoration cannot overwrite a later login/logout. A new account invalidates queue preparation and continuation immediately. Same-account token rotation preserves the queue. Captured reporting clients keep old requests tied to their account and never refresh or replay them as another account. Request timeouts are 15 seconds; HTTP completion does not hold the native audio command lane.

The app transport uses the same StreamingPlayer TurboModule and StreamingPlayerStateChanged event on Android/iOS. Framework module names and server response keys remain explicit protocol boundaries. Platform dependencies are composed at NativeAudioRuntime and AuthenticationService; pure runtime/authentication/queue components have injected collaborators.

### Queue and continuation

Native queue identities detect replacement outside the app facade. Separate content revisions avoid repeated page reads on selection/progress, and native control revisions reject stale prepared replacements, including redundant system Pause. Ordinary append can survive Pause. Atomic appendAndSelect installs suggestions and selects their first occurrence in one native mutation. Repeat Song Next restarts the same occurrence. Clear/removal release public metadata independently of a successful full UI read.

A full playlist is loaded with bounded 100-row server pages, checked against the selected recording and native capacity, then committed once. A newer collection request cancels older source preparation before its HTTP loading finishes. Superseded collection results do not touch audio. Suggestions are one batch per explicitly selected queue, shared by duplicate end/Next notifications and fenced by account, engine, queue identity, control revision and selection. Late results do not override manual selection. Empty/error responses preserve the ended queue; there is no endless autoplay policy or dedicated suggestion-retry button.

Queue views keep a bounded native page projection and an occurrence-position index. Failed reads clear the loading flag and retry while paused, with a 250-millisecond delay and at most three attempts; content changes or explicit refresh allow a new attempt. Late failures cannot restore an older selected entry. Suspension cancels retries. The projection still materializes the full logical queue on content changes; fully lazy queue UI, large queue benchmarks and Android timeline reorder optimization remain follow-up work.

### Feature checks

| Behavior | Dedicated tests |
| --- | --- |
| Restoration, persistence order/failure, shared refresh, subject mismatch, late refresh/logout/account changes | tools/player-application-session.test.cjs |
| Actual axios interceptors: authorization, concurrent refresh across clients, one replay, auth route exclusion, captured account and late login/401 responses | tools/player-network-client.test.cjs |
| Catalog URLs/public metadata and complete/cancelled/oversized collection pagination | tools/player-collections.test.cjs |
| Runtime composition, shared observation/disposal, source capture, late collection/suggestion results, native Pause, token rotation/logout, continuation, repeat-one, nonblocking reports, foreign ownership and engine restart | tools/player-runtime.test.cjs, injected native fixture backed by the production queue reference model |
| Failed projection recovery, retry bound, latest selection, suspension and new queue recovery | tools/player-view-recovery.test.cjs |
| Native content/identity projection cache | tools/player-queue-projection.test.cjs |
| Each app bridge method, subscription cleanup, selected dependency and startup removal | tools/player-selected-runtime.test.cjs |
| Queue ordering, cancellation, unknown outcomes, duplicate occurrences, edit semantics, metadata/source ownership and reporting | Existing rewrite, intent, source, composition, authentication and reporting suites |
| Metro binary image API and patch integrity | tools/player-metro-assets.test.cjs, tools/player-metro-patch.test.cjs |

### Executed checks

- npm run test:player-mobile: strict adapter compilation and 287 deterministic tests passed across 16 files. New runtime/network tests inject native, cache, network, reporting and scheduling collaborators; they do not play device audio.
- ./node_modules/.bin/tsc --noEmit --pretty false: full app passed.
- npm run test:player-integration: seven workspace/Metro/export checks passed.
- npm run test:player-android-app: all 11 APK integration checks passed after RNTP removal. Generated registration/provider, service permission and four ABI FFmpeg/application libraries are present.
- node --test tools/player-metro-patch.test.cjs tools/player-metro-assets.test.cjs: three passed. The patch applies to pristine metro 0.82.5 using npm run postinstall. It fixes both named imports and asset-file reads for image-size's binary API, in JavaScript and Flow.
- React Native CLI bundle --platform android --dev false and --platform ios --dev false: both production bundles and image assets built successfully. Bundle artifacts are under /tmp/full-audio-migration-baseline.
- Player checks: 328 TypeScript/tooling, 253 Android native and 280 Swift host tests passed; Apple SDK compilation and unsigned xtool release harness packaging passed. See ../StreamingServicePlayer/PROGRESS.md.
- adb devices: no device attached. No audible playback, service dismissal, notification controls, background survival, iPhone execution or performance measurement is claimed.

The available all-ABI debug APK changed from 168,631,447 bytes to 163,573,711 bytes: 5,057,736 bytes smaller (about 4.82 MiB). The baseline already contained both players, so this measures removing RNTP from that build, not the size difference between an original RNTP-only app and this player. Release/device-size results may differ.

### Resume / remaining validation

1. Install the Android APK and exercise real authenticated playback, cached files, URL/header/POST-resolved sources, seeks, rapid selections, playlist pagination, queue edits, repeat/shuffle, suggestions, account changes, Bluetooth/headphones, notifications and lock-screen controls.
2. Verify the confirmed Android policy: dismissing the app from Recent Apps stops playback; ordinary backgrounding preserves it. Exercise service/process recreation and stale JS reconnect.
3. On a macOS/Xcode host, prepare the sibling player, run CocoaPods and build the actual iOS React Native app. The Linux Apple SDK/xtool harness checks do not replace this gate. Use the existing harness device scenarios when signing/device access is available.
4. Measure large queue preparation/first-read/reorder cost and release memory/start/seek behavior. Native entry/page indexing is implemented; full lazy UI projection and Android timeline reconciliation remain unmeasured follow-up work.
5. Implement durable background report/session restoration only if required. Current reporting is nonblocking but process-local. Cached files are accepted using the existing managed-file existence/size policy; complete download integrity and account-scoped offline storage remain separate work.
6. Keep optional Insert Next, Clear Upcoming, explicit continuation retry/configuration and actual listening history separate from this migration.

No push was made. Earlier package/lock security edits, removed image-colors declaration and dependency-security test remain outside the migration commit. In particular, the checked working installation includes the user's pending Metro/image-size override; dependency reproducibility should be rechecked once that separate change is committed.

## Pending dependency changes — reviewed and clean-install verified

The user asked to complete migration follow-up item 6 immediately. The earlier unrelated pending dependency changes now belong to this authorized chapter. [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md) records the exact changes, dependency paths, audit commands, remaining findings and validation.

A separate source copy at /tmp/streaming-mobile-dependency-validation passed a fresh npm ci, automatic Metro patch application, explicit player preparation, 11 dependency/Metro regression checks, all 287 mobile tests, full app TypeScript checking, seven workspace integration checks, both production bundles and the 11-check Android APK build across four ABIs. There were no existing dependency/native outputs in that copy; npm/Gradle download caches were reused. The lockfile hash matched the workspace exactly.

The pending package/lock changes and removed unused image-colors declaration are now reviewed for commit with the security regression test. No dependency changes remain intentionally excluded from this chapter. Earlier notes saying they were left separate describe the migration commit only.

Current npm audit: 62 affected-package entries (56 high, six moderate), compared with 91 in a75fd66 (four critical, 68 high, 18 moderate, one low). The production-only audit reports 31 entries. All remaining entries trace to two root advisories, braces and sprintf-js, with no published fixed version at the check time. The audit still exits nonzero. These findings remain open; completing clean-install verification does not mean every vulnerability is fixed.

No forced framework upgrade or advisory suppression was used. See DEPENDENCY_AUDIT.md before updating those toolchain paths. Device playback and the actual iOS native host remain the next migration validation steps.

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

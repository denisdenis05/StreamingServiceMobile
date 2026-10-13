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

## Blocked — Android packaging

Command attempted from `android`:

```sh
./gradlew :streaming-service-player:assembleDebug --offline --no-daemon
```

The Gradle wrapper exits before compilation because it cannot write its lock file in the read-only `/home/denis/.gradle/wrapper/dists` directory. No Android library or app package was produced. Work stopped for the user's decision; no environment workaround was attempted after this failure.

RNTP remains the selected runtime. Its audio service, playback-service registration and UI hooks have not been switched. The new package is available for integration, but no new audio engine is initialized by the application yet.

## Resume after the user's decision

1. Establish an Android packaging check or obtain explicit approval to continue source migration while packaging remains blocked.
2. Add a focused mobile player adapter, using platform transports and native queue revisions. Read `StreamingServicePlayer/MEDIA_SOURCES.md` and `SOURCE_WIRE_CONTRACT.md` first.
3. Connect authentication changes to native configuration. Clear the native session on logout/account change; rotate same-account tokens without resetting playback.
4. Map catalog tracks and existing managed cache files into native queue entries, preserving occurrence identifiers and separate UI metadata.
5. Replace the RNTP audio service, playback-service registration and React queue ownership together. Keep one engine active. Preserve recommendation fetching and asynchronous Last.fm reporting.
6. Replace RNTP progress/state hooks and track types in the controls and album/playlist screens.
7. Test queue edits, repeat/shuffle, cached playback, rapid track changes, seeking, stale completion handling and reporting independence. Record any deliberate behavior changes.
8. Verify Android app packaging and device playback, then iOS pod integration and the documented xtool/device workflow. Compilation and host tests do not establish playback correctness.

Native background credential renewal, persistent history accounting, process recovery and measured format/performance parity remain player limitations. Do not silently claim those capabilities during migration.

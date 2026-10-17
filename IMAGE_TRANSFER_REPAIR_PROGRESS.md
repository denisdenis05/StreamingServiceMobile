# Image transfer lifetime repairs

Implemented on 2026-10-17 after the [image pipeline review](../StreamingServiceServer/IMAGE_CACHE_REVIEW.md).

## Implemented

- A reproducible `react-native-fs` 2.20.0 patch removes failed-transfer JavaScript listeners and terminal Android/iOS native download entries. Android registers jobs before starting them and uses a concurrent dictionary.
- iOS nonresumable cancellation and errors always settle once and invalidate the session. Download completion is serialized against cancellation before moving a file. Native dictionary reads/writes are synchronized. Background completion UUIDs remain available until the existing completeHandlerIOS contract consumes them.
- Android cancellation disconnects the current connection; redirects retain the configured connection/read deadlines.
- The adapter has an independent total-transfer watchdog: two minutes for images and thirty minutes for audio. Timers are canceled on settlement; late results and cancellation-boundary exceptions cannot restart a completed transfer.
- Every native attempt writes a distinct private path. It is moved into the cache work path only after successful current completion. Late canceled writes cannot truncate a retry. Native settlement triggers final private-path cleanup; a transfer that never acknowledges cancellation leaves an isolated temporary for age-based maintenance.
- Missing files are tolerated; permission and other filesystem errors are reported rather than treated as successful deletion or an empty directory.
- Releasing a display pin schedules coalesced cleanup. Image delivery no longer waits for the directory eviction scan. Display telemetry and invalidation use a bounded reverse path index rather than repeatedly hashing the recent request catalog.

The dependency's terminal cleanup is required; the JavaScript watchdog alone cannot remove native references or dependency-owned listeners. Keep the patch with the pinned installed version and run patch checks when updating RNFS.

## Verification

- `npm run test:asset-cache`: 71 tests passed, including actual patched-wrapper listener counts across 100 successes and 100 failures, timeout/cancel/stale-result tests, late-writer isolation, pin release cleanup and delivery independent of slow directory scans.
- `npm run test:player-mobile`: 319 passed; dependency/security patch checks: 11 passed; full app TypeScript passed.
- Android `:react-native-fs:compileDebugJavaWithJavac`: passed against the installed Android/React Native dependencies.
- `node tools/build-asset-transfer-ios.cjs`: xtool compiled and packaged the actual patched Downloader.m plus a cancellation assertion harness as an unsigned iOS app. Latest artifact: `/tmp/streaming-transfer-ios-xCuqIv/xtool/TransferLifetimeHarness.app`.
- Android and iOS production JavaScript bundles passed with 19 and 15 image assets under `/tmp/streaming-images-*`.
- patch-package application and reverse-diff checks passed. Patch generation's package-download step failed even after approved escalation, so the patch was generated from saved original installed sources and checked against the resulting files.

The JavaScript tests execute the real patched RNFS wrapper; native dictionary guards are source assertions. The xtool result establishes Apple SDK compilation/packaging of the downloader, not execution of its assertion, a complete React Native iOS host build or an iPhone memory test. Android Java compilation does not prove native retention counters on a running device. Rebuild the native app to use this patch; Metro refresh alone cannot update compiled native modules.

## Remaining measurements and separate performance work

Run repeated success/failure/cancellation scrolling on Android and iOS while collecting native heap and event-listener counts. Confirm memory stabilizes after warmup and native job counts return to baseline. Exercise actual iOS cancellation with resume data and host/background callbacks.

The existing native Image.getSize validation still decodes permitted images on Android (review M4). Cached disk lookups still share scheduling slots with downloads, and preview priority needs further work (M8). Those are remaining mobile performance items; the two delegated implementation tracks addressed server performance and logic. Eviction is now coalesced and outside delivery, but still uses directory reconciliation and is not an indexed disk-cache database. No device latency/RSS improvement percentage is claimed.

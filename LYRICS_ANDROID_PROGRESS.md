# Android lyrics integration

## Compact lyrics on smaller phones

Follow-up branch: `fix/compact-lyrics-phone-layout`, based on the integration branch after PR #2 merged. No master branch exists. Existing Home/recommendation working-tree changes are unrelated to this chapter and remain unstaged.

On windows narrower than 600 dp, only compact lyrics use smaller base typography (active 22, inactive 18, line height 30), 16 dp side padding, 12 dp top padding, a 56 dp header and base heading size 18. Existing responsive font scaling still applies. The expand button retains its 48 dp touch target; reducing the header inset moves it closer to the card edge. Expanded mode and compact mode at wider widths retain their accepted styling. Window dimensions update through React Native's dimension hook.

Dedicated regression tests in `tools/lyrics-panel.test.tsx` cover phone compact text/padding and touch target, unchanged phone expanded styling, unchanged wide compact styling, and the width boundary. `npm run test:lyrics`: 51 tests passed in 7 suites. `npx tsc --noEmit --pretty false` and `git diff --check` passed. An attempted narrow emulator screenshot caught Metro bundling rather than lyrics, so it is not claimed as visual verification. Emulator dimensions were restored to their original 1080x1920 at density 180. The user requested an APK for phone testing instead of further device checks.

Built `build/lyrics/StreamingService-Lyrics-Phone.apk` using the release command documented below with unchanged cached Spotify native libraries. Build succeeded in 31 seconds. Signature and bundled JavaScript/ARM64/x86_64 native libraries verified. The APK was built from the current workspace, including the pre-existing Home/recommendation edits. Phone acceptance and installation of this release candidate remain pending. Publication is deferred while the user tests the requested APK.

## Current chapter

Implemented account-scoped lyrics loading and local caching, synchronized and plain lyrics parsing, compact and expanded panels, timed seeking, animated highlighting, automatic scrolling with manual-scroll suspension, and cover-derived background color. Playing artwork, progress, controls, Lyrics and Jam cards share the same width. Control glyph bounds compensate for SVG whitespace.

The horizontal inner inset is 36 dp. The latest requested adjustment adds 24 dp of top padding to the compact card, above the existing header. The card's outer width remains aligned with the progress bar. The user accepted this spacing and subsequently requested APK and PR publication.

The user accepted the spacing and requested manual scrolling only in expanded lyrics. Compact mode disables nested scrolling, bounce and scroll-to-top gestures, ignores manual-scroll suspension, and reserves trailing space so the last current line remains on the second row. Expanded mode retains manual scrolling and its existing follow/reset rules.

After this adjustment, `npm run test:lyrics` passed all 47 tests in 7 suites and `npx tsc --noEmit --pretty false` passed. Dedicated new tests cover expanded-only gesture settings and compact trailing space. Local adb checks on the running emulator passed: compact drag did not move the current/previous line pair, the final current line appeared second, and expanded drag moved the visible lyrics. Device assertion metadata is in `/tmp/android-lyrics-scroll-proof.json`; it contains row indices and bounds rather than lyrics text. The test paused playback and left the compact card at the first lyric timestamp.

## Feature-specific verification

| Behavior | Dedicated tests |
| --- | --- |
| Timed parsing, offsets, active lines and scroll bounds | tools/lyrics-document.test.ts |
| Account isolation, caching, cancellation, stale results and persistence ordering | tools/lyrics-repository.test.ts |
| Authentication scope, API route and foreground retries | tools/lyrics-platform.test.tsx |
| Expand/minimize, timed seeking, highlights and scroll suspension/reset | tools/lyrics-panel.test.tsx |
| Cached cover color, stale completion and fallback | tools/lyrics-cover-color.test.tsx |
| Visible control bounds and centering | tools/playing-control-geometry.test.ts |
| Playing composition, overlay and playback command gates | tools/playing-lyrics-screen.test.tsx |
| Dominant cover color selection | android/app/src/test/java/com/streamingservice/lyrics/CoverColorSelectionTest.kt |

`npm run test:lyrics`: 7 suites, 47 tests passed, including the final compact scrolling changes. `npx tsc --noEmit --pretty false` passed again during PR preparation. Native cover-color unit tests and debug APK assembly passed; the installed APK runs with Metro JavaScript updates. The build used cached annotation 1.7.0/browser 1.4.0 resolution through a temporary Gradle init script and skipped rebuilding the existing Spotify Rust library.

`npm run test:player-mobile`: 384 passed, 3 failed. All failures are in the progress-hook harness because its dependency map does not provide `./RecommendationPlaybackPlatform`. Neither that harness nor AudioPlayerService has been changed by this feature. This broader suite is not green.

## Remaining checks and workflow

Completed emulator assertions for compact dragging, the previous/current pair at the third line, the final current line in the second row, and expanded manual dragging. Remaining device checks include a complete first/second transition sequence, expanded centering and suspension/reset, and native timestamp seeking. Screenshots and deterministic tests establish selected behavior, but do not establish all device scenarios. Device access through the connector remains disabled in this session; local adb connects to the user-provided emulator.

The task branch is `feat/android-synced-lyrics`. The repository has no origin/master; it was created from the current modern player branch with its existing local commits preserved. The user authorized publication. The PR targets `feat/streaming-service-player-audio-migration` because `master` is absent and `main` is the historical app. It includes the two preceding local commits for recommendations and artist pages, which were already present in the tested app and are absent from the remote integration branch. Keep the release APK outside Git; its ignored artifact path and checksum are recorded below.

No merge, deployment or playback engine switch is authorized by this work.

## Requested standalone APK

Built `build/lyrics/StreamingService-Lyrics.apk` with the latest accepted layout and compact scrolling behavior. Release packaging bundles JavaScript and supports ARM64 phones and x86_64 emulators. It uses the repository's existing debug signing configuration; it is a sideload candidate.

Command: `./gradlew :app:assembleRelease -x :app:buildSpotifyLibrespot -PreactNativeArchitectures=arm64-v8a,x86_64 --offline --init-script /tmp/lyrics-cached-android-dependencies.gradle --no-daemon` from `android`. Result: BUILD SUCCESSFUL in 2m 26s. The initial attempt to rebuild Spotify failed because the system Rust toolchain lacks Android standard-library targets; packaging reused the existing unchanged ARM64 and x86_64 Spotify libraries instead.

Verified APK signing using Android build-tools 37.0.0 `apksigner verify --verbose`, package metadata with `aapt dump badging`, and archive entries for the bundled JavaScript and both Spotify native libraries. Size: 60,588,495 bytes. SHA256: `2123c9a857dc221c6433e5d8ac8da63cb96a3239cf85c3818c5f02e5e8189652`. This release artifact has not been installed on a phone or emulator; earlier emulator checks used the debug app with Metro.

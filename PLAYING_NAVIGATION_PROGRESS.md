# Phone orientation and Playing navigation

Implemented on 2026-11-24 in StreamingServiceMobile. The player library and server are unchanged.

## Behavior

- Android chooses orientation in MainActivity on creation and configuration changes. ScreenOrientationPolicy requests portrait below a smallest screen width of 600 dp and leaves orientation unrestricted from 600 dp upward. It uses Android's named ActivityInfo constants. The activity applies a changed policy when a foldable or resized configuration crosses the threshold.
- iPhones support portrait. The separate iPad orientation array permits portrait, upside-down portrait and both landscape orientations.
- Playing keeps outgoing artwork mounted during a 280 millisecond native-driver animation. Next moves the old cover left and brings the new cover in from the right; Previous reverses that movement. Automatic advances move forward. Artwork sizing and the existing image cache remain in use.
- Rapid changes stop the previous animation. Retired completion callbacks cannot remove the latest outgoing artwork. Metadata refreshes for the same queue occurrence preserve the animation. Clearing the selection cancels it. Navigation direction is scoped to the originating occurrence and cleared after selection changes.
- Local Next/Previous resume a paused or stopped selected song. Navigation and the following Play share one dispatcher operation, so a later queued Pause remains later. The adapter checks for intervening native controls before Play. It avoids extra Play commands for an already-playing selection and leaves end-of-queue continuation to the existing append-and-play path.
- Next preflight checks whether a newer selection/control has superseded it before submitting navigation.
- Spotify Jam following requests Play after successful Next/Previous while the same action and session remain current. A retired action cannot send its extra Play into another Jam.

## Feature verification

- Initial XML/plist parsing and standalone aapt2 compilation accepted the original orientation resources, but did not prove that Android would honor a configuration-specific manifest value. Release lint subsequently rejected that approach. It was replaced with the activity policy; ScreenOrientationPolicyTest now verifies the 599 dp phone boundary, 600 dp tablet boundary and 840 dp tablet case. The iPhone/iPad plist configuration remains unchanged.
- `npx tsc --noEmit`: passed for the full app.
- `npx tsc --project tsconfig.audio-migration.json`: passed.
- `node --test tools/player-runtime.test.cjs tools/player-queue-rewrite.test.cjs`: 81 passed. Dedicated regressions cover Next and Previous from Pause and Stop, later JS/native Pause, paused final-song continuation, first-song Previous and paused repeat-one Next.
- `npx tsc --project tsconfig.spotify.json && node --test tools/spotify-player-jam.test.cjs`: 72 passed. Remote Next/Previous assert navigation then Play; the new session-change regression asserts no late Play.
- `npx jest --runInBand --watchman=false --runTestsByPath tools/playing-cover-transition.test.tsx tools/playing-lyrics-screen.test.tsx`: 12 passed. Dedicated cases cover initial presentation, both directions, rapid skips, stale completions, metadata refreshes, automatic advance, clearing, and Playing button wiring.
- ESLint on all changed implementation files and screen tests: zero errors, seven existing warnings. The new transition component and its tests pass without warnings. `git diff --check` passed.
- `npm run test:player-mobile`: 391 of 394 passed before the final two boundary tests were added. Three existing progress-hook tests fail because their AudioPlayerService sandbox omits `./RecommendationPlaybackPlatform`. Neither that service nor the failing test file was changed by this task. The final two added cases passed in the 81-test targeted run above.

## Build and device gaps

- Initial Gradle dependency resolution failed for the existing dynamic annotation/browser versions. The release build now succeeds using the previously documented temporary Gradle init script, which selects cached annotation 1.7.0 and browser 1.4.0. No repository dependency declarations were changed. The subsequent release-lint error for the manifest screen-size resource was fixed in the activity policy rather than suppressed.
- `adb devices` lists no connected device. Actual phone rotation, tablet rotation, animation frame timing and audible playback remain unverified. An iOS host/device build was not run in this Linux session.
- The mobile adapter cannot atomically combine Next/Previous and Play across a native-origin control arriving after its snapshot check. The native command API exposes them as separate operations. Session epochs still apply, and newer controls observed before Play suppress the resume. No player-library API was changed for this task.

## Branch and delivery

`origin/master` does not exist; the repository advertises `origin/main` as its default. Created `fix/portrait-playing-transitions` from fetched `origin/main`, then fast-forwarded the existing local `fix/compact-lyrics-phone-layout` baseline before implementation. That baseline contains 190 commits not on origin/main. Existing unrelated recommendation/UI working-tree edits were temporarily stashed, restored and excluded from this task's commit.

Committed the task as `Lock phone orientation and smooth Playing track navigation`. `GIT_TERMINAL_PROMPT=0 git push -u origin fix/portrait-playing-transitions` failed: `could not read Username for 'https://github.com': terminal prompts disabled`. No GitHub credential helper or GitHub API token is available in this session, and `gh` is not installed. The task branch remains local; no pull request was created. After authentication is restored, push this branch and open the PR against the existing `main` default branch. No merge or deployment was performed.

## Resume

Install the packaged APK and test on a phone and tablet. Check the reverse artwork movement, rapid alternating skips, and paused/stopped skips with real audio. Verify iPhone/iPad rotation and transitions on an iOS host. Repair the existing progress-test dependency fixture independently. If submitting a PR against main, review its inherited unmerged baseline as well as this task's commit.


## APK delivery follow-up

The user requested a PR and APK after the implementation. The first release assembly exposed the unsupported manifest configuration resource through Android's ManifestResource lint check. MainActivity now applies the tested phone/tablet policy at runtime. Release lint remains enabled and passes.

Command from `android`:

```sh
./gradlew :app:testReleaseUnitTest :app:assembleRelease -x :app:buildSpotifyLibrespot -PreactNativeArchitectures=arm64-v8a,x86_64 --offline --init-script /tmp/lyrics-cached-android-dependencies.gradle --no-daemon
```

Result: BUILD SUCCESSFUL in 34 seconds; 558 Android unit tests, zero failures/errors, including the three orientation tests. The build reuses the existing unchanged ARM64 and x86_64 Spotify native libraries. The JavaScript bundle was regenerated from this task's source with unrelated working-tree edits stashed. Full TypeScript checking and the 153 queue/Jam plus 12 screen tests passed again against that clean source.

Artifact: `build/playing/StreamingService-Playing.apk`, 60,593,147 bytes. SHA256: `aeb1d5e4f4caaa342846265885ef4d400a3bf8bc7a4d4275b531a7b5ce829806`. Android apksigner verifies its v2 signature, zipalign accepts 16 KB page alignment, and aapt reports `com.streamingservice`, minimum Android SDK 24 and target SDK 35. Archive verification confirms the 2,494,988-byte Hermes bundle contains the new artwork-transition markers and both native architectures are present. The repository's existing debug signing configuration signs this release sideload candidate; it runs without Metro. No phone or emulator execution was performed.

The repeated HTTPS push attempt still failed for missing GitHub credentials. A private GitHub token prompt is pending for the PR. Unrelated recommendation/UI edits were restored from the temporary stash after packaging and remain excluded from the task's commits and APK.

## Restore the current Recommendations flow

The user reported that the packaged Recommendations UI was the older version. The cause was packaging only the committed Playing task while temporarily excluding the existing uncommitted Recommendations changes. Merging that earlier branch would not restore those changes. The user explicitly requested adding them and revoked merge authorization; create/update the PR, but do not merge it.

The branch now includes the existing newer flow: Home shows recommendation playlist cards with generated collages, the Recommendations route opens the ordinary PlaylistViewer, and the recommendation hook loads previews, starts playback at the selected row, saves ordered selections, regenerates explicitly and fences stale account/request completions. The old standalone Recommendations screen is removed. Collection loading is disabled for recommendation previews; Home refresh includes the recommendation query. Related tests are included with these changes.

Validation on 2026-11-24:

- `npm run test:recommendations`: 95 controller/player tests and 22 screen tests passed.
- `npm run test:home`: 22 query tests and 24 screen tests passed.
- `npx tsc --noEmit`: passed for the full mobile app.
- `git diff --check`: passed.
- `:app:assembleRelease` with the preceding cached dependency overrides and unchanged native Spotify libraries: BUILD SUCCESSFUL in 29 seconds, with release lint enabled. The APK includes the Recommendations changes rather than stashing them.
- Corrected artifact: `build/playing/StreamingService-Playing-Recommendations.apk`, 60,591,335 bytes, SHA256 `0a4be38efc77e575c01cabb287c53611fa0f3735e7a1f3d897716224c1e7c933`. Signature verification and 16 KB archive alignment pass. The 2,493,176-byte Hermes bundle contains the new recommendation-query/hook and Playing transition markers; the old standalone Recommendations introduction is absent. ARM64 and x86_64 Spotify libraries are present.
- GitHub credentials were supplied privately for push/PR creation. The latest user instruction explicitly forbids merging; leave the PR open.

The Recommendations preview/collections API endpoints exist in the server workspace. No server deployment or live backend validation is included in this correction.

## Correct cover transitions and add horizontal dragging

The user reported inconsistent outgoing/incoming directions in the preceding APK and explicitly requested the quality skill for the fix, another APK and another PR. The latest no-merge instruction remains in force. The authored mobile changes in this chapter use the skill's constants, naming, dependency injection and dedicated test requirements.

### Cause and replacement

The preceding component replaced the cover layers while reusing one animated progress value, and direction was passed through parent React state that was cleared on track change. Its tests checked only the incoming starting side, not the retained outgoing layer or intermediate frame positions. Native Previous can also restart the same occurrence, and native selection can precede React's projected queue update; a direction request cannot be inferred from a Promise completing or from an album URL.

CoverGestureController now owns one scene with a retained current cover and adjacent queue occurrences. Playing buttons call it directly. The controller reads the selected native occurrence after button commands and keeps the direction until that occurrence reaches the projected view. Restarting the same song clears the request without a cover transition. A scene remains mounted until its motion and observed selection agree. Motion identifiers fence retired callbacks. One pixel offset moves all three cover layers; the component's layout effect resets the offset only when committing a centered scene, rather than changing direction or artwork under a running interpolation.

### Gesture behavior

The cover takes the responder only after horizontal movement exceeds 6 logical pixels and dominates vertical movement. Parent scrolling/dismissal retains vertical gestures. Movement updates only the horizontal animated offset, without selecting a track while held. Dragging left reveals the next actual queue occurrence; dragging right reveals the previous one. Moving the finger back reverses those same layers.

The release threshold is strictly greater than 30% of the latest measured cover width. Width is supplied by onLayout; the threshold and neighbor limits are computed on each movement/release, including after resizing. A missing neighbor limits movement to 30% in that direction and always returns smoothly. Gestures select the adjacent stable queue occurrence directly, so a right swipe selects the preceding song rather than invoking a position-based restart. Jam following uses its existing remote navigation path instead of trying to replace local shared playback.

Fast flicks use the release velocity when its magnitude is at least 0.5 logical pixels per millisecond. The release decision projects the current offset by 180 milliseconds of that velocity, then compares the result with the same measured-width threshold. A short fast gesture can therefore commit; a slow short gesture returns. Missing neighbors still block flick navigation.

Every release, responder cancellation and selection failure settles through a timed motion. The return path reads the stopped animated value, including a partially completed native animation, instead of assigning zero or assuming the animation reached its target. Completion animates the remaining distance with a bounded duration. Unacknowledged swipe selections return after the injected 2 second timeout. Duplicate release/button requests are blocked while settling; disposal cancels timers and fences late work.

### Feature-to-test mapping

| Behavior | Dedicated evidence |
| --- | --- |
| Next/Previous/Next outgoing and incoming positions | playing-cover-transition.test.tsx samples both layers halfway through each direction and verifies one final centered scene |
| Delayed native selection and same-song restart | cover-gesture-controller.test.ts covers delayed queue-wrap projection and Previous restart followed by automatic advance; player-progress.test.cjs covers reading selected native identity |
| Held, reversible horizontal drag | controller and component tests cover complete reveal, reversing the held offset and no selection before release |
| Strict width-relative threshold and resizing | controller tests cover 89/90/91 pixels at 300-pixel width, resizing to 500 pixels and selecting above its new threshold |
| Short fast flick versus short slow drag | controller/component tests cover both fling directions and a slow return |
| Missing first/last queue neighbor | controller tests clamp both boundaries at 30%, including fast flicks |
| Smooth return and interrupted motion | tests cover cancellation, disabled controls, removed neighbor, partial-animation selection failure and timeout |
| Ordering, stale callbacks and disposal | tests cover animation-first and observation-first completion, rapid duplicate buttons, stale completion, metadata refresh and late selection failure after disposal |
| Screen/remote wiring | Playing screen tests verify selection/native acknowledgement adapters and remote Jam navigation |

React Native's exact gesture field names dx/dy/vx, React ref/JSX attributes, style values, accessibility values and Jest APIs are framework-owned identifiers/strings. Authored behavioral values live in CoverGesturePolicy, CoverPresentationPolicy and CoverFixture. No authored explanatory code comments were added. The controller depends on injected animation offset access, commands and scheduling; the component composes React Native implementations.

### Validation and artifact

- `npx tsc --noEmit`: passed for the complete app.
- `npm run test:cover-gestures`: 6 native selection/progress tests and 34 controller/component/screen tests passed. This command was added for future changes.
- `npm run test:player-mobile`: all 397 tests passed. The existing progress sandbox now includes the already-required RecommendationPlaybackPlatform dependency; its prior three fixture failures are resolved.
- `npm run test:lyrics`: 53 tests passed in seven suites.
- `npm run test:recommendations`: 95 controller/player tests and 22 screen tests passed.
- ESLint on the new controller, component and dedicated tests: zero errors/warnings. Existing Playing screen warnings are unchanged. `git diff --check` passed.
- `./gradlew :app:assembleRelease -x :app:buildSpotifyLibrespot -PreactNativeArchitectures=arm64-v8a,x86_64 --offline --init-script /tmp/lyrics-cached-android-dependencies.gradle --no-daemon`: BUILD SUCCESSFUL in 30 seconds, with release lint enabled. Cached dependency selection and unchanged native Spotify libraries were reused as in the preceding build. Native unit tests were not rerun for this TypeScript-only chapter.
- Artifact: `build/playing/StreamingService-Cover-Gestures.apk`, 60,600,575 bytes, SHA256 `6e86e14164d1799f3297aa1023dbf88d088db5c1bc9a67ac94377960ca2574cc`. apksigner verifies its v2 signature; zipalign accepts 16 KB archive alignment. The 2,502,416-byte Hermes bundle contains the new gesture viewport/previous/current/next cover and native-selection markers, excludes the retired outgoing-cover implementation marker, and retains the newer Recommendations query. ARM64 and x86_64 Spotify libraries are present. Existing debug signing makes this a sideload candidate that runs without Metro.

`adb devices` lists no connected device, and the installed emulator tooling lists no configured AVD or system image. No physical/runtime gesture test, audible playback test or animation frame measurement was performed. These deterministic motion-position and ordering tests are not evidence of device smoothness. Check alternating buttons, full held drags/reversals, short fast flicks, both queue boundaries and cancellation on a phone/tablet before claiming that validation.

Created `fix/playing-cover-gestures` from freshly fetched origin/main, then fast-forwarded the existing unmerged #6 baseline to preserve the approved Recommendations and other app work. origin/master remains absent. The new PR targets main and includes that inherited baseline; this chapter's correction is a separate commit. No merge is authorized or performed.

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

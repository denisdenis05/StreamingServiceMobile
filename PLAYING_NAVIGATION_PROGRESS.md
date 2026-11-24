# Phone orientation and Playing navigation

Implemented on 2026-11-24 in StreamingServiceMobile. The player library and server are unchanged.

## Behavior

- Android phones request portrait through the activity manifest. The `sw600dp` resource removes the orientation restriction for tablets. The integer resources use Android's required `ActivityInfo.SCREEN_ORIENTATION_PORTRAIT` (1) and `SCREEN_ORIENTATION_UNSPECIFIED` (-1) values.
- iPhones support portrait. The separate iPad orientation array permits portrait, upside-down portrait and both landscape orientations.
- Playing keeps outgoing artwork mounted during a 280 millisecond native-driver animation. Next moves the old cover left and brings the new cover in from the right; Previous reverses that movement. Automatic advances move forward. Artwork sizing and the existing image cache remain in use.
- Rapid changes stop the previous animation. Retired completion callbacks cannot remove the latest outgoing artwork. Metadata refreshes for the same queue occurrence preserve the animation. Clearing the selection cancels it. Navigation direction is scoped to the originating occurrence and cleared after selection changes.
- Local Next/Previous resume a paused or stopped selected song. Navigation and the following Play share one dispatcher operation, so a later queued Pause remains later. The adapter checks for intervening native controls before Play. It avoids extra Play commands for an already-playing selection and leaves end-of-queue continuation to the existing append-and-play path.
- Next preflight checks whether a newer selection/control has superseded it before submitting navigation.
- Spotify Jam following requests Play after successful Next/Previous while the same action and session remain current. A retired action cannot send its extra Play into another Jam.

## Feature verification

- Phone/tablet configuration: Python XML/plist parsing verified manifest resource binding, portrait phone values, Android tablet override and all four iPad orientations. `/opt/android-sdk/build-tools/35.0.0/aapt2 compile android/app/src/main/res/values/orientation.xml android/app/src/main/res/values-sw600dp/orientation.xml -o /tmp/portrait-orientation-resources` passed from the mobile repository.
- `npx tsc --noEmit`: passed for the full app.
- `npx tsc --project tsconfig.audio-migration.json`: passed.
- `node --test tools/player-runtime.test.cjs tools/player-queue-rewrite.test.cjs`: 81 passed. Dedicated regressions cover Next and Previous from Pause and Stop, later JS/native Pause, paused final-song continuation, first-song Previous and paused repeat-one Next.
- `npx tsc --project tsconfig.spotify.json && node --test tools/spotify-player-jam.test.cjs`: 72 passed. Remote Next/Previous assert navigation then Play; the new session-change regression asserts no late Play.
- `npx jest --runInBand --watchman=false --runTestsByPath tools/playing-cover-transition.test.tsx tools/playing-lyrics-screen.test.tsx`: 12 passed. Dedicated cases cover initial presentation, both directions, rapid skips, stale completions, metadata refreshes, automatic advance, clearing, and Playing button wiring.
- ESLint on all changed implementation files and screen tests: zero errors, seven existing warnings. The new transition component and its tests pass without warnings. `git diff --check` passed.
- `npm run test:player-mobile`: 391 of 394 passed before the final two boundary tests were added. Three existing progress-hook tests fail because their AudioPlayerService sandbox omits `./RecommendationPlaybackPlatform`. Neither that service nor the failing test file was changed by this task. The final two added cases passed in the 81-test targeted run above.

## Build and device gaps

- `./gradlew :app:processDebugResources -PreactNativeArchitectures=arm64-v8a` failed during dependency resolution for existing `androidx.browser:browser:1.4.+`. Retrying with `--offline` failed because the dynamic version listing is not cached. The new XML resources compile independently with aapt2; full Android resource linking and APK packaging remain unverified.
- `adb devices` lists no connected device. Actual phone rotation, tablet rotation, animation frame timing and audible playback remain unverified. An iOS host/device build was not run in this Linux session.
- The mobile adapter cannot atomically combine Next/Previous and Play across a native-origin control arriving after its snapshot check. The native command API exposes them as separate operations. Session epochs still apply, and newer controls observed before Play suppress the resume. No player-library API was changed for this task.

## Branch and delivery

`origin/master` does not exist; the repository advertises `origin/main` as its default. Created `fix/portrait-playing-transitions` from fetched `origin/main`, then fast-forwarded the existing local `fix/compact-lyrics-phone-layout` baseline before implementation. That baseline contains 190 commits not on origin/main. Existing unrelated recommendation/UI working-tree edits were temporarily stashed, restored and excluded from this task's commit.

Committed the task as `Lock phone orientation and smooth Playing track navigation`. `GIT_TERMINAL_PROMPT=0 git push -u origin fix/portrait-playing-transitions` failed: `could not read Username for 'https://github.com': terminal prompts disabled`. No GitHub credential helper or GitHub API token is available in this session, and `gh` is not installed. The task branch remains local; no pull request was created. After authentication is restored, push this branch and open the PR against the existing `main` default branch. No merge or deployment was performed.

## Resume

Restore Android dependency resolution, package and test on a phone and tablet. Check the reverse artwork movement, rapid alternating skips, and paused/stopped skips with real audio. Verify iPhone/iPad rotation and transitions on an iOS host. Repair the existing progress-test dependency fixture independently. If submitting a PR against main, review its inherited unmerged baseline as well as this task's commit.

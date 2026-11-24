# Jam owner queue and native host repair

Updated 2026-11-01.

## Reproduced source blockers

An owner following Spotify could not choose a local replacement queue because
prepareQueueChange rejected every follower edit. Owned native Jams that had only
membership also played local replacements without starting hosting. The native
post-activation check then attempted forbidden observer registration, immediately
failing and withdrawing the device after successful activation.

The account-named Spotify device is not the configured StreamingService endpoint.
StreamingService is intentionally hidden while only observing. It becomes a
visible playback device only after successful local host activation; membership
alone does not prove that happened.

## Implemented chapters

- `ff776a9`: owned/native/ready Jam queue replacement shares the actual committed
  local queue. An owner following first releases external queue authority with
  account/engine/authentication and cleared-queue fences. Guests cannot take over.
- `216156b`: host preflight reads use actual successful activation/publication
  receipts with their original age, never observer registration after hosting.
  Expiry, Dealer authority changes and conflicting acknowledgements reject them.
- `1b8139b`: explicit hosting is unavailable while following because following
  owns the mirrored queue. Both Jam entry points use the guarded capability and
  owners are directed to choose local app music for the automatic handoff.

Player guidance now describes choosing an app song/playlist directly, and
separates local queue changes from actual Spotify host confirmation.

Owning feature maps: `PLAYER_JAM_PROGRESS.md` and
`JAM_NATIVE_HOST_DEVICE_PROGRESS.md`.

## Source checks

- `npm run test:player-mobile`: 382 passed.
- `npm run test:spotify`: 691 Node and 193 Jest cases passed after integrated native-device discovery.
- `npm run test:spotify-probes`: 36 passed.
- `npx tsc --noEmit`: passed.
- `:app:testDebugUnitTest -x :app:buildSpotifyLibrespot --no-daemon`: passed,
  456 tests across 33 suites, zero failures.
- Native agent full Rust suite: 257 passed; targeted JVM transport/projector/
  coordinator checks: 63 passed.

Source checks are separate from APK installation, actual host activation,
Spotify device visibility and synchronized playback.

## Initial emulator observations

ADB reconnected to the running Waydroid x86_64 emulator without restarting it.
The installed native library matches the intermediate paced x86_64 artifact.
The app opened successfully, restored its Spotify connection and displayed
No Jam loaded. No catalog search, new pairing, force-stop, Spotify process
termination or emulator restart was performed during this initial inspection.
UI/account/song text was filtered; no raw private values were recorded here.

## Real emulator checks after the initial inspection

Installed `61bbc09` once without clearing data. The saved Spotify connection
restored. One local search recording reached Android media state Playing, then
was paused for stable UI inspection. Start sharing created membership but the
first catalog request returned HTTP 429 with Retry-After 56 seconds. No activation
was reached. No immediate retry was made.

After source integration, installed `81d8ba5` once without clearing data. APK
signature and 16 KiB alignment checks passed. The app restored the saved native
connection and owned Jam. Selecting one local recording automatically attempted
sharing, proving that this UI path now reaches matching. Native device discovery
loaded the real remote device without the earlier public-device lookup failure.
StreamingService is not visible yet because activation has not succeeded.

The deliberate native-provider attempt returned HTTP 400 at the client-token
stage with catalog requestCount 0. No Partner search was sent. The request
currently omits actual Android platform fields; a corrective source chapter is
in progress. No Spotify process or emulator was restarted.

Candidate `build/spotify-jam/StreamingService-Jam-Repair-81d8ba5-x86_64.apk`:
37,252,365 bytes; SHA-256
`b72beda9812cd31ab107ff29cd2c6cdc14afa670922c31761134e76414676511`.
This is a diagnostic candidate, not verified hosting delivery.

## Live verification pending

Build the repaired x86_64 APK with the configured Rust/NDK script, install once
without clearing app data, confirm saved connection restoration and select one
local recording. Validate actual activation/publication and device visibility;
then test a second local selection and incoming Spotify controls if hosting works.
Read only safe catalog diagnostics and honor Retry-After if returned. Do not
repeat failed searches merely to test the limiter or manufacture live success.

## Live continuation — 2026-11-02

Integrated native platform/client-token correction and strict equivalent-recording
selection. The first corrected search reached HTTP200; safe evidence counts
exposed equivalent release ambiguity. SpotifyJam3c7a771 resolved the actual test
selection and reached native Hosting. The user independently saw the selected
recording on their phone for about seven seconds. Unconditional one-second host
publication then failed RateLimited; its exact header was not available yet.

Mobile55fa1b1 coalesces unchanged publication with ten-second heartbeats.
Mobilec5ff3d4 adds fixed-field Connect request receipts and a process-scoped full
Retry-After cooldown. SpotifyJam b95e151 and Mobilece8b689 preserve retained
observation receipt age and original HTTP bracket for queue reads. Root's
connect-store regression expectation was updated for original receipt age.

The combined x86_64 candidate installed without clearing app data or restarting
Waydroid. It restored native sign-in and hosted continuously for over eight
minutes with HTTP200 publication heartbeats approximately ten seconds apart.
Official desktop Spotify displayed StreamingService. Official MPRIS Play then
Pause changed Android media state from paused to3(Playing) and back to2(Paused).
This verifies single-account incoming transport controls, not second-account
admission or audible alignment.

One attempted second-selection check initially retained the prior search query;
it was a test-input error, not evidence of a source failure. After correction a
different local recording matched HTTP200 and changed the local player. Its
subsequent remote metadata propagation was not verified, and hosting stopped
after that transition. The user then restricted all playback tests to downloaded
Madvillainy and took control of choosing tracks; root must no longer select songs.

The user-selected downloaded Madvillainy track played locally (Android state3),
but did not appear in desktop Spotify. HostingStore matches the entire album queue
from its first entry before considering the actual current occurrence. An earlier
unmatched recording therefore prevents current-song activation. Current-first
hosting and independent future matching are now being implemented with dedicated
tests. Root paused local playback to prevent automatic advancement; leave the
user's chosen song selected and cue the user after the fix is installed.

Latest integrated checks before the current-first chapter: Spotify701 Node and
199 Jest passed; TypeScript passed; native Rust278 passed; Android JVM474/34 suites
passed. Source checks remain separate from the real observations above.

User authorized a graceful Linux Spotify restart for debugging. Spotify now runs
with its existing profile and CDP bound only to127.0.0.1:9222. The renderer-only
safe90-second trace contains two redacted events and does not expose native
Connect traffic. A native TLS diagnostic tool is under source verification; do
not claim a full native capture until root actually runs it. No raw packet,
header, body, credential, account or song dump was persisted.

## Current-first candidate installed — 2026-11-02

Mobile1031dad now starts native hosting from the actual selected occurrence,
keeps bounded future matching independent, and prepares only the selected active
replacement recording. Root integrated source checks: Spotify724 Node and201
Jest, player385, TypeScript passed. Complete Android JVM suite passed493 tests
across34 suites with zero failures/errors/skips. Combined JVM/release build
completed in39seconds.

Installed once without clearing data:
`build/spotify-jam/StreamingService-Jam-Current-First-1031dad-x86_64.apk`
(37,294,873bytes), SHA-256
`9d583b73a9f8f6d11159cc1a742ed1a98e59bea9e8538178b017613e0354a6cd`.
APK signature and16KiB alignment passed. The app reopened successfully.

The user was cued to select their same downloaded Madvillainy track again and
reply playing. Root must then start/check Jam sharing, verify actual Spotify
current metadata/device/queue and sustained publication, and only then cue a
second user-selected track from that album. This candidate's live current-first
acceptance is pending. No final phone/arm64 package is claimed for this chapter.

Native GDB trace actually failed after two safe HTTP1 events and closed desktop
Spotify. Root restored normal desktop Spotify with the original profile and
loopback debugging, cancelled the obsolete desktop-play prompt, and prohibited
another live native GDB attempt.67a515a records this limit;20 trace source tests
pass but do not establish a stable real debugger capture. The two partial safe
trace files are diagnostic artifacts, not evidence of official playback cadence.

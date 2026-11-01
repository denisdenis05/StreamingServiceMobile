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
- `npm run test:spotify`: 193 Jest passed; Node result recorded with final release.
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

## Live verification pending

Build the repaired x86_64 APK with the configured Rust/NDK script, install once
without clearing app data, confirm saved connection restoration and select one
local recording. Validate actual activation/publication and device visibility;
then test a second local selection and incoming Spotify controls if hosting works.
Read only safe catalog diagnostics and honor Retry-After if returned. Do not
repeat failed searches merely to test the limiter or manufacture live success.

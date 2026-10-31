# Jam playback repair — 2026-10-31

The user reported successful Jam creation/QR/second-account admission but no
shared playback. Host from player with RO returned Network. Membership and app
hosting were separate actions, country fields were empty, and following only
projected the current song. These are source defects/UX gaps; the earlier APK
was not proven to deliver complete shared playback.

## Patch queue

| Patch | State |
| --- | --- |
| Shared automatic/remembered country with optional override | Implemented; platform and scoped domain tests pass |
| Start sharing creates membership then confirms actual app hosting | Implemented; real composition and stale identity tests pass |
| Join and listen explicitly joins then starts verified following | Implemented; guest admission and failure tests pass |
| Preserve membership without claiming shared playback after startup failure | Implemented; UI regression covers retained membership |
| Actionable capture/catalog/auth/activation/publication failure stages | Implemented; wrapped native errors retain known codes |
| Prevent stale idle native polls from erasing hosting errors | Implemented; two dedicated regressions pass |
| Current-first upcoming queue matching and authoritative projection | Implemented; partial-queue diagnostics keep current playback active |
| Player bounded external queue and current playback preservation | Committed in Player 2a66a2a; 289 Android JVM and 19 focused Swift cases passed |
| True x86_64 native emulator build alongside ARM64 | Implemented; build and installation passed |
| Emulator registration, hosting activation and same-account control | Registration and membership creation observed; activation/audio remain unverified |
| Two-account remote playback and measured synchronization | No second account currently available |

## Emulator checkpoint

The connected device is WayDroid x86_64. Its previous installed debug app could
not load the Metro script. The previous base APK was retained in the ignored
artifact folder. A bundled preliminary release with actual x86_64 native Spotify
support installed using adb install -r; application data was retained. Home,
Profile, Settings and Spotify Jam actually rendered. No account/song text or
credentials were exported; temporary UI hierarchy files were removed.

The emulator generated a device-pairing request. The user approved it; actual
React UI reported this device connected to Spotify. One Start sharing action
created/loaded owned Jam membership; the user independently saw the Jam in their
Spotify application. This does not prove app host activation, audio, queue
publication or another device playing. The currently installed preliminary APK
predates final current-first queue/error-preservation fixes and will be replaced
only after those sources are integrated. The old desktop probe was cancelled by
the T3 restart; do not infer a live handle from its old socket.

## Source checks so far

- Mobile Spotify: 563 Node and 159 Jest, before the final partial-queue refinements.
- Mobile player: 341. Settings: 25 Node and 25 Jest. Full TypeScript passed.
- App Android JVM: 445; Player Android JVM: 289, zero failures, before the final
  partial-queue refinement. Host observation regression suite: 59 passed.
- Player npm test: 387 cases plus architecture and TypeScript passed.
- x86_64 Rust release native library build passed in 36 seconds.
- Preliminary x86 release/JVM assembly passed in 81 seconds. Installation and
  actual React rendering passed; startup timing is not audio evidence.

Feature maps: JAM_LISTENING_FLOW_PROGRESS.md, HOSTING_CONTINUATION_PROGRESS.md,
FOLLOWER_QUEUE_PROGRESS.md and Player PROGRESS.md. Final frozen-source tests,
chapter commits, artifact identity and real emulator scenarios follow below.

## Integrated source checkpoint

Spotify library chapter committed as 4582186; Player chapter is 2a66a2a. Final
source integration passed 569 Spotify Node/163 Jest cases before the final local
queue-issue UI addition; the refreshed integrated suite result is recorded in
build/spotify-jam/jam-repair-integrated-spotify.log. Full TypeScript passed.
Frozen native run passed 447 app JVM and 289 Player JVM cases and x86 release
assembly in 40 seconds. Three safe queue issue types now distinguish missing
current playback, the 80-entry hosting bound and existing follower ownership;
their copy is shown in all three sharing views. Domain queue/store/player
regression suite passed 112 cases; UI focused coverage passed 68 cases.

The final-source emulator APK installed with saved login retained. Actual native
connection restored. Host current app queue failed at QueueCapture/Unsupported,
before catalog matching/activation; no active playback device was established.
The user confirmed Spotify only showed Jam/participants. A local song was then
selected for the next check. Standard uiautomator cannot become idle during the
player progress animation; a temporary read-only UiAutomation helper exports
only allowlisted static UI labels/bounds, never titles, accounts or credentials.
The queue-issue copy addition is being rebuilt before repeating that explicit
check. No desktop probe was restarted.

## Live catalog prerequisite repair

After a single-song selection from Search, hosting passed QueueCapture and
failed CatalogMatching/Network on the installed 1843225 build. A read-only,
unauthenticated capability check against the configured live backend returned
404 for spotify/catalog/recordings/search and 401 for the existing protected
Recommendation/sections route. The local Server ad35b78 already contains the
new authorized controller. Missing deployment is the likely cause; no production
server was modified. The user has been asked for the deployment path.

The app now preserves known HTTP statuses instead of flattening all library
request failures into Network. A scoped compatibility query can use actual
selected recording metadata after primary lookup NotFound, and uses the existing
bounded Metadata/search/db route only after an actual primary-search NotFound.
It never downloads the full catalog or relaxes authorization failures. Foreground
and both headless paths use the same factory. An opaque account/server revision
fences logout/relogin work; raw pending queue metadata is remembered before
host preparation and never includes credentials or arbitrary response fields.

The existing match ranker still requires actual duration/recording-code evidence.
Two matching ready native snapshots can fill missing duration only for the actual
current known recording. Future tracks receive no borrowed/invented duration;
complete reliable matching still needs the deployed catalog endpoint (or actual
confirmed associations). Compatibility does not establish full future matching.

Saved Spotify login now restores once per app account at application startup,
without waiting for the Jam page. Restoration waits for OAuth initial-address/
pending-redirect readiness, never starts playback, and does not retry automatically
after a failure or explicit disconnect. The page's duplicate restore was removed.

Integrated verification passed 637 Spotify Node and 176 Jest cases, full app
TypeScript and 341 player/mobile cases. The new focused suites cover missing-route
compatibility, HTTP-category privacy, observed scope/ABA/capacity, actual duration,
and saved-login/redirect ordering. Packaging and the next explicit emulator
hosting check are still pending for this source checkpoint.

## Delivery and interrupted final emulator installation

The current phone/emulator APK identities and source results are recorded at
the top of SPOTIFY_JAM_APK.md and SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md. Source
commits are Mobile `1843225`/`d2f7c98`, SpotifyJam `4582186` and Player `2a66a2a`. Final
637 Spotify Node/176 Jest, full TypeScript and 341 mobile-player checks passed;
447 app JVM/289 Player JVM, 387 Player source and 19 focused Swift cases passed.
Both release ABIs passed signature, 16 KB ZIP/native alignment and bundle checks.
The phone artifact was replaced only after verification and its prior source
1fb232f copy was retained. Physical-phone execution was not attempted.

Final x86 installation stalled in committed session 821621242 during dex2oat32
with zero accumulated CPU time. Read-only inspection identified only the app
compiler/package state. An adb-root capability request returned not available
in Waydroid; the device then disconnected and Waydroid reported Session STOPPED.
The install command exited 1 and reconnect timed out. No successful root access,
explicit process kill, app-data deletion or production deployment occurred.
The exact session-stop cause is not established. The user has been asked to reopen
the emulator and to provide the server deployment path. Neither elapsed time nor
source tests count as those prerequisites becoming available.

Resume by inspecting the current package/installer state after adb reconnect.
Do not start duplicate installation while the prior session is pending. Then
verify app-owned saved Spotify restoration, select one actual local song and
make one explicit hosting attempt to test the new compatibility path. Record
its stage and actual active-device result without account/song data. Complete
server-catalog deployment is needed for full accurate future-track metadata;
compatibility intentionally leaves ambiguous missing-duration candidates unselected.
The cancelled desktop probe is not a live native session and no stale pairing
code should be reused. Second-account and audible/background scenarios remain
separate unverified acceptance gates.

## Latest user direction and final source checks

The user requested continuing without the emulator. Live emulator checks are
postponed; no reconnect, installation or playback attempt will be made in this
chapter. Final settings rerun passed 25 Node and 25 Jest cases; final full app
TypeScript completed successfully. The server deployment path remains unknown.
The source and APK checkpoint is ready; active Spotify device publication,
audible playback and cross-account/background acceptance remain unverified.

## Resumed implementation and live matching gate — 2026-11-01

The user updated the deployed server and reopened the emulator. Further audit
found and fixed real source defects; detailed chapter commits, tests and package
identities are in JAM_REPAIR_RELEASE.md. Two APK updates installed successfully.
Source 63751ed reached CatalogMatching/Backpressure. Source 2138cf7 distinguishes
HTTP429 and local capacity; one controlled check reached CatalogMatching/RateLimited.
No further searches were made. Active host publication and shared audio remain
unverified. Retain the actual native session; do not reuse old desktop codes.

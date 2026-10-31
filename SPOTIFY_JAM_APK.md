# Latest checkpoint — 2026-11-01

Read [JAM_REPAIR_RELEASE.md](JAM_REPAIR_RELEASE.md) first. It records the current
2138cf7 APKs, new source fixes, successful emulator installations and the actual
CatalogMatching/RateLimited result after the server update. Active hosting and
shared audio remain unverified; historical postponed-emulator/deployment notes
below are superseded by this checkpoint.

---

# Current Jam repair release — 2026-10-31

Sources: Mobile `d2f7c98` (plus chapter `1843225`), SpotifyJam `4582186`,
Player `2a66a2a`. Three GPT-6.1 Sol agents implemented the flow, native/build and
follower queue chapters; root integrated, tested and committed them in their
owning repositories. Server's pre-existing local configuration changes remain
untouched. Source and packaging are complete for this checkpoint; live playback
acceptance remains open.

## Included patches

Automatic per-account remembered country, explicit Start sharing / Join and
listen, membership versus active-playback copy, actionable safe failure stages
and queue corrections, and protection against late idle snapshots hiding errors.
Actual upcoming queue projections preserve repeated occurrences and current
playback. Current matching starts first; future matching runs separately and
partial failures do not stop current audio. Local automatic advancement stays
blocked while Spotify owns playback. Hosting remains bounded to 80 entries.

Saved native connection restoration now belongs to app startup, with OAuth
redirect readiness and no automatic retry after failure or explicit disconnect.
Foreground and headless matching share HTTP-category handling and a bounded
older-server catalog adapter. Actual raw selected metadata can be reused after
primary NotFound. Only actual current native duration may fill missing duration;
future songs do not receive invented duration and the matching ranker is unchanged.
Reliable complete metadata still needs the deployed recording-catalog endpoint.

## Source checks and APKs

637 Spotify Node and 176 Jest cases, full app TypeScript, 341 player/mobile,
25 settings Node and 25 settings Jest passed. Native source: 447 app JVM and
289 Player JVM; Player source: 387; focused Swift authority: 19; SpotifyJam: 652.
Architecture/build checks passed. These are host source results, not audio proof.

Phone APK: `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`.
36,059,888 bytes; SHA-256
`218744a15fd3269069e3cc8c22cf85b2899da4805f33c96dbbb7e751ef194d9b`.
Emulator APK: `build/spotify-jam/StreamingService-Jam-repair-x86_64.apk`.
37,128,609 bytes; SHA-256
`65c7c8b1d69f3aba39d8290cd79aabe75869f65f425632f4767563f1047080a8`.
Both have a fresh 2,356,632-byte Hermes bundle, correct sole ABI, verified v2
signature, 16 KB ZIP alignment and 0x4000 native ELF LOAD alignment. Both headless
registrations and new flow/error/upcoming queue markers are present. x86 release
assembly passed in 35 seconds; ARM64 in 22 seconds. Ignored metadata/logs are in
build/spotify-jam/jam-repair-d2f7c98-*; the prior 1fb232f phone APK is retained.

## Actual emulator result and next steps

WayDroid x86_64 was paired; registered connection, actual React pages and Jam
creation were observed on earlier repair builds. The user independently saw the
Jam in Spotify but confirmed StreamingService was not the active playback device.
An empty/current-queue precondition initially prevented hosting. A real single
local Search result then reached CatalogMatching and returned Network. The live
backend catalog search route returned unauthenticated 404, while an existing
protected route returned 401; missing server deployment is the likely cause.
The local Server `ad35b78` contains the required route. The user has been asked
for its deployment path; no production server was changed.

The final d2f7c98 emulator installation stalled at committed install-session
821621242 while dex2oat32 had no accumulated CPU time. `adb root` reported
"not available in Waydroid"; the target subsequently disconnected, installation
exited 1, and Waydroid reported Session STOPPED. No successful root access or
explicit process termination occurred. The user subsequently requested continuing
without the emulator; further live checks are postponed.
Do not claim this final build was launched or that the compatibility path worked
live. On reconnect check the pending package installation before starting another,
verify saved restoration, select a single actual local song, then make one
explicit host attempt and record its safe stage/result. Preserve Spotify processes.

The desktop probe was cancelled by the T3 restart; old sockets/codes are obsolete.
The earlier desktop HTTP 429 is historical evidence, not a result from this new
emulator build. No automatic catalog retry or uncertain mutation replay was added.
Two-account audio, active-device publication, full matching/queue propagation,
audible timing and background/reconnect acceptance remain unverified. Physical
phone verification is still separate from the authorized emulator checks.
Details and feature/test maps: JAM_REPAIR_PROGRESS.md, JAM_LISTENING_FLOW_PROGRESS.md,
FOLLOWER_QUEUE_PROGRESS.md, HOSTING_CONTINUATION_PROGRESS.md and
OBSERVED_RECORDINGS_PROGRESS.md.

---

# Integrated player Jam, shared controls and QR release — 2026-10-31

This checkpoint supersedes historical status below. Three GPT-6.1 Sol agents
implemented the native/catalog, guest-controls and QR chapters; the owning
session integrated the player lifecycle, reviewed source and ran source checks.
Mobile verification remains postponed. No phone installation or audio action
was performed for this release.

## Source chapters

- Mobile `87768b4`: bounded headless mapping preparation/cache, immediate host
  publication requests, safe native catalog diagnostics and Dealer-driven
  follower refresh with one coalesced read behind an in-flight operation.
- SpotifyJam `5890b80`: guarded native guest commands and reconciliation with
  fresh membership, actual native restrictions and Dealer acknowledgements.
  Browser/default owner guards remain. Admission does not grant every command.
- Mobile `26c5555`: locally generated invitation QR codes from the current real
  invitation, offline encoding, scoped clearing and accessible share/text paths.
- Mobile `1fb232f`: actual player Jam sheet, explicit host/follow/stop, preparation
  before hosted queue changes and publication after actual player receipts.
  Following forwards supported controls without duplicate local mutation;
  scoped cursor checks reject stale selection after another local/remote action.
  Player library remains `b28f393`; the app owns the Spotify integration.

Arbitrary remote song selection/reordering is unsupported by the current native
command contract. Owners can explicitly host from this player; guests can append
when permitted or stop following for local playback. Unknown outcomes are not
replayed. QR scanning opens the real Spotify invitation; in-app camera scanning
and a new StreamingService deep-link route were not introduced.

Feature/test mapping: PLAYER_JAM_PROGRESS.md, SHARED_CONTROL_PROGRESS.md,
CATALOG_HOSTING_PROGRESS.md and JAM_QR_PROGRESS.md.

## Host source verification

- `npm run test:spotify`: 538 Node and 148 Jest cases passed.
- `npm run test:player-mobile`: 341 passed.
- `npm run test:settings`: 25 Node and 25 Jest passed.
- `npx tsc --noEmit`: passed.
- Android `:app:testDebugUnitTest -x :app:buildSpotifyLibrespot --no-daemon`:
  433 JVM cases passed.
- `cargo test --manifest-path native/librespot-session/Cargo.toml --locked --quiet`:
  236 passed; `--example connect_probe` adds 8 passed.
- `npm run test:spotify-probes`: 32 passed. SpotifyJam `npm test`: 643 passed.
- Release `:app:assembleRelease --no-daemon --console=plain`: passed in 59 seconds.

## Packaged APK

`build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`: 36,027,172 bytes.
SHA-256: `a3819c8b174d2c019851e85fa416e9eb131f9eff1ab3058279c757b4ae6bb433`.
Packaged source is Mobile `1fb232f`, SpotifyJam `5890b80`, Player `b28f393`.
APK v2 signature and 16 KB ZIP alignment passed using build-tools 37.0.0.
All four Spotify ELF LOAD segments use 0x4000 alignment. Hermes bundle is
2,323,920 bytes; native Spotify library is 5,626,960 bytes. Player host/manage,
QR and both hosting-recording/authentication headless task markers are present.
The previous `8aac411` APK is preserved in the ignored artifact folder.
Verification logs and `player-jam-release-metadata.json` are in build/spotify-jam.
No installation or physical-device result is claimed.

## Live session and concrete next steps

After the previous probe exited, the user approved fresh read-only execution
12242. Native grant and actual generation-1 registration were observed. Preserve
this running probe and all existing Spotify processes; inspect current output
before future use rather than assuming the socket or saved session is live.

`node tools/validate-spotify-native-search.cjs` ran once against that session.
Current playback read and metadata decoding passed; catalog search failed with
Backpressure. Allowlisted native diagnostics confirmed an actual HTTP 429 from
https://api.spotify.com at phase httpResponse, followed by requestCompletion
Backpressure. This attempt reached the API and was rate-limited; it was not a
local dispatch-admission failure. The cause/scope/duration of the server limit
is unknown, and this observation does not prove the cause of earlier attempts.
No automatic retry, playback command or queue mutation was issued. A later
explicit check after the limit clears is needed to establish decoded candidates.

Catalog success remains unresolved. Cross-account admission/control permissions,
real queue propagation, audible synchronization/drift, QR scanning, reconnect,
screen lock, headless task execution and process/credential lifecycle remain
unverified. Use SPOTIFY_JAM_ACCEPTANCE.md when device checks resume. Source tests
and APK assembly do not prove these scenarios. Keep all account/song data,
credentials and invitation tokens out of exported evidence.

---

## Packaged artifact and remaining acceptance

APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk, 35,938,216 bytes.
SHA-256: 950dd8d5225fd94a4723d34da5c202373831f5189f05ca3c24cb8a0716eb9480.
Source: Mobile 8aac411, SpotifyJam 4220c2f, Player b28f393.
Release assembly passed in 38 seconds after source integration. APK v2 signature
and 16 KB ZIP alignment passed. All four Spotify ELF LOAD segments use 0x4000
alignment. Fresh Hermes bundle: 2,257,868 bytes; Profile/Settings, artwork clearing,
hosting and both background hosting-recording/authentication markers are present.
The previous 9cef510 artifact is retained separately in the ignored artifact
folder. This APK has not been installed or tested on a phone.

Do not claim every Spotify operation works end to end. Live catalog search most
recently returned Backpressure, with no proven HTTP cause. Guest writes still
require actual control-permission evidence; cross-account joining/role changes,
queue propagation, measured audible synchronization and screen-lock/network/
renewal behavior remain unverified. Mobile verification is postponed by the user.
Historical probe 52503 was approved, but its liveness must be checked before any
future use; never infer a live owner from its socket. Preserve existing sessions.


The in-app connection route is now Profile → Settings → Spotify & Jam.
Implementation details and source checks are in PROFILE_SETTINGS_PROGRESS.md
and the current SPOTIFY_INTEGRATION_PROGRESS.md checkpoint.

# Updated hosting-error APK — 2026-10-31

Mobile source `9cef510` preserves safe native hosting failure categories. The
updated APK is `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`:
35,886,944 bytes, SHA-256
`d3aae9cbb4cf6b9081c0e7ea8bb4d75facc6ea57973a44f4942b4551fff30b7d`.
`PATH=/home/denis/.cargo/bin:$PATH ./android/gradlew -p android
:app:assembleRelease --no-daemon --console=plain` passed in 23 seconds.
APK v2 signature verification and 16 KB ZIP alignment passed using build-tools
37.0.0. All four Spotify ELF LOAD segments use 0x4000 alignment. The fresh
2,206,596-byte Hermes bundle includes hosting UI and both background hosting-
recording/authentication task markers. Ignored verification logs are under
build/spotify-jam/hosting-failure-*.

Source checks passed: 487 Spotify Node, 105 Jest and full mobile TypeScript.
Only JavaScript failure reporting changed; native source/permissions did not.
This APK has not been installed or device-tested. The phone's earlier installation
and Jam-creation evidence belongs to source e82ea20, retained separately as
`build/spotify-jam/StreamingService-Spotify-Jam-e82ea20-arm64.apk`.
The populated-queue attempt on that older APK displayed Network; no root cause
or successful app-led playback was established. Continue without device access
as requested. Live catalog access, guest permission/shared audio and physical
background/reconnect/renewal acceptance remain pending. Do not restart or replace
live native sessions to install this artifact without a deliberate transition.

# Physical Android installation checkpoint — 2026-10-31

An authorized Pixel 10 Pro is now attached over USB: ARM64, Android API 37.
The existing APK checksum matched
`7bfcc1ea616f7c0275a811fd1204d30ee95e67501533c1583b6863057730afa0`.
`adb install -r build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`
succeeded without clearing app data. `adb shell am start -W -n
com.streamingservice/.MainActivity` reported a successful cold launch in 452 ms.
A later process/activity check confirmed the app running and resumed. This is
installation/startup evidence only, not proof of React UI or native playback.

After the user unlocked the phone, the actual React UI rendered Home, Profile
and Spotify Jam. The Jam screen reported this device connected to Spotify using
its restored app-side session; this does not prove audio or a specific native
generation. Refresh showed no loaded Jam. One explicit Create Jam action
succeeded and the screen reported ownership, with no active Spotify host device.
The created Jam remains active; it was not automatically ended.

Entered hosting market RO and invoked Host current app queue once. It returned
Unsupported, displayed as That operation is not available for this connection.
This category covers missing context and unsupported/empty local queue; the
precise precondition is not established by the UI evidence. App hosting and
playback did not pass. The user was asked to select an app-library song and return
to Spotify Jam before another check. No song/account value is required in chat.

Only fixed source UI labels and status/bounds were exported; temporary hierarchy
files were removed from the device. No broad logcat, raw account/song data or
credentials were captured. No Spotify process was stopped and no explicit audio
or queue mutation was sent. Cross-account guest/audio checks still need a second
account. Source tests and the packaged APK are unchanged.

# Integrated app hosting and background matching build — 2026-10-31

Current APK: `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`.
35,886,828 bytes; SHA-256
`7bfcc1ea616f7c0275a811fd1204d30ee95e67501533c1583b6863057730afa0`.
Source: Mobile `e82ea20`, SpotifyJam `d6eb464`, Player `b28f393`.

Includes retained native app hosting, explicit start/stop controls, real queue and
player-epoch capture, receipt-based incoming actions, native timed publication,
queue-independent withdrawal, follower reconnect, scoped authentication renewal
and headless recording matching in both directions. New local queue recordings
pause playback while matching; Play afterward remains explicit. Guest playback
permission guards remain unchanged pending actual second-account evidence.

Verification: release assembly passed with fresh Rust ARM64 and Hermes output;
APK v2 signature verification and 16 KB ZIP alignment passed. All Spotify native
ELF LOAD segments have 0x4000 alignment. The packaged Hermes bundle is
2,206,480 bytes and contains hosting UI, hosting-recording task
and authentication task markers. Commands: `PATH=/home/denis/.cargo/bin:$PATH
./android/gradlew -p android :app:assembleRelease --no-daemon --console=plain`;
Android build-tools 37.0.0 `apksigner verify --verbose` and
`zipalign -c -P 16 -v 4`; `readelf -lW` on the packaged Spotify library.
Ignored metadata and logs are under `build/spotify-jam/host-*`.

Source checks: 235 Rust, 409 Android JVM, 451 Spotify Node, 105 Jest,
329 player/mobile and 619 library tests; full app TypeScript passed. These do not
prove real Android execution, guest admission/permissions or audible timing.
No Android device is attached, so the APK has not been installed by the agent.
A fresh read-only probe is waiting for pairing; catalog success remains unresolved.
See SPOTIFY_JAM_ACCEPTANCE.md for the remaining device/session checks.

Earlier artifact notes follow and refer to their own source checkpoints.

# Native follower app handoff build — 2026-10-30

Current APK: `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`.
35,656,248 bytes; SHA-256
`04489bc0967939637c7107208ee91e161872bdb3ce7273d5e7a9d15213c8eb36`.
Source: Mobile `147eb76`, SpotifyJam `3bd1232`, Player `b28f393`.

The existing follow action now uses the application-owned native Android runtime
with device sign-in. Native player ownership and a verified account/server/player-
epoch receipt must be acknowledged before background continuation. Browser sign-in
keeps foreground following. Local pause remains authoritative; account, host,
generation and stale-response protections remain active. New dedicated source
tests cover the handoff, player receipt, credential updates, restoration and
cleanup. Full behavior and feature mapping are in `SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md`.

Source checks passed: 413 Spotify Node cases, 95 Jest cases, 329 player/mobile
cases, full TypeScript and focused Android compilation/22 JVM cases. Release
assembly passed, including fresh Hermes generation. APK v2 signature and 16 KB
ZIP alignment checks passed; the Spotify native library LOAD segments use 16 KB
alignment. The packaged Hermes bundle is 2,178,580 bytes and contains the native
ownership handoff and headless task registration. Packaged Spotify native library
is 5,516,064 bytes. Source identities, checksum and validation logs are retained
under the ignored `build/spotify-jam/` artifact directory.

No Android device was attached, and the APK has not been installed by the agent.
No new live Spotify request was made. Guest permission, audible synchronization,
measured timing, screen lock/network/renewal acceptance, automatic reconnect and
app-led hosting remain open. The source allows guarded native background following;
physical lifecycle behavior remains unverified.

# Application runtime and native integration checkpoint — 2026-10-27

# Native background resolver and search build — 2026-10-30

Current APK: `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`.
35,636,788 bytes; SHA-256
`9aabd47ba313b7fbc4d9f15b31d54fe3f5089fb5337236fe1d1ecfb23be4ce71`.
Source: Mobile `58e5aa4`; this commit includes the Android Jam follower runtime,
native app-player adapter, bounded background recording broker, React Native
headless registration, typed native catalog search and explicit host activation
gate.

`npm run test:spotify` passed 364 Node and 92 Jest cases. Focused Rust tests passed
67 cases; focused Android JVM coverage passed 108 cases. Strict TypeScript and
Android Metro bundle generation passed. Release APK assembly passed after
installing Rust 1.99.0 with the `aarch64-linux-android` target into the task
toolchain. APK v2 signature verification and 16 KB ZIP alignment passed. The
Spotify native library LOAD segments use 16 KB alignment. APK contains a
2,159,120-byte Hermes bundle and a 5,516,072-byte Spotify native library.

No Android device is attached and no live native probe remains registered, so
the current-session catalog-search request was not sent. This is packaged source,
not device verification. Guest membership/queue permission, synchronized audible
playback and measured timing, app-led host readiness/publication, reconnect after
generation replacement, and screen-lock/network/background lifecycle remain
unverified. The APK has not been installed by the agent.

Earlier build notes follow chronologically; their artifact/status statements
refer to those checkpoints, not this current APK.

Current APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk.
35,427,788 bytes; SHA-256
5756a4efcdca57b29165eb3422ae7e42dbdc7ad9578efaf60b5d11cbefd0b92b.
Source: Mobile 4231657, SpotifyJam 1e4f009, Player b28f393.

Includes application-owned Connect sessions with validated React reattachment,
explicit orphan logout and credential-erasure ordering, bounded rejected-token
read renewal, Dealer-confirmed outgoing commands and explicit shared-state
recovery. Native player service/lease and source-clock components are compiled;
they are awaiting the native follower/resolver integration. Native publication
code is tested source groundwork with no app entry point or initial activation.
App-led hosting and continuous background synchronization remain disabled.

Combined frozen checks passed: 345 Node,92 Jest,162 Rust plus JNI loading,
full mobile TypeScript and146 Android release JVM cases. Fresh Hermes generation,
release assembly, debug signing and16 KB ZIP/native ELF alignment passed.
Bundle2,149,032 bytes; native5,399,072 bytes. Exact source hashes, artifact checksum
and logs are in build/spotify-jam. Library612 tests remain from its last code
checkpoint; its later queue update changes documentation only.

Fresh live paired native read/metadata and acknowledged pause/resume succeeded
against the same-account desktop peer; read uncertainty109.274523 ms. This APK
has not been installed by the agent. Guest permission/admission, local audio
alignment, physical React/account lifecycle and background operation remain
unverified. Subsequent follower/dispatcher source work is outside this artifact.

# Dealer receipts and explicit recovery build — 2026-10-27

Current APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk.
35,353,872 bytes; SHA-256
cd02a2333b7f19737fd9d3fc493a0684cac4ea42d079526cb787e93555b1bb11.
Source: Mobile c756ea5, SpotifyJam cee7db9, Player ae4666d.

Includes private metadata/queue reads, structural queue markers, hidden observer
registration, server Dealer-confirmed outgoing commands and explicit owned-host
shared-state recovery after uncertain edits. Recovery verifies fresh membership
and native state without replaying the old request. Working paired Login5 is
preserved. The APK does not include subsequent application-runtime work.

Frozen checks passed: library 612; mobile 332 Node and 91 Jest; native 133 plus
JNI loading; diagnostic example seven; Android JVM 51; full mobile TypeScript.
Fresh Hermes generation and release assembly passed. Debug signing, 16 KB ZIP
and native ELF alignment passed. Native 5,360,176 bytes; bundle 2,146,780 bytes.
Artifact details and verification logs are in build/spotify-jam.

Same-account protocol controls, acknowledgements, metadata and library queue
reads have earlier live evidence. This APK has not been installed or exercised
by the agent. Guest admission/audio, measured alignment, app-led hosting and
continuous background synchronization remain unfinished. The local live probe
channel is unavailable now; earlier pair approval is not a current live handle.

Earlier build notes follow chronologically; their artifact/status statements
refer to those checkpoints, not this current APK.

# Native Connect ownership build — 2026-10-26

Current APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk.
35,138,748 bytes; SHA-256
6acc5fe437d7f41eb24a4e1cc94bd0ec488cb07b0c8e2d64ef121dd8867ee21f.

Adds account-bound persistent native connection ownership, cancellation/cleanup
on logout/replacement/reload, actual app device registration and a separate
connection status in the Jam screen. Native control-mode joining uses the
verified app device; remote listening remains disabled until playback is ready.
The working native paired login is preserved. Independent registration and fresh
Spotify pause/resume/queue events are live verified on the host diagnostic.

Signature, 16 KB ZIP/native alignment, forced Hermes generation, Android release
assembly and 39 JVM cases pass. The APK has not been installed by the agent;
no ADB device is available. Guest admission, shared queue mutation, synchronized
audio, app-led hosting and continuous background playback remain in development.
See SPOTIFY_INTEGRATION_PROGRESS.md for the active live process and exact tests.

# Spotify Jam personal-test app

Updated 2026-10-25. The source implements primary browser/device login, optional
Librespot password login and optional
Spotify browser login, secure saved-login
restoration, Jam creation/sharing, experimental joining, app-song matching, host
queue requests, host queue observation and foreground membership recovery.
Approximate foreground host following now plays matched local recordings alongside
Spotify. Private guest playback and measured audio alignment remain open.

## Owned-host playback controls build — 2026-10-25

The Jam screen now includes Play/Pause/Next/Previous and seconds-based Seek for
its owned active Spotify host. Commands check host/track state, share serialized
request handling and block replay after an unknown outcome. Guest controls remain
unavailable; background following and app-led hosting are not implemented.

Live independent-login create/share/passive-refresh and restore succeeded. The
test Jam has no active host, so command effects/audio remain unverified. An
invitation has been offered for the pending second-account membership check.

Current artifact: `34,236,080` bytes; SHA-256
`0593292022067d5f8cbdf9183e46b3ed0d04d1d96247d6cdfc55fc9733518739`.
Passed: library 556; mobile Node 273; UI/platform 84; diagnostic Node 16;
native probe three; Rust 39/JNI; Android JVM 23/release assembly. Signature and
16 KB archive alignment passed. Current probe/cleanup state is in
SPOTIFY_INTEGRATION_PROGRESS.md.

## Live-tested paired Login5 build — 2026-10-25

Current APK replaces the rejected Keymaster token exchange with stored-credential
Login5 without client-token. Browser pairing, an Android-user-agent request and
the production native bootstrap/restore functions succeeded against Spotify on
Linux. The user subsequently confirmed Android sign-in works. Saved-session
restoration, expiry renewal and private Jam access still need separate checks.

Install this APK, open Spotify Jam and start a fresh sign-in. Approve Spotify for
Desktop, return manually and test saved-login restoration after restarting.

Previous paired-Login5 artifact: `34,224,188` bytes; SHA-256
`e1b67f91a4a7bcd4c703f2a9130f5176a2e5cf016532577b83a2d68128ee752f`.
Native session library: `4,292,840` bytes. All 39 Rust, three native example,
nine diagnostic Node and 23 Android JVM cases passed, plus host JNI and release
assembly. Signature and 16 KB archive/ELF alignment passed. Full live evidence
and limits are in SPOTIFY_AUTH_LIVE_RESEARCH.md.

## Pairing native-session follow-up — 2026-10-25

The primary pairing request is named **Spotify for Desktop**. The installed
Spotify app may open it. Press Pair and return manually; there is no callback.
Install the rebuilt APK and start a fresh sign-in to approve its matching
account/playback permissions. Older pending tickets cannot be resumed.

Desktop-authorized native sessions now obtain their token through Keymaster;
password sessions retain Login5. Distinct `native-session` and `native-token`
rejection stages identify which native step Spotify refused. Unsupported
verification and transient failures preserve their recovery classifications.
This addresses a plausible failure path; the reporting phone must verify it.

Previous Keymaster artifact: `34,236,404` bytes; SHA-256
`b13249690aa2b9f946bfcc1ff712f8d3d919fa2b9e360850b076fab8ca80ecb5`.
Library 537, mobile service 261, UI/platform 76, Rust 26 and Android JVM 23
cases passed, plus host JNI and release assembly. Signature and 16 KB ZIP/ELF
alignment passed. Full account approval/native login and private Jam admission
remain unverified on a phone.

## Browser-assisted email-code build — 2026-10-25

1. Install this APK and open Profile → Spotify Jam.
2. Press the primary **Log in with Spotify** under Email code or browser login.
3. Complete Spotify's browser login using its email code or another available
   method, then approve pairing. The app's pairing code is a different code.
4. Return to the app. It establishes and securely saves the native session.
   After an app restart, open the Jam screen to resume pending approval.

Password login remains a separate optional form. No installed Spotify client or
developer client ID is needed for the primary flow. A native-session or Jam error
is shown separately from approval. A consumed/interrupted approval requires a
new sign-in; expired/denied transactions cannot be reused.

Previous browser/device artifact: `34,209,364` bytes (34.21 MB); SHA-256
`5f22d37bbd46d776e63454d3f0c06b6814c560ceb16f47744ed0545c3598ed90`. The Hermes bundle is `2,100,320` bytes;
packaged ARM64 native session is `4,278,512` bytes. Signature and
16 KB archive alignment passed. The browser/device and optional-password markers
are present in the embedded release bundle.

Passed: 531 library, 261 mobile service, 74 UI/platform, nineteen Rust and 23
Android JVM cases; full TypeScript, host JNI and release build checks. Live
pairing initialization succeeded through the actual broker. Complete account
approval/native bootstrap and private Jam access remain unverified on a phone.

## Librespot login build — 2026-10-25

Install the APK below and use the primary **Log in with librespot** button with
your Spotify email/username and password. This path requires no Spotify app or
developer client ID. The password is cleared after submission; a renewable
session is saved in the device credential store. Disconnect/Forget removes it.
The optional developer OAuth form remains below the primary form.

Authentication and Jam access are reported separately. Login success does not
establish that Spotify admitted this client to the private Jam service. Additional
verification challenges unsupported by upstream are shown explicitly. Live login
and Jam access on the reporting phone still need testing.

Previous password-login artifact: `34,187,748` bytes (34.19 MB); SHA-256
`906794a0e9229f2c463f100627ad758fa73be577b5ba4bb91654c7b43f69e3af`. It is 4.36 MB larger than the previous
APK. The included ARM64 native library is 4.28 MB; the Hermes bundle
is `2,080,904` bytes. Signature, 16 KB zip/ELF alignment and native/library
markers were verified. There is no separate native-library installation step.

Passed: 496 library, 249 mobile service, 66 UI/platform, thirteen Rust and
23 Android JVM cases, plus host JNI execution, full TypeScript checks and release
assembly. No physical Android execution was available. Full evidence and scope
are in SPOTIFY_INTEGRATION_PROGRESS.md.

## Callback base comparison build — 2026-10-24

The latest build handles an empty/root slash difference in custom-scheme return
paths consistently across browser capture, startup recovery and library exchange.
The configured redirect sent to Spotify stays unchanged. Other paths, authorities,
schemes, states and unsafe components remain checked. A slash difference is a
candidate for the reported redirect-mismatch, not a measured phone result.
If another mismatch remains, its safe status now identifies scheme, host or path.

Previous callback-base artifact: `29,828,992` bytes; SHA-256
`85a128748e4a6d94b64de8679199f55192ddfe5f95b2b9ffc71fe4092e0831c5`. It contains an ARM64-only archive and
`2,062,160`-byte Hermes bundle with shared redirect comparison
and all three component diagnostic markers. Forced release bundling, assembly,
native unit-test task and signature verification passed. The unchanged native
suites retain all fifteen passing cases. No ADB device is connected.

## Automatic return follow-up — 2026-10-24

The latest build adds an Android in-memory callback buffer captured before React
Native forwarding and fixes cancellation racing a pending native callback read.
It preserves exact redirect/state validation. Return failures now show a safe
`Return status:` category beside login, without displaying callback values.
Retry with the same client ID. If it still fails, report that category.
Actual live login on the reporting phone remains unverified.

Previous callback-buffer artifact: `29,827,572` bytes; SHA-256
`da1706c625baa2e6b818fd348aa6ac2a5247fc801b35a2491fc734e85b0be6c9`. The embedded Hermes bundle is
`2,060,740` bytes. Android assembly, all fifteen native
unit tests and signature verification passed. Source checks, 214 service tests,
54 UI/platform tests and full TypeScript checks passed. No device is connected.

## Login return recovery build — 2026-10-24

Rebuilt for the reported silent return from Spotify. Android captures the callback
before opening the browser, retains the current Activity intent, and can resume a
secure pending sign-in after app recreation. The screen preserves errors beside
the login button and shows the last step. Public profile login is independent of
private Jam service discovery. Retry with the same public client ID and registered
callback below; no pasted access token is required.

Previous recovery artifact: `29,824,612` bytes; SHA-256
`aec40fd47f2a32274071606528a5bf216121f96400b07d29e8f9e4bb13fe443d`. Its ARM64-only archive contains a
`2,057,780`-byte Hermes bundle with recovery/progress markers.
Signature verification, release assembly and three native proof tests passed.
Mobile tests passed 208 service and 50 UI/platform cases; full TypeScript checks
passed. Physical installation, actual browser return and live OAuth/private Jam
admission remain unverified. A failure should now retain its step and message;
report that text without codes, callback URLs or tokens.

## Install and setup

The ARM64 APK is `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk` with
its checksum, signing report and archive summary beside it. Android 7.0/API 24
or newer is required. It contains the release Hermes bundle and runs without
Metro, using the project's existing debug signing configuration for testing.

1. Install the APK, sign into StreamingService and open Profile → Spotify Jam.
2. Use the primary browser/device action and approve on Spotify, where email-code
   login is available for eligible accounts. Return to the app to finish. The
   optional password form remains available. No developer setup is required.
3. For the optional developer OAuth alternative, register your application with
   `streamingservicespotify://callback`, enter its client ID in the secondary form
   and press Log in with Spotify. No client secret or pasted token is used.
4. Later visits attempt secure saved-login restoration for the current app account.
   Restore saved Spotify login retries it explicitly. No saved record leaves the
   normal login form available.
5. Create a Jam and share its invitation. A guest must leave before hosting another
   Jam. The app never creates or joins a Jam automatically during restoration.
6. Start Spotify playback on the intended host device and refresh. A created Jam
   may have no host device; queue operations require its actual active Spotify host.
7. Paste a Spotify song link/URI/ID, or choose Add to Spotify Jam from a song's
   context menu. For an app song, select a country, find Spotify candidates and
   explicitly choose the matching recording. Matching alone queues nothing and
   starts no audio. Conflicting versions/codes and unavailable candidates are blocked.
8. The host queue view preserves repeated tracks and episodes. It updates while
   focused/foreground and labels stale results. Guest queue observation is absent.
9. Hosts can end after confirmation; guests can leave. Disconnect or Forget removes
   saved login, without ending or leaving the remote Jam. Removal remains pending
   until storage responds, and failures are displayed.

No registered client ID was supplied during development. Real browser admission
and private Jam access with those OAuth credentials remain unverified. Spotify
must accept the registered callback. Joining/leave requests remain experimental
until a second controlled account validates admission and permissions.

## Follow the Spotify host

After creating a Jam, start Spotify on its actual host device. Enter the two-letter
country code in Listen alongside Spotify and press Replace queue and follow
Spotify. This replaces your local queue and uses your own catalog audio. Ambiguous
or missing matches hold local audio while waiting for another song. Use Spotify
for remote play/pause/seek/skip; local pause ends following. Stop remains pending
until native cleanup acknowledges it. Backgrounding ends following; returning
foreground does not automatically restart audio.

The source polls every two seconds. Transport, remote buffering, local preparation
and audio-output latency limit alignment. This is an experimental host-only path;
no physical-device alignment was measured. Native leases hold one item, block
independent advance and pause after five seconds without renewal. The source is
the documented account playback endpoint, rather than a verified private guest
feed. Newer native binaries must advertise supportsExternalAuthority; older ones
are rejected. Full contracts and feature tests are in the library's
HOSTED_PLAYBACK.md and SHARED_PLAYBACK.md.

## Credentials and lifecycle

The library owns PKCE, account verification, refresh rotation and durable restore.
The OS credential store holds the refresh grant/configuration/account, not access
tokens, codes or proof verifiers. The app pins react-native-keychain 10.0.0 with
Android AES-GCM Keystore and iOS device-only, noncloud Keychain options.

Only a nonsecret revocation marker uses AsyncStorage; it prevents restoring a
logically forgotten login if physical credential removal fails. A successful new
login clears that marker after secure persistence. App-account logout/replacement
forgets the former account even if the Spotify screen was never opened. Cold
restoration of the app account preserves its saved login. Hot reload/disposal
retires memory work while retaining the saved refresh grant.

Membership and queue view subscriptions are shared by focused consumers.
Backgrounding cancels reads/timers. Foreground recovery coalesces a fresh passive
membership read before resuming host queue observation. Account-current reads
avoid incorrectly clearing membership because a selected device became stale.
Failures pause polling and preserve rate-limit guidance. No native background
shared-playback transport is implemented.

The iOS proof-key module, callback registration, host tests and Apple SDK/Objective-C
checks are described in SPOTIFY_IOS_LOGIN.md. Full iOS app linking/device behavior
remains unverified.

## Queue and protocol limits

Queue writes use the documented Web API, require Premium/approved permissions and
target the current Jam's actual host. No unrelated selected device is substituted.
HTTP acceptance means Spotify received the request, not that a guest observed it.

The account queue response has no stable Jam occurrence IDs or revision. Duplicate
entries retain array order; no IDs are invented from positions. Before/after
host checks are not an atomic queue snapshot and cannot clear an unknown write
outcome. Queue writes are never automatically retried. Inspect Spotify's queue
before reconnecting and issuing a new intent after an uncertain submission.

Private guest command routing, a fresh cross-account playback stream, remote
shared controls and continuous background transport remain unimplemented. The
foreground host follower now uses the guarded native external-authority boundary.
No guessed private endpoint or stale Connect snapshot is presented as working
synchronization. The installed desktop client's debugging endpoint is unavailable;
no process was killed or playback/queue changed to restore it in this chapter.

Short-invitation handling fetches public pages without bearer headers/cookies,
validates initial/final hosts and extracts one unique token without executing HTML.
Intermediate redirects are not independently constrained. Size checks occur after
reading rather than imposing a streaming allocation bound.

## Validation

The current deterministic checks are recorded in SPOTIFY_INTEGRATION_PROGRESS.md
and the library PROGRESS.md. Dedicated suites cover recording selection, queue
observation, membership recovery, secure storage, saved login, screen actions and
native proof generation. Passing them does not establish live OAuth/guest/audio
behavior. No controlled second account or physical Android/iOS execution was used.

Build the Android test APK with:

```bash
npm run prepare:player
npm run prepare:spotify
cd android
./gradlew :app:testReleaseUnitTest :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon -Pkotlin.compiler.execution.strategy=in-process
```

Run `npm run test:spotify` for mobile behavior/type checks,
`npm run test:spotify-ios` for the iOS boundary checks, and `npm test` in the
Spotify library for its dedicated suites. The source feature-to-test map is in
the library FEATURES.md and the mobile chapter progress notes.

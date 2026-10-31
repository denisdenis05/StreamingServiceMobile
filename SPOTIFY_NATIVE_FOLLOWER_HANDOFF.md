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

# Profile, Settings and verified Spotify integration — 2026-10-31

User approved the self-contained Profile/Settings mockup and requested three
GPT-6.1 Sol Codex agents, continued implementation and postponed device checks.
The three agents covered Profile/Settings, hosting/background lifecycle and guest
observation. The owning session integrated and reviewed their source and tests.
No device, pairing, Spotify process, audio or queue action ran in this chapter.

## Source chapters

- Mobile aab9714: host startup failure categories, serialized/idempotent native
  binding retirement, actual queue/authority/current-occurrence recapture and
  exact Hosting/player-epoch acknowledgement.
- Library 4220c2f: optional guest membership verification before/after queue and
  playback reads, participant/account/Jam/host fences and prompt cancellation.
- Mobile 2801fb1: actual Android Connect membership bridge, native-only verifier
  binding, admitted-guest follower context and explicit shared-listening UI.
  Guest mutation guards remain closed; admission is not control permission.
- Mobile 8aac411: approved visual style and Profile → Settings navigation;
  account/server-scoped local display name editor, real Last.fm lifecycle,
  Spotify connection destination/status, actual shuffle/repeat, storage metrics,
  explicit artwork-only cache clearing and About. Unsupported liked/history
  destinations use existing library/playlist creation routes, without fake data.

Feature/test details: PROFILE_SETTINGS_PROGRESS.md, HOSTING_CONTINUATION_PROGRESS.md
and GUEST_IMPLEMENTATION_PROGRESS.md. No backend profile/photo editor exists;
profile-name changes are explicitly local to this device. Audio caches are not
removed while live playback may reference them. Last.fm status copies validated
fields only; cancellation and account replacement retire delayed responses.

## Integrated source checks

- npm run test:settings: 25 deterministic domain and 25 Jest cases passed.
- npm run test:spotify: 503 Node and 106 Jest cases passed.
- npx tsc --noEmit: passed.
- Android :app:testDebugUnitTest -x :app:buildSpotifyLibrespot with --no-daemon:
  415 JVM cases across 32 suites passed.
- cargo test --manifest-path native/librespot-session/Cargo.toml --locked --quiet:
  235 cases passed.
- npm run test:player-mobile: 329 passed; npm run test:asset-cache: 73 passed.
- Library npm test: 626 passed, including strict build/architecture checking.
- git diff --check: passed. Host logs are ignored under build/spotify-jam/profile-*
  and settings-integrated-tests.log.

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

# Hosting failure categories and device-free continuation — 2026-10-31

The user selected a library song and returned to Spotify Jam. A single new
Host current app queue action with market RO displayed the generic Network
message. The actual native/catalog cause is not established by that message.
No successful app-led audio or background result is claimed. The user then
requested continuation without the device; further device actions are deferred.

Source review found that SpotifyHostingStore discarded React Native rejection
codes unless the error was a library IntegrationFailure instance. It also replaced
every non-null native snapshot failure with Network. The store now retains only
known IntegrationFailureCode values from both paths, including start preparation,
explicit stop and scoped observations. Unknown values and throwing code getters
still become Network, without copying raw errors, messages or private fields.
No playback/permission guard or retry behavior changed.

Dedicated feature mapping: tools/spotify-hosting.test.cjs covers every known
native rejection and snapshot code, cleanup/catalog failure preservation, explicit
stop rejection, unknown/throwing error privacy and unknown snapshot privacy.
Before the fix, 32 of 44 cases failed; after it, all 44 passed.
`npm run test:spotify` passed 487 Node cases and 105 Jest cases across 14 suites.
`npx tsc --noEmit` passed. Source tests do not establish the phone failure's cause
or fix live catalog access. Host logs are ignored under build/spotify-jam/hosting-
failure-*.log. Repackage after this source commit; do not install or disturb live
native sessions while continuing without the device.

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

# Approved live probe checkpoint — 2026-10-31

The user approved a fresh read-only probe in execution session 52503. It reached
nativeGrant and registered generation 1. The current native reading and decoded
track metadata passed during `node tools/validate-spotify-native-search.cjs`.
Catalog search returned `backpressure` and the validator exited 1. No playback or
queue mutation was sent. The probe binary includes the bounded HTTP deferral
source change; this live result does not establish its cause or HTTP status.
Do not classify it as successful catalog validation or automatically retry search.

Preserve execution 52503 and its in-memory native session while it remains alive.
Check actual registration/process ownership before using the socket; never infer
liveness from the socket file. Pairing is complete for this process, so no new code
is needed while it remains registered. The APK is unchanged. `adb devices -l`
currently reports no attached device. The user has a device but no second account;
installation, Android lifecycle, guest joining and audible synchronization remain
unverified. Continue device checks when USB debugging is connected and authorized.

# Probe failure correction — 2026-10-31

Fresh probe execution 31908 has ended with exit 1 before registration. The generic
network summary did not preserve the failure phase or original safe category;
no pairing/native-grant/search result may be inferred from it. The probe now
reports only fixed lifecycle phases and known safe error codes, with 29 probe
tests passing. There is currently no approved registered probe from this attempt.
Do not reuse its stale pairing link or mistake a socket file for a live owner.
The APK and integrated source described below remain valid; diagnostics-only
changes do not require APK regeneration. Live catalog and device/guest acceptance
remain pending fresh authorization and actual device/account availability.

# Integrated source and packaged APK checkpoint — 2026-10-31

Mobile source `e82ea20` integrates retained app hosting, explicit UI start/stop,
real queue/epoch capture, host/follower cleanup exclusivity, native module/task
routing and background reverse matching. Native HTTP deferral is in `ce558bd`;
retained runtime composition is in `dfe384f`. Packaging notes are committed in
`840f8a3`. Library documentation is now `ce2cb0a`; Player remains `b28f393`.

APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk, 35,886,828 bytes;
SHA-256 7bfcc1ea616f7c0275a811fd1204d30ee95e67501533c1583b6863057730afa0.
Release assembly, v2 signature, 16 KB ZIP alignment and Spotify ELF LOAD alignment
passed. Fresh Hermes bundle contains the host UI and headless hosting/auth tasks.
Source results: 235 Rust, 409 JVM, 451 Spotify Node, 105 Jest, 329 player/mobile,
619 library cases; full mobile TypeScript passed. Exact commands and feature/test
mapping are in SPOTIFY_INTEGRATION_PROGRESS.md and SPOTIFY_APP_HOSTING.md.

The old native probe ended across an interrupted turn. A newly built read-only
probe is running in execution session 31908 and currently waits for fresh user
pairing approval. Preserve it. Do not interpret the stale socket as registration;
wait for actual registered output before running the safe native search validator.
No new live result exists yet. Earlier approved state/metadata reads passed and
two search attempts returned backpressure; cause/HTTP status remain unproven.
No Spotify process was stopped. Only an obsolete-expectation Cargo test and its
own worker were stopped during the bounded HTTP deferral test update.

No Android device is attached. The user has been asked to connect a device and
confirm availability of a second Spotify account, and separately to approve the
fresh probe. These answers are pending, not assumed. Continue read-only current-
session catalog validation after actual registration. Then install the APK and
run SPOTIFY_JAM_ACCEPTANCE.md when the device/account are available. Do not claim
guest permission, installation, audible timing or background lifecycle from these
source and packaging results. Guest permission guards remain intact pending
cross-account evidence. New local queue matching pauses playback and never
resumes it implicitly; the later Play action remains explicit.

# Current session checkpoint — 2026-10-31

Read this checkpoint before the historical follower notes below. Mobile source
HEAD is `d25864d`; library documentation HEAD is `d6eb464`. The native host source
chapters are committed separately in the mobile repository: `5fc44f2` readiness
and deadlines, `928360d` actual command receipts, `1a537e6` coordination,
`dc13688` native session/configuration and `d25864d` queue-independent withdrawal.

Latest source verification: full native Cargo suite 230 tests; all Android app JVM
suites 385 tests across 28 files; mobile Spotify suites 433 Node and 99 Jest tests;
full `npx tsc --noEmit` passed. Exact commands and feature-to-test mapping are in
SPOTIFY_INTEGRATION_PROGRESS.md and SPOTIFY_APP_HOSTING.md. Native packaging,
actual React integration, phone lifecycle and audible timing are separate gates.
No fresh APK was built during these unfinished integration chapters.

The user approved the last pairing. State and metadata reads passed; two native
catalog searches returned backpressure. No HTTP status or root cause was proven.
The probe process is now absent, with a stale socket left on disk. Preserve all
running Spotify/native processes, and never print raw account/song data or tokens.
Do not mistake the socket for a live registration or repeat a stale pairing code.

Continue implementation with application-owned host runtime and module/task
routing, then explicit JS hosting controls and background reverse matching for
new local queue additions. The actual host dispatcher/coordinator/session are
source tested but are not yet composed into a working app hosting action. Keep
activation gated on an attached command handler. Retained runtime design must
preserve failed cleanup barriers across replacement and keep old scope ownership
only for cleanup; avoid holding owner locks while invoking coordinator/session
callbacks. Hosting must retire on connection/generation loss and cannot reactivate
implicitly. Native following already has verified same-Jam reconnect source logic.

Queue-independent withdrawal now hides the actual native device without a mapped
queue or current Jam membership. It still requires the actual owned native
connection/generation; unknown outcomes remain failed and never replay. Application
composition must handle actual connection retirement before releasing a binding
whose cleanup failed. Background auth renewal already exists for following;
hosting must route its scoped auth/recording jobs through the same real headless
entry points. Guest admission and permission guards must remain honest until
second-account evidence exists. Build/package the APK after source integration,
then report source checks separately from real device verification.

# App controls for the native follower

The existing Listen alongside Spotify action now chooses one playback owner.
Device sign-in uses `SpotifyNativeFollowerStore` and the application-owned Android
runtime. Spotify browser sign-in retains the existing foreground follower.
`SpotifyPlaybackController` waits for both previous owners to finish cleanup
before starting the selected route. A failed native start remains a failure;
it cannot start the foreground follower automatically.

The native configuration captures both accounts, server address, Jam, actual host,
native handle/generation and selected market. `SpotifyConnectStore` exposes a
read-only handle/generation descriptor only for its ready bound account. Missing
membership or another host/account prevents or retires following. Acknowledged
following can recover across verified reconnect generations as described below. Guest following remains disabled.

## Acknowledgement and player ownership

`startFollowing` already waits for verified membership/playback and a real native
player lease. The snapshot now also carries the actual player engine and
authentication epochs. JavaScript verifies those epochs against the live player
and an active, unsuspended external authority, persists the existing app ownership
receipt, and verifies the player again. The receipt contains account/server/epochs
and no token. Native handoff is accepted by the app only after this operation.

This step matters because native startup clears the old player authentication
epoch. Without updating the app's binding and receipt, a later app command or
React recreation could clear an otherwise valid native session. The adoption
operation shares the app authentication ordering: logout waits for an earlier
write and then clears the receipt; same-account token refresh preserves the
verified native epoch. Account, player or scoped-session replacement prevents
late adoption.

Backgrounding before acknowledgement stops the pending start. After successful
native ownership and receipt acknowledgement, the native route remains active
without JavaScript playback polling. The browser route still stops in the
background. Local suspension requires another explicit start; foregrounding or
restoring a view cannot resume it. Delayed snapshots and startup completions
cannot replace terminal failure, suspension or a newer request.

The native view can adopt a retained matching account/Jam/host/handle/generation.
Disposing that view removes its subscriptions. The existing development hot
module disposal explicitly closes Connect and therefore also retires following;
this is separate from Android native-module invalidation and retained-runtime
view adoption. Android process death/restart recovery is not implemented here.

## Feature-specific tests

| Behavior | Dedicated tests |
| --- | --- |
| Exact configuration, real acknowledgement, native ownership persistence, background transitions, local suspension, account/token changes, replacement, late completion, cleanup failure, snapshot validation and reentrant stop | `tools/spotify-native-follower-store.test.cjs` |
| Exclusive route selection, both cleanup barriers, no automatic fallback, foreground/background behavior and restored views | `tools/spotify-playback-controller.test.cjs` |
| Actual native-module selection and event subscription cleanup | `tools/spotify-jam-playback-platform.test.ts` |
| Live player epoch/authority verification, storage failure, logout/write ordering, token renewal and fresh coordinator reattachment | `tools/player-native-ownership.test.cjs` |
| Ready account-bound native descriptor and retirement on reconnect/detach | `tools/spotify-connect-store.test.cjs` |
| Login-provider selection and disconnect reset | `tools/spotify-integration.test.cjs` |
| API paths and rejection of insecure/credential/query/fragment addresses | `tools/spotify-background-recording.test.cjs` |
| Exact native player epochs and credential exclusion in snapshots | `SpotifyJamPlaybackRuntimeTest.kt` |

React Native's ambient URL declaration lacks the properties supplied by the URL
polyfill installed by `index.js`. The pure task/protocol modules use a type-only
`ParsedAddress` alias for those properties, retaining the global constructor so
Node tests need no React Native runtime. Runtime validation still checks the
actual parsed URL. The global polyfill import remains before app startup.

## Verification and next work

The progress file records the final source commands and results. These tests use
injected native and player collaborators; they do not prove Android screen-lock
behavior, audible synchronization, process survival, network recovery or app
credential renewal during background streaming.

Next: verified same-Jam reconnect recovery after a native generation changes;
then app-led host activation, accepted incoming player actions and real state
publication. A new approved probe is still needed for live catalog search, and a
second Spotify account/device is needed for guest and measured audio acceptance.

## Verified reconnect recovery

The application observes native connection lifecycle events while React is detached.
A connection gap immediately fences new source/audio intent, cancels old source and
recording work, pauses owned playback and stops polling. Registration may advance
only the same native handle/account to a strictly newer actual generation. Fresh
membership and playback reads must verify the same Jam and host before renewal
or playback. Player epochs and an unexpired lease are retained; expired leases
still use the existing fresh-read recovery barrier. Commands are never replayed.
Local safety pause, failed membership and terminal sessions require explicit restart.
A gap during unacknowledged startup retires that startup.

The JavaScript view retains only an acknowledged same-scope native owner while
Connect reconnects. Once the actual descriptor is ready it reads the retained
native snapshot. Old observations and late inspections cannot replace a newer
request. No new native start or ownership receipt is needed for the same epochs.

Dedicated tests: `SpotifyNativeFollowerCoordinatorTest` (six reconnect cases),
`SpotifyJamPlaybackNativeSessionTest` (two lifecycle cases),
`SpotifyJamPlaybackRuntimeTest` (three scope/acknowledgement cases),
`SpotifyJamConnectionRecoveryTest` (three native-event cases), and the reconnect
cases in `tools/spotify-native-follower-store.test.cjs` and
`tools/spotify-connect-store.test.cjs`. These are source tests; physical network
loss, screen lock and audible recovery still need a device.

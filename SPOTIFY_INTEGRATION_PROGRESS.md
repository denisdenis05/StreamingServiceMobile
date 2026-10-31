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

# Fresh probe ended before registration — 2026-10-31

Execution 31908 exited with status 1 after waiting for pairing. Its sole terminal
summary was a generic network failure. That old top-level catch erased safe
failure categories and had no phase field, so this evidence cannot distinguish
pairing, token/bootstrap or transport failure. No registration or live search
succeeded in this attempt. Do not treat the prior pairing link as a live session.

The probe now preserves only known library failure codes and fixed authorization,
nativeGrant or observation phases. Raw errors, account/song data and credentials
stay excluded. The nativeGrant phase is emitted only when the authorization
broker actually invokes bootstrap. `npm run test:spotify-probes` passed 29 cases,
including known-code/phase preservation and raw/unknown/throwing-property privacy
regressions. `git diff --check` passed. Only host diagnostics and notes changed;
the packaged Android artifact is unchanged. A fresh authorized session and an
attached Android device/second account are still required for live acceptance.

# Integrated ARM64 release artifact — 2026-10-31

Source Mobile `e82ea20` has been packaged after source integration. Current artifact
`build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk` is 35,886,828
bytes, SHA-256 `7bfcc1ea616f7c0275a811fd1204d30ee95e67501533c1583b6863057730afa0`. Release assembly,
APK v2 signature, 16 KB ZIP alignment and 0x4000 Spotify ELF LOAD alignment passed.
The fresh 2,206,480-byte Hermes bundle contains hosting UI and both
background hosting-recording/authentication task markers. No phone is attached;
installation and Android behavior are unverified. A newly built read-only probe
is waiting for user pairing in execution session 31908; preserve it. Earlier
current-session search backpressure is still unresolved, not reclassified as a
successful live search by the actor waiting-queue source fix.

Final source checks: 235 Rust, 409 JVM, 451 Spotify Node, 105 Jest,
329 player/mobile, 619 library cases, and full app TypeScript passed. Commands,
artifact checks and remaining live/device scenarios are in SPOTIFY_JAM_APK.md and
SPOTIFY_JAM_ACCEPTANCE.md. No guest permission or synchronized audio claim is made.

# Explicit app hosting and reverse background matching — 2026-10-31

Added Host current app queue / Stop app hosting controls. Preparation retires both
following routes, waits for actual player readiness, captures bounded native queue
pages and epochs, matches real app recordings, then rechecks the entire cursor and
queue before native activation. Matching preserves repeated actual occurrences.
Guest accounts cannot activate hosting. Browser following also waits for host
retirement. React view disposal retains acknowledged native ownership.

New local queue recordings use a bounded native broker and the registered
StreamingServiceSpotifyHostingRecording headless task. The job captures account,
server, Jam, native generation and recording; native search is available only to
its one-use claim. The task restores the actual app account, reads app recording
metadata, decodes the scoped native catalog response and applies the existing
conservative matcher. Ambiguity, expiry, replacement and malformed responses never
invent a Spotify identity. The coordinator pauses while matching new entries,
then publishes a fresh actual sample. It does not resume playback automatically;
use the app Play control after matching. Stop cancels jobs and withdraws ownership.

Verification: `npm run test:spotify` passed 451 Node and 105 Jest cases; full
`npx tsc --noEmit` passed. All Android app JVM suites passed 409 cases with
`./android/gradlew -p android :app:testDebugUnitTest
-x :app:buildSpotifyLibrespot --no-daemon --console=plain`. Dedicated suites:
spotify-hosting, spotify-hosting-queue, spotify-hosting-screen,
spotify-background-hosting, spotify-background-hosting-headless,
SpotifyHostRecordingBrokerTest and new background coordinator cases. A controller
regression covers exclusive hosting/following cleanup. `git diff --check` passed.
Native 235-case verification belongs to the previous chapter. No live host,
guest or physical-device playback success is claimed. Source integration is ready
for release packaging; actual second-account and Android lifecycle acceptance
remain required, and the earlier paired probe is absent.

# Bounded native HTTP contention handling — 2026-10-31

Native reads, catalog searches and host publication/demotion can wait behind an
active HTTP operation in an eight-action bounded queue. Deferred actions recheck
actual generation, registration, cancellation, authority and publication order
when dispatched. Pending response retirement remains explicit. Dealer commands,
acknowledgements and heartbeat processing stay responsive. No HTTP request is
replayed: catalog throttling/backpressure returned by HTTP stays a failure.

Verification: full `cargo test --manifest-path native/librespot-session/Cargo.toml
--locked --quiet` passed 235 cases. Dedicated actor cases cover search waiting,
bounded capacity, cancellation, shutdown, withdrawal behind passive work and no
HTTP search retry. The former immediate metadata-backpressure test now verifies
bounded deferral while unqueued playback mutations and stale reads remain refused.
An initial full test run waited on that obsolete expectation; only its own Cargo
and test worker were stopped, and the corrected complete suite passed. No Spotify
process was touched. This resolves a deterministic actor-contention path; it does
not establish the cause of the earlier live search failures or successful live
catalog permission. `git diff --check` passed.

# Retained host runtime and native task composition — 2026-10-31

Added an application-owned host runtime with revocable React attachments, scoped
native ownership, serial decisions, explicit cleanup barriers and account/token
updates. Failed cleanup survives repeated replacement attempts. Actual native
retirement can release a retained binding and clear that fence. Host sessions,
real player, native transport, metadata broker and bounded authentication renewal
are composed in SpotifyHostApplicationRuntime. The existing headless recording
and authentication entry points route their unique jobs to the correct owner.
Native hosting commands and snapshots are exposed through SpotifyJamPlayback.
Starting native following retires hosting first. Host command permission is
separate from old-scope cleanup permission.

Connect shutdown attempts host demotion before removing the native device; failed
demotion still proceeds through actual native retirement and binding release.
Automatic native closure also retires hosting. Snapshots contain actual scope and
status, without credentials or song details. External session/coordinator work
runs outside owner locks on a serial decision queue.

Verification: all Android JVM tests passed 402 cases with `./android/gradlew -p
android :app:testDebugUnitTest -x :app:buildSpotifyLibrespot --no-daemon
--console=plain`. Dedicated new suites: SpotifyHostRuntimeTest,
SpotifyDecisionExecutorTest and SpotifyHostSnapshotProtocolTest. Additional
Connect/session tests cover host-before-native ordering, failed demotion release
and failed-binding cleanup. `git diff --check` passed. No live hosting or device
result. Continue explicit JS controls, queue capture and reverse background
matching before integrated APK packaging.

# Queue-independent native host withdrawal — 2026-10-31

Host shutdown no longer needs a mapped player queue or a membership read. Added
strict generation/device/session/sequence-scoped withdrawal through JNI, the
responsive actor and its HTTP worker. It constructs an inactive hidden observer
registration using only the actual native device/session. It carries no track,
queue, playback occurrence or command claim. Actual sequence order and uncertainty
fences survive withdrawal. Only known successful demotion permits another explicit
activation; late/foreign/canceled attempts cannot replace current authority.

The Kotlin transport exposes this control without an incoming-handler requirement.
The coordinator pauses against its actual cursor, reads the actual native next
sequence, then withdraws. Unmapped local queue additions or loss of player queue
sampling therefore cannot block demotion. An uncertain withdrawal is never replayed
and remains a failed cleanup barrier.

Verification: full native Cargo suite passed 230 cases using `cargo test
--manifest-path native/librespot-session/Cargo.toml --locked --quiet`; all Android
app JVM tests passed 385 cases across 28 suites using `./android/gradlew -p android
:app:testDebugUnitTest -x :app:buildSpotifyLibrespot --no-daemon --console=plain`.
Dedicated cases cover empty playback withdrawal encoding, identity/time validation,
strict bridge fields, actor generation/cancellation/order/uncertainty, deliberate
reactivation, Kotlin exact identity/sequence/no-handler dispatch and missing player
queue cleanup. `git diff --check` passed. No live withdrawal, physical-device or
APK claim. Application-owned host runtime, module/task routing, JS hosting controls
and background reverse mapping remain the next source chapters. Guest admission,
live catalog backpressure and actual background/audio verification remain open.

# Host native session and exact configuration — 2026-10-31

Added an exact bounded host configuration carrying actual player epochs, cursor,
previous native host and known recording mappings. Unknown fields, duplicate
occurrences, malformed Spotify identifiers and coerced revisions are rejected.
The actual player is configured without clearing authentication or replacing its
queue. Native connection observation attaches before host activation and survives
without a React attachment. Lost connections, higher native generations and
account replacement retire incoming handling; hosting never reactivates implicitly.
Startup covers binding/configuration timeout as well as coordinator readiness.

App token updates during startup are committed before acknowledgement; later
updates serialize through the actual player while preserving epochs. Session
retirement detaches observation immediately, awaits dispatched authentication and
actual host cleanup, then unbinds. A failed native demotion keeps the binding and
returns a failed barrier. Dedicated feature suites: SpotifyHostConfigurationProtocolTest,
SpotifyHostNativeSessionTest and SpotifyHostConnectionEventsTest. The coordinator
now implements an injected session interface for deterministic lifecycle tests.

Verification: all Android app JVM tests passed 381 cases across 28 suites with
`./android/gradlew -p android :app:testDebugUnitTest
-x :app:buildSpotifyLibrespot --no-daemon --console=plain`. Mobile
`npm run test:spotify` passed 433 Node and 99 Jest cases; full `npx tsc --noEmit`
passed. The complete native suite passed 223 cases earlier in this source run;
no Rust changed after that result. `git diff --check` passed. These are source
results. No new live/session/physical-device result or APK packaging.

Next: application-owned host runtime and native module/task routing, explicit JS
host controls, background reverse mapping for new local queue additions, and
cleanup that does not depend on projecting a mapped queue after account/session
loss. Current cleanup honestly fails when that projection is impossible; do not
hide this by inventing song data or claiming successful retirement. Keep guest
admission/second-account and live catalog-backpressure gates explicit. Preserve
all running Spotify/native processes; the old probe socket has no live owner.

# Native host coordination — 2026-10-30

Added host coordination over injected player, transport, elapsed clock, scheduler
and decision executor. An explicit start verifies actual native registration,
previous host, expected app cursor, real mappings and player readiness. Hosting
acknowledgement waits for activation and a fresh local-host preflight. A native
timer publishes actual queue samples with increasing native sequences. Accepted
command mappings and provenance are retained only for matching actual cursors.
Startup is bounded; no React timer is required.

Stop removes incoming handling immediately, waits for any dispatched mutation,
performs a cursor-fenced pause and reads the actual next native sequence before
fresh demotion. Unknown writes never replay. Foreign host takeover retires the
host. Unknown app queue mappings fail closed rather than fabricate Spotify IDs.
A failed cleanup remains an explicit failed barrier; the runtime must not unbind
or acknowledge complete retirement as successful in that case.

Verification: focused Android host and player-service tests passed 128 cases with
`./android/gradlew -p android :app:testDebugUnitTest --tests '*SpotifyHost*Test'
--tests '*SpotifyPlayerServicePortTest' -x :app:buildSpotifyLibrespot --no-daemon
--console=plain`. SpotifyHostCoordinatorTest has 16 dedicated cases for actual
acknowledgement, timed publication/sequence order, cursor and authority rejection,
unknown outcomes, cleanup failure, stop during activation/sampling, foreign host,
missing mappings, startup expiry and reentrant observers. No live hosting or APK
result. Next: retained application/session composition, task routing, explicit app
controls and background reverse mapping. Guest admission and live search remain
unverified; no running Spotify process was changed.

# Actual host command dispatcher and retirement pause — 2026-10-30

Added an injected native command dispatcher that samples the actual app cursor,
serializes incoming actions and waits for the real player receipt before replying
success. Duplicate keys never execute twice; unsupported commands are refused.
The original deadline applies while waiting behind another command or sampling.
Unknown outcomes, receipt mismatch and failed acknowledgement retire the handler;
late callbacks cannot revive it. Retirement cancels pending work. The host player
now supports a cursor-fenced safety pause that cannot override newer local controls.
Cleanup clock reads remain available after membership ends or a foreign host wins,
with actual connection/generation checks retained.

Verification: focused Android host and player-service JVM tests passed 112 cases
using `./android/gradlew -p android :app:testDebugUnitTest --tests
'*SpotifyHost*Test' --tests '*SpotifyPlayerServicePortTest'
-x :app:buildSpotifyLibrespot --no-daemon --console=plain`.
Dedicated dispatcher tests cover actual receipts, duplicates, serialized sampling,
inactive/unsupported requests, retirement, delayed sampling, expired operations,
unknown outcomes, acknowledgement failure and account replacement. Dedicated
player tests cover pause receipts, cursor conflict, malformed receipts and already
paused state. A deadline test caught duplicate cancellation and now passes.
`git diff --check` passed. This remains source implementation: the dispatcher is
not yet attached to a retained host lifetime, and no new APK/device claim is made.
Continue native host coordination, periodic actual queue publication, cleanup,
headless mapping and app hosting controls without changing live Spotify processes.

# Host command readiness and native deadlines — 2026-10-30

Remote command capabilities now require evidence of an attached command handler.
Activation refuses missing readiness, publication carries the actual handler state,
and demotion removes command acceptance. Incoming events carry their original
native receipt/deadline. The Android polling boundary captures its actual elapsed
clock bracket; decoding maps deadlines conservatively from the poll start.
Queued or delayed delivery cannot grant a fresh ten-second permission window.
Unsupported or already expired commands retain only enough information to refuse.

Verification: fresh-process Android Kotlin compilation passed. Focused host,
player-service and native-execution JVM tests passed 109 cases. Complete native
Cargo tests passed 223 cases. Dedicated tests cover readiness retirement before
dispatch, publication capabilities, exact producer lifetime, duplicate suppression,
poll clock capture, delayed delivery, malformed timing and scope replacement.
Commands: `./android/gradlew -p android :app:testDebugUnitTest --tests
'*SpotifyHost*Test' --tests '*SpotifyConnectNativeExecutionTest' --tests
'*SpotifyPlayerServicePortTest' -x :app:buildSpotifyLibrespot --no-daemon
--console=plain`; `cargo test --manifest-path native/librespot-session/Cargo.toml
--locked --quiet`. The earlier Gradle spawn-helper failure was resolved by a fresh
JVM; no dependency configuration changed. No live session, device or APK result.

Continue the retained host dispatcher/runtime, periodic publication, cleanup and
explicit app hosting controls. The capability gate stays closed until that actual
composition exists. The previously approved probe is absent; its leftover socket
is not evidence of a live registered session. Preserve other running sessions.

# Kotlin native host transport — 2026-10-30

Added bounded native host identity/preflight/control composition. Fresh owned
membership brackets the native read; actual handle/generation, previous host and
native/server/elapsed clock ranges are validated. Activation uses actual player
readiness and external-authority evidence. Queue cancellation prevents dispatch;
uncertain mutation replies or replacement never trigger replay. Safe native
failure categories remain visible. Initial hosting can observe no previous host.

Verification: Android `./android/gradlew -p android :app:testDebugUnitTest --tests
'*SpotifyHost*Test' --tests '*SpotifyPlayerServicePortTest'
-x :app:buildSpotifyLibrespot --console=plain` passed 86 JVM cases;
`git diff --check` passed. Dedicated tests: SpotifyHostNativeTransportTest.kt,
plus the no-previous-host case in SpotifyHostPublicationProjectorTest.kt. No new
live/session/device results or APK packaging. Continue retained host runtime,
incoming command handling, real state publication and app controls; source
transport/codec tests do not establish working app-led hosting.

# Native host demotion and repeated explicit activation — 2026-10-30

Added a typed, bounded native deactivation operation through JNI, the responsive
actor and HTTP worker. It publishes the real player state as inactive, hides the
local device and removes playable/control capabilities. Only known demotion
permits another explicit activation. Sequence order survives this boundary and
the actor exposes its actual next sequence; overflow never invents a safe value.
Unknown outcomes retain the activation fence and never replay. Stale demotion
acknowledgements cannot replace a newer local host observation. Cleanup may hide
the local device after another host has taken over without taking that host over.

Verification: complete `cargo test --manifest-path native/librespot-session/
Cargo.toml --locked --quiet` passed 220 cases, including dedicated deactivation,
actor ordering, uncertainty, generation/cancellation, sequence exhaustion and
bridge-decoding cases. `git diff --check` passed. No device, hosting UI, native
activation or demotion has been exercised live. The Kotlin native host transport
and actual application host runtime are still being composed. No APK rebuilt.

# Real host queue and publication projection — 2026-10-30

Added bounded actual-player queue sampling, complete cursor validation, resolved
recording/occurrence retention and an authenticated service-owned host adapter.
The host publication projector uses actual queue order, confirmed mappings and
measured elapsed/native/server anchors. It rejects stale/wrong-generation samples,
unknown/ambiguous mappings and unsupported options; paused-ready remains distinct
from buffering. Native command provenance now preserves message/sender fields
when the optional session command identifier is absent.

Verification: Android `./android/gradlew -p android :app:testDebugUnitTest --tests
'*SpotifyHost*Test' --tests '*SpotifyPlayerServicePortTest'
-x :app:buildSpotifyLibrespot --console=plain` passed 70 JVM cases. Complete
`cargo test --manifest-path native/librespot-session/Cargo.toml --locked --quiet`
passed 210 cases. `git diff --check` passed. Dedicated mapping and pending
composition: SPOTIFY_APP_HOSTING.md. No APK rebuilt or host/device test performed.

The approved probe execution 98826 is no longer present after the interrupted
turn; its socket file remains and must not be mistaken for a live owner. Earlier
registered/metadata and two search-backpressure results remain the live evidence.
No Spotify process was stopped by implementation commands. Continue host runtime,
incoming command dispatch, periodic publication, demotion and app controls.

# Current-session native catalog check — 2026-10-30

The user approved the fresh pairing. The existing native probe is now registered
at generation 1 and remains running in execution session 98826; its local socket
is build/spotify-jam/connect-probe.sock with mode 0600. Do not stop/restart it or
Spotify processes. No credential was exported or logged.

Read-only current-state and metadata requests passed. Two catalog-search
attempts returned the safe `backpressure` failure. This is live failure evidence,
not successful search permission or successful matching. It does not establish
whether the response came from actor occupancy or HTTP throttling; do not claim
an HTTP status without evidence. No playback/queue mutation was issued.

Added `tools/validate-spotify-native-search.cjs`: reads the current song in memory,
validates its native metadata and searches without printing identifiers, titles,
artists or raw failures. `npm run test:spotify-probes` passed 27 cases, including
three dedicated search diagnostic/privacy cases. The tool does not retry. Keep
live public-search availability unresolved while continuing host source work.

# Background app authentication lifecycle — 2026-10-30

Added native expiry-driven app credential renewal independent of recording
resolution. A bounded account/server/Jam/host/generation-scoped headless task
restores and refreshes the StreamingService account, then updates the real native
player. Completion requires committed expiry advancement. Failures stop native
ownership; reconnect, replacement, suspension and stop retire old jobs. Native
credential writes now serialize and commit expiry only after actual success.

Verification: `npm run test:spotify` passed 433 Node and 99 Jest cases;
`npm run test:player-mobile` passed 329 cases; full `npx tsc --noEmit` passed;
`./android/gradlew -p android :app:testDebugUnitTest --tests
'*SpotifyJamAuthenticationRenewalTest' --tests '*SpotifyJamPlayback*Test'
-x :app:buildSpotifyLibrespot --console=plain` passed 42 JVM cases. Library
`npm run check` and `git diff --check` passed. Feature mapping and lifecycle
limits: SPOTIFY_BACKGROUND_AUTHENTICATION.md. A preexisting suspended-view test
caught a changed adoption contract during implementation; terminal view adoption
again returns its state without starting another session, and the full focused
suite passes. No Spotify process was stopped.

No new APK or physical/device evidence. The live native probe remains pending
pairing approval. Continue actual app host composition and incoming command/state
publication before packaging; guest and physical audio acceptance still need
another account and an attached Android device.

# Explicit native activation transport — 2026-10-30

Connected explicit activation to the responsive Dealer actor, bounded HTTP worker
and session publication path. The actor retains its own exact native read and
exposes actual player session/device identity. Activation requires current
registered generation, matching previous host/read brackets, actual player state
and readiness. Dispatch is one-shot. Host replacement during HTTP prevents late
success from restoring local authority. Typed JNI controls reject malformed data;
raw playback-ready startup and incoming control capability remain disabled.

Verification: focused Rust activation/publication/actor/bridge suites passed 73
cases. Complete `cargo test --manifest-path native/librespot-session/Cargo.toml
--locked --quiet` passed 209 cases. `git diff --check` passed. Dedicated test map
and design: native/librespot-session/PUBLICATION_PROGRESS.md. No live takeover,
Android host control or APK rebuild in this chapter. Continue composing the
actual app host, incoming commands, queue mapping and native clock publication.
Background renewal independent of new recording resolution is also pending.

# Native catalog search bridge — 2026-10-30

Connected the existing Rust/JNI catalog search to Kotlin execution, account owner,
retained runtime, React Native module and the mobile account-bound catalog port.
The library now validates bounded search input/results and routes device sign-in
search through the actual native session. Handle/generation, account replacement
and cancellation fence every result. Permission failures do not retry with browser
credentials. No account or song payloads are logged.

Verification: `npm run test:spotify` passed 422 Node and 95 Jest cases;
`npx tsc --noEmit` passed; Android `./gradlew :app:testDebugUnitTest --tests
'*SpotifyConnect*Test' -x :app:buildSpotifyLibrespot --console=plain` passed 103
JVM cases. Library `npm test` passed 619 cases including seven new search cases.
Feature tests: `tools/spotify-connect-store.test.cjs` (routing/account/cancel/
reconnect), `SpotifyConnectNativeExecutionTest`, `SpotifyConnectOwnerTest`,
`SpotifyConnectRuntimeTest` and library `tests/connect-search.test.mjs`.
No new Rust behavior or APK packaging in this chapter. Live permission awaits
probe pairing approval. Continue hosting and background lifecycle source work.

# Native same-Jam reconnect recovery — 2026-10-30

Implemented application-owned native connection recovery and the matching React
view. Connection gaps fence source intent, pause owned playback and cancel reads,
resolution jobs and polling. Only a higher actual generation on the same native
account/handle may recover; fresh membership and playback verify Jam/host before
resuming. The actual player epochs and valid lease survive. Existing expired
lease recovery and local safety suspension remain enforced. No mutations replay.
Pending startup retires on a connection gap. React adoption retains only an
acknowledged same-scope owner and rejects old observations/late snapshots.

Verification: `npm run test:spotify` passed 418 Node and 95 Jest cases;
`npx tsc --noEmit` passed; Android `./gradlew :app:testDebugUnitTest --tests
'*SpotifyNativeFollowerCoordinatorTest' --tests '*SpotifyJamPlayback*Test'
--tests '*SpotifyJamConnectionRecoveryTest' -x :app:buildSpotifyLibrespot
--console=plain` passed 62 focused JVM cases. `git diff --check` passed. Dedicated
mapping and design are in SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md. No APK rebuilt at
this chapter boundary. These are source tests, not physical network/audio checks.

Continue app-led activation, accepted incoming commands and real player state
publication, native catalog composition and background credential lifecycle.
The fresh native probe is waiting for browser pairing approval; preserve it.
Guest acceptance still needs another account and physical playback checks need
an Android device. Build the integrated APK after remaining source work.

# Native follower app handoff — 2026-10-30

The existing follow action now selects the native Android runtime for device
sign-in, while browser sign-in keeps the foreground route. Both previous playback
owners must finish cleanup before replacement. Native startup must acknowledge
the actual player lease and persist a verified account/server/player-epoch
ownership receipt before the app permits background continuation. Account/host/
native-generation changes, local suspension and delayed responses remain fenced.
Same-account token updates reach the native runtime without restarting following.
`SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md` maps each behavior to dedicated tests.

Source validation: `npm run test:spotify` passed 413 Node and 95 Jest cases;
`npm run test:player-mobile` passed 329 cases; `npx tsc --noEmit --pretty false`
passed; `./gradlew :app:testDebugUnitTest --tests '*SpotifyJamPlayback*Test'
-x :app:buildSpotifyLibrespot --console=plain` passed Android compilation and
22 JVM cases. This chapter changes no Rust source or player engine selection.

Mobile source commit `147eb76` is packaged in the APK recorded in
`SPOTIFY_JAM_APK.md`. Release assembly, signature and 16 KB ZIP/native ELF
alignment checks passed. The old probe is unavailable and there is no new
live-session/device result. Real screen-lock operation,
unseen-song playback, background renewal, measured synchronization and guest
permission remain unverified. Next source work is same-Jam reconnect recovery,
then app-led host activation/incoming controls/publication. Process-death recovery
and physical lifecycle testing remain in the implementation queue.

# Application runtime APK and fresh live grant — 2026-10-27

Current APK checkpoint: Mobile4231657, library1e4f009, Playerb28f393;
35,427,788 bytes, SHA256
5756a4efcdca57b29165eb3422ae7e42dbdc7ad9578efaf60b5d11cbefd0b92b.
Frozen combined checks: mobile345 Node+92 Jest/full TypeScript, native162/JNI,
Android146 release JVM cases, forced Hermes/release assembly/signing/alignment.
Source commits, sizes and validation logs are in build/spotify-jam.
SPOTIFY_JAM_APK.md records the exact scope. No device/audio/background claim.

Fresh user pairing approved and native session is live in exec63592. The official
same-account desktop client was launched in exec67827 and resumed for tests.
Fresh native read/metadata, library decoding and server-confirmed pause/resume
passed; uncertainty109.274523 ms. Only safe metrics were persisted in
live-renewal-integration.json. Forced401 and cross-account operation were not
exercised. Keep the grant in memory; restart child through parent if needed.
A different account's invitation remains pending for guest verification.

Next work is in progress with delegated ownership: native follower coordinator
using real player readiness/authority, a responsive Dealer actor while HTTP is
pending, and root-owned native membership verification/background recording
resolution. Keep UI background following disabled until native handoff and
unseen-track resolution are actually composed. Explicit initial hosting
activation/incoming player commands still need integration. iOS stays deferred.

# Native authentication and build watcher follow-up — 2026-10-27

Mobile 9e36048 adds one bounded rejected-bearer renewal for paired Desktop safe
observation/metadata reads. Commands/removal never replay automatically. The
upstream password-token cache has no invalidation API, so that path preserves
its existing expiry behavior and surfaces rejection for explicit recovery.
Nine dedicated authentication cases and the new pending-ack rollover regression
bring the full Rust suite to 143 passing cases plus JNI loading smoke.
SPOTIFY_CONNECT_AUTHENTICATION.md records the contract and remaining live gaps.
The delivered receipt/recovery APK predates this source chapter.

Concurrent Rust compilation exposed a real Metro watcher failure on a temporary
native target/debug/deps/rustcoelbFY entry. metro.config.js now excludes the
native target directory while preserving Metro's default block list. Direct
configuration checks cover debug/cross-compile descendants, the target root,
unchanged app/library/native source visibility and the existing __tests__ rule.
The final forced bundle/release build will verify the combined native/runtime
checkpoint. No audio/background success is inferred from this build change.

# Packaged receipt and recovery checkpoint — 2026-10-27

Delivered APK now includes Mobile c756ea5 and library cee7db9: 35,353,872 bytes,
SHA256 cd02a2333b7f19737fd9d3fc493a0684cac4ea42d079526cb787e93555b1bb11.
Fresh Hermes (2,146,780 bytes), ARM64 native (5,360,176 bytes), release assembly,
signature, ZIP alignment and ELF LOAD alignment passed. Frozen library 612,
mobile 332+91, native 133/JNI, example seven, full app TypeScript and Android
JVM 51 passed. Build logs and source hashes are retained in build/spotify-jam.
Physical APK/audio/guest/background behavior remains unverified.

The old probe handle is missing and an actual Unix-channel connection failed;
there is no current live-test owner. Preserve the earlier live results as
historical evidence and request a new pairing only when live work needs it.
Independent development continues: application-scoped native Connect runtime
with safe React reattachment, and bounded native token renewal on safe reads.
Do not remove foreground follower background-stop protection until a native
audio/resolution handoff is actually acknowledged. The goal remains active.

# Dealer-confirmed outgoing command receipts — 2026-10-26

Implemented chapter; APK replacement follows this checkpoint. Native command HTTP returns a
45-byte JSON object with a server ack_id distinct from the logging request UUID.
Added bounded identifier projection in connect_receipts.rs and a bounded pending
journal. Checked commands now wait for a Dealer Cluster carrying that exact ack
and expected active host. Only then does receipt deliveryObserved become true;
observed native clock and actual queue revision are retained. Cancellation,
shutdown, missing/duplicate ack, deadline and host replacement remain uncertain
without retry. Cached host changes older than preflight cannot retire the pending
confirmation. Raw diagnostic commands retain HTTP-only semantics.

Kotlin requires an explicit observed acknowledgement for command success. Known
native failure receipts preserve their codes; malformed or thrown post-dispatch
replies become unknown-outcome. JNI command panics also default to uncertainty,
while explicit errors are unchanged. This avoids advertising an HTTP-only edit
as delivered. Unknown results do not reset SDK queue/playback replay fences.

Live Unix-channel checks succeeded for pause, resume and append using the new
journal: all returned deliveryObserved true only after matching Dealer events.
The queue append also changed revision and produced one new matching available
song occurrence from provider queue, with a server-assigned replacement UID.
The earlier direct HTTP body inspection established ack_id presence and no
matching logging-request ID. No raw IDs, song metadata or response bodies were
printed. Those checks used the retained approved grant and official desktop peer.
The old exec handles are no longer available in the resumed tool session; do not
assert that their ownership remains live without a new authoritative check.
A different account's Jam invitation is still needed for guest evidence.

Frozen chapter checks: npm run test:spotify-native passed all 133 Rust cases and
actual JNI loading smoke. Android :app:testReleaseUnitTest passed all 51 JVM
cases. npm run test:spotify passed 332 Node and 91 Jest cases, including the
complete delegated explicit-recovery additions. Logs are under build/spotify-jam.
Focused journal eight, receipt codec five, actor 24 and bridge nine cases are
included in the full native run. The example and full app TypeScript are checked
separately before packaging. These checks do not prove device audio or guests.

Current delivered APK is the observer/marker checkpoint from mobile 09e80c2 and
library 29c93c7: 35327716 bytes; SHA256
0638f1a1acc6bb74ed0217171c9d3f2a4ba63025b05ee2d624bd5343406137ad.
Bundle 2141536 bytes, native 5339264 bytes; native SHA
47e4c06591de991797599d47ffa514eaaa8d463a5a80e31b5b1545f534200e26.
Signature, ZIP/16 KB ELF alignment and required markers passed. The artifact
contains working same-account native controls/private metadata/queue reads but
not the new observed-delivery receipt/Android guard. It was linked to the user.
No physical APK, guest audio, app-led hosting or background correctness is proved.

Explicit shared-state reconciliation is committed in library cee7db9 and mobile
a87c8d3. It preserves passive refresh protection and old unknown receipts, verifies
fresh membership before/after native shared state, and clears only captured
mobile uncertainty. Continue live recovery, guest admission/permissions, actual
local audio, app-led host publication and native foreground recovery. The next
native chapter moves connection ownership beyond React lifetime with safe
reattachment; this does not itself implement the background audio follower.
The objective remains active; iOS is deferred.

# Live controls, observer fix and local test channel — 2026-10-26

The installed official Spotify client was not running. It was launched for the
peer test and resumed through its MPRIS interface. The independent probe then
received an active host and fresh position/pause/buffer/track updates. Native
pause and resume each returned success, changed the official client's MPRIS
status, and produced matching Dealer state with acknowledgements. This proves
same-account Connect controls; it does not prove guest permission or local audio.

That test exposed a real preflight bug: hidden observers are omitted from the
returned device map, and the additional jam_status echo check rejects while a
different active device plays. Observer readiness now uses the successful
account-authenticated, Dealer-connection-bound registration response, classified
acknowledgedObserver, without adding a fake device to the cluster. Playable
registration still requires its exact device in the returned map. Two native
registration cases and a source-store acknowledgement regression cover this.
The old exact device-status validator remains a separate legacy utility.

A new host-only Unix channel at build/spotify-jam/connect-probe.sock exposes typed
fresh reads, metadata and checked commands to local verification scripts. It is
not part of the Android app, binds mode 0600, has bounded framing/clients/timeouts,
never accepts credentials, cancels a disconnected command, preserves live or
regular existing files and removes only its own socket. Seven diagnostic example
cases cover projections plus typed input, permissions/read envelope, disconnect,
binding and cleanup. The same live process 85329 retained its paired grant during
child rebuild/restart. Restart leaves socket cleanup to the old child before the
new child binds. Keep the write side open until a local channel reply arrives.

The channel allowed actual library integration checks without another pairing.
Source had spotify:meta and spotify:delimiter queue markers. The strict song-only
raw decoder rejected them and blocked valid playback. Library now retains them
in raw state and excludes known structural markers from displayed queue metadata.
Live result: progressing observation, 71.739192 ms timing uncertainty, 50 raw next
entries, 48 displayed songs, three metadata batches for 49 songs including current,
and unchanged authoritative occurrence order. This is not an Android UI test.

A controlled append of the currently playing available song was accepted, changed
queue revision on the same host, and created one new matching occurrence from the
queue provider. The supplied occurrence UUID was not retained and the player
session command ID did not echo the request UUID. The earlier public test song
request changed the queue but its exact track delivery was not established; it
must not be counted as occurrence-confirmed. No unknown command is replayed.
Further receipt/Dealer acknowledgement research is needed for uncertain edits.

Current checks: full library 586 cases; full mobile 318 source plus 89 UI/platform
cases; full Rust/JNI 116 cases plus JNI smoke; diagnostic example seven cases.
The active local Spotify app process is exec session 6380; do not terminate
unrelated client processes. Its native probe remains 85329, currently with an
active same-account peer. No further manual playback click is required for this
peer. A genuinely different account/Jam invitation is still needed for guest tests.

The delivered artifact currently predates acknowledgedObserver and marker fixes
(metadata build: 35331036 bytes, SHA d6d62066984bd2f3f1fef79b3e42a8789d9feabe0587a823832989ca5c7c3879).
Force a fresh Hermes bundle and release assembly after this chapter before
replacing it. Native registration/commands/metadata/queue reading are live checked
independently; APK install, guest operation and simultaneous/background audio
remain unverified. The complete objective remains active.

# Private track metadata and shared queue display — 2026-10-26

Added the pinned extended-metadata protocol through the existing native session's
bounded account-bound HTTP adapter. Requests contain at most 20 unique real
base62 IDs. Decoding checks extension kind, each entity URI, numeric status,
actual protobuf track gid, title/artists/duration and explicit ISRC codes. It
reorders responses to the requested IDs and rejects missing/duplicate/foreign
entities. Explicit 404 is not-found. No audio data or keys are read.

Metadata is exposed through generation-fenced actor/JNI/Kotlin/JS reads. The
native owner now shares its read-retirement guard for observation/metadata.
Native-login runtime uses private metadata for song lookup and a private queue
reader which resolves repeated songs once per read, preserves occurrence and
revision values, and confirms the same host/generation/revision after metadata.
Search remains the existing catalog adapter. The queue display retains its 100
entry bound; native episode metadata is unsupported and full private search is
not claimed. JS read cancellation also covers the receipt-settlement/continuation
race, with a dedicated reproducing test.

Live process 85329 reused its in-memory credential while its native child was
rebuilt/restarted. A fresh paused-track metadata lookup succeeded with title,
one artist, duration and one recording code. The safe summary is in
build/spotify-jam/live-metadata-summary.json, and exports only presence/counts and
fixed failure codes. Paused source playbackSpeed is 0.0; the library's new test
accepts paused zero speed and still rejects unsupported active speed. Spotify
still reports no active device, so explicit native song controls/queue mutation
remain unverified. Pending user request is to resume Spotify playback and reply
playing. Actual second-account invitation is still needed for guest tests.

Checks: library 584 cases; mobile 317 source plus 89 UI/platform cases; Android
JVM 49 cases; full Rust/JNI 113 cases plus JNI smoke; diagnostic example two
cases; full app TypeScript. Core codec cases cover bounds, ordering/identity,
malformed responses, ISRC filtering and explicit not-found. Actor cases cover
exact request routing/provider failure and stale generations. Kotlin/source tests
cover envelope/account binding, retirement, malformed/foreign receipts and
prompt cancellation. Example tests exclude song identifiers/details from output.

Previous artifact still contains only the command chapter (mobile 613fd9b,
library 2a10829); it does not yet contain the observation/metadata changes.
A forced Hermes bundle and release assembly follow this chapter. Continue through
guest permission/admission, live commands/reconciliation, simultaneous local
playback, host state publication and foreground/lifecycle recovery. Do not mark
the full objective complete from these tests or APK assembly.

# Fresh native observations and occurrence-aware following — 2026-10-26

Added ConnectAction::Read and JNI connectRead. It returns a fresh cluster with
native request start/end and delivery sample clocks. It performs no song edit,
rejects old generations and skips abandoned queued reads. Android and JS fence
ownership before/after asynchronous work. JS cancellation retires the waiting
reader promptly and discards late native results. Native-login runtime playback
reads now use this port instead of the public player read endpoint.

The library validates all timing/identity bounds, preserves occurrence IDs and
queue revision, and uses Spotify server time to advance position from the player
anchor only while playing and neither paused nor buffering. The mobile follower
retains source buffering and prepares a new execution for a repeated song's new
occurrence. Matching for that song remains cached. Guest role remains disabled;
this does not establish synchronized audio or a native foreground service.

Validation: library 573 cases, mobile 313 source cases plus 89 UI/platform cases,
Android JVM 47 cases, Rust/JNI 105 cases plus JNI smoke, diagnostic example one
case, and full app TypeScript pass. The example writes only fixed nonidentifying
clock/playback metrics to build/spotify-jam/live-observation-summary.json and can
confirm an explicitly appended URI/occurrence internally without exporting IDs.
The diagnostic artifact test checks exact correlation and identifier omission.

Live interactive process 85329 is still running and retains the approved grant
only in parent memory. Its rebuilt child was restarted without pairing again.
Two explicit reads returned server elapsed 79392 ms versus native request-start
elapsed 79399 ms, with a 247 ms latest request. The active device is still absent,
playback paused, queue length 79. Waiting for the pending user playback response
before native commands; a second-account Jam invitation is still needed for actual
guest admission. refresh/restart/stop and explicit play/pause/next/previous/queue
controls are available. Never assume this handle survives a process restart.

A native-command APK was built from mobile 613fd9b and library 2a10829: 35207336
bytes, SHA256 4c8f3c7cd630e4049f5f2a2477ff73ea82be9560c4df64ad7622ce4a1be0f3fc.
It passed signature, Hermes/native markers, ZIP/16 KB ELF alignment. It does not
yet include this observation chapter; another forced bundle/assembly is needed.
No ADB/device execution or second-account/audio correctness is claimed.

Next independent chapter: native metadata/queue display and revision-based
reconciliation, guest permission evidence/admission, local authority/host state
publication and Android foreground recovery. The full objective remains active.

# Native typed command path — 2026-10-26

Native-login queue/playback adapters now bypass the public player mutation API.
They retain the library session coordinator's owned-host membership checks and
serialize with existing queue/membership work. Guest permissions remain disabled.
The Rust actor refreshes the cluster before checking the expected active host,
action restrictions, seek track and position. Mutations have one dispatch only.

Android registers scoped command cancellation before worker queueing. Canceling
queued/preflight work prevents mutation; canceling in-flight work is uncertain.
Owner reservations fence retired accounts and reused identifiers, and bounded
command capacity is released after native execution actually finishes. JS binds
requests to account/generation, copies intents, cancels retired work and ignores
late success. No public API fallback or automatic mutation replay is added.

Validation: full library 566 cases; Rust/JNI 102 cases plus JNI smoke;
Android release JVM 45 cases; mobile source 307 cases plus 89 UI/platform cases;
24 diagnostic probe cases; full app TypeScript passes. Android build uses the
cached Rustup toolchain through CARGO_HOME/RUSTUP_HOME/CARGO; the first attempt
with system Cargo failed for its missing Android target, then the configured
cached toolchain built and all JVM tests passed.

Live process 85329 uses an interactive terminal, holds approved credentials only
in memory, and supports refresh/play/pause/next/previous/queue <Spotify ID>, restart
and stop. It registered successfully; the initial snapshot has no active device.
The previous noninteractive process 75330 ended on stdin EOF after approval and
lost its grant. Previous process 79452 is also terminal, not a reusable session.
The APK in build/spotify-jam is still the earlier observer checkpoint; these
changes require a fresh Hermes bundle and release assembly before delivery.

Next: live private pause/resume and append confirmation; actual second-account
Jam admission/permission changes; private queue/playback observation with valid
clock mapping; local audio/host publication; foreground service integration and
physical-device lifecycle verification. The objective remains active.

# Android Connect APK and fresh event checkpoint — 2026-10-26

Built and verified build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk:
35,138,748 bytes; SHA-256
6acc5fe437d7f41eb24a4e1cc94bd0ec488cb07b0c8e2d64ef121dd8867ee21f.
Forced release bundle generation, Android release/JVM assembly, APK signature,
16 KB archive alignment and native ELF LOAD alignment passed. The embedded
Hermes bundle is 2,124,000 bytes and includes the Connect event/credential handoff
markers. ARM64 native session is 5,167,832 bytes, SHA-256
3c61ff3b22502fd01a74822b34473949c0e9e46b1a074464cf5640f3013d7d43.
Artifact metadata records library eb7cbb8, mobile c6fdbdd and unchanged player
ae4666d. ADB reports no devices/emulators, so installation/phone lifecycle is
not agent verified. This APK adds observer ownership and registration; shared
guest queue/audio and app-led hosting are still incomplete.

The user then started playback. Live Dealer updates on generation 1 showed an
active device, new playback anchors, pause/resume transitions and an 80-entry
queue with occurrence identifiers. This establishes fresh transport observation
on the approved account. It does not establish audio alignment, guest admission
or app-owned host behavior. Unified exec 79452 remains active with its grant only
in memory. A second-account Jam invitation has been requested for guest testing.
Do not pair again while that process is available; it supports refresh/restart/stop.

The final build passed Android JVM 39. The final source-store regression suite
has nineteen cases; three were added after the earlier full 293 mobile Node
suite passed. Library 561, mobile UI/platform 89, Rust/JNI 86, probe 23 and full
app TypeScript passed. Further source changes require another bundle/build before
claiming they are included in the APK. Detailed feature mapping follows below.

Next chapter: route queue/playback actions through typed native Connect commands
with fresh host/track/restriction preflight, generation/account fencing and
unknown-outcome handling. Continue through the active queue; the APK is a
checkpoint, not completion.

# Android Connect ownership and hidden-device registration — 2026-10-26

Implemented a React Native SpotifyConnectSession module, a native-owned polling
worker and separate bounded lifecycle/command executors. Native start/close order
is serialized so cancellation before queued start cannot orphan a device. Logout,
account replacement and React reload cancel the owned session and drain cleanup
before releasing it. Empty native batches do not generate JavaScript events.
This is connection ownership, not a foreground playback service or background
synchronization guarantee.

LibrespotLoginSession now provides an explicit immutable native credential handoff
only after durable login/renewal acknowledgement. Ordinary access-token results
remain unchanged. The mobile connection store fences account/handle/generation
changes, late starts, subscriber reentrancy and canceled replacements. Its cleanup
barrier retains all retired bindings and supports explicit cleanup retry.
Membership notifications trigger passive refresh. Native state is shown separately
from login/Jam state. Control joining uses this app's verified device identifier;
remote admission remains blocked until an actual playback adapter exists.

Live browser approval succeeded with the user's help. The first transport failed
because its hidden non-player observer was absent from the returned Cluster.device
map. Fixed-stage diagnostics identified registrationDevice. Registration now
verifies an omitted observer through the existing account-bound
/social-connect/v2/devices/{deviceId}/jam_status endpoint and requires the exact
server-returned identifier. It does not invent a cluster device or relax player
registration. The corrected live probe registered successfully: deviceCount 0,
no active device, a cached old track/queue with occurrence identifiers. These
cached values are not accepted as proof of fresh playback or guest participation.

ACTIVE LIVE CHECKPOINT: unified exec 79452 keeps the approved grant in memory and
runs the corrected observer. User pairing JRPHFY has already been consumed; do
not request it again. The runner supports refresh, restart and stop. After a
native example rebuild, restart performs cleanup and starts the new binary with
the same in-memory record. No credential is written to disk. A user request to
start/pause/skip in Spotify is pending so fresh events can be checked. Earlier
exec 83129 was closed cleanly with stop after the first failed validation.

Validation: complete library suite 561 cases; mobile suite 293 Node and 89
UI/platform cases; Android JVM 39 cases, including ten owner and six decoder
cases; complete Rust/JNI 86 cases; developer probe suite 23 cases. Full app
TypeScript passed. Final Android release bundle/assembly remains to run after
source commit. No new APK has yet been assembled or installed.
The corrected live connection also completed explicit refresh with no failure;
it remained on generation 1 and returned the same cached inactive-host state.
Full mapping: native/librespot-session/CONNECT_TRANSPORT.md and library FEATURES.md.

Next: finish validation/build, preserve the live probe, verify fresh state and
actual second-account guest admission, then implement shared queue operations,
guest synchronized local audio, app-led authority and a real Android foreground
playback lifecycle. The user explicitly requires continuing through the queue;
a chapter commit or APK is not completion. iOS remains deferred.

# Persistent Connect foundation in progress — 2026-10-25

The active objective is all Android/library queue items 1–5 in
../StreamingServiceSpotifyJam/IMPLEMENTATION_QUEUE.md. iOS remains deferred.
This checkpoint does not end that objective or establish guest playback.

Added persistent account-bound AP/Dealer transport, regional resolution,
observer-only Connect registration, bounded protobuf/JSON/gzip event decoding,
independent WebSocket heartbeat and explicit incoming-command replies. Commands
preserve remote queue occurrence identifiers/revision/acknowledgement metadata.
Single-dispatch private HTTP avoids the pinned helper's internal HTTP 429 replay;
streamed response sizes are bounded and uncertain mutation failures stay uncertain.

A native registry serializes connection ownership through cleanup, increases
handles across replacements, bounds event batches and fences retired callers.
JNI start/poll/refresh/reply/cancel/finish exports compile and pass actual host JNI
checks. Android's declaration exists, but no React Native module/service or
application composition uses it yet. Playback-ready configuration is rejected
at the production bridge until local audio command handling exists. Existing
login and selected audio engine are unchanged.

Dedicated native cases: wire 11, device 4, actor 9, socket 4, HTTP classification
3, registry 5, bridge parsing 7 and transport lifecycle 2. The complete Rust suite passed 84 cases;
host JNI smoke passed including the new exports. After tightening finish to retain
unread final events, the registry's five cases passed again. npm run
test:spotify-probes passed 21, including five new Connect IPC/privacy cases.
cargo check --locked --manifest-path native/librespot-session/Cargo.toml
--examples passed. Android ARM64 API 24 native release build passed with the 16 KB linker configuration;
this is a native library build, not an assembled or installed APK.
Detailed test mapping and known limits: native/librespot-session/CONNECT_TRANSPORT.md.

The observer probe in unified exec 51610 was canceled with Ctrl-C after the run
hit its execution usage limit. Pairing code QAC68N must not be reused. It never
reported approval, registration or playback; no live-device success is claimed.
The goal remains incomplete with status usageLimited; continue the active queue
on the next user continuation. Credentials were not persisted by this probe.
No new APK has been built: build/spotify-jam still contains the prior host-control
APK, SHA-256 0593292022067d5f8cbdf9183e46b3ed0d04d1d96247d6cdfc55fc9733518739.

Next: verify independent registration/fresh events, integrate native ownership
and state projection with Android/app account lifetime, then actual guest
admission/permissions, shared queue, playback, app-led host publication and
background recovery. Propagate Retry-After, add cross-reconnect execution dedupe,
and map native/JavaScript/server clock domains before enabling playback actions.

# Live probe closed after status check — 2026-10-25

The latest passive account-current read returned no Jam. The cause of its
absence was not established. The previously shared test invitation is no longer
usable for this test; use a fresh Jam/invitation for the next guest check.
Unified exec session 92646 was then closed with quit. Its cleanup returned
ended:false because there was no matching test Jam to delete, and the process
exited successfully. No new remote deletion was issued. Diagnostic credentials
and the in-memory cleanup lease are no longer retained by that process.
The earlier ACTIVE TEST CHECKPOINT is historical. Implementation/build status
is unchanged; guest participation and active-host command effects remain open.

# Owned-host playback command chapter — 2026-10-25

Added explicit host Play/Pause/Next/Previous/Seek to the Jam screen and production
runtime. The library serializes/deduplicates commands with membership/enqueue,
requires owned active membership and its host, checks fresh playback before send,
and fences stale account/session/host work. Seek captures/rechecks track identity
and duration. A public API track transition can still race the final seek request;
this does not provide private occurrence addressing or guest permissions.

SpotifyPlaybackCommandStore exposes availability, pending, typed failure and
uncertainty. It rejects malformed seconds, prevents duplicate busy taps, aborts
retired seek preparation, ignores late results and retains uncertain mutation
state across membership refresh. Reconnection retires that fence. The follower
receives subsequent observations; there is no remote-command feedback loop.

New live-probe commands use actual native bootstrap/restore and production
LibrespotLoginSession/SpotifyJamRuntime/regional gateway resolution. Child-process
stdout is private grant IPC consumed in memory, never forwarded to the console.
Only fixed status/summary fields and an explicitly requested invitation are shown.
The runner refuses to create over/end preexisting Jams and checks its own cleanup
lease before ending a test Jam. Read-only catalog stubs are unused by lifecycle
operations; no catalog or playback success is claimed from them.

Live outcome with user-approved browser pairing: login, absent-Jam read,
create, passive present/owned/active refresh, invitation generation and restore
succeeded. The test Jam has one participant and no playback host. Guest invitation
outcome and live playback commands remain pending.

ACTIVE TEST CHECKPOINT: unified exec session 92646 runs the temporary Jam probe.
It is waiting for the user's second-account invitation result. Credentials and
the created-session cleanup lease are only in that process memory. Use status
to inspect, end to remove only its test Jam, then quit to release the session.
Do not claim cleanup until the end receipt succeeds. If the process is gone,
reestablish authentication and inspect membership before changing remote state.

Feature tests: library tests/hosted-playback-commands.test.mjs (19), mobile
tools/spotify-playback-commands.test.cjs (12),
tools/spotify-playback-controls-screen.test.tsx (8), and
tools/spotify-jam-probe.test.cjs (7). Existing device-probe tests (9) cover recovery
and private-field sanitization; example session_probe retains three native tests.
All these authored JavaScript/TypeScript tools are now included in source checks.

Passed: 556 library cases/source checks/strict compilation; 273 mobile Node and
84 UI/platform cases; full app TypeScript; 16 diagnostic Node; three native probe;
39 Rust and actual host JNI; 23 Android JVM cases. Forced release bundle and
:app:testReleaseUnitTest :app:assembleRelease passed. Logs:
/tmp/spotify-host-controls-{library-final,mobile-final,types,probes,native-probe,
native-host,bundle-final,apk-final}.log.

APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk, 34,236,080 bytes;
SHA-256 0593292022067d5f8cbdf9183e46b3ed0d04d1d96247d6cdfc55fc9733518739.
Hermes bundle 2,112,708 bytes; native library stays 4,292,840 bytes and uses the
working paired Login5 exchange. Archive is ARM64; control markers, native byte
match, license assets, signature and 16 KB alignment passed. Metadata/reports are
beside the artifact. No server or player runtime code changed; no new iOS native
login/background/guest transport is claimed.

Next: second-account membership evidence and an active-host command check, then
private guest queue/playback, app-led hosting, background transport and iOS native
login. Leave the active test/cleanup checkpoint visible until resolved.

# Phone sign-in confirmed by user — 2026-10-25

The user reports that sign-in works with the paired Login5 APK delivered in the
previous chapter. Record this as user-confirmed Android sign-in, not an observed
agent device test. Saved-session restore after restart, expiry renewal, private
Jam admission, guest queue propagation and synchronized playback were not
individually confirmed by that report. No runtime code or APK changed here.

# Paired Login5 fix verified against Spotify — 2026-10-25

The approved browser test reproduced Keymaster 403 with both broad and streaming
scopes. Login5 without client-token succeeded, including a separate request with
an Android-style user agent. The production native bootstrap and restore functions
then succeeded with that approved session on Linux. This replaces the prior
Keymaster candidate. No Android hardware is connected; phone behavior still
requires a fresh pairing on the reporting device.

Paired desktop credentials now use a dedicated stored-credential Login5 exchange
without the Android client-token request. Password sessions retain upstream
Login5. Client/device/account binding and native record schemas stay unchanged.
The protocol bounds response/token/expiry and challenge data, handles hashcash
using Librespot's solver, preserves transient/unsupported categories and avoids
cross-client fallback. Transport, clock and solver are injected for unit tests.

The diagnostic runner now resumes pending tickets on bounded transient failures,
respects Retry-After, and never replays consumed approvals. Tokens and reusable
credentials stayed in memory; the interactive process was stopped after testing.
SPOTIFY_AUTH_LIVE_RESEARCH.md contains the live evidence, feature/test mapping,
commands and exact platform limits.

Validation: npm run test:spotify-native passed 39 Rust cases and host JNI smoke;
separate example tests passed three cases, Node probe tests nine cases. Android
:app:testReleaseUnitTest :app:assembleRelease passed, with 23 JVM cases. Existing
public profile calls returned 503/429 and passive current-Jam reads returned 404;
none counts as confirmed Jam admission. No Jam was created or changed.

APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk, 34,224,188 bytes;
SHA-256 e1b67f91a4a7bcd4c703f2a9130f5176a2e5cf016532577b83a2d68128ee752f.
Packaged native library: 4,292,840 bytes, SHA-256
bd74ded44efcf2b576e4257ee4451aa306fe2289cd3858bce9960501b6dde2e8.
Hermes bundle remains 2,100,816 bytes because JavaScript is unchanged. Native
bytes match the Gradle stripped build output. Signature, ARM64 archive, license
assets and 16 KB ZIP/ELF alignment passed. Metadata/checksum/reports are beside
the APK. Logs: /tmp/spotify-login5-{android,native-host-final,apk}.log.

Next: install this APK and perform fresh phone pairing, restart/restore, then
private Jam creation and queue checks. The Linux live result and Android-style
request do not claim actual mobile persistence, Jam admission or playback.

# Live token-exchange reproduction — 2026-10-25

The user approved a desktop-browser pairing for the new local diagnostic runner.
The actual broker and pinned native code established an access-point session on
Linux. Keymaster returned HTTP 403 for both five playback scopes and streaming
alone. Upstream Login5 succeeded with that same session. This disproves the
previous Keymaster route as a fix for the reporting account; the original Android
Login5 failure still needs a separate explanation.

SPOTIFY_AUTH_LIVE_RESEARCH.md records the sanitized results, tool commands,
feature-to-test mapping, credential handling and remaining checks. Added a native
example plus Node browser/probe runner. Three native report/deadline tests and
three Node sanitization/isolation tests passed. A second pairing is awaiting
approval to compare Login5 without client-token. No production runtime source or
APK has changed in this diagnostic chapter. Continue from the live probe before
implementing or rebuilding another candidate fix.

# Pairing native-session follow-up — 2026-10-25

The reporting phone approves Spotify for Desktop pairing inside the Spotify app
and returns manually. That is expected for device authorization. Its previous
error covered both native access-point connection and subsequent token minting,
so the exact rejected request remains unknown.

Desktop-authorized bootstrap/restore now uses Librespot Keymaster token minting;
Android password sessions keep Login5. The removed Login5 path combined a desktop
session identity with a platform Android client-token request. This is a plausible
cause addressed in source, not a confirmed account/server diagnosis. There is no
cross-client credential replay. Native account/credential validation and shutdown,
cancellation and deadlines remain in place.

Pairing and native minting request matching streaming/account/playback scopes.
Pending-device schema 2 requires new approval rather than resuming old
streaming-only tickets. Other secure record schemas remain compatible. Native
connection and token-mint rejections have separate safe fixed UI stages; raw
Spotify errors, addresses, payloads and credentials are never displayed. Mercury
401/402/403 now classify as token rejection, 429 remains backpressure and server
failures remain network errors. Unsupported verification keeps its previous
classification and saved-record recovery behavior. The pairing screen explains
Spotify for Desktop and manual return.

Dedicated mapping: native/librespot-session/tests/token_exchange.rs covers desktop
and password routes, no fallback, permanent stage mapping, unsupported/transient
preservation and structured Mercury statuses. Library tests/device-authorization.test.mjs
covers matching approval scopes, old-ticket migration and bootstrap failure
propagation; tests/librespot-login.test.mjs covers stage retention and permanent
restore/renew cleanup. Mobile tools/spotify-librespot-mobile.test.cjs checks code
propagation; tools/spotify-screen.test.tsx renders both safe stage messages.

Validation passed:
- Library npm test: 537 cases across 23 files, strict compilation/source checks.
- npm run test:spotify: 261 Node service and 76 UI/platform cases.
- Full app TypeScript passed in the diagnostic implementation review.
- npm run test:spotify-native: 26 Rust cases and actual host JNI smoke execution.
- Forced :app:createBundleReleaseJsAndAssets --rerun-tasks, then
  :app:testReleaseUnitTest :app:assembleRelease: 23 JVM cases and release assembly.
- Accountless live pairing initialization accepted all five scopes (HTTP 200,
  expiry 3599 seconds, interval 5 seconds); no account approval was attempted.

APK: build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk, 34,236,404 bytes;
SHA-256 b13249690aa2b9f946bfcc1ff712f8d3d919fa2b9e360850b076fab8ca80ecb5.
Hermes bundle 2,100,816 bytes; packaged native session 4,305,056 bytes. Embedded
manual-return/scope/both diagnostic markers and Keymaster route are present.
Packaged native bytes match Gradle's stripped output. Signature verification,
16 KB ZIP alignment and ELF LOAD alignment passed; archive contains only ARM64.
License assets are retained. Artifact metadata/checksum/verification reports are
beside the APK. Logs: /tmp/spotify-pairing-{library-final,mobile-final,native-host-final,
native-android-final,bundle,apk-final}.log.

No physical-device sign-in succeeded in this session. Next: install this APK,
start a fresh pairing, approve and return manually. If rejected, report the
native-session/native-token stage; then verify restore and private Jam access.
The protocol fix and stage diagnostics do not prove private Jam admission or
synchronized Spotify playback.

# Browser-assisted email-code login — 2026-10-25

The primary Log in with Spotify button now requests device authorization and
opens Spotify's pairing page. The user can use an email code or another login
method available there, approve and return to the app. Pairing code/expiry and
reopen/cancel controls are shown in the app. Password login is secondary and
developer OAuth remains optional. Pairing and emailed login codes are distinct.

The library broker persists the private pending record before browser opening,
waits the server interval, handles pending/slow_down/expiry/denial and sanitizes
failures. UI snapshots include only public code, address and expiry. Pending state
uses StreamingService.SpotifyDeviceAuthorization. in the device Keychain; only
revocation markers enter AsyncStorage. Restoring the Jam screen checks native
credentials first, then pending device authorization, then optional developer
OAuth. Invalid/expired pending state cannot silently select another identity.
Pending approval resumes on opening the Jam screen after restart, without another
request or automatic browser launch. Cold-start navigation to that screen is not
implemented.

After approval, the pending record is consumed before native bootstrap. The
approved access token is not saved. Native bootstrap uses the fixed eligible
desktop client identity, obtains the canonical native session/reusable credential,
and preserves that client/device binding on restoration. Existing platform
password records still restore. Arbitrary client identities and malformed tokens
are rejected before network work. Failure after token consumption requires new
sign-in; unknown token outcomes are not replayed. Native bootstrap uses its
sixty-second network deadline, separately from interactive approval expiry.

Account replacement, cancel, Disconnect and Forget attempt all four namespaces.
Observers and late results are account/lifetime-fenced. Approval and native
bootstrap have separate visible phases; Jam rejection preserves account login.
The installed Spotify client and developer client ID are unnecessary for this
primary path. Native support remains Android ARM64; no new player is compiled.

| Functionality | Dedicated tests |
| --- | --- |
| Start/poll forms, safe verification URLs, encrypted-record acknowledgement, interval/default/slow_down, expiry, denial, resume, consumption, cancellation and observers | Library `tests/device-authorization.test.mjs` |
| Password-free single-use authorization/resume and shared native grant storage | Library `tests/librespot-login.test.mjs` |
| Bootstrap dispatch and browser launch; native missing/cancel/failure boundaries | `tools/spotify-librespot-mobile.test.cjs`, `tools/spotify-librespot-platform.test.ts` |
| Pending selector order and four-namespace forgetting | `tools/spotify-login-providers.test.cjs`, `tools/spotify-secure-platform.test.ts` |
| Public pairing snapshot, account fences, cancel/reopen/restore and no profile HTTP | `tools/spotify-mobile.test.cjs` |
| Primary device action, pairing metadata, approval/native phases, optional password and developer form | `tools/spotify-screen.test.tsx` |
| Native desktop bootstrap/bound restoration, malformed/canceled token and real JNI transport | `native/librespot-session/tests/session_boundaries.rs`, `tools/fixtures/librespot-jni/com/streamingservice/spotify/SpotifyLibrespotNative.java` |

Validation:

- Library npm test: 531 cases across 23 files. Source/strict checks passed.
  Package dry-run: 128 files, nothing published.
- All 29 broker cases also passed against the installed React Native URL
  polyfill, with no production network credentials.
- Mobile test:spotify: 261 Node and 74 Jest cases passed. Full TypeScript passed.
  Player-mobile: 320 passed; player integration: seven passed.
- Native host: nineteen Rust cases and actual host JNI smoke passed, including
  malformed and canceled bootstrap. No authentication network request was used.
- Forced release bundle, native Rust build, Kotlin/JVM compilation and
  :app:testReleaseUnitTest :app:assembleRelease passed using
  -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain. All 23 JVM
  cases passed. Rust uses the existing isolated toolchain and NDK/API24 setup.

The real broker was also used for a live accountless device-authorization request.
Spotify returned valid pairing metadata. The public observer canceled before
browser opening, token polling, or native bootstrap. No account was authenticated,
no email was requested and no private device credential was logged or persisted
outside the in-memory test adapter. This proves initialization only.

Final APK: 34,209,364 bytes (34.21 MB); embedded Hermes
bundle 2,100,320 bytes; ARM64 native session 4,278,512 bytes.
Signature/16 KB archive alignment checks passed. The packaged native library
matches Gradle's stripped output. Broker, pairing-help, password-option and native
module markers are present. Hash and source revisions are beside the APK.

No ADB device is connected. Completed browser approval, native bootstrap,
OS storage and private Jam admission still need the reporting phone. Existing
guest playback and background synchronization limitations remain. See library
LIBRESPOT_AUTH.md and the previous research report for the protocol design.

# Independent Librespot login — 2026-10-25

Implemented the primary username/password login with pinned librespot-core,
without requiring an installed Spotify app or a developer client ID. The screen
clears the password immediately after an explicit press. A native renewable
session is saved under the separate StreamingService.SpotifyLibrespot. Keychain
namespace; passwords/access tokens are not saved. Restore prefers the native
record. Invalid native storage cannot silently switch to another OAuth identity.
Account replacement/Disconnect/Forget attempt all three credential namespaces.

The JNI adapter acquires client/Login5 credentials, connects to an access point,
resolves canonical account identity and returns a renewable credential plus token
expiry. It does not compile or activate a Spotify player. Native sessions shut
down on success/failure/cancellation/deadline. Registered request identities,
bounded work, worker isolation, dispatch compensation and sanitized JNI errors
protect lifecycle. The Rust boundary disables token/panic logging. A sixty-second
deadline bounds work; upstream unsupported code verification remains explicit.

The controller uses native account identity directly rather than /v1/me. Existing
Jam create/join/queue code receives the new provider. A private Jam rejection
preserves successful authentication and is identified as Jam access failure.
The optional developer OAuth path remains available. StreamingServicePlayer is
unchanged. Android's default build now targets ARM64, matching the native binary;
other Android ABIs and an iOS Librespot binary are not included.

| Functionality | Dedicated tests |
| --- | --- |
| Native login/restore dispatch, cancellation, late results and safe failures | `tools/spotify-librespot-mobile.test.cjs`, `tools/spotify-librespot-platform.test.ts` |
| Native-first saved selection, OAuth fallback, no malformed-record downgrade and all-namespace removal | `tools/spotify-login-providers.test.cjs` |
| Canonical native identity with no profile HTTP, account replacement and Jam-rejection preservation | `tools/spotify-mobile.test.cjs` |
| Password entry/clearing, native authorizing, login/verification/Jam messages | `tools/spotify-screen.test.tsx` |
| Separate OS credential service and no plain-storage secrets | `tools/spotify-secure-platform.test.ts` |
| Native schema/type/account/expiry validation, registry capacity/isolation, cancellation, unsupported verification and deadline | `native/librespot-session/tests/session_boundaries.rs` |
| Register-before-dispatch, forwarding, duplicates, scoped cancel/close, dispatch release and native-load failure | `android/app/src/test/java/com/streamingservice/spotify/SpotifyLibrespotRequestRunnerTest.kt` |
| Actual native JNI loading, strings, duplicate/cancel/release/malformed restore | `tools/fixtures/librespot-jni/com/streamingservice/spotify/SpotifyLibrespotNative.java` |
| Library storage/renewal/expiry/account/lifetime contracts | `../StreamingServiceSpotifyJam/tests/librespot-login.test.mjs` |

Validation:

- Library `npm test`: 496 cases across 22 files; source/strict checks passed.
  Package dry-run: 124 files, no publication.
- Mobile `npm run test:spotify`: 249 Node and 66 Jest cases passed.
  `npx tsc --noEmit --pretty false` passed.
- `npm run test:player-mobile`: 320 passed; `npm run test:player-integration`:
  seven passed. The player implementation was not changed.
- `CARGO=/usr/bin/cargo npm run test:spotify-native`: thirteen Rust cases and
  actual host JNI smoke passed without authenticating/network requests.
- Forced `:app:createBundleReleaseJsAndAssets --rerun-tasks`, then
  `:app:testReleaseUnitTest :app:assembleRelease`, passed with
  `-PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain`.
  All 23 JVM tests passed. A final assemble includes the license inventory.
- Android Cargo used the isolated Rust 1.99.1 toolchain, target
  aarch64-linux-android, NDK 27.1.12297006 and the API 24 linker. Both Rust and
  Gradle native outputs use 16 KB load alignment. APK signature and zip alignment
  checks passed. Only ARM64 native libraries are present.

Measured APK: 34,187,748 bytes (34.19 MB), up
4,358,756 bytes from the previous 29,828,992-byte APK.
The packaged native library is 4,276,312 bytes; its hash matches
Gradle's stripped output. The Hermes bundle is 2,080,904 bytes and
contains the new login/native-module/Jam-error markers. Upstream and dependency
license texts are packaged. Hash/details are in SPOTIFY_JAM_APK.md and build metadata.

No ADB device is connected. Live Login5/server admission, physical OS credential
storage and private Jam access remain unverified. Test on the reporting phone:
primary Librespot login, restart/restore, passive Jam refresh, then explicit
create/share/join/queue. Existing guest/shared playback/background limitations
remain open. See the library LIBRESPOT_AUTH.md for architecture and exact commands.


# Callback base mismatch follow-up — 2026-10-24

The user reports automatic return followed by redirect-mismatch. The preceding
combined category did not identify which URI component differed. A root slash
is a candidate only; no actual callback URI was collected.

Browser capture, startup recovery and library code extraction now share callback
base comparison. Only empty and `/` response paths compare equally under the same
custom scheme and nonempty authority. State, duplicate state, credentials,
fragments and nonroot paths remain checked. Network/file and opaque schemes do
not gain root compatibility. The registered redirect in authorization, secure
configuration and token exchange is unchanged.

Specific safe categories now distinguish scheme-mismatch, host-mismatch and
path-mismatch. No callback/code/state value is exposed in those messages.

| Functionality | Dedicated tests |
| --- | --- |
| Root slash event returns in both directions and native initial-intent recovery | `tools/spotify-authorization-recovery.test.cjs` |
| Root callbacks preserve state, duplicate-state, credentials and fragment checks | `tools/spotify-authorization-recovery.test.cjs` |
| Cold root callbacks in both directions, rejecting foreign scheme/host and nonroot paths | `tools/spotify-authorization-recovery.test.cjs` |
| Specific mismatch component displayed beside login | `tools/spotify-screen.test.tsx` |
| Shared comparison and original registered redirect retained during warm/resumed token exchange | Library `tests/authorization-redirect.test.mjs`, `tests/pending-authorization.test.mjs` |

`npm run test:spotify` passed 219 Node and 57 Jest cases, including 30 browser/
startup/navigation cases. `npx tsc --noEmit --pretty false` passed. Source checks
ran during preparation. Library tests passed 454 cases across 21 files. The new
warm-root regression rejects under the preceding library implementation and
passes with current code. Package dry-run reviewed 117 files without publication.

Release checks passed: `./gradlew :app:createBundleReleaseJsAndAssets
--rerun-tasks -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain`,
then `./gradlew :app:testReleaseUnitTest :app:assembleRelease
-PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain`.
The unchanged native callback-store/proof suites retain all fifteen passing
cases. APK signature, only-ARM64 native libraries, Hermes header and new shared
comparison/scheme/host/path diagnostic markers were verified. No ADB device is
connected. The artifact hash is in SPOTIFY_JAM_APK.md and the build folder.

The phone's exact mismatch remains unobserved; no live login success is claimed.
Retry the rebuilt APK and report only the safe return category if failure remains.


# Automatic Spotify callback retention — 2026-10-24

The user confirmed Spotify returns to the app automatically, yet the login phase
reports browser cancellation. That rules out manually abandoning the browser;
it does not establish the exact callback shape or native event ordering.

Reproduced a concrete adapter failure: the grace deadline could reject login
while a native callback probe was still pending. The regression
`A matching native callback probe completing after the grace deadline still
finishes authorization` fails against the preceding browser implementation and
passes after the change. The final cancellation decision now waits for a fresh
native read. Account cancellation still retires capture; late reads cannot log in.

MainActivity captures callback data before React Native forwarding on both
creation and new intents. SpotifyAuthorizationReturnStore retains the newest
expected scheme/host return in process memory, independently of intent action or
ReactContext availability. It has a ten-minute monotonic lifetime and a 16,384
character limit. Multiple readers do not consume it. No callback/code is written
to disk or logs. A new browser authorization waits for explicit native clearing;
canceling preparation cannot open a browser afterward. Both cold startup and the
warm browser adapter prefer this buffer and fall back to Linking when empty.
The JavaScript/library layer still requires exact redirect/state validation.

Safe return diagnostics distinguish no return, unreadable address, wrong redirect,
missing/duplicate/wrong state and unsafe components. The displayed category
contains no callback, state, code or token. A received event's rejection category
cannot be overwritten by an older initial intent. These diagnostics preserve the
failed phase and survive screen remounts. They are scoped to browser failures.

| Functionality | Dedicated tests |
| --- | --- |
| Pending probe at grace deadline; final-probe cancellation; preparation cancellation; return classification and event priority | `tools/spotify-authorization-recovery.test.cjs` |
| Native-buffer precedence, startup reads and acknowledged clearing before browser opening | `tools/spotify-login-platform.test.ts` |
| Controller retains the return category and failed phase | `tools/spotify-mobile.test.cjs` |
| Screen renders safe category beside login without automatic error-clearing restore | `tools/spotify-screen.test.tsx` |
| Pre-JavaScript capture, nonconsuming readers, replacement, unrelated intents, diagnostic shape retention, limits, expiry, clock rollback and clearing | `android/app/src/test/java/com/streamingservice/spotify/SpotifyAuthorizationReturnStoreTest.kt` |

Validation: `npm run test:spotify` passed 214 Node and 54 Jest cases, including
25 browser/startup/navigation cases. `npx tsc --noEmit --pretty false` passed.
Source checks ran through `prepare:spotify`. Player integration's seven checks
passed; the player implementation was not changed. The old-code reproduction
uses a transient isolated module, never a production source modification.

Release validation: forced `:app:createBundleReleaseJsAndAssets --rerun-tasks`
and `:app:testReleaseUnitTest :app:assembleRelease`, both with
`-PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain`, passed.
All twelve native callback-store and three proof-key JVM tests passed.
APK signature verification passed, with only ARM64 libraries and a Hermes bundle
containing the native-callback, safe-diagnostic and existing player markers.
No ADB device is connected; no physical browser return or live login was measured.

The exact physical failure remains unobserved. Retry this chapter's APK; report
only the displayed return status if login still fails. Live OAuth, physical
Android callback delivery and private Jam admission remain separate checks.

# Android Spotify login return recovery — 2026-10-24

Implemented owned callback capture before Android custom-tab launch, bounded
intent fallback after dismissal and MainActivity current-intent replacement.
The library securely persists pending PKCE proof before browser opening. Startup
can resume after app recreation and waits for application-account restoration;
a navigation coordinator opens the Jam screen once. Pending proof uses a separate
device-only Keychain service from the saved refresh grant. Account logout/forget
attempt both removals. No code, callback URL or token is written to plain storage.

Public login now verifies the profile without private service discovery. Login
phase and failure stay visible beside the action; screen remounts do not erase
them by automatically restoring an empty record. Native browser details are
sanitized. iOS retains its native authentication-session browser path.

Feature mapping: `tools/spotify-authorization-recovery.test.cjs` covers callback
races, initial intents, state rejection, cancellation, cleanup, cold app-account
and saved-restore ordering, duplicate suppression and navigation readiness.
`tools/spotify-login-platform.test.ts` covers actual platform composition for
Android custom tabs/events/initial intent and iOS openAuth. Controller/public
profile regressions are in `tools/spotify-mobile.test.cjs`; screen/error and
separate secure storage regressions are in `tools/spotify-screen.test.tsx` and
`tools/spotify-secure-platform.test.ts`. Library pending cases are in
`../StreamingServiceSpotifyJam/tests/pending-authorization.test.mjs`.

Review found gaps consistent with the reported silent return; the exact phone
branch was not captured. Live OAuth, physical callback delivery after process
recreation, OS storage behavior and private Jam admission remain unverified.
Retry the replacement APK with the same registered client ID. If it fails,
record only the displayed phase and error, without callback URLs or credentials.

Validation for this chapter:

- Library `npm test`: 444 passed, including 32 pending authorization cases.
  `npm run check` passed; package dry-run reviewed 115 files, with no publication.
- Mobile `npm run test:spotify`: 208 Node and 50 Jest cases passed.
  `npx tsc --noEmit --pretty false` passed after making the new platform test a
  TypeScript module; focused strict Spotify compilation also passed.
- `npm run test:player-mobile`: 320 passed. `npm run test:player-integration`:
  seven passed. Player implementation was not changed by this chapter.
- `./gradlew :app:createBundleReleaseJsAndAssets --rerun-tasks
  -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain` passed.
- `./gradlew :app:testReleaseUnitTest :app:assembleRelease
  -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain` passed,
  including all three native proof-key tests and MainActivity compilation.
- APK signature verification passed. Archive contains only ARM64 native libraries
  and a Hermes bundle with the recovery/progress and shared-player markers.
  No ADB device is connected; installation and real browser return are untested.

# Foreground host playback follower — 2026-10-24

The Jam screen now offers Replace queue and follow Spotify with explicit country
selection. It polls the hosting Spotify account's actual active Jam device,
translates the playing track to a local recording and follows through the real
synchronization core and native player adapter. This is approximate foreground
host following. The source has no authoritative Jam occurrence IDs or buffering
feed; its execution IDs are local fences. No private guest playback is enabled.

The adapter prepares one local item paused, samples readiness/position, applies
current targets with drift correction and protects engine/authentication/lease
identity after asynchronous work. Native time is never subtracted from JS time.
Playback renewal has a native watchdog independent of JS observers. Expired
leases can be reclaimed after JS restart, while an active lease is preserved.

Stop, account/connection/Jam/host replacement and backgrounding retire work.
Stop remains visibly pending until native acknowledgement. Local pause exits
following. Use Spotify for remote playback controls; remote shared controls and
continuous background following remain unfinished. Normal recommendation
continuation is suppressed while native external authority owns playback.

New dedicated suites: tools/spotify-shared-playback.test.cjs (real controller,
synchronization core and adapter with injected native/network boundaries) and
tools/spotify-shared-screen.test.tsx. Existing player-runtime.test.cjs contains
the continuation regression. Library/player protocol, timing and native feature
mappings are in their owning repositories. Final checks and APK metadata follow.

No developer client ID, second controlled Spotify client, physical device or
working desktop debugging endpoint was available. No live OAuth/private admission,
actual OS storage, shared guest propagation or audible timing result is claimed.
The user has authorized implementation; those evidence/deployment inputs remain
missing. Server configuration edits remain untouched.

Validation: `npm run test:spotify` passed 181 Node cases and 42 rendered-screen
cases; its script now prepares both local libraries. Full app
`./node_modules/.bin/tsc --noEmit --pretty false` passed. Existing
`npm run test:player-integration` passed seven cases and
`npm run test:player-mobile` passed 320 cases, including the new continuation
regression. Library tests passed 412 cases. Player tests passed 387 TypeScript,
257 Android JVM and 293 Swift host cases; Apple SDK compilation passed. Full
native Android packaging/signature evidence is recorded below. No source or
native test result is promoted to a device/alignment claim.

Review regressions cover failed cleanup followed by an explicit retry (active
leases remain protected; expired leases can be reclaimed), reentrant start during
Stopping and disposal during retirement. Cleanup errors are surfaced to the caller
while the sequencing barrier drains so a later explicit retry can proceed. Intent
tokens prevent an outer start from overwriting a newer subscriber action.

Final Android packaging: forced `:app:createBundleReleaseJsAndAssets --rerun-tasks`
passed, followed by `:app:testReleaseUnitTest :app:assembleRelease
-PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain` (612 tasks).
All three app proof-key unit tests passed. Signature verification passed with the
existing debug certificate. The copied ARM64 APK is 29,805,416 bytes;
its embedded Hermes bundle is 2,038,584 bytes. Archive
checks confirmed the new UI and native authority markers. SHA-256:
`1dfbcccb8e1523df2656d549cc6c0eca8009e1ff98eac49e8d6ab1a903c9ab93`.
Artifact/checksum/signing/archive evidence remains in ignored build/spotify-jam/.
No phone was connected; no installation, audible alignment or device lifecycle
result is claimed. Three subagents supplied native/lifecycle review and REA
follow-up. Sanitized private-protocol findings remain outside the package at
spotify-jam-research/GUEST_PROTOCOL_FOLLOWUP_2026-10-24.md.

# Secure saved login and iOS boundary — 2026-10-23

Saved refresh credentials now use pinned react-native-keychain 10.0.0. Android
selects AES-GCM Keystore and iOS uses device-only, noncloud Keychain options.
Nonsecret revocation markers prevent automatic restore after a failed physical
removal; no Spotify credential is placed in AsyncStorage. Account-scoped storage
leases serialize older saves, forget and replacement login. Opening the Jam screen
restores a saved login without browser interaction or a repeated client-ID entry.
Explicit disconnect/forget waits for storage acknowledgement; errors are visible.
App logout removes the old account's grant even if Spotify was never opened.
Cold account restoration and hot reload preserve the appropriate saved grant.

The iOS native proof-key implementation and callback are registered in the actual
Xcode project. Thirteen portable proof-factory tests passed; Swift source checks,
Apple SDK compilation and Objective-C syntax checking against real React Native
headers passed. Full iOS CocoaPods/Hermes linking/device execution is not claimed.

Validation: library npm test passed 342 cases across 16 files, including 28 saved
login cases. Mobile npm run test:spotify passed 145 Node and 37 Jest cases, and
full app TypeScript passed. npm run test:spotify-ios passed 13 host cases plus
Darwin Swift/Objective-C checks. The npm install audit reported zero known
vulnerabilities; only react-native-keychain and its lockfile entry were added.
Android release build, signing and final artifact results are recorded below.

New dedicated files are library tests/saved-login.test.mjs, mobile
tools/spotify-secure-storage.test.cjs and tools/spotify-secure-platform.test.ts,
with saved-login lifecycle cases in the existing controller/screen suites.
Native tests are tools/spotify-ios-proof-tests.swift and the existing Android
SpotifyProofKeyFactoryTest. No actual Keychain/Keystore/device login was exercised.

All work remains local. Private guest queue commands, fresh cross-account
playback, native follower authority and background shared-playback transport are
unfinished. A registered OAuth client, two controlled clients and an enabled
desktop debugging endpoint are the required next protocol evidence. Earlier
source/probe results are not promoted to verified admission or synchronized audio.

Final packaging: forced `:app:createBundleReleaseJsAndAssets --rerun-tasks`
passed, followed by `:app:testReleaseUnitTest :app:assembleRelease
-PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain` (612 tasks).
All three Android proof-key unit cases passed. The packaged native modules include
react-native-keychain. `apksigner verify --verbose --print-certs` passed with the
existing debug certificate. The copied ARM64 APK is 29,767,576 bytes;
its embedded Hermes bundle is 2,000,744 bytes. SHA-256:
`998e22d0bee0fb4c5b0bc07d8f3efebdf139ed9a11b706ca7df5da06468cc7fb`.
Artifact, checksum, archive summary and signing report are under ignored
`build/spotify-jam/`. `adb devices` reported no attached device, so no install,
OS storage execution or audible playback result is claimed.

Repeatable checks: `npm run test:spotify`,
`./node_modules/.bin/tsc --noEmit --pretty false`, and
`npm run test:spotify-ios`. Library `npm test` includes architecture checks and
strict compilation. Library `npm pack --dry-run --json --cache
/tmp/spotify-jam-npm-cache` reviewed 99 files, including secure-login contracts,
compiled output and documentation; no package was published.

# Browser login and host queue chapter — 2026-10-23

Implemented library-owned PKCE login with secure Android proof generation,
existing browser authorization sessions, official profile verification and
in-memory renewal. The screen now takes the public client ID and opens Spotify;
it does not require a pasted token. Registered callback:
`streamingservicespotify://callback`. No real developer client ID was supplied,
so live OAuth login/private Jam access remains unverified.

Added guarded host queue submission for Spotify track links/URIs/IDs. It uses the
Jam's actual host identity, rejects missing hosts/guests and preserves uncertainty
without automatic retries. Starting playback in Spotify and refreshing is required
when creation returns no host. No shared queue observation or synchronized audio
is claimed. Experimental join remains available for later controlled validation.

Validation: `npm run test:spotify` passed 87 Node and 15 screen cases;
`./node_modules/.bin/tsc --noEmit` passed. Library suite passed 214 cases across
12 files. Android `:app:testReleaseUnitTest` passed three proof-key cases.
Feature mapping and setup details are in SPOTIFY_JAM_APK.md. No phone was attached.

Final Android `:app:testReleaseUnitTest :app:assembleRelease` passed. APK signature
verification passed using the existing debug certificate. The copied ARM64 APK
is 29,159,665 bytes and contains a 1,940,156-byte Hermes bundle. SHA-256:
`85e8b6fcee4b04d3d0aaca09414f89e36050d218a11c4546dfdf7d69a1e973ab`.
Archive, signing and checksum evidence are beside the ignored build artifact.
Review fixes have dedicated tests for browser close exceptions, queue command
results under subscriber reentrancy and receipt removal after Jam replacement.

Next: configure a real Spotify developer client ID and accepted callback; verify
browser login, passive private membership, owned create/share and host queue on a
physical phone; then use a second controlled account to test join/leave and shared
queue propagation. OAuth credentials are not assumed to authorize private Jam.

# Spotify library integration

## Native catalog search and background resolver integration — 2026-10-30

Implemented a bounded authenticated public Spotify track-search request in the
native Connect session. Inputs are quoted and escaped, use the account country,
and cannot redirect the fixed request to another host or path. Response decoding
preserves Spotify's returned track identity, relinking identity, artist credits,
duration, recording code and explicit playability without substituting another
track. Rejected safe reads may renew the native token once; mutations remain
single-dispatch. The probe protocol now exposes this typed search operation.

Integrated the background recording task with the native broker through the
React Native headless-task registry. The task claims exact pending work, restores
the app account, queries the authenticated recording catalog, synchronizes the
player token and returns only a bounded match result. Native request/account/Jam/
host/generation fences remain authoritative. The app's foreground-stop behavior
is still enabled; a headless task being registered does not prove continuous
background following or remove lifecycle safety stops.

The old live native probe is not registered: no probe process or control socket
was present, and `adb devices -l` reported no attached device. The current-session
catalog search therefore could not be exercised without a live approved session.
No credentials or account/song details were read or emitted. Desktop Spotify
processes were left untouched. Cross-account permission, guest shared queue,
actual synchronized audio, automatic reconnect recovery and app-led host
activation/publication remain unverified.

Source validation on 2026-10-30: native Rust `connect_search`, `connect_activation`,
`connect_actor` and `connect_authentication` suites passed (67 cases); focused
Android JVM coverage passed (108 cases); `npm run test:spotify` passed 364 Node
and 92 Jest cases; strict TypeScript checking and the Android Metro bundle passed.
All 19 dedicated background resolver cases passed. One overlapping-retirement
race was fixed by sharing the current cleanup barrier and its regression test
passes. These are source tests, not native phone verification. The release APK
was packaged and its signature/16 KB alignment verified; live-session search and
full end-to-end/device acceptance remain open. See SPOTIFY_JAM_APK.md.

## Mobile personal-test chapter — 2026-10-22

The user authorized a mobile implementation and installable APK. The Profile page
now opens Spotify Jam. Implemented temporary-token connection, verified private
profile lookup, passive initial/account refresh, device selection, create/share,
experimental join/leave, host end confirmation and typed failure handling.
Short Spotify share links resolve through a credential-free public page reader.
The end dialog is fenced against a replaced Jam; initial membership must be read
before changes are allowed. Device API failures do not block Jam creation.

Applied the project skill throughout. The collaborating agent implemented and
tested library membership/current-account operations, verified the passive
endpoint and share-link format, and reviewed mobile ownership/confirmation flows.
No player engine, audio synchronization or server code changed in this chapter.

Validation: `npm run test:spotify` passed 65 Node cases and 11 rendered-screen
cases; full app TypeScript passed. Library source checks/build and 162 cases
passed. Seven workspace player checks and 319 player-mobile cases passed.
The live production controller/gateway/library cycle created/refreshed/ended an
owned Jam and confirmed absence on a Node host; this is not Android execution.
Private profile/current-session probes and two public share-link samples passed.
All temporary Jams were removed. Public profile/device discovery returned 429.

The ARM64 release APK is packaged with embedded Hermes output and the existing
test signing key. Final artifact, checksum and install instructions are in
`SPOTIFY_JAM_APK.md` and `build/spotify-jam/`. No attached Android device was
available for installation or audible testing. Join/leave remain unverified
against a second account; playback synchronization and browser sign-in remain
unfinished. No user credential is included in the package.

Next: install and exercise this APK on a controlled phone, supply a second
controlled Spotify account for guest tests, then implement the protocol and player
bridge gates described in the library's PLAYBACK_SYNC_PLAN.md. Keep tokens out of
persisted evidence; changes are committed only in their owning repositories.

## Earlier integration checkpoint

Implemented on 2026-10-21 under the workspace streaming-service-quality rules.

The mobile app links the sibling `StreamingServiceSpotifyJam` package through
`file:../StreamingServiceSpotifyJam`. `prepare:spotify` builds it before the app's
Android/iOS/start scripts; Metro watches its repository and resolves shared React
from the mobile installation. No native dependency or player backend changed.

The startup import composes `spotifyIntegration`, an application-account owner.
Its `connect` method accepts the library's explicitly supplied Spotify credential,
endpoint, recording catalog, mapping store, network, and clock dependencies.
Application identity and Spotify identity are separate. Logout/account changes,
connection replacement, disposal and hot reload retire old work. No account is
connected and no Jam is created automatically.

An optional device-selection provider supplies the actual Spotify device and
unique request identifiers. AppState foreground transitions then perform one
passive refresh. There is no creation polling, native background connection, or
implemented Spotify login screen. Selector/device-provider failures do not
escape the foreground callback. Local audio and reporting remain independent.

Validation:

- `npm run test:spotify`: passed focused strict compilation and 12 cases covering
  package/Metro linking, application ownership, logout/account changes,
  replacement/disposal, stale catalog completion and foreground behavior.
- `./node_modules/.bin/tsc --noEmit --pretty false`: passed full app checking.
- `npm run test:player-integration`: seven existing workspace checks passed.
- Production JavaScript bundles for Android and iOS passed, including the startup
  composition import. These are not APK/IPA or physical-device results.

The library's 116 deterministic cases and the server's 12 catalog cases passed
separately. Live private session operations worked with desktop-session
credentials; standalone mobile credential acquisition, guest joining, push
updates, and real-device foreground/transport behavior remain open. A Spotify
catalog probe returned HTTP 429. See the library PROGRESS.md and VALIDATION.md.

## App recording selection — 2026-10-23

The shared song context menu now includes Add to Spotify Jam. It carries copied,
bounded ID/title/author records and the originating StreamingService account.
After login, choose a country and app recording, inspect Spotify candidates, then
explicitly select the matching recording. Matching never starts audio or queues
implicitly. Different versions, conflicting recording codes and unavailable
candidates are blocked. A changed country requires matching again.

The library runtime owns the recording selection coordinator; a mobile store
switches it with the connection. App-account replacement, changed Jam/host and
disposal clear stale selections and subscriptions. Before dispatch, cancellation
prevents confirmation/enqueue. After a queue write starts, the workflow keeps it
pending until its real receipt to prevent cancellation from implying rollback.

Validation: npm run test:spotify passed 99 Node and 24 rendered-screen cases;
full app TypeScript passed. Library npm test passed 235 cases, including 21
new recording workflow cases. Dedicated new suites are tools/spotify-recording-
queue.test.cjs and tools/spotify-recording-screen.test.tsx. The existing manual
Spotify-reference queue flow remains available. APK regeneration is deferred
until the remaining authorized chapters are integrated; the previous APK does
not include these source changes yet. No physical/catalog/queue claim is made.

Remaining authorized work continues in the library DEVELOPMENT_SEQUENCE.md:
host/shared observation, guest routing, membership recovery, playback authority,
secure login storage and platform lifecycle. Private-auth and cross-account live
gates remain unresolved; the user has authorized development, not fabricated
protocol success.

## Host queue observation — 2026-10-23

Added a focused-screen queue view backed by the library host observer. It retains
repeated tracks and episode positions and labels stale results. The public queue
response has no stable Jam occurrence IDs or revisions; the UI does not invent
those identities or settle uncertain writes from track counts.

The mobile queue store counts observing views and switches subscriptions when
the runtime changes. Blur closes observation. Background suspends reads, and
foreground activation waits for successful passive membership reconciliation.
Manual membership recovery can re-enable observation only for the current ready
foreground runtime. The extra OAuth read-currently-playing scope is requested.

Validation: npm run test:spotify passed 113 Node and 29 rendered-screen cases;
full app TypeScript passed. Dedicated suites are tools/spotify-hosted-queue.test.cjs
and tools/spotify-hosted-screen.test.tsx, with foreground/manual-recovery cases in
the existing integration/controller suites. Host wire, polling, timing and
cancellation cases belong to the library's hosted-queue-observation suite.
No native code changed; a final APK rebuild remains pending later chapters.

This is host-account observation, not a verified guest shared queue transport.
No new public/private Spotify request was made from the mobile implementation.
Private authentication/fresh guest routing still require usable credentials and
protocol evidence. Continue the authorized membership recovery, playback,
secure storage and platform chapters; do not mark those finished from these tests.

Host observation review also fixed a reentrant observer replacement and opted the
mobile foreground path into account-current membership reads even when a device
is selected. This prevents a stale device choice from clearing the actual account
Jam. Both have dedicated regressions. Library validation passed 276 cases,
including 41 host-observation cases. No live queue read is claimed.


## Membership observation and recovery — 2026-10-23

Added focused membership observation, participant refresh controls and stale-state
labels. The connection owner resumes through the membership observer and shares
its pending read with foreground recovery. A successful observed refresh can
recover host queue observation after a failure. Background, blur, account
replacement and disposal retire callbacks and leases. Retired foreground errors
cannot report failures into a new lifecycle. Shared view-store mechanics serve
both queue and membership projections without duplicating subscription policy.

Validation: npm run test:spotify passed 120 Node and 32 rendered-screen cases;
full application TypeScript passed. Library npm test passed 314 cases across
15 files, including 38 dedicated membership/passive-cancellation cases. Dedicated
mobile membership suites are tools/spotify-membership-mobile.test.cjs and
tools/spotify-membership-screen.test.tsx; integration regressions cover coalesced
foreground reads, failure/recovery and stale callbacks. These are host tests;
no guest admission or native/background transport success is claimed.

Source changes still need the final APK rebuild after the remaining authorized
chapters. Private guest routing and fresh cross-account playback are blocked on
protocol evidence/credentials, not declared implemented by membership polling.
Continue secure login persistence and iOS login boundaries while preserving that
explicit gate. Do not wire the normal local player as a synchronized follower
without native authority and a verified fresh playback source.

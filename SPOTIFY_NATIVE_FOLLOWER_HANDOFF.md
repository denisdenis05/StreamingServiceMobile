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

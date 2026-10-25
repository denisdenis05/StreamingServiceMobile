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

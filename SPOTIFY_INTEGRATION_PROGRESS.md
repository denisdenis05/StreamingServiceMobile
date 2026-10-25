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

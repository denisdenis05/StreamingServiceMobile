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

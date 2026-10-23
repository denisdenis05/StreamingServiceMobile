# Spotify Jam personal-test APK

Updated 2026-10-23 under the workspace streaming-service-quality skill.
The Android flow is browser login, passive membership read, create/share or
experimental join, and an explicit host queue request. Live OAuth access to the
private Jam endpoints remains unverified. Shared audio playback is not implemented.

## Install and setup

The ARM64 APK is `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`, with
its SHA-256 and archive summary beside it. It requires Android 7.0/API 24 or newer,
contains the production Hermes bundle and runs without Metro. The release variant
uses the project's existing debug signing configuration for personal testing.

1. Register a Spotify developer application. Add the exact callback
   `streamingservicespotify://callback` in its redirect allowlist.
2. Install the APK, sign into StreamingService, then open Profile → Spotify Jam.
3. Enter the public Spotify client ID and press Log in with Spotify. The app opens
   Spotify's authorization page. No client secret or pasted access token is used.
4. After authorization, the library exchanges the code and verifies the account.
   The app reads current Jam membership before allowing changes. Refresh when a
   failed passive read prevents mutations.
5. Press Create Jam, then Share invitation. Others can open the invitation in
   Spotify. Existing guest membership must be left before creating a hosted Jam.
6. Start playback on the intended Spotify host device and refresh the Jam. A Jam
   created without a host device cannot accept a queue request from this app.
7. Paste a Spotify track link, URI or 22-character ID and press Add to host queue.
   Premium and approved playback permissions are required. The confirmation means
   Spotify accepted the request; another participant's queue has not been observed.
8. Hosts can end the Jam after confirmation. Disconnecting retires this app's
   credentials without ending or leaving the remote Jam.

No registered Spotify client ID was provided during implementation. The setup
above has not completed a real browser login here. Spotify may reject the custom
callback registration or private Jam calls from third-party OAuth credentials;
those are explicit live-validation gates, not solved by successful unit tests.
See library `LOGIN.md` for Spotify protocol references and injected boundaries.

The screen also offers experimental invitation-based joining and guest leave.
Supported invitations include full `open.spotify.com` links,
`spotify:socialsession` URIs, raw join tokens and observed
`spotify.link`/`spotify.app.link` shares. Remote membership requires an actual
selected Spotify device. Guest admission and shared listening remain unverified.

## Credentials and account lifecycle

`SpotifyLoginSession` in StreamingServiceSpotifyJam owns PKCE authorization,
state/callback checks, token exchange and refresh renewal. Android supplies secure
entropy and SHA-256; the existing browser package supplies the authorization
session. Official `/v1/me` verifies browser-login credentials. Regional service
origins are resolved publicly without a bearer header, then validated.

Credentials remain in memory and refresh during the current app lifetime.
Disconnect, app-account change, hot reload or restart retires them. No desktop
credential relay or persistent login storage is included. iOS has no proof-key
boundary in this chapter and reports Unsupported.

The older temporary-token controller API remains for deterministic tests and
controlled protocol research; it is no longer the mobile screen's login flow.
Its private profile adapter does not establish browser OAuth compatibility.
Deep-link logging was removed so authorization callbacks are not printed.

Snapshots exclude tokens and invitation values. Share accesses the invitation
explicitly. Account changes reject stale completions and retired providers.
The end dialog rechecks the displayed Jam before submission. Queue command
results are independent of later subscriber state, and their confirmation is
scoped to the current immutable Jam snapshot.

## Queue and invitation limits

Queue requests use the documented Web API and the current Jam's actual
`hostActiveDeviceId`. No arbitrary selected device is substituted. Guest queue
submission, queue observation and private queue routing are not implemented.
The existing library matcher can translate a local recording first; this screen
accepts an already selected Spotify track. See library `HOSTED_QUEUE.md`.

A queue request is never automatically retried. Unknown queue outcomes retain a
write fence even after membership refresh. Inspect Spotify's actual queue, then
reconnect before a new intent; do not blindly repeat the uncertain item.

Public short-link fetching sends no bearer credentials/cookies, validates initial
and final hosts and extracts a unique strict Jam token without executing HTML.
Intermediate redirect hosts are not independently constrained. Response size is
an acceptance bound after reading, not a streaming allocation limit.

## Feature tests and validation

| Behavior | Dedicated tests |
| --- | --- |
| App-account ownership, foreground refresh, retirement | `tools/spotify-integration.test.cjs` |
| Login providers, official/private profiles, stale accounts, host queue input and command-result reentrancy | `tools/spotify-mobile.test.cjs` |
| Browser success, unavailable transport, cancellation and native-close failure | `tools/spotify-login-mobile.test.cjs` |
| Login submission, create/join/end/share controls, host queue guards and stale receipt regression | `tools/spotify-screen.test.tsx` |
| Entropy, SHA-256 challenge and attempt independence | `android/app/src/test/java/com/streamingservice/spotify/SpotifyProofKeyFactoryTest.kt` |
| PKCE exchange/refresh/cancellation and hosted queue lifecycle | Library `tests/spotify-login.test.mjs`, `tests/hosted-queue.test.mjs`, `tests/network.test.mjs` |

`npm run test:spotify` passed strict focused compilation, 87 Node cases and 15
rendered screen cases. Full application TypeScript checking passed. Library tests
passed 214 cases across twelve files. Android proof-key tests passed all three
cases. Source checks and whitespace checks passed.

The previous chapter's seven player integration checks and 319 player-mobile
cases passed; the player was not changed for this chapter. Native build/signature
and archive details are recorded beside the APK and in progress notes. The final `:app:testReleaseUnitTest :app:assembleRelease` build and
`apksigner verify` passed. The artifact is 29,159,665 bytes with a 1,940,156-byte
Hermes bundle. No Android device was connected for installation, login or playback
testing.

Build and run Android unit tests with:

```bash
npm run prepare:spotify
cd android
./gradlew :app:testReleaseUnitTest :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon -Pkotlin.compiler.execution.strategy=in-process
```

Earlier controlled Node/desktop-credential probes verified create/refresh/end and
short-invitation parsing; they do not prove independent Android login. A later
host-field probe confirmed an owned active Jam may have an empty host identifier,
then cleaned it up without changing playback or the queue. Public API probes
previously returned 429. No live queue mutation, second-account admission, shared
queue propagation or audio synchronization is claimed.

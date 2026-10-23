# Spotify Jam personal-test app

Updated 2026-10-23. The source implements Spotify browser login, secure saved-login
restoration, Jam creation/sharing, experimental joining, app-song matching, host
queue requests, host queue observation and foreground membership recovery.
Playing audio together through the local player is not implemented.

## Install and setup

The ARM64 APK is `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk` with
its checksum, signing report and archive summary beside it. Android 7.0/API 24
or newer is required. It contains the release Hermes bundle and runs without
Metro, using the project's existing debug signing configuration for testing.

1. Register a Spotify developer application and the exact callback
   `streamingservicespotify://callback`.
2. Install the APK, sign into StreamingService and open Profile → Spotify Jam.
3. On first use, enter the public Spotify client ID and press Log in with Spotify.
   Spotify's browser page handles sign-in. No client secret or pasted token is used.
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

Private guest command routing, a fresh cross-account playback stream and a native
external-authority follower remain unimplemented protocol/development gates.
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
npm run prepare:spotify
cd android
./gradlew :app:testReleaseUnitTest :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon -Pkotlin.compiler.execution.strategy=in-process
```

Run `npm run test:spotify` for mobile behavior/type checks,
`npm run test:spotify-ios` for the iOS boundary checks, and `npm test` in the
Spotify library for its dedicated suites. The source feature-to-test map is in
the library FEATURES.md and the mobile chapter progress notes.

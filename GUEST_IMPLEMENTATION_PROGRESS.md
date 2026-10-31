# Verified native guest following and observation — 2026-10-31

SpotifyConnectModule, Runtime, Owner and NativeExecution expose the existing
native connectMembership read through retained attachment ownership. The store
verifier requires the exact native handle/generation/account/Jam/host and active
membership. Nonowners must appear in the bounded unique participant list.
Reconnect, replacement, cancellation and malformed responses fail closed.
Compatibility implementations without this operation report Unsupported.

The shared playback screen allows an admitted device-sign-in guest to explicitly
request following. The native follower already verifies current membership before
and after each playback read; UI availability is not permission evidence. Removed
guests cannot restart from stale projected admission. Browser guest following stays
unavailable. Shared queue copy describes native verified observation. The owning
session composes guestObservationVerifier and updates nativePlaybackContext in
SpotifyMobileService.ts; this chapter does not own that file.

Feature mapping and checks:

- tools/spotify-connect-store.test.cjs: four dedicated guest cases covering exact
  admission, denial/duplicates/host changes, reconnect retirement and malformed
  JSON. The complete file passed 55 cases.
- tools/spotify-shared-screen.test.tsx: explicit admitted-guest action and removal;
  with tools/spotify-hosted-screen.test.tsx, 11 Jest cases passed.
- SpotifyConnectNativeExecutionTest: new exact handle/generation membership bridge
  case. This suite and SpotifyConnectVerifiedFollowerSourceTest passed using
  ./android/gradlew -p android :app:testDebugUnitTest --tests
  com.streamingservice.spotify.SpotifyConnectNativeExecutionTest --tests
  com.streamingservice.spotify.SpotifyConnectVerifiedFollowerSourceTest
  -x :app:buildSpotifyLibrespot --no-daemon --console=plain.
- npx tsc --project tsconfig.spotify.json and npx tsc --noEmit passed.
- git diff --check passed.

No device access, pairing, process restart or live mutation was attempted.
Guest joining, permission, simultaneous audible timing and Android background
acceptance remain live gates. Native admission verification permits observation;
it does not grant guest queue/playback writes. Guest mutation guards stay closed
until actual permission evidence supports those operations.

Suggested chapter: Connect verified guests to native shared playback and queue reads.

## Application composition

SpotifyMobileService binds guestObservationVerifier only for native Connect.
The extracted captureSpotifyNativeFollowerContext requires an active ready Jam,
actual host, signed-in app account, native registration descriptor and either
ownership or the bound Spotify account in the participant projection. Native
source membership remains the final authority. Seven dedicated tests in
tools/spotify-native-follower-context.test.cjs cover admitted/removed guests,
owner compatibility, browser denial, stale membership, missing app/native
authentication and recovery generation capture.

The integrated Spotify source run passed 503 Node and 106 Jest cases. All Android
JVM tests passed 415 cases; full mobile TypeScript passed. No device or live
guest mutation check was performed. Native observation is not control authority.

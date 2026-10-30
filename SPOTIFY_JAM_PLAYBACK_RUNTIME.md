# Application-owned native Jam following — 2026-10-27

`SpotifyJamPlaybackApplicationRuntime` owns a native follower session independently
of React module lifetime. Its production factory binds the existing Android
player service, reads the actual engine/authentication identity, verifies fresh
native Jam membership/playback, performs the explicitly requested app-account
configuration handoff, and starts `SpotifyNativeFollowerCoordinator`. It composes
the verified source, bounded background recording broker, headless task runner,
actual native metadata source and existing media engine. Native decision/network
executors have bounded queues; idle threads time out. No separate observer
foreground service or new audio engine is created.

`SpotifyJamPlaybackModule` is registered in `SpotifyProofKeyPackage`. Its name is
`SpotifyJamPlayback`. The callable methods are:

- `startFollowing(identifier, serializedConfiguration)` returns a serialized snapshot.
- `stopFollowing()` waits for exact native cleanup and service unbinding.
- `getSnapshot()` returns a serialized snapshot for the current control attachment.
- `updateApplicationAccount(accountIdentifier, accessToken)` accepts restored app
  authentication; null/null retires following, another account retires following,
  and the same account refreshes its exact native player credential.
- `claimRecording`, `isRecordingPending`, `completeRecording`, `failRecording`
  and `synchronizePlayerAuthentication` expose only the broker's exact pending
  recording jobs. The latter receives request identifier, app account and token.

Configuration has exactly `streamingServiceAccountIdentifier`, `baseAddress`,
`accessToken`, `spotifyAccountIdentifier`, `jamSessionIdentifier`,
`hostDeviceIdentifier`, `handle`, `generation`, and two-letter uppercase `market`.
It carries no Spotify grant. HTTPS addresses may retain the existing API path
and trailing slash. Native account identification reads the same JWT `sub` claim
as the app; `exp` must be an exact positive integer. This is identity/revision
parsing, not local signature validation. Older and equal-expiry updates are
ignored, preserving a newer accepted native credential across React contexts.
A refresh received during startup is applied before the actual lease starts.

Snapshots and `SpotifyJamPlaybackChanged` events use serialized JSON strings.
Snapshots contain `identifier`, `nativeHandoff`, account/session/host/handle/
generation fields, `baseAddress`, `market`, `status`, current occurrence and
recording, drift and failure. Status/failure values retain Kotlin enum names,
including `Following`, `Suspended` and `Detached`. Tokens, metadata payloads,
private credentials and grants are absent.

## Ownership and cleanup

A module gets a revocable control attachment. Creating another attachment revokes
the old module's start, stop, authentication and snapshot access. React
invalidation removes that view and leaves following owned by the application.
A matching replacement can adopt the existing session and snapshot without
another service binding or lease. Each actual factory lifetime also has a private
identity guard, so replacing a session with identical public account/Jam/handle
values cannot authorize old source or authentication callbacks.

Recording jobs intentionally survive control-attachment replacement. Their broker
checks the exact pending request and native account/Jam/host/handle/generation;
retirement removes jobs before late task results can apply. Module detachment
does not turn a stale job into a current one.

A startup promise waits for a verified fresh source and an actual owned player
lease. Starting the core's timer loop alone does not acknowledge handoff. The
native session first verifies a source before resetting player authentication,
then the core obtains another source before acquisition. `nativeHandoff` becomes
true only after the real session acknowledgement. Local safety suspension or a
terminal failure makes it false. A suspended session can be adopted for display;
adoption never reclaims it. Explicit stop followed by start is required to resume.
Startup times out and unbinds if verified ownership cannot be established.

Explicit Connect close, shutdown/logout and account replacement invoke follower
retirement and native access-point cleanup together. Completion waits for both
barriers. React detach invokes neither retirement. Application-owned
`ownsNativeConnection` gives the concrete source a lock-free exact account/handle
check; each JNI source read still validates the actual generation. A detachable
`observeNativeConnection` hook forwards validated batches independently of React
for later reconnect composition. Automatic verified same-Jam generation recovery
is not implemented by this chapter; a generation mismatch fails safely.

Native session stop, runtime retirement and the player's close operation retain
their first cleanup future. A repeated request cannot turn a failed cleanup into
a successful grant-erasure acknowledgement. Cleanup failure remains observable
and blocks a replacement session through that barrier.

## Dedicated verification

`SpotifyJamPlaybackRuntimeTest` covers ownership acknowledgement, safe snapshots,
React adoption, revoked controls, pending-job completion after replacement,
monotonic credential updates, logout and replacement barriers, cached cleanup
failure, suspension, foreign identity, private factory scope and late startup.

`SpotifyJamPlaybackNativeSessionTest` uses the actual
`StreamingPlaybackCoordinator`, `SpotifyPlayerServicePort` and native follower
core. It verifies fresh-source/actual-lease startup ordering, stop during bind
and preflight, timeout, late results, startup token refresh and account retirement.
The typed output/source/binding collaborators are deterministic; this is not an
Android device binder test.

Dedicated additions in `SpotifyConnectRuntimeTest` cover joint AP/follower drain,
replacement waiting, failure propagation and React-independent observation.
`SpotifyPlayerServicePortTest` covers repeated failed close preserving its exact
completion. Existing follower/player tests remain separate.

The focused final command passed Android app/test Kotlin compilation and 88 JVM
cases across these four selected suites:

```text
./StreamingServiceMobile/android/gradlew -p StreamingServiceMobile/android :app:testDebugUnitTest --tests '*SpotifyJamPlayback*Test' --tests '*SpotifyConnectRuntimeTest' --tests '*SpotifyPlayerServicePortTest' -x :app:buildSpotifyLibrespot --console=plain
```

No physical-device binding, audible following, screen-lock lifecycle, process
survival or measured alignment result is claimed. `SpotifyBackgroundRecordingHeadless`
now connects the broker to app-account restore, authenticated recording lookup,
the existing association store and bounded matcher. `index.js` registers the
headless task. AppState still stops the foreground follower; no runtime evidence
authorizes changing that safety behavior. Application-led host publication/
readiness and automatic Dealer generation recovery remain incomplete. The APK
and source validation are recorded in SPOTIFY_JAM_APK.md.

# Native existing-player port — 2026-10-27

`SpotifyPlayerServiceBinding` provides an explicit application-context binding to
`StreamingPlaybackService.PlaybackBinder.playbackService().playbackCoordinator()`.
Its adapter calls the existing coordinator's public API. It does not create an
audio engine, install a progress observer, replace either event listener, or
start a separate foreground service. Binding happens only when a future native
handoff explicitly calls `bind()`. No React module or AppState policy owns this
component. It is not wired into the current follower or Connect runtime.

`SpotifyPlayerServicePort` receives a typed coordinator, main executor and unique
identifier source. Production uses the Android main looper; deterministic JVM
tests use a queued executor and typed coordinator. Calls share one drain task
and a bounded pending queue. Cancellation removes queued work; another guard
before mutation prevents work retired during a snapshot read from dispatching.
Cancellation after dispatch and malformed mutation receipts report unknown
outcome, with no replay. Retirement fences late results. Future completion
callbacks cannot enqueue playback that escapes lease retirement.

## Authentication and authority

The application must supply its current StreamingService identity, account,
server and credential explicitly through `configureAuthentication`. Spotify
credentials never enter this call. An account or server change requires an
explicit reset handoff with no existing authority. That path calls the existing
`clearSession()` before configuration. Same-account, same-server token refresh
is allowed under the exact owned lease and preserves engine/authentication
identity. Another authority cannot be configured over, stolen or recovered just
because its deadline expired.

Acquisition binds the actual engine epoch, authentication epoch, configured
account and a fresh external-authority identifier. Every mutation reads current
native state and sends the existing player operation enum and protocol fields,
including expected queue identifier, queue revision and playback-control
revision. `prepare` replaces the queue with exactly the supplied server recording
and Spotify occurrence, selected paused. It does not resolve an unseen Spotify
track. Playback and seek require that exact occurrence. Seek also rejects an
unseekable output before dispatch.

A failed admitted claim attempts compensation only while its exact epoch and
authority still match. Known rejected claims clear local ownership immediately.
If compensation itself is uncertain, `close()` retains enough private ownership
to attempt exact cleanup. Release first retires queued work, then sends an exact
owned `setExternalAuthority(null)` command. The existing player clears and stops
that authority's queue. Changed epochs/authority and stale lease releases never
mutate a replacement session. Closing rejects new work and waits for its own
cleanup before the binding releases its platform connection.

## Native sampling

`sample` forwards the existing player's sampled monotonic milliseconds unchanged.
The production player clock is Android `SystemClock.elapsedRealtime`; the domain
is explicit in `SpotifyPlayerClockDomain.ElapsedRealtime`. No wall-clock value,
JavaScript timestamp or fabricated projection is substituted. Samples include
actual position, duration, buffering/resolving state, playing, seekability,
interruption, authority suspension and expiry.

The narrow Android `StreamingPlaybackCoordinator.playbackOutputReady()` getter
reads actual output readiness for a current, nonstopped, error-free item. This
allows paused preparation to become ready before a following coordinator asks
for play. The production adapter provides that boolean. A test or future adapter
that omits this optional method produces unknown readiness; paused state alone
never fabricates ready. No JavaScript/Swift snapshot schema changed.

`renew` is separate from `sample` and must be called only by a native follower
coordinator after validating fresh remote state. Sampling never renews the
lease. Suspended and expired authority cannot be renewed or played through this
port. A local user pause therefore remains suspended. This component has no
polling loop, deadline scheduler or autonomous renewal.

## Dedicated tests and validation

| Functionality | Dedicated tests |
| --- | --- |
| Explicit main-executor authentication handoff, account reset, token refresh under exact lease and authority rejection | `SpotifyPlayerServicePortTest.kt` |
| Epoch/account admission, unrelated expired authority, failed/malformed claim compensation, paused one-recording replacement and revision fields | `SpotifyPlayerServicePortTest.kt` |
| Actual elapsed-realtime sample, native paused readiness, buffering, seekability, strict boolean decoding, suspension and expiry without renewal | `SpotifyPlayerServicePortTest.kt` |
| Occurrence-bound seek/play/pause, separate renewal, invalid/unseekable seek and conflict preservation | `SpotifyPlayerServicePortTest.kt` |
| Bounded queue, one drain, cancellation before/after dispatch, retirement during read, reentrant completion, stale release and close/release ordering | `SpotifyPlayerServicePortTest.kt` |
| Explicit bind, queued handoff/cancellation, rejected/duplicate bind, detach, late callbacks, old disconnects, retained-port retirement and idempotent unbind | `SpotifyPlayerServiceBindingTest.kt` |
| Actual coordinator paused ready versus idle/buffering/ended, no current entry, stopped and failed output | Player `PlayerBehaviorTest.kt` readiness cases |

Focused validation command from the workspace root:

```text
./StreamingServiceMobile/android/gradlew -p StreamingServiceMobile/android :streaming-service-player:testDebugUnitTest --tests '*PlayerBehaviorTest' :app:testDebugUnitTest --tests '*SpotifyPlayerService*Test' -x :app:buildSpotifyLibrespot --console=plain
python3 StreamingServicePlayer/tools/check-native-architecture.py
```

The focused Android JVM cases and Kotlin compilation passed. Native packaging,
physical-device service lifecycle, audible preparation/playback, account switching
on a device, screen lock and timing alignment remain unverified. Native service
callbacks are behind a deterministic connector in host tests; those tests do not
instantiate the Android binder. The application adds the player-pinned Media3
session dependency to compile the real binder's service supertype.

Continuous following still requires an application-owned native follower,
fresh-state admission, cancellation and account handoff, and a complete native
resolver for unseen Spotify tracks. Application-led host publication also needs
separate integration. AppState following remains unchanged. No background Jam
playback capability or synchronization result is claimed by this foundation.

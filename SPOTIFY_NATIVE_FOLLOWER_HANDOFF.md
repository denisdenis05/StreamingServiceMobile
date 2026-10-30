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
membership, another host/account, reconnecting registration or a changed native
generation prevents or retires following. Guest following remains disabled.

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

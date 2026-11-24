# Background app credential renewal

An acknowledged native follower now owns an authentication renewal timer separate
from recording resolution. It schedules renewal sixty seconds before the actual
StreamingService token expiry. A bounded headless task restores the app account,
refreshes through the existing cookie/JWT flow, checks the captured account and
pending native request again, and submits the resulting token to that same
player session. Native completion requires the committed expiry to advance.
No token or song data appears in the claimed task payload.

The native request captures both accounts, server, Jam, host, handle and actual
generation. Claims are one-use and submissions cannot repeat. Replacement, stop,
reconnect generation changes and local suspension cancel old work. Timeouts,
failed refresh and an unchanged expiry fail closed and retire native playback.
Late completions cannot affect a replacement. If the bounded decision executor
rejects failure delivery, the unhealthy renewal state immediately fences native
source authorization; the follower cannot keep renewing its playback lease.

Native credential writes are serialized. Only a successful actual write advances
the committed expiry. Failed writes may retry the same intended expiry; a delayed
older request cannot overwrite a newer committed credential. Suspended/failed
views may be reattached without resuming playback; explicit app restart first
retires the prior native owner.

## Dedicated tests

| Behavior | Tests |
| --- | --- |
| Native expiry timing, one-use claim, actual expiry advancement, account and generation fences, timeout, task failure, cancellation and duplicate snapshots | `SpotifyJamAuthenticationRenewalTest.kt` |
| Credential-write ordering, retry after failure, failure retirement and old failure rejection | `SpotifyJamPlaybackRuntimeTest.kt` |
| Headless bounded renewal, server/account validation, cancellation, timeout, late refresh and immutable scope | `tools/spotify-background-authentication.test.cjs` |
| Actual React Native module composition, restore/refresh calls and scoped completion | `tools/spotify-background-authentication-headless.test.ts` |
| Existing renewal deduplication and account replacement | `tools/player-authentication.test.cjs` |

The task is registered as `StreamingServiceSpotifyAuthentication` by `index.js`.
It uses the existing Android headless dispatch and wake lock with its own task
name. Registration, source tests and compilation do not prove delivery during
Android screen lock, Doze, network loss or process death. Native session state is
not persisted for automatic playback after process death. An Android device and
actual account renewal are still required for those acceptance checks.

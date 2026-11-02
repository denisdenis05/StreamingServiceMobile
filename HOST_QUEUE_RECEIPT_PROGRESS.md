# Native hosted queue receipt timing — 2026-11-02

The library and Android follower observation decoders assumed that a native
playback read always performed a new HTTP exchange. Native hosting instead
returns its actual successful activation/publication receipt, with the original
HTTP timing and a bounded age. The prior duration-versus-current-call check
rejected valid receipts when a subsequent bridge read completed quickly.

Both decoders now preserve the original native HTTP interval and receipt age.
They map its midpoint through the current caller bracket, subtract its age and
half the original exchange duration, and retain both intervals in uncertainty.
The observed freshness timestamp also subtracts receipt age. Original native
exchanges remain bounded at 1.5 seconds and retained receipts at 15 seconds.
Reversed intervals, future native samples, expired receipts and negative local
anchors fail. Host, generation, track, occurrence and queue revision validation
remain intact. No queue or recording identity is fabricated.

## Feature tests

| Behavior | Dedicated coverage |
| --- | --- |
| Fast bridge read of original publication receipt; actual queue identity; original interval uncertainty and freshness | SpotifyJam `tests/connect-observation.test.mjs`, Mobile `SpotifyConnectObservationDecoderTest` |
| Expired receipt, backward native sample and negative mapped local anchor | Same dedicated decoder suites |
| Verified membership brackets and actual source clock mapping | `SpotifyConnectVerifiedFollowerSourceTest` |

Library commit `b95e151` passes `npm test`: architecture checks, TypeScript and
671 cases across 32 files. Focused JVM decoder and verified-source suites pass
29 tests. Complete `:app:testDebugUnitTest`, excluding native library packaging,
passes 474 tests across 34 suites with zero failures or errors. Logs are
`/tmp/jam-queue-projection-library.log`, `/tmp/jam-queue-projection-jvm.log` and
`/tmp/jam-queue-projection-full-jvm.log`.

No Spotify request, adb action or APK build was performed by this implementation
agent. This fixes a reproduced source contract mismatch consistent with the
reported queue-panel InvalidResponse; integrated emulator verification is still
owned by the root session. Actual extended-metadata responses and remote queue
changes remain independent paths to verify if that panel still fails.

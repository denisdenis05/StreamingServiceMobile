# Guest controls and prompt native following — 2026-10-31

PlaybackCommandStore offers explicit native guest commands only when the runtime
has guestCommandsAvailable and the bound account remains in projected admission.
The library verifies fresh membership before command submission; the actual native
Connect command preflight enforces source restrictions and actual acknowledgements.
Recording selection reaches the same guarded queue operation. Root composition
owns binding the native verifier and actual player controls.

Native Dealer playback events now prompt an immediate follower read through
SpotifyJamConnectionRecovery, application runtime, native session and coordinator.
One pending source-change action and one pending follow-up read are coalesced;
reads stay serial. Disconnect, terminal state and account/generation retirement
prevent restart. Periodic reconciliation remains available when no event arrives.

HTTP refresh also emits local Cluster events. Native Cluster events now include
an app-local receivedFromDealer flag: true only for real DealerInput::Cluster,
false for HTTP refresh/publication. Recovery ignores false flags, preventing an
HTTP refresh feedback loop. Session and membership events also request refresh.
No Spotify wire field, mutation endpoint or remote occurrence ID was invented.

Authored dedicated tests, mobile execution postponed by the user:

- SpotifyNativeFollowerCoordinatorTest: immediate event refresh, coalescing behind
  an in-flight read, timer replacement, disconnect/stop cancellation.
- SpotifyJamConnectionRecoveryTest: true Dealer versus HTTP-origin clusters and
  session events.
- tools/spotify-playback-commands.test.cjs: admitted native guest availability,
  default/browser denial and removal.
- native tests/connect_actor.rs: checked-command HTTP/Dealer source provenance.

Library `npm test` passed 643 cases. Mobile Kotlin, Rust, JavaScript and TypeScript
checks have not run for this chapter. Actual guest acceptance, audible timing,
background lifecycle and measured latency remain open. No device, pairing,
process restart or live mutation was attempted.

## Owning-session source verification

After composition and player integration, full mobile source checks passed:
433 Android JVM, 236 Rust plus 8 probe-example, 538 Spotify Node, 148 Spotify Jest,
341 player/mobile, 25 settings Node and 25 settings Jest, and 32 probe cases.
Full mobile TypeScript passed. The owning session bound guestCommandVerifier only
for native Connect and retained the same native follower during Jam Operating.
These are host source checks; physical mobile verification remains postponed.

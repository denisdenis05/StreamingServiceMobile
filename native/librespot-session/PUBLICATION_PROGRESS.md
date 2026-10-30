# Explicit activation transport — 2026-10-30

The native actor now exposes actual device/player-session identity and explicit
activation through the existing internal JNI control boundary. Activation uses
the actor's retained current-generation read, exact previous host and matching
request brackets. Actual player snapshot/readiness inputs remain required. The
session promotes its observer registration only for this guarded publication;
raw playback-ready startup remains rejected. Activation/publication mutations
never replay. A host change during dispatch prevents a late response from
restoring publication authority. Incoming control capability remains disabled
until the app host dispatcher is composed.

Dedicated source tests: `connect_actor` has six new activation/identity cases;
`connect_bridge` covers strict identity/publication decoding; existing activation
and publication builder suites remain passing. Focused command:
`cargo test --manifest-path native/librespot-session/Cargo.toml --test
connect_activation --test connect_publication --test connect_actor --test
connect_bridge --quiet` passed 73 cases. Complete `cargo test --manifest-path
native/librespot-session/Cargo.toml --locked --quiet` results are recorded in
mobile SPOTIFY_INTEGRATION_PROGRESS.md. No live activation or Android host action
has been exercised; application host composition remains next.

# Native local-player publication — 2026-10-27

Implemented the bounded actual-player protobuf builder, session-bound publication
PUT and guarded actor action. The publication purpose never repeats a rejected
mutation. Existing observer registration remains separate and cannot overwrite
local player state after publication dispatch. Playback-ready bridge registration
remains disabled and no application integration calls publication yet.

Primary local protocol evidence: pinned librespot revision 99b6088,
connect/src/state.rs set_last_command/set_now/set_active/set_status/update_position,
protocol/proto/connect.proto PutStateRequest/Capabilities, and
protocol/proto/player.proto PlayerState/ProvidedTrack. Publication preserves
paused-ready separately from buffering, rather than copying the pinned implementation's additional paused buffering compatibility
flag. The observed desktop peer also reports paused without buffering. Auth uses
existing paired Login5 unchanged.

Validation: cargo test --locked --quiet in native/librespot-session passed the
complete native suite. Dedicated codec tests: 11. Actor tests: 32, including eight
publication cases. Authentication tests: nine, including publication rejection
without replay. git diff --check passed. No live publication, phone execution,
packaging or audio synchronization was performed in this chapter. Diagnostic
examples connect_probe and session_probe built with cargo build --locked
--example connect_probe --example session_probe --quiet.

Next: compose a real StreamingServicePlayer adapter and clock mapping; execute
incoming actions once before acknowledging; keep Dealer handling responsive
during HTTP; establish explicit transfer and preserved-state reconnect/read
behavior and a separate user-authorized initial activation operation (own-host
publication deliberately cannot bootstrap ownership); validate actual Spotify
publication and participant playback. Keep the host-ready guard off until these runtime requirements pass.

Corrective review: paused-ready publication no longer invents buffering. The
dedicated paused_ready_samples_preserve_paused_without_inventing_buffering test
checks paused true/buffering false and buffering paused false/buffering true.
Validation: cargo test --locked --test connect_publication --quiet passed all
11 codec cases, including all four Playing/Paused/Buffering/PausedBuffering
flag and speed combinations. No runtime readiness gate changed.

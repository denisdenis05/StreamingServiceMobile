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

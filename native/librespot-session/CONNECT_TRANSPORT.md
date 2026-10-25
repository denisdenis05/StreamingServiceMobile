# Persistent Spotify Connect transport

The native transport restores the same account, device and desktop-client identity
as paired login. It keeps the access-point session open, obtains tokens through
the existing dedicated Login5 exchange, resolves regional services and opens a
bounded Dealer WebSocket. Credentials stay in native memory/private process IPC.
No extracted Spotify application code is packaged.

A connection identifier received in Spotify-Connection-Id is used as
x-spotify-connection-id for device registration. The returned protobuf Cluster
must include this device before player readiness is published. A hidden observer
can be omitted from that map; its exact identifier must instead be confirmed by
the existing account-bound Jam device-status endpoint. Registration starts
inactive. The Android bridge currently accepts observer configuration only;
playback readiness is rejected until an actual local player adapter can accept
commands. Registration alone establishes neither Jam admission nor audio output.

Socket I/O and heartbeats run concurrently with HTTP registration/commands.
Frames, decompression, normalized events, channel capacity, acknowledgement
deadlines and completed-request journals are bounded. Overflow reconnects instead
of silently dropping state. An incoming player command requires an explicit reply;
unsupported, conflicting and expired requests receive negative acknowledgements.
Successful replies follow physical socket flush. Duplicate handling currently
covers one Dealer connection; a durable execution journal across reconnects
remains required before enabling incoming player actions.

Private HTTP uses the pinned HttpClient.request_fut single dispatch boundary.
The convenience request/request_body helpers retry HTTP 429 internally and are
deliberately unsuitable for uncertain mutations. Response bodies are bounded
while streaming. Transport failures after mutation dispatch are unknown outcomes,
not proof of rejection. Rate-limit Retry-After propagation remains open.

The registry holds one native connection until transport cleanup finishes and
queued events are consumed. Handles increase across replacements; stale callers
cannot poll, cancel or finish the next connection. Cancellation prevents new
action acquisition. A connection batch contains a sampled native monotonic clock;
JavaScript performance.now is a separate clock and needs a bounded exchange
before using these observations as playback timing anchors.

JNI names, no_mangle, serde camelCase/tag attributes, protobuf fields and enum
names are required protocol/compiler boundaries. Domain names use full words;
wire field spelling is preserved at those boundaries. Tokio time is the injected
runtime timer boundary; paused-time tests exercise deadlines without real waits.

## Feature tests

| Behavior | Dedicated tests |
| --- | --- |
| Dealer framing, gzip limits, protobuf clocks, queue occurrence identities, revisions, acknowledgements and changed devices | tests/connect_wire.rs |
| Observer/player descriptors, inactive state, absent initial track, invalid configuration | tests/connect_device.rs |
| Registration gating, stale generations, canceled work, exact command dispatch, explicit replies, pending/completed duplicates and expiry | tests/connect_actor.rs |
| Physical flush receipts, independent heartbeat, missing pong and overflow | tests/connect_socket.rs |
| Status categories, passive failures, uncertain mutations and exact hidden-device status confirmation | tests/connect_http.rs |
| Cleanup ownership, cancellation, bounded event batches, stale handles and action-channel closure | tests/connect_registry.rs |
| Native start/control parsing, account-bound reusable record and rejection of premature playback readiness | tests/connect_bridge.rs |
| Pre-canceled transport and permanent malformed-credential termination without network work | tests/connect_lifecycle.rs |
| Actual JNI exports, invalid handles, null inputs and absent-session controls without network requests | ../../tools/fixtures/librespot-jni/com/streamingservice/spotify/SpotifyLibrespotNative.java |
| Private diagnostic IPC, split frames, safe summaries, explicit controls and malformed-output termination | ../../tools/spotify-connect-probe.test.cjs |
| Android native owner, replacement cleanup, cancellation retry, late refresh and empty-batch suppression | Android SpotifyConnectOwnerTest.kt |
| Android native envelope bounds/types/handles, typed failure sanitization and explicit control receipts | Android SpotifyConnectNativeExecutionTest.kt |
| Mobile credential/account binding, startup abort, cleanup barriers/retry, old generations, reentrancy and observer registration | ../../tools/spotify-connect-store.test.cjs |
| Native platform selection and event subscription ownership | ../../tools/spotify-connect-platform.test.ts |
| Controller native login lifetime, passive snapshot projection and real device selection for joining | ../../tools/spotify-mobile.test.cjs |
| Separate device connection state and control-only native admission UI | ../../tools/spotify-screen.test.tsx |

Run npm run test:spotify-native and npm run test:spotify-probes from the mobile
repository. Build diagnostic examples with cargo build --locked --manifest-path
native/librespot-session/Cargo.toml --example connect_probe --example session_probe.
Then node tools/probe-spotify-connect.cjs requests fresh browser pairing. Its
console excludes tokens, credentials, account/device/session/track identifiers
and raw membership/command payloads. Only refresh and stop are exposed by this
observer test, along with restart after cleanup, which retains the grant only in
parent process memory. Failure stages are a fixed enum and never contain raw
request data. Credentials are not written to disk.

## Remaining integration

Android now owns the connection outside the screen lifetime through a React
Native module with native polling and bounded workers. Polling starts only after
explicit native attachment. React event-emitter addListener/removeListeners and
module lifecycle names are required framework boundaries. Replayable background
state and native clock mapping still remain. The library must
bind actual native device registration to guest admission and permissions before
enabling guest queue/control operations. Fresh event/queue publication, local
playback authority, app-led hosting and physical background checks remain in the
active implementation queue. The existing APK does not contain these additions
until a new release bundle and assembly have been verified.

Android media playback foreground service requirements are documented at
https://developer.android.com/develop/background-work/services/fgs/service-types.
Background transport must be composed with actual user-requested playback;
an observer-only connection is not evidence of background audio support.

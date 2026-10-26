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
and raw membership/command payloads. The observer test exposes refresh, explicit play/pause/next/previous and queue
commands against the observed host, plus stop and restart after cleanup. Restart
retains the grant only in parent process memory. Typed commands carry the
observed generation and run the same fresh preflight as Android. Failure stages are a fixed enum and never contain raw
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

## Typed outgoing commands

`tests/connect_commands.rs` covers payload endpoints, logging request identity,
append occurrence input, seek track/duration, active-host replacement, action and
global restrictions and malformed bounds. `tests/connect_actor.rs` adds fresh
preflight, stale generation, closed receipt, scoped preflight cancellation and
in-flight unknown outcomes without replay. `tests/connect_registry.rs` covers
individual isolation, capacity, release and spontaneous termination cancellation.
`tests/connect_bridge.rs` covers the exact typed input shape and unknown fields.

Android SpotifyConnectOwnerTest adds reservation-before-queue, canceled queued
work, identifier reuse across retired ownership, in-flight uncertainty and stale
or malformed owners. SpotifyConnectNativeExecutionTest covers exact native
reservation routing and rejection of a serialized command using another reserved
request. The JNI smoke resolves the three new scoped-command exports without
network requests. Source-store command cases cover account/generation/host
binding, registration gating, abort and replacement, safe failure projection,
bounded pending work, duplicate IDs, immutable intents and reentrant retirement.

JNI control JSON and reservation request IDs must match. Command reservations
are registered synchronously before worker queuing so an immediate JS abort
cannot miss work waiting in the executor. Finishing is identity-bound/idempotent
at the owner, so an old finally block cannot release a replacement reservation.

## Fresh observation reads

connectRead returns handle/generation plus a fresh cluster and native request
start/end/delivery clocks. It uses the existing observer refresh (registration
PUT) and never mutates host playback. Tests in connect_actor.rs cover fresh
intervals, stale generation rejection and abandoned queued reads; JNI smoke
resolves the read export without authentication traffic. Android tests reject
foreign/coerced envelopes and post-read ownership retirement. Source-store tests
cover binding, prompt cancellation, late generation and malformed results.

SpotifyConnectObservationValues in the library brackets the whole call with
JavaScript time; source position is advanced using server_at minus player
anchor only while actually progressing. Native clock origin never substitutes
for JavaScript time. Buffered/paused state remains nonprogressing even if Spotify
reports is_playing. Remote occurrence IDs reach the local follower, including
repeated tracks. Source URI/metadata is not yet a rendered shared queue.

The diagnostic example writes only nonidentifying numeric/boolean summaries to
build/spotify-jam/live-observation-summary.json. Its dedicated example test checks
exact appended occurrence correlation and excludes host/track/occurrence strings.
Run cargo test --locked --manifest-path native/librespot-session/Cargo.toml
--example connect_probe in addition to the normal native test script.

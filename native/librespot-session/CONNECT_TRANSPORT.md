# Persistent Spotify Connect transport

The native transport restores the same account, device and desktop-client identity
as paired login. It keeps the access-point session open, obtains tokens through
the existing dedicated Login5 exchange, resolves regional services and opens a
bounded Dealer WebSocket. Credentials stay in native memory/private process IPC.
No extracted Spotify application code is packaged.

A connection identifier received in Spotify-Connection-Id is used as
x-spotify-connection-id for device registration. The returned protobuf Cluster
must include this device before player readiness is published. A hidden observer
can be omitted from that map. Its successful authenticated registration response
is the observer acknowledgement; Jam device status is not a registration echo
and can differ while another device plays. No device-map entry is invented. Registration starts
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

## Track metadata

connect_metadata.rs builds the pinned extended-metadata TRACK_V4 request and
checks all returned entity URIs/gids. Metadata comes from this account's existing
native HTTP session; response bodies remain bounded. The codec does not expose
track files or audio keys. Metadata actions are generation-bound and passive;
failed or abandoned requests are not mutation outcomes. JNI and Kotlin preserve
handle/generation, and JS verifies the exact requested result sequence.

`tests/connect_metadata.rs` covers unique/bounded requests, reordered entities,
exact gid matching, missing/duplicated/foreign data, malformed/oversized bodies,
ISRC filtering and 404. `tests/connect_actor.rs` covers metadata routing and old
generations. Android owner/execution cases cover metadata account retirement and
foreign envelopes. Source-store cases cover account binding, cancellation, foreign
handles and cancellation after receipt settlement. The diagnostic example's
metadata projection test excludes title, artists, identifiers and recording codes
from its report. Live private metadata succeeded on 2026-10-26; the safe artifact
reports title/duration presence, artist/code counts and a fixed failure category.

## Live observer acknowledgement and developer channel

An acknowledgedObserver event is emitted only after the account-authenticated
registration PUT with the actual Dealer connection ID succeeds and its Cluster
body decodes. Player readiness still requires explicit device presence. The
native source-store recognizes this distinct proof source. Tests in connect_http
and spotify-connect-store reproduce the active-device observer failure.

The host diagnostic example has a Unix-only local channel at
build/spotify-jam/connect-probe.sock. It accepts one bounded JSON line, keeps the
write side open until a response, and returns typed read/metadata/command results.
It never accepts a credential or starts another account. Socket permissions are
0600; live sockets and regular files are preserved; disconnected commands cancel
their token. This channel can return private account song/device data to the local
caller; verification scripts print only safe metrics and never save raw replies.
It is not packaged in Android. #[path] and std Unix ino/mode names are compiler/OS
API boundaries. Example tests cover framing, ownership, cancellation and cleanup.

Fixed-stage inspection is generation-bound and only reports ConnectFailureStage;
its dedicated actor case checks current/stale generations. Production commands
still use their typed cancellation and uncertainty rules. Live pause/resume and
one append of the playing available track succeeded. Spotify assigned a different
queue occurrence identifier; logging request IDs are not delivery receipts.

## Outgoing delivery receipts (current chapter)

Checked commands retain the server HTTP ack_id and wait for its matching Dealer
Cluster on the expected active host. HTTP acceptance alone is not delivery. The
native journal bounds pending confirmations and recent server identifiers; it
retains actual observed queue revision/native time without substituting a local
counter. Missing or conflicting identifiers, cancellation, expiry and shutdown
remain unknown outcomes and never resend a mutation. A stale cached host change
older than the preflight server timestamp cannot retire a current confirmation.

connect_receipts.rs tests distinguish empty/object/non-object/malformed bodies,
known identifier aliases, conflicts, bad types/bounds and omission of private
unknown fields. connect_command_journal.rs covers correlation, unrelated state,
host replacement, cancellation, expiry, duplicate/missing IDs, capacity, shutdown
and cached host changes. Actor tests prove delayed matching confirmation and
post-HTTP cancellation/shutdown behavior. The bridge panic guard test preserves
explicit preflight failures while classifying unexpected command panics unknown.
Android execution tests reject unobserved/false/coerced acknowledgements and keep
unexpected post-dispatch replies uncertain. Known native failure receipt codes
remain intact. Live pause/resume and one duplicate-song append were confirmed by
matching server acknowledgements; this does not prove guest permission or audio.

## Rejected safe-read token recovery

ConnectRequestPurpose separates observation registration and metadata reads from
queue/playback commands and cleanup removal. A rejected HTTP 401 invalidates the
session's cached bearer. Primary paired Desktop Login5 reads can obtain a fresh
token and repeat that identical read once within a combined 15-second budget.
A second rejection invalidates the new bearer and stops. Authentication failure
before dispatch, 403, transport errors, deadlines, cancellation and rate limits
never trigger this replay. Commands and removal never replay automatically,
including after 401. Existing per-dispatch mutation uncertainty is preserved.

The pinned upstream non-Desktop Login5 manager has a separate internal token
cache with no public invalidation method. Its sessions therefore do not opt into
rejected-token replay; they retain upstream expiry behavior and surface 401 for
explicit recovery. No alternate client identity or client-token exchange is
introduced. The paired Desktop path uses the existing uncached dedicated
session_token exchange and remains account/device/client-bound.

connect_authentication.rs has nine deterministic cases for exact-body/token
renewal, success, repeated rejection, unsupported provider, mutation/removal
non-replay, permanent/transient errors, initial/renewal authentication failure
and a paused-clock total deadline. The command journal also tests a still-pending
acknowledgement reused after completed receipts rotate its bounded recent window;
this cannot overwrite the original pending command or confirm either request.
These checks do not establish actual expiry behavior on a phone.

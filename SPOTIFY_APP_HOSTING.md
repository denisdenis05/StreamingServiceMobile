# App-led hosting source work

## Real queue and publication projection

The host player adapter can now read the actual bounded playback-order page with
its captured engine/authentication/queue/content/control cursor. It validates the
page and rereads the cursor before returning. A queue change during sampling
rejects the sample. Incoming media commands retain each actual resolved recording
and the occurrence assigned to the real player. A service-owned host adapter is
fenced by its authenticated binding and cannot survive binding retirement.

`SpotifyHostPublicationProjector` uses those real entries and confirmed mappings
to produce current, previous and next Spotify occurrences. Unknown or ambiguous
mappings reject publication. It maps the real elapsed player sample onto the
measured native read/server anchor, validates freshness and uncertainty, and
keeps paused-ready separate from buffering. Generation, local device and actual
native player session must match. Publication revisions derive from the actual
local queue identity and content revision. The host owns those revision values;
they are not copied from another Spotify device.

Accepted command publication preserves actual sender/message provenance even
when Spotify did not supply an optional session command identifier. The native
builder now accepts that absence without inventing an identifier. Unsupported
shuffle, repeat and rate configurations reject this initial projection.

## Dedicated source tests

| Behavior | Tests |
| --- | --- |
| Actual queue order/cursor, changed queue rejection, malformed and oversized pages, retained mappings and authenticated binding lifetime | `SpotifyHostPlayerPortTest.kt` |
| Actual playback/occurrences/revision, measured clock mapping, freshness, uncertainty, generation, missing mappings/options and optional command provenance | `SpotifyHostPublicationProjectorTest.kt` |
| Accepted sender/message provenance with an absent optional session command identifier | `native/librespot-session/tests/connect_publication.rs` |

## Remaining composition

The explicit Rust activation transport is committed, but an Android host runtime,
actual incoming-command dispatcher, periodic publication, retirement/demotion and
app controls still need composition. Raw playable registration remains disabled.
No current APK or live probe demonstrates app-led hosting. Current native catalog
search returned backpressure, which also leaves live local-to-Spotify matching
unverified. Keep these source tests separate from phone/audio acceptance.

## Kotlin native host transport

`SpotifyHostNativeTransport` reads actual native device/session/next-sequence
identity, verifies owned Jam membership before and after a fresh source read,
and captures the real native/server/elapsed clock bracket. Guest ownership,
account or host replacement, malformed responses and excessive uncertainty fail
before activation. Initial activation may observe no previous active host.

Activation receives the actual sampled player readiness and absence of external
authority. Publication, demotion and Dealer replies use bounded typed native
controls. Queued cancellation prevents dispatch; replacement or malformed replies
after a mutation begins remain uncertain and never retry. Native errors expose
only known failure codes. `SpotifyHostNativeTransportTest.kt` provides dedicated
registration, clock/membership, cancellation, uncertainty and readiness cases.

This adapter is still a source component. The retained app host runtime, native
incoming dispatcher, periodic publication and app controls remain to be wired.

## Incoming command boundary

Native command events include the original native monotonic receipt and deadline.
The polling executor captures local elapsed time before and after the native call.
SpotifyHostCommandEventDecoder uses the earlier bound and native precision margin
so delayed event delivery cannot extend the original permission. Replayed bootstrap
events have no poll bracket and cannot authorize actions. Dedicated mapping,
expiry, scope, unsupported payload and malformed chronology tests live in
SpotifyHostCommandEventDecoderTest and SpotifyConnectNativeExecutionTest; the
producer lifetime and duplicate case lives in the native connect_actor suite.
Remote command capabilities require an actual attached handler; composition must
provide this evidence before activation, including a final dispatch-time check.

## Command execution and retirement

SpotifyHostCommandDispatcher serializes native actions through SpotifyHostPlayer,
retains bounded duplicate keys and acknowledges only actual matching receipts.
An original deadline also covers queue waits and asynchronous sampling. Unknown
player outcomes or failed replies retire the handler without replay. Feature tests
are SpotifyHostCommandDispatcherTest. SpotifyHostPlayerPortTest covers the
actual cursor-fenced safety pause, including newer local controls and uncertain
receipts. SpotifyHostNativeTransportTest covers membership-independent retirement
reads. Runtime composition must attach this dispatcher before opening capability
gates and detach it before cleanup; this chapter does not perform that composition.

## Host coordinator

SpotifyHostCoordinator owns explicit activation, fresh acknowledgement, native
periodic publication and retirement ordering. SpotifyHostCoordinatorTest maps
these behaviors to deterministic cases, including reentrant stop and late async
completion. Unknown queue mappings or uncertain mutation results retire ownership.
Demotion requires actual fresh queue projection and a current native registration;
failed cleanup remains a failed barrier. Application composition and reverse
background mapping still need implementation before app-led hosting is exposed.

## Native session boundary

SpotifyHostNativeSession binds the real player without resetting its authentication
epoch or queue. An attached native observer is required before activation; native
connection/generation/account loss retires handling. React is not a dependency of
this session. Startup credential races, token writes, delayed binding and cleanup
barriers have dedicated SpotifyHostNativeSessionTest cases. Configuration scope
and malformed inputs map to SpotifyHostConfigurationProtocolTest; connection
loss/replacement maps to SpotifyHostConnectionEventsTest. The application runtime,
headless job routing and explicit JavaScript controls remain to be composed.
A failed cleanup retains the binding and must remain visible to its owner.

## Withdrawal without a playable queue

The latest coordinator cleanup uses native withdrawal after its cursor-fenced
pause. Withdrawal reads the actor's actual next sequence and constructs a hidden,
inactive observer registration from the real native device/session. It contains
no player song, queue or command provenance and needs no app recording mapping
or current Jam membership. The previous cleanup projection limitation is resolved
for a still-owned native connection. Actual connection/generation replacement can
still reject cleanup and must remain a failed barrier until native retirement.
Dedicated suites: native connect_publication/connect_actor/connect_bridge and
Kotlin SpotifyHostNativeTransportTest/SpotifyHostCoordinatorTest.

## Integrated app action and background mapping

SpotifyHostApplicationRuntime now composes the retained native owner, real player,
Connect transport, command observer, metadata broker and authentication renewal.
SpotifyJamPlayback routes unique headless authentication/recording jobs to the
correct host or follower. Connect shutdown attempts withdrawal before native
retirement and releases retained bindings after actual connection removal.

SpotifyHostingStore and SpotifyHostingQueue capture and recheck the actual queue
for the explicit app action. Starting either following route waits for host
retirement. New local recordings use SpotifyHostRecordingBroker and
SpotifyBackgroundHostingTask with native job-bound search. Playback pauses while
matching; a later Play remains explicit. The feature tests listed in the latest
progress chapter cover these behaviors. Earlier sections describe historical
composition gaps; this section supersedes those source statuses. Live app hosting,
second-account admission and measured audio/background behavior remain unverified.

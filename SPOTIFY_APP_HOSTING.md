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

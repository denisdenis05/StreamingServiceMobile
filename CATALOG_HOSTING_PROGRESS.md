# Catalog diagnostics and prepared host publication — 2026-10-31

The native documented search path remains https://api.spotify.com/v1/search.
No private endpoint, automatic search retry or speculative cause was substituted
for the earlier live Backpressure failure. Native search diagnostics now emit only
a fixed origin, allowlisted phase, optional actual numeric HTTP status and safe
failure code. They distinguish dispatch admission, transport, HTTP response, body
limit, decode and request completion. The example logger filters to this target
only; the Node probe bounds and validates stderr JSON, dropping other/private
output without killing its owner. UI backpressure copy now covers both busy
transport and limiting requests without asserting a cause.

The historical probe had no live process. Root built the diagnostic example and
started fresh read-only execution 44183. It subsequently exited with status 1
after Network and authorization Unauthorized failures, without observed
registration. Its pairing link is obsolete; a fresh probe is needed when pairing
is available. Do not treat a socket file as a registered session or assert a
catalog HTTP cause from this authorization failure.
No playback command/queue mutation or process restart was issued.

Scoped native preparation now caches confirmed recording-to-Spotify mappings,
independently of occurrences. The publication projector assigns actual sampled
occurrences after a real local change. JS prepareRecordings runs before the local
mutation; publishLocalChanges schedules immediate/coalesced publication after its
receipt and does not acknowledge an HTTP publication. A preparing/buffering player
without duration has a bounded 15-second grace, preserving the active host while
the engine becomes publishable. Unknown/unprepared additions still pause safely.
Prepared record caching is bounded and scoped; a whole preparation batch has one
30-second deadline and cancels its active headless task. Failed preparation leaves
the old player queue intact, and the player UI permits explicit Stop while busy.
No automatic resume or uncertain mutation replay was added.

Dedicated coverage: SpotifyHostCoordinatorTest (prepared mapping, real switching,
coalesced publication and buffering grace), SpotifyHostPreparationProtocolTest
(bounds/types), SpotifyHostRecordingBrokerTest (cache scope and batch deadline/
cancellation), SpotifyHostRuntimeTest (scoped native routing), tools/spotify-
hosting.test.cjs (actual host preparation/publication scope), native connect_search
and connect_actor cases, probe example and tools/spotify-connect-probe.test.cjs
(HTTP/status/privacy/bounded stderr). Integrated source checks passed 433 JVM,
236 Rust, 8 probe-example, 32 Node probe, 538 Spotify Node and 148 Jest cases.
Source checks do not establish live catalog permission or physical playback.

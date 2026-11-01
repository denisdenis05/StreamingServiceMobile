# Native Jam host device repair — 2026-11-01

## Failure found

The Connect observer is deliberately hidden and named StreamingService. Joining or
creating a Jam alone does not advertise a playback endpoint. Explicit hosting
promotes the same native device and publishes the actual mapped application queue.
The configured name is retained during that promotion.

A deterministic native blocker prevented hosting from staying active: after a
successful activation, the Android host coordinator performs another preflight.
The native read implemented preflight by registering the observer again. The
publication lifecycle correctly forbids observer registration after activation,
so that read returned Unsupported and cleanup withdrew the newly active device.
Periodic publication preflights had the same problem. Actor tests used an injected
session whose refresh did not reproduce the real session registration guard.

## Repair

The HTTP worker records the actual native request interval for successful
activation and publication responses. The actor retains that real response for
hosting reads and refreshes for at most the existing fifteen-second publication
sample lifetime. It does not issue a new observer registration, invent a fresh
server timestamp, use an unverified endpoint, or republish an old queue for a read.
Normal observer reads before hosting retain their existing HTTP preflight.

The Android clock anchor preserves the original receipt age and includes the
original HTTP interval in its uncertainty. Periodic successful publications renew
the receipt. Expiry, cancellation, generation replacement and Dealer authority
loss reject retained reads. A newer Dealer player/session/queue identity cannot
be overwritten by a delayed publication acknowledgement. A successful withdrawal
clears the retained publication receipt.

Activation and publication acknowledgements require the actual native device to
be active. Returned device names, hidden state and player/session/queue/occurrence
identities cannot contradict the submitted publication. Omitted optional details
are accepted; false protobuf defaults are not treated as evidence that an omitted
capability was explicitly denied. The application still does not claim remote
success merely because it submitted a request.

## Feature tests

| Behavior | Dedicated test |
| --- | --- |
| Active hosting reads and refreshes use the actual retained receipt without another observer registration; refresh preserves the cluster event | `connect_actor.active_host_reads_reuse_the_actual_publication_receipt_without_observer_registration` |
| Receipt timestamps stay original; expiry, reversed time and retired authority fail | `connect_actor.retained_publication_read_preserves_its_original_clock_and_rejects_expiry_or_retired_authority` |
| Newer Dealer queue identity rejects an older publication response | `connect_actor.a_newer_dealer_queue_revision_cannot_be_replaced_by_an_older_publication_receipt` |
| Dealer host replacement remains responsive during publication and prevents late success | `connect_actor.stalled_local_state_publication_keeps_incoming_controls_and_host_retirement_responsive` |
| Actual active device, returned name/visibility, player/session and queue identity must match | `connect_publication.publication_acknowledgement_requires_its_actual_active_device_and_matching_returned_player_identity` |
| Partial acknowledgements remain valid | `connect_publication.publication_acknowledgement_tolerates_omitted_optional_device_and_player_details` |
| Android retained anchors preserve receipt age; expired receipts cannot look fresh | `SpotifyHostNativeTransportTest.retainedPublicationReadPreservesItsOriginalAgeInThePlayerClockAnchor`, `expiredRetainedPublicationCannotBeTreatedAsAFreshHostObservation` |

## Verification

`cargo test --manifest-path native/librespot-session/Cargo.toml` passed the full
native suite. The actor suite now has 65 cases and publication has 20.

`./gradlew :app:testDebugUnitTest --tests '*SpotifyHostNativeTransportTest'
--tests '*SpotifyHostPublicationProjectorTest' --tests '*SpotifyHostCoordinatorTest'
-x :app:buildSpotifyLibrespot --console=plain` passed 63 JVM tests. The initial
invocation without the exclusion attempted an Android crossbuild with the default
shell Cargo environment and failed before JVM execution. The exclusion keeps JVM
verification separate from native Android packaging; root owns configured APK
builds and actual emulator verification.

No Spotify authentication, catalog request, device mutation or running Spotify
process change was performed for these source checks. Actual device visibility,
host activation, incoming controls and queue/audio behavior remain live gates.

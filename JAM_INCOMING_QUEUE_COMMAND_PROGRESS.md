# Incoming queue commands — 2026-11-02

Pinned librespot checkout `99b6088`, `core/src/dealer/protocol/request.rs`, defines
`skip_next.track` as an optional ProvidedTrack and `set_queue` as `prev_tracks`,
`next_tracks`, `queue_revision` and logging parameters. The revision is the
previous queue revision. The decoder now accepts these shapes, preserves repeated
songs with distinct occurrence IDs, accepts the protobuf default empty UID as an
unspecified occurrence and rejects duplicate supplied occurrences and oversized
queues. Incoming set_queue requires its real revision; internal native commands
can omit that protocol field.

Targeted skip selects an existing actual player occurrence using the normal
Select operation. The supplied Spotify URI and optional UID must agree with a
retained mapping and actual queue entry. URI-only selection is rejected when
repeated tracks make the occurrence ambiguous. It does not replace the queue or
rematch a known recording. `rememberMappings` accepts bounded verified mappings;
reuse also checks actual player queue metadata and recording identity.

Set_queue merges previous/current/next occurrences around the actual current
entry. Remove, Append and Move operations retain its queue identity, playback
position and paused/playing intent. Every step uses actual receipt cursors;
partial/uncertain outcomes never become a positive acknowledgement. A stale
incoming queue_revision that differs from the actual queueIdentifier/contentRevision
is rejected before mutation. Existing mapped recordings reuse actual local queue
metadata; new participant recordings use the injected resolver.

Play commands can explicitly select a current occurrence instead of always using
the first queue item. `preservePosition` uses incremental queue reconciliation when
the old current occurrence remains. Changing the selected occurrence uses Select;
replacement without the old current uses the normal replacement behavior.

Both dispatcher and player command journals now retire the oldest completed
receipt when capacity is reached, preserving all pending jobs. Duplicate commands
remain deduplicated inside the retained receipt window. This avoids permanently
rejecting playback controls after 128 completed commands. No uncertain command is
automatically replayed.

Verification: focused Gradle `:app:testDebugUnitTest` passed 56 tests across
SpotifyHostCommandTest (10), SpotifyHostCommandDispatcherTest (13),
SpotifyHostQueueCommandTest (10) and SpotifyHostPlayerPortTest (23). The dedicated
new queue suite uses the actual StreamingPlaybackCoordinator and covers selected
occurrences, duplicate URI ambiguity, track/occurrence mismatch, participant queue
merge, retained position/intent/identity, known mapping reuse, post-failure control
recovery and incoming revision rejection/acceptance. Decoder regressions cover
ProvidedTrack, set_queue, duplicate UIDs and default empty UID. Dispatcher tests
cover completed receipt eviction and pending-job preservation.

These are source tests. This chapter makes no live Spotify requests, changes no
running process and builds no APK. Root/mobile integration owns native bridge
composition, hosting publication and actual emulator/participant verification.

# Controllable Jam queues and fresh current-song matching

## Source behavior

The package receives injected local and Spotify queue ports. Each read carries
actual occurrence identifiers, scope, revision and current selection. Each write
checks its captured scope/revision and returns an actual operation receipt.
Application HTTP/authentication and native player ownership stay in Mobile.
SDK chapters 6526067/e8baa2b and Mobile dbfa8c4 compose the ports and their triggers.

The native bridge implements getHostingQueue(side) and applyHostingQueue(side,
change). Local reads contain the full real player queue, even when future entries
lack Spotify mappings. Spotify reads contain the mapped tracks in the last
acknowledged owned-host publication. They are not an arbitrary Spotify device's
queue. Partial publication reads are explicitly marked incomplete. Local writes
execute the real player CAS operations; Spotify writes validate the actual local
occurrences/order/current selection and wait for publication acknowledgement.
An SDK operation does not manufacture a Dealer command acknowledgement. Existing
native Dealer handling owns incoming commands while JavaScript is asleep.

Complete local replacements no longer retain removed old Spotify occurrences
merely because a future mapping is pending. A surviving occurrence can reuse its
known mapping. Native matching remains paced; the SDK bridge consumes retained
mappings and adds no catalog search loop.

Current matching uses a cancellable job independent of queue sampling. Each actual
current occurrence/recording change cancels the previous job and clears its error.
A failed current match pauses and exposes that song's error without destroying the
host. It is not repeatedly searched while unchanged. A new song, a return to a
known recording, or a newly established exact mapping can recover. Late results
cannot replace the newer current song. Queue sampling conflicts during playback
changes are sampled again without retiring the host. Startup and uncertain
mutations retain their existing fences. Account-wide Spotify cooldown is retained.

Mappings prefer the exact occurrence. Distinct Spotify releases for one local
recording cannot make an exact current occurrence ambiguous. A new occurrence
receives a retained canonical mapping where available; conflicting fallback
mappings are never guessed. Publication, package queue reads and matching checks
share this selection rule.

Mobile efdae36/5ef2c35 implement official targeted skips, revision-checked set_queue,
and supported Play skip_to forms. Queue edits preserve actual occurrences, queue
identity, current position and playback intent through actual player operations.
Known entries reuse actual queue metadata. Unknown/contradictory context selection
fails explicitly; arbitrary context URL fetching is not implemented. Completed
command journals evict bounded old receipts rather than permanently exhausting
capacity. See JAM_INCOMING_QUEUE_COMMAND_PROGRESS.md for the dedicated map.

Outgoing player tracks now identify their context provider. Publication response
validation compares returned upcoming/previous order and occurrences when a player
state is returned; it no longer accepts a contradictory queue merely because the
current track and revision match. The upstream provider and command references are
[librespot provider](https://github.com/librespot-org/librespot/blob/dev/connect/src/state/provider.rs)
and the pinned local core/dealer/protocol/request.rs. Optional omitted response
player details retain the existing compatibility boundary; HTTP receipt checks are
not an audible or cross-account synchronization measurement.

## Feature tests

- SDK tests/controllable-queue.test.mjs: bidirectional changes, duplicate songs,
  current priority, partial preservation, complete replacement, receipts, echoes,
  cancellation, changed scope/revision and fresh matching after failure.
- tools/spotify-controllable-queue.test.cjs and tools/spotify-player-jam.test.cjs:
  native bridge adapter, lifecycle fencing, invocation order and resolving/failed
  owned selection recovery.
- SpotifyHostQueueCommandTest, SpotifyHostCommandTest, SpotifyHostPlayerPortTest,
  SpotifyHostCommandDispatcherTest: actual queue mutation and protocol cases.
- SpotifyHostCoordinatorTest: canceled/failed current matching, switching back,
  sampling conflict, acknowledgement completion, actual bridge projection,
  current mapping availability and no invented Dealer provenance.
- SpotifyControllableQueueProtocolTest: complete/partial membership, occurrence
  identity, exact-release mapping, invalid/stale inputs and scoped revisions.
- SpotifyHostRuntimeTest: bridge delegation and retired account/view denial.
- native tests/connect_publication.rs: outgoing provider and contradictory queue
  acknowledgement rejection.

## Live checkpoint

Before these queue changes, the installed matching candidate checksum was verified
on the restarted emulator. The user's Raid selection matched successfully despite
featured-title/extra artist differences. Android reported playing Raid, official
Linux Spotify metadata reported Raid, and its interface displayed StreamingService.
The user subsequently reported queue mismatch and loss of mapping after switching
in Spotify. A later safe diagnostic still reported Matched; that supports examining
queue/host state rather than attributing every failure to catalog search.
These observations do not verify the new queue/recovery changes. No second account
is available. Cooperative track changes, actual queue comparison/participant adds,
background behavior and unknown-track recovery need the integrated candidate.

## Integrated source verification — 2026-11-03

- `npm test` in SpotifyJam: 738 passed, `/tmp/jam-queue-sdk-final.log`.
- `npm run test:spotify`: 768 Node and 207 Jest cases passed,
  `/tmp/jam-queue-integrated-complete.log`.
- `npm run test:player-mobile`: 385 passed, `/tmp/jam-queue-player-complete.log`.
- `npx tsc --noEmit`: passed, `/tmp/jam-queue-ts-complete.log`.
- `cargo test --manifest-path native/librespot-session/Cargo.toml`: 280 passed,
  `/tmp/jam-queue-all-rust.log`.
- `:app:testDebugUnitTest`: 550 passed with no failures/errors/skips,
  `/tmp/jam-queue-native-verified.log`.

The resumed projection failure was an obsolete assertion that ambiguous previous
tracks must prevent an independently mapped current track from publishing. The
regression now separately verifies omitted ambiguous previous tracks, rejected
ambiguous current tracks and exact occurrences using different Spotify releases.
A dedicated async case verifies that matching completion cannot displace another
in-flight player sample. Uncertain local package writes still retire the host;
they are not reset or replayed as if they were harmless matching errors.

These are source checks. Build, installation and live queue/recovery verification
are separate gates recorded after source integration.

## Emulator candidate — 2026-11-03

Mobile source 0199a38 is integrated with SDK e8baa2b. x86_64 release assembly
passed in 46 seconds. Artifact:
`build/spotify-jam/StreamingService-Jam-Queue-Recovery-0199a38-x86_64.apk`.
Size 37,350,305 bytes; SHA256
`290f134ca67c650dc63037cd93e8bfadcb5ecaf0ae2a86aafec355d0dbad54f5`.
Signature and 16 KiB ZIP alignment checks passed. In-place adb installation reported
Success and StreamingService reopened. Native observation requests returned 200.
Linux Spotify was started with its existing profile and its MPRIS control is
available. No new pairing or credential extraction was performed.

The user has been asked to select downloaded Raid and reply playing. New queue,
remote selection, participant additions and current-song recovery have not yet
passed a live check. Source tests and installation do not establish these results.

## Live queue gap and contained artist integration — 2026-11-03

The user selected downloaded Raid. Android and official Linux Spotify agreed on
the current track and StreamingService was visible. A Linux Spotify pause was
reflected in Android playback state. Private MediaSession/official queue reads
found 22 local entries, current index 4, and only 14 of the expected 17 upcoming
Spotify entries. The 14 visible entries retained local order; local positions
5, 7 and 11 were omitted. This is a failing queue parity check, not acceptance.
Catalog responses observed during that check returned 200, with no observed 429.
No raw queue, account metadata or credentials were written into this report.

SDK 5dc54be introduces recording-evidence-v4: exact normalized base titles and
symmetric complete artist-set containment, with release-only, availability,
recording-code and unrelated collaborator safeguards. Its three public
Madvillainy fixtures reproduce the missing credit shapes. All 751 SDK tests
passed. These fixtures are source checks, not proof that the three live entries
now resolve. The mobile headless test now separately covers strict expanded
credits without importing and release-only credits requiring the actual importer.

On resuming, Linux Spotify remains running and the Android control sheet reports
an unconfirmed host with uncertain action state. The user explicitly postponed
the initial confirmation issue. Queue parity, cooperative local/remote selections,
recovery after matching errors and participant additions remain live gates.
The new APK must contain policy v4; force JavaScript bundling because sibling SDK
changes alone may not invalidate Gradle bundle inputs. No second account exists.

Mobile integration verification: `npm run test:spotify` passed 768 Node and
208 Jest tests (`/tmp/jam-contained-mobile-tests.log`); `npx tsc --noEmit` passed
(`/tmp/jam-contained-mobile-types.log`). Android 550 and Rust 280 are the earlier
0199a38 source results; native code was not modified in this SDK integration.

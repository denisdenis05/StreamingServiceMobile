# Commit authorization restored — 2026-11-03

The user authorized commits again at the current time, with no backdating.
Earlier uncommitted/no-commit notes describe the implementation period and are
superseded for new commits. Source results remain 769 Node and 209 Jest cases,
full TypeScript, and 283 native Rust cases. Both APKs were verified; emulator
installation and independent no-Jam preparation were observed. Full queue parity,
participant edits and physical/cross-account playback remain open. Initial host
confirmation remains deferred. The user-approved launcher and Linux Spotify
sessions must be preserved. No server deployment is authorized by these commits.

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

## Rebuilt policy v4 candidates — 2026-11-03

User override: no further commits today. SDK 5dc54be and mobile f1ec811 had already
been committed before that instruction arrived. Further notes remain uncommitted.

Forced JavaScript rebundling by deleting the generated bundle before assembly.
x86_64 release passed in 35 seconds; ARM64 in 23 seconds. Both packaged bundles
contain recording-evidence-v4. APK signature verification, ZIP 16 KiB alignment
and all 21 native library ELF LOAD alignments passed for each architecture.

- Emulator: `build/spotify-jam/StreamingService-Jam-Queue-Recovery-f1ec811-sdk5dc54be-x86_64.apk`,
  37,350,721 bytes, SHA256
  `aaaa2ce5d6c4a27491b8c0187d8c6fb23c77aac10cf38fae1f76809ab38e1675`.
  In-place installation returned Success; app reopened. Its process replacement
  cleared the active MediaSession queue. User has been asked to play Raid again;
  await that response before playback checks. Linux Spotify remains running.
- Phone candidate: `build/spotify-jam/StreamingService-Jam-Queue-Recovery-f1ec811-sdk5dc54be-arm64.apk`,
  36,266,472 bytes, SHA256
  `87870200d4affcb49c9187cd459e8834a656915686b326fc37d959f6db8b6af0`.
  Built and inspected only; not installed on a phone. Stable artifact aliases
  were not overwritten because live queue parity is not yet accepted.

Logs: /tmp/jam-contained-release-x86.log and /tmp/jam-contained-release-arm64.log.
No catalog search was manually submitted during packaging. Recent safe diagnostic
status counts contained two HTTP200 responses and no observed429. This is a
bounded observation, not proof that rate limiting cannot occur.

## Autonomous live continuation — 2026-11-03

The user authorized autonomous song selection today and repeated no commits.
Selections remain limited to the downloaded Madvillainy queue. The first v4 live
read on Raid had 22 local entries and, after background matching settled, 15 of
17 upcoming Spotify entries, missing positions 5 and 11. Local Next reached the
first omitted entry; returning to Raid restored local selection, but the native
sharing lifecycle later failed publication/preflight. Initial host confirmation
remains deferred by user instruction, and full recovery is not accepted.

A direct foreground matching observation for the omitted entry had zero search
candidates under quoted field filters. Natural title/artist text now retrieves
ten candidates with HTTP200, two title matches and no accepted artist matches.
This confirms retrieval improvement but also a remaining source-credit problem.
The matching safeguards were not weakened to accept arbitrary partial overlap.
282 Rust tests pass after two dedicated natural-query cases; mobile diagnostics
and integration pass 769 Node and 208 Jest tests plus full TypeScript. The source
credit diagnostic contains provenance, joined-credit flags and counts only.

The restarted app restored the account and native connection but had no Jam
loaded after Refresh Jam. Start sharing created an owned Jam and reached the
catalog check without new pairing. This did not replace an observed existing Jam.
Linux Spotify remains running. No credentials or raw account/queue payloads were
persisted in diagnostics. Temporary extra source lookup on failed foreground
matches is investigative and should be removed after source-credit diagnosis.

## Verified controls before final importer candidate — 2026-11-03

The natural-search diagnostic candidate recovered app-led hosting when Raid was
selected through the actual album UI after a failed current match. Queue settled
to 16 of 17 upcoming entries, leaving local index 5 omitted. Official Linux queue
selection of Rainbows changed Android current index to 7 and retained all 22 local
entries; its 14 remaining upcoming entries matched Spotify in exact order.

With Android in Home/background, official Spotify selection of Curls changed local
current index to 8, retaining 22 entries and all 13 upcoming entries in order.
Explicit Linux MPRIS Play produced Android media state 3 and Spotify Playing;
Pause was then submitted to avoid progressing into another song. These are actual
emulator/native background observations, not physical-device/process-death/audio
synchronization or second-account guest acceptance. The queue-row selection itself
preserved paused intent; explicit Play was needed and is recorded separately.
The final transitive-import candidate has not yet been installed at this point.

## Integrated independent matching candidate — 2026-11-03

Source changes remain uncommitted. The completed SDK importer chapter requires
actual mapped-record metadata and strict source equivalence before bridging a
second local identifier. Its 24 dedicated tests are in
../StreamingServiceSpotifyJam/TRANSITIVE_IMPORT_MATCHING_PROGRESS.md. The server
now projects/searches canonical recording artists as well as credited aliases;
16 catalog cases pass, including three isolated PostgreSQL cases. That server
change has not been deployed and no live canonical response is claimed.

Native publication now advertises playlist-v2 only while command handling is ready
and clears it on deactivation. Rust tests pass 283 cases, including explicit ready,
unready and deactivation checks. Official Add-to-queue availability and a real
participant append/remove receipt remain unverified. An earlier official Remove
press did not produce an observed queue change; it is not a passed edit test.

Independent recording preparation no longer requires a loaded Jam when an account
is connected. Previously the screen could enable Find but the SDK reported expired
Spotify authorization for that valid state. Actual queue submission retains ready,
active, host/guest authorization checks before confirmation or mutation. Jam arrival
and account replacement cancel old preparation. The screen now explains that a Jam
is required to add results. Eight SDK regressions and one screen regression were
added. SDK npm test passes 783 cases; mobile npm run test:spotify passes 769 Node
and 209 Jest cases; npx tsc --noEmit passes. Logs are
/tmp/jam-independent-matching-{sdk-tests,mobile-tests,mobile-types}.log.

Forced JavaScript rebundling, then built both architectures. x86_64 assembly passed
in 34 seconds and ARM64 in 21 seconds. Both signatures, ZIP 16 KiB alignment and all
21 native ELF LOAD alignments passed. Both bundles contain recording-evidence-v4
and the new no-Jam guidance.

- Emulator: build/spotify-jam/StreamingService-Jam-Independent-Matching-uncommitted-x86_64.apk,
  37,353,553 bytes, SHA256
  f3003213f720e4071fe2f78722b8620f13308cefd04004f780080cd8e99acb48.
- Phone candidate: build/spotify-jam/StreamingService-Jam-Independent-Matching-uncommitted-arm64.apk,
  36,269,368 bytes, SHA256
  1b9298cea53352e0eb3a30f09bb41d33523169b9a45ce2db6d49458e2aa5c32c.

In-place emulator installation is pending in tool session 97033. ADB remains
connected; Android dex2oat32 has accumulated zero user/kernel CPU ticks while
installd waits. No restart, data clear or new pairing was performed. Linux Spotify
is preserved. The new read-only matching behavior is source-tested and packaged,
but cannot yet be claimed as observed in the app. No catalog requests were sent
during this packaging/install attempt. Stable artifact aliases remain unchanged.

The pending in-place installation later returned Success (tool session 97033).
The app was reopened without restarting Waydroid or clearing data. Independent
read-only matching is now the next live check; installation alone is not acceptance.

## Independent matching observed in emulator — 2026-11-03

After installation succeeded, the app reopened with its retained Spotify connection
and no Jam loaded. Root opened the downloaded Madvillainy album and selected the
previously omitted recording through its Add to Spotify Jam menu without starting
playback. One Find request completed: the expired-authorization error was absent,
no NotFound/finding state remained, candidates were presented, no-Jam guidance was
visible, and visible queue actions were disabled. This verifies independent
preparation and write gating in the actual app. The current UI does not expose the
internal Matched versus Ambiguous category, so candidate display is not proof of
automatic selection or full queue parity. No confirmation or queue mutation was
submitted. Initial hosting remains deferred.

Current-process safe diagnostics contained five HTTP200 statuses and no observed
429. No raw account, recording or queue metadata was logged or added to notes.
Temporary private UI XML was removed from the workspace scratch path and emulator.
Linux Spotify remains running; no new pairing, restart or app-data clear occurred.

## User-approved launcher restart — 2026-11-03

The user confirmed ~/.local/share/applications/android-emulator.desktop, named
Android Emulator, invoking ~/.local/bin/android-emulator.sh. Closing its specific
scrcpy process let its existing cleanup stop the session. A desktop gio launch did
not retain a session; invoking that exact existing launcher script succeeded.
Waydroid and container reported RUNNING, its portrait scrcpy used the existing
--no-audio --max-size=1280 options, and ADB reconnected at the existing address.
No Waydroid/GPU configuration was edited. Linux Spotify was not stopped.

StreamingService reopened. Profile Settings -> Spotify showed Connected and the
existing Open Spotify Jam action. This proves saved connection restoration through
this emulator restart, not shared-host activation or synchronized playback. No
pairing, catalog search, queue write or playback selection was submitted during
this restart check. Launcher tool session 74156 remains running to retain the
mirror and session; do not terminate it merely as a finished diagnostic command.

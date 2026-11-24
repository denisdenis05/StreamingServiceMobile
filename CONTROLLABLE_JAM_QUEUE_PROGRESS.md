# Controllable Jam queue and local matching recovery

## App and package boundary

The mobile composition supplies local and Spotify queue port objects to the
SpotifyJam runtime. The package accepts queue snapshots and scoped compare-and-set
changes; it does not import the app or its player implementation. The Android
hosting bridge owns actual player reads, native mutations and Spotify publication.

Each snapshot carries an actual scope and revision, ordered occurrence identities,
local recording and Spotify identifiers when known, and an acknowledged operation
identity. Repeated recordings remain separate queue occurrences. Partial snapshots
retain their explicit incomplete marker. The JavaScript adapter validates and
captures inputs, checks cancellation and account/Jam scope before and after native
calls, checks the expected revision before submission, and requires an actual
matching operation receipt. Native code must also enforce compare-and-set at the
mutation boundary; the JavaScript preflight is not an atomic native write.

Actual local queue commits invoke the package synchronizer before playback
publication. The mapper consumes retained native mappings and does not launch
parallel or rapid catalog searches for future entries. Native background matching
continues to own paced future enrichment. Incoming Dealer queue changes remain
owned by the native background coordinator, avoiding a second JavaScript poller.
The SDK coordinator preserves existing destination entries for incomplete or
unresolved future projections and fences superseded asynchronous work.

## Recovery after a remote song cannot be matched

Previously, native Resolving blocked every app queue replacement as backpressure.
Selecting a known downloaded song could therefore remain stuck behind an earlier
unmatched remote song. An explicit owned app replacement or existing queue
selection now retires the old native host and restarts matching from the actual
committed local selection. Failed hosts also receive cleanup before reactivation.
The application does not report Hosting before native acknowledgement. Guests,
recovering registrations and stale account/Jam completions cannot take ownership.
Future appends do not silently interrupt a resolving current occurrence.

Native per-occurrence matching cancellation, incoming queue reconciliation and
bridge implementation are a separate chapter. These source changes do not prove
live queue convergence, audio synchronization or recovery on an Android device.

## Feature tests

| Behavior | Dedicated tests |
| --- | --- |
| Actual ordered occurrences, repeated recordings and immutable snapshots | `tools/spotify-controllable-queue.test.cjs` |
| Scoped revision preflight, actual operation acknowledgements, malformed responses and partial projections | `tools/spotify-controllable-queue.test.cjs` |
| Canceled reads, account changes during read/write and mutable caller input | `tools/spotify-controllable-queue.test.cjs` |
| Resolving/failed owner replacement, existing selection recovery, guest restrictions and stale recovery | `tools/spotify-player-jam.test.cjs` |
| Package synchronization only after local receipt, publication ordering, unknown outcomes and retired Jam suppression | `tools/spotify-player-jam.test.cjs` |
| Real queue lifecycle passes existing selection recovery through mobile composition | `tools/spotify-player-runtime.test.ts` |

## Source checks

- `node node_modules/typescript/bin/tsc --project tsconfig.spotify.json`: passed.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node --test tools/spotify-controllable-queue.test.cjs tools/spotify-player-jam.test.cjs`: 87 passed.
- `npm run test:spotify`: 768 Node tests and 207 Jest tests passed.
- `git diff --check`: passed.

No live Spotify request, device command, APK build or installation was performed
for this JavaScript chapter. The owning session must integrate the native bridge,
run its dedicated tests and verify actual queue changes and return to the user's
selected downloaded recording on the emulator.

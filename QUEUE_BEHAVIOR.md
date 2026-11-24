# Mobile queue behavior

Status: implemented and selected by the mobile app, 2026-10-15. The user authorized the full migration after items 1 and 2. RNTP has been removed. See AUDIO_MIGRATION_PROGRESS.md for executed checks and remaining device/iOS host validation.

## Ownership and scope

The replacement player's native logical queue owns committed membership, canonical order, playback order, active occurrence, shuffle, repeat and playback intent. The platform player timeline projects that queue. React and this command layer do not keep another authoritative list.

NativeQueueController is the selected mobile queue facade, composed by PlaybackRuntime. AudioPlayerService.useQueue publishes its native view and stable actions. The old prequeue flags, QueueEventEmitter and screen playback effects are removed.

QueueIntentScheduler owns operation slots and cancellation, not playlist state. PlaybackTrackMapper and NativeQueueSourcePreparation own private source preparation. PlaybackMetadataRegistry stages public metadata before native events. NativePlayerCommandDispatcher serializes actual native commands independently of potentially slow source lookup.

## Identity and revision vocabulary

| Value | Meaning |
| --- | --- |
| Recording identifier | Catalog song identity. May appear more than once. |
| Occurrence identifier | Unique identifier assigned when a track insertion is accepted. All selection/removal/move/seek targets use this identity, never a later row index. |
| Desired queue identifier | Local lifetime token for the latest accepted replacement or clear and its dependent edits. It is visible before that candidate is committed. |
| Committed queue identifier | Local lifetime token whose native replacement/clear receipt is known. It is null when a queue command outcome is uncertain. It is not a native protocol field or a durable restoration identifier. |
| Engine/authentication epochs | Native session fences. Staged handles and commands cannot cross them. |
| Native queue identity | Native replacement/clear lifetime. Commands require the expected identity and reject foreign replacements. |
| Native content revision | Canonical metadata/membership and playback order. Selection/progress do not invalidate projected pages. |
| Native control revision | Explicit playback, selection and mode actions, including redundant Pause/Stop. Prepared selection mutations require the captured value. |
| Native queue revision | Reducer concurrency precondition, refreshed immediately before submission; remains distinct from list content. |
| Event sequence | Existing event ordering; it is not a queue identity or a list-content revision. |
| Intent cancellation | A lease for a particular accepted operation. Canceling its waiter does not undo a mutation already applied by native code. |

Local queue tokens protect dependencies between facade commands. Native queue identities fence external replacements as well. Engine/account transitions invalidate local ownership; engine reconnect clears uncertain state before restoring credentials. Only this facade submits app list mutations.

## Accepted command behavior

| Command | Rule |
| --- | --- |
| playTracks(tracks, selectedIndex) | Capture inputs and allocate occurrence identifiers at acceptance. Prepare first; send one replace-and-select command. An invalid selection/source definition rejects before canceling an existing valid candidate. A failure during later preparation leaves the committed native queue intact. |
| append(tracks, isStillWanted) | Capture inputs at acceptance. Bind to the desired queue lifetime at that time. An append after a pending replacement waits for its successful receipt. A failed replacement cannot redirect its dependent append to the old queue. The optional freshness predicate is checked during preparation and immediately before submission. |
| remove / removeMany | Target captured occurrence identifiers. One batch is one native command; an invalid member must not remove the valid members. Duplicate identifiers reject before dispatch. Empty batches do nothing. |
| move(entry, beforeEntry) | Use stable occurrence and anchor identifiers. null moves to the end. Delegate the current native behavior: edit canonical and playback order together; keep the active occurrence/position. A missing anchor returns a failure rather than targeting a different row. |
| setShuffle / setRepeat | Explicit values, not React toggles. These edits wait behind earlier accepted list edits and pending replacement. Native rules determine the resulting order and capabilities. |
| clearQueue | Supersede outstanding edits, create a new desired lifetime and send one native clear. Successful clear establishes an empty committed lifetime. It is distinct from Stop. |
| select | Cancel a pending replacement and its dependents, then select the requested occurrence in the committed queue. It does not await an ordinary append's source lookup. Native can reject a stale/missing identifier. |
| Play / Pause / Stop / Next / Previous / Seek | Cancel a pending replacement and its dependents. Dispatch independently of source preparation. They do not cancel an ordinary append solely because it is still preparing. Seek captures an occurrence and validates finite nonnegative seconds before converting to milliseconds. |
| cancelPendingReplacement | Integration port for an independently observed native control that supersedes candidate playback. It cancels candidate work and dependents without issuing a second native control. Ordinary appends remain pending. |
| invalidateSession | Cancel all outstanding intents and replace local lifetime tokens. The authentication coordinator also invalidates dispatcher work and clears/configures native ownership. This method alone does not stop or clear native playback. |

Every insertion gets a new occurrence identifier even when its recording already exists in the queue. The selectedIndex argument applies only to the captured candidate list in the same replace transaction; it is not a mutable committed-queue index.

## Ordering and cancellation

1. Reserve the queue-edit slot synchronously at acceptance, before any snapshot, cache or source-registration await.
2. Serialize append, remove, move, mode edits and candidate replacement by those reserved slots. A later fast append cannot overtake an earlier slow append.
3. A new replacement or clear supersedes older pending edit slots. Failure does not restore those canceled requests; the caller may explicitly submit new ones.
4. Edits accepted after a pending replacement depend on that candidate. If it fails or is canceled, dependent edits reject; they never fall through to the previous committed queue.
5. Playback/selection controls use the separate native command lane. They can cancel candidate preparation without waiting for a filesystem operation. An ordinary append can finish after Pause and must preserve the native pause intent.
6. Canceling one queued slot must not let a later slot overtake an uncanceled predecessor. A failed append must not poison later independent slots.
7. Canceled callers reject promptly. A source registration already sent to native must still be consumed and its unused handle released when it returns. The resource-preparation chain may wait for that native response/cleanup; playback controls do not wait on that chain.
8. Native command submission is the concurrency boundary. Once a replacement has actually applied, Pause does not restore the old queue: the new queue remains, paused. A late known receipt updates local ownership accordingly. It must not overwrite a newer desired candidate or another account's ownership.

A native command whose bridge response is stalled can still occupy the native dispatcher. This implementation separates slow preparation from commands; it does not claim it can bypass an indefinitely stalled native command or undo a native mutation.

### Examples

| Accepted sequence | Result |
| --- | --- |
| Slow append B; append C | B commits before C. |
| Slow replace B; append C | Replace B, then append C to B. |
| Slow replace B; set shuffle | Replace B, then enable shuffle on B. |
| Failed replace B; append C | Both reject as appropriate; C is not appended to old A. |
| Slow replace B; replace C | B is superseded promptly; C becomes the candidate. |
| Slow replace B; Pause | Cancel B and its dependents; pause the committed queue. |
| Native already applied B; Pause; B receipt returns | Keep B and pause it; do not restore A. |
| Slow append B; Pause | Pause current audio; append B can still commit with pause intent preserved. |
| Replace B; remove an old A occurrence | Removal waits for B, then rejects if that old occurrence does not exist in B. A numeric row is never substituted. |

## Conflicts, failures and recovery

The facade uses queueCommandOnce. It never automatically retries a queue edit with a fresh revision/request identifier. The dispatcher's older generic retry API remains available for existing consumers, but is not used here.

Prepared edits capture queue identity, content revision, control revision and session before cache/source work. Same-queue ordinary appends can survive selection/Pause when content remains unchanged. Prepared replacement/append-and-select additionally require the captured control revision at the native mutation boundary. Changed content, identity or required control state rejects with source cleanup. Callers must explicitly resubmit after a conflict; they must not loop blindly.

Known validation rejections do not imply a successful edit. Public QueueCommandFailure retains the result status and native error code with a fixed message; native exception text is not exposed through that error.

An exception after sending a queue command, or an Internal/ServiceUnavailable rejection, is treated conservatively as an unknown outcome. The edit might have applied. Mark local committed ownership uncertain, expose no claimed committed identifier, and block later list/mode/selection edits. Already preparing appends must recheck that condition before submitting. Pause/Stop remain available. Explicit replacement or clear can establish known ownership again. Automatic replay and automatic destructive recovery are forbidden.

Successful native receipts, not cancellation alone, transfer source ownership. Failed/obsolete preparation releases unused registrations; cleanup failure does not prevent cleanup of other handles. Unknown receipts can leave a handle owned by native; authoritative source ownership and staged expiry remain the library's cleanup mechanisms. Replacement, clear and batch removal retire metadata independently of UI page success.

## Playback semantics retained from native

- Repeat Song: manual Next and natural completion restart the same occurrence. The native entry event starts a new listening occurrence/session. This is already confirmed by the user.
- Active removal: choose the next surviving forward entry; use the existing repeat-all wrap/end behavior when none survives. Preserve pause/play intent. This is already confirmed by the user.
- Repeat off: native end-of-queue behavior applies. Repeat all wraps under the existing native reducer.
- Previous uses the existing named restart threshold. At the first occurrence, it can restart; array position alone must not determine the UI capability.
- Shuffle preserves the current occurrence and position, retains canonical order separately, and preserves appends/removals when disabled. The existing native policy keeps the prefix through the active occurrence fixed while shuffling the remainder.
- Source/cache changes do not change recording or occurrence identity. The facade does not mutate a public queue URL to switch between cached and remote media.

## Suggestions and collection loading contract

The selected runtime preserves one automatic suggestion batch per explicitly selected collection queue. Request identity and entry provenance replace an array-boundary marker. Only one request may be active for that queue generation. Reject late results after replacement, clear, account switch or a superseding selection. Empty/error results settle in a coherent ended state; they do not clear a user's queue. A retry must be explicit. Use appendAndSelect's freshness predicate together with native queue/control preconditions.

Provider deduplication must not prohibit intentional duplicate user insertions. Configurable endless continuation, Insert Next, Clear Upcoming and actual playback history remain optional later features; appendAndSelect is the one new native command needed by this migration.

playTracks consumes the complete candidate supplied by its caller. It never watches a screen's array to infer playback intent. PlaybackCollectionLoader supplies the whole playlist with 100-row pages, capacity/cancellation checks and selected-row validation before one replacement. Screens submit explicit actions.

## Native/system integration

PlaybackRuntime observes the authoritative native state and cancels pending replacements on control revision changes. The native command precondition closes the race between a last JS snapshot and mutation. Redundant native Pause/Stop therefore supersede prepared selection even when their intent value did not change. Native queue identity fences replacements outside the facade.

One native event subscription supplies state and reporting. Native engine reconnect invalidates pending work and reconfigures credentials. Device lifecycle, routes, notifications and actual sound remain unverified; host tests demonstrate deterministic ordering and build integration only.

## Implementation and feature tests

| Area | Implementation | Dedicated checks |
| --- | --- | --- |
| Reserved order, failure recovery, cancellation and slot fairness | QueueIntentScheduler | player-queue-intents.test.cjs: 11 cases |
| Queue lifetimes, atomic replacement, dependent append/modes, rapid supersession | NativeQueueController | player-queue-rewrite.test.cjs |
| Responsive controls, ordinary append during Pause, native-control cancellation port | NativeQueueController | player-queue-rewrite.test.cjs |
| Stable duplicate occurrences, batch remove/capture, move/anchor failure, shuffle edits | NativeQueueController plus production queue reference model | player-queue-rewrite.test.cjs |
| Revision/account conflicts, unknown receipts, explicit recovery and late registration cleanup | NativeQueueController / QueueCommandFailure | player-queue-rewrite.test.cjs |
| Single native attempt and session invalidation | NativePlayerCommandDispatcher.queueCommandOnce | player-command-dispatcher.test.cjs: 3 new cases |
| Existing source, metadata, observation, reporting and authentication behavior | Existing components with explicit invalidateSession integration | Existing mobile suites, including updated composition conflict/cancellation cases |

Run `npm run test:player-mobile` for focused strict compilation and all 16 host test files. The default command now includes source preparation, composition, authentication and both rewrite suites, so these checks are not optional standalone files. Run `./node_modules/.bin/tsc --noEmit --pretty false` for the complete app.

Tests inject deferred cache/registration/native receipts and use the production TypeScript queue reference model. Items 1 and 2 changed only the mobile layer. The subsequent migration adds guarded cursors and atomic append-and-select with Kotlin/Swift/facade regression tests; the core reducers retain their existing semantics. Host tests do not establish device audio, background controls, iOS host integration or measured performance.

# Listening queue origin

Updated 2026-11-01.

## Explicit source context

Album playback already maps its queue with the selected album identifier; playlist playback already maps its queue with the playlist identifier. Catalog mapping now records the album queue origin in `sourceAlbumIdentifier` independently of the recording's display `albumIdentifier`. Playlist context takes precedence if both are supplied. Search, suggestions and foreign queues do not acquire an album origin from recording metadata.

Source context follows occurrence metadata through native selection, ordering, repeat, append and remove. Newly appended suggestions have their own unscoped origins. The history request includes exclusive `sourceAlbumId` and `playlistId` fields captured when the reporting session is created. Listening HTTP remains in the existing detached reporting queue. A successful current-account history start publishes a safe Home refresh notification; stale account responses do not publish.

## Feature-to-test map

| Behavior | Dedicated tests |
| --- | --- |
| Direct playback vs explicit album vs playlist origins; defensive exclusive payloads | `tools/player-listening-context.test.cjs` |
| Source capture before asynchronous cache lookup; metadata order/current occurrence changes; appended suggestions | `tools/player-listening-context.test.cjs` |
| Conservative legacy restoration and metadata retirement | `tools/player-listening-context.test.cjs` |
| Delayed reporting preserves each captured collection origin and account/session identity | `tools/player-reporting-integration.test.cjs` |
| Queue edits, mapping and collection loading retain existing behavior | `tools/player-native-composition.test.cjs`, `tools/player-track-mapper.test.cjs`, `tools/player-collections.test.cjs` |

`npx tsc --project tsconfig.audio-migration.json` passed. The five test files listed above passed 88 tests, including ten new origin cases. No network, Spotify, device or account data was accessed.

## Next chapter

Persist explicit album origins in a bounded app sidecar, scoped to server/account/native epochs/queue identity and occurrence identifiers. Restore before reports resume; legacy or untrusted data remains unscoped. Playlist source already exists in the native queue entry. No player-library protocol change is needed.

## Restore and background queue context

The second chapter adds app-only queue context persistence. It records explicit album origins per native occurrence and recording, together with server/account identity, native engine/authentication epochs, queue identity and content revision. Cached album occurrences also retain their recording association and cache flag without persisting media addresses. The native player protocol is unchanged.

Only a matching owned native session can restore this sidecar. Hydration runs before playback views and listening reports resume, verifies current queue identity again after reading native entries, rejects mismatched recording associations and lets explicit native playlist origins take precedence. Missing, malformed, oversized, stale or timed-out storage leaves source attribution unknown; recording display metadata never supplies an origin. Reads stop waiting after 1.5 seconds. Writes are detached, serialized, deduplicated and invalidated when the account or runtime is retired. Audio controls never await sidecar writes or history HTTP.

The sidecar contains no song titles, artist names, playback URLs, authorization tokens or request bodies. Playlist context remains persisted by existing native queue entries. Album source persistence is best effort: a reload before the detached save finishes, failed storage, or legacy queues has unknown source context. Those cases must not guess the album.

### Restore test map and source results

`tools/player-listening-context-storage.test.cjs` adds 26 deterministic tests for matching and missing receipts; all identity mismatch fields; malformed/duplicate origins; queue rewrites; account retirement; conflicting recording and playlist origins; serialized, retired, duplicate and failed writes; data minimization; read deadlines; malformed/oversized/failed storage; cached playback identity; actual Runtime reload before the first listening start; native shuffle/repeat/select/move/remove/append; and controls while writes remain unresolved.

Final chapter checks:

- `npm run test:player-mobile`: 377 tests passed, including the ten direct origin tests and 26 persistence tests.
- `npx tsc --noEmit`: passed across the app.
- Scoped ESLint on authored queue-context integration: zero errors; six preexisting explicit detached-operation warnings in touched runtime files.
- `git diff --check`: passed.

These are deterministic source checks. No APK, live device, Spotify request, production history write or deployment was performed by this chapter. Server changes and Home refresh integration are separate owning chapters.

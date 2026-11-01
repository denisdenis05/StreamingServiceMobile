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

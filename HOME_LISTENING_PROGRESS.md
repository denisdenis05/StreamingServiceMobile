# Home cards and collection listening history

Updated 2026-11-01.

## Current behavior

Home no longer draws random releases for personalized or friends sections.
The server advertises sections only when backed by data:

- Your saved albums, newest saves first.
- More from your artists, using recorded listening, the selected Liked Songs
  playlist and saved albums; already-saved albums are excluded from this section.
- Recently added albums, newest local catalog additions first.

All orders have stable identifier tie breakers and bounded result counts. New
listeners get real catalog additions rather than invented personalization.
Legacy today/picks endpoints use artist evidence or latest additions. The old
friends endpoint returns no cards because no friends-listening feature exists.

Home's Recently played grid contains explicitly played collections. The older
recent carousel endpoint remains compatible, but the mobile app avoids showing
the same recent collections twice. Owned playlist cards use the server's canEdit
capability and open PlaylistViewer; album cards open AlbumViewer. Playlist artwork
is not requested as if its identifier were an album identifier.

## Exact listening semantics

- An album queue records sourceAlbumId, independently of song album display metadata.
- A playlist queue records playlistId and does not credit the song's album.
- Direct search results, suggestions and other context-free tracks remain track
  listens without marking an album or playlist recently played.
- Queue edits preserve each occurrence's real origin. Appended suggestions do
  not inherit the previous collection's origin.
- Valid explicit album origins are restored from bounded app storage before
  listening reports resume for the matching account/server/native session/queue.
  Missing, stale, invalid, failed or unfinished storage remains unknown.
- The server validates album membership or owned playlist membership before
  crediting a collection. Invalid/conflicting source fields do not discard the
  underlying track listen or fabricate another collection.

Recents group by collection before limiting, then order by its newest listen.
Many tracks from one playlist cannot hide other collections. Deleted/unavailable
collections and another account's playlists are excluded. No public-playlist
visibility contract exists, so playlist attribution currently requires ownership.

Historical records without explicit source context cannot tell whether the queue
was an album, a playlist or a direct song. They remain stored as track history;
the migration does not guess or backfill album attribution.

## Refresh and failure behavior

Successful current-account history creation invalidates Home queries. Library and
Liked Songs changes also refresh saved/artist recommendations. Returning to Home
or foregrounding it refreshes recommendations. Query invalidation preserves the
account scope and Search query/results and cancels superseded recommendation
requests. Home, recent-grid and individual section failures each offer retry;
loading is distinct from an empty Home. Audio controls do not await history HTTP
or queue-origin storage writes.

## Feature-to-test map

| Functionality | Dedicated tests |
| --- | --- |
| Honest sections, stable ordering, artist evidence, no fake friends, collection grouping and visibility | Server `HomeRecommendationsTests.cs` (12 tests) |
| Persisted source, invalid/conflicting context, legacy compatibility and schema upgrade/rollback preservation | Server `PlaybackCollectionContextTests.cs` (9 tests) |
| Direct/album/playlist provenance, captured payloads and queue mapping | Mobile `tools/player-listening-context.test.cjs`, `tools/player-reporting-integration.test.cjs` |
| Restored native session origins, stale/malformed/failed storage, queue edits and nonblocking controls | Mobile `tools/player-listening-context-storage.test.cjs` |
| Home collection navigation, playlist capability, no duplicate recent carousel, failure/empty states, focus/foreground | Mobile `tools/home-recommendations-screen.test.tsx` (9 tests) |
| Home refresh on history/library changes without Search or unrelated Library resets | Mobile `tools/library-heart-refresh.test.tsx` |
| Matching invalidation preserves account scope and existing query lifecycle | Mobile `tools/query-lifecycle.test.cjs` |

## Final source checks

- `npm run test:home`: 21 Node lifecycle tests and 21 Jest tests passed.
- `npm run test:player-mobile`: 377 tests passed.
- `npm run test:settings`: 25 Node tests and 115 Jest tests passed.
- `npm run test:spotify`: architecture checks, 651 Node tests and 187 Jest tests passed.
- `npx tsc --noEmit`: passed.
- Scoped Home/integration ESLint: zero errors, two inherited inline-style warnings.
- Combined server filter for HomeRecommendationsTests,
  PlaybackCollectionContextTests, LikedSongsPlaylistTests and
  SearchQueryOptimizationTests: 38 passed, zero failures/skips, including real
  disposable PostgreSQL tests. The disposable cluster was stopped after testing.

The first server integration filter omitted the plural HomeRecommendationsTests
name and ran 26 tests; the corrected filter ran all 38. No production database or
external Spotify/Last.fm request was used.

## Commits and release requirements

Server `bb57ee3` adds history attribution and migration
`20261101102204_TrackPlaybackCollectionContext`. Server `1b500ad` adds Home
recommendations. Deploy both and apply the migration using the normal deployment
workflow before using the new Home/history code. Existing track listens are
preserved. User-owned appsettings changes and .idea were left untouched.

Mobile `f926304` adds explicit source capture; `cde772c` adds safe restoration.
The integration chapter adds Home presentation, targeted cache refresh,
notifications, route ownership and the feature test commands.

Detailed owning notes: server HOME_RECOMMENDATIONS_PROGRESS.md and
HISTORY_CONTEXT_PROGRESS.md; mobile LISTENING_QUEUE_CONTEXT_PROGRESS.md.

No new device, background process execution, actual playback, server deployment
or production history write was verified. The existing Jam live acceptance gap
is unchanged by this feature.

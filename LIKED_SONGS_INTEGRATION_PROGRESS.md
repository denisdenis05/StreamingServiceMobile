# Settings and Liked Songs integration

Updated 2026-11-01.

## Implemented

The Settings hierarchy now separates account, connected apps, music library,
listening and application settings. Spotify connection, reconnect and disconnect
belong to Spotify settings; actual Jam actions remain on the Jam screen. Last.fm
explains browser approval, listening history and scrobbling, with distinct pending,
checking, connected and disconnect states.

Settings → Liked Songs lets an account choose one of its owned playlists. The
server stores that designation using the existing system-playlist flag. Every
recording in the selected playlist is liked through the existing membership
queries; no track copying or database migration is required. Selection preserves
all playlists and contents. Choosing automatic clears the designation; the next
heart creates a new default Liked Songs playlist.

The current player reads authoritative heart status and confirms toggle responses.
Unknown status is visibly unknown; it cannot issue an assumed inverse toggle.
Changing selection, toggling hearts, adding/removing playlist recordings and
creating/renaming playlists publish a shared library change. Open collection
screens refresh membership indicators, and the Library list refreshes independently
of search state. Audio queues and native playback are not rewritten for heart
changes.

Collection loading cancels superseded requests, discards old account/route/revision
results and advances pagination only after success. Failed pages preserve already
loaded rows and offer retry. Initial loading, failed refresh and successful empty
states are distinct. Playlist write errors keep the page available for retry and
never log response bodies or song metadata.

Collections now fetch account-current metadata instead of trusting the old shared
MMKV recording-list snapshots, whose heart membership can belong to another
selection/account. Artwork/audio caches remain available. Offline collection
metadata display is not implemented by this hook; it requires an account-scoped
cache with explicit stale/unknown heart semantics.

## Feature-to-test map

| Functionality | Dedicated tests |
| --- | --- |
| Spotify account settings, reconnection, confirmations, advanced options and Jam navigation | `tools/spotify-screen.test.tsx`, `tools/profile-settings-screen.test.tsx` |
| Last.fm browser approval and status lifecycle | `tools/profile-settings-lastfm.test.ts`, `tools/lastfm-settings-screen.test.tsx`, `tools/profile-settings-deeplink.test.ts` |
| Playlist choice, validation, failed save, duplicate save, account switch, disposal and scoped transport | `tools/liked-songs-settings-service.test.ts`, `tools/liked-songs-settings-platform.test.ts`, `tools/liked-songs-settings-screen.test.tsx` |
| Authoritative player heart, unknown state, duplicate toggle, delayed account/song responses and external refresh during save | `tools/recording-like.test.ts`, `tools/recording-like-platform.test.tsx` |
| Revision subscriptions, selection-triggered collection refresh, cancellation, account/route fences, pagination, failed-page retry and search-state preservation | `tools/library-heart-refresh.test.tsx` |
| Filled row hearts, loading/error/empty feedback, add/create/rename/remove success publication and failed mutation preservation | `tools/library-heart-ui.test.tsx` |
| Existing query lifecycle with the new change subscription | `tools/query-lifecycle.test.cjs` |

## Verification

Final integrated source checks:

- `npm run test:settings`: 25 Node tests and 113 Jest tests passed across 11 Jest suites.
- `npx tsc --noEmit`: passed.
- `npm run test:player-mobile`: 341 tests passed.
- `npm run test:spotify`: architecture source checks, 651 Node tests and 187 Jest tests passed.
- `npm run test:query-lifecycle`: 20 tests passed. Its isolated module harness now supplies the added LibraryChanges dependency.
- Scoped ESLint on integration sources/tests: zero errors, seven warnings for existing inline layout and explicit detached operations.
- Server agent: 17 targeted tests passed, including disposable PostgreSQL cases; see `../StreamingServiceServer/LIKED_SONGS_PLAYLIST_PROGRESS.md`.

The first Spotify regression attempt found two newly introduced unnamed test
module paths. They were replaced with named Imports fields before the passing run.
The first query lifecycle run lacked the new injected module; its harness was
updated before the passing run.

## Repositories and remaining release work

Mobile chapter commits: `c026047` Last.fm, `704cbbe` Spotify/Settings,
`59c42cc` player hearts, `28625f8` Liked Songs picker and `4310d10` UI backlog.
The integration commit adds routing, change publication, collection indicators,
request lifecycle, test-script wiring and dedicated integration regressions.

Server commit `0fc21cc` must be deployed for the new picker and authoritative heart
responses. The earlier recording-catalog deployment does not include this new
chapter. No deployment or production database operation was performed here.

See `UI_BACKLOG.md` for the requested prioritized UI list. It is a remaining-work
list, not a claim those items have been implemented.

No device, live Spotify query, Last.fm authorization or second-account Jam test
was performed in this chapter. Active host registration, shared audio, external
queue changes and background reconnect still require the live acceptance scenarios
in `SPOTIFY_JAM_ACCEPTANCE.md`. Source checks do not prove these device behaviors.

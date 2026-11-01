# Liked Songs settings

## Implemented chapter

The mobile settings page loads the account's selected Liked Songs playlist and owned playlists from the server. Radio choices have an explicit Save action. The page explains that playlist membership controls filled hearts, liking adds a track, and removing a heart removes a track from the chosen playlist. Automatic Liked Songs clears the assignment while preserving existing playlists and explains that the next like creates a default playlist.

The injected settings service validates and copies only the fields it needs, keeps confirmed state during failed saves, ignores duplicate writes, and publishes a library change after a confirmed successful save. A failed response asks the user to refresh because a request might have committed before its response was lost. Account replacement/logout/disposal abort pending requests and reject stale completions. Current playlist, unsaved draft and error are presented separately; failed saves preserve the user's draft for retry, while changing accounts discards it.

The platform composition captures the current account token in a scoped application client. It reads `Library/liked-songs-playlist` and `Library/playlists`, writes `Library/liked-songs-playlist`, and observes root-owned library-change notifications to refresh settings when other library operations change the assignment or choices. Null assignment and canonical `{playlistId}` PUT responses match the agreed server contract.

## Feature-to-test map

| Behavior | Dedicated evidence |
| --- | --- |
| Read current selection/owned choices, copy validated fields, preserve immutable choices | `tools/liked-songs-settings-service.test.ts` |
| Confirmed playlist save, null automatic assignment, one library notification, redundant save suppression | `tools/liked-songs-settings-service.test.ts` |
| Failed/unconfirmed saves preserve previous state; duplicate commands and refresh do not interrupt writes | `tools/liked-songs-settings-service.test.ts` |
| Account replacement, logout, abort signals, stale completion protection, observer-triggered account changes and disposal | `tools/liked-songs-settings-service.test.ts` |
| Empty playlists, unavailable assignment, invalid/duplicate choices, count and string bounds, safe failures and observer isolation | `tools/liked-songs-settings-service.test.ts` |
| Scoped auth token, endpoint/body/signal wiring, library-change refresh and logout network exclusion | `tools/liked-songs-settings-platform.test.ts` |
| Explicit Save after radio choice, no write on open, membership explanation and automatic preservation | `tools/liked-songs-settings-screen.test.tsx` |
| Busy disabling, failed-save draft retry, account replacement, unavailable/loading/empty states | `tools/liked-songs-settings-screen.test.tsx` |

## Verification

- `npx jest --runInBand --watchman=false --runTestsByPath tools/liked-songs-settings-service.test.ts tools/liked-songs-settings-screen.test.tsx tools/liked-songs-settings-platform.test.ts` — 30 tests passed across three suites.
- `npx tsc --noEmit --pretty false` — mobile source tree passed.
- `npx tsc --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noUnusedLocals --noUnusedParameters --target ES2020 --module CommonJS --skipLibCheck --noEmit src/services/settings/LikedSongsSettingsService.ts` — pure settings service passed strict checking.
- Scoped ESLint across the seven implementation/test files — no errors; five existing-policy `no-void` warnings for detached promises.
- Prettier applied to authored implementation and tests.

## Integration

The parent owns App registration and test commands. Register default `LikedSongsSettings` from `src/pages/Settings/LikedSongsSettings.render.tsx` at `SettingsRoutes.likedSongs`. Include the three dedicated Jest suites in `test:settings`. The pure service can also be added to `tsconfig.settings.json`; it has no native or app imports. No App/package/DataProvider files were edited for this chapter.

The platform depends on the parent-owned `src/services/LibraryChanges.ts` exports `notifyLibraryChanged` and `subscribeLibraryChanges`; that file is not part of this chapter's commit. Other library views and their query invalidation remain the parent's integration chapter. Physical-device layout, actual authenticated server requests and persisted database behavior have not been exercised here. Cancelling local requests cannot reverse a server write that already committed.

React Native accessibility roles and React component properties are framework contracts. Source values with application meaning use named constants. No code comments or abbreviated authored identifiers were added.

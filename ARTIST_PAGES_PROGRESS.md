# Artist pages

## Implemented on 2026-11-14

- Artist search entries open the Artist stack route with the selected artist ID and name.
- The artist page uses the app's existing colors, fonts and cached artwork. A two-column album grid opens AlbumViewer with all artwork tiers.
- In your library lists indexed albums. Discography requests the external catalog only after selection. Both lists support explicit pagination, empty states and retry.
- Go to artist sits beside Go to album in the shared context menu. Existing search, album, playlist and player menus provide recording or album IDs. Restored player entries can resolve their artist without adding server-specific fields to the player package.
- Artist and account changes unmount old requests and clear displayed albums. Switching list sources cancels old requests. Late responses cannot replace the current list. A failed page retains loaded albums and retries the same offset.

## Feature tests

| Behavior | Dedicated source test |
| --- | --- |
| Artist search tap and identity | tools/artist-search.test.tsx |
| Shared menu placement, navigation and missing identity | tools/artist-navigation.test.tsx |
| Library albums, EP navigation, recording resolution, pagination, deduplication, retry, empty states and account/artist/source cancellation | tools/artist-screen.test.tsx |

Commands run:

- `npm run test:artists`: 12 passed.
- `npx jest --runInBand --watchman=false --runTestsByPath tools/artist-screen.test.tsx tools/artist-navigation.test.tsx tools/artist-search.test.tsx tools/home-recommendations-screen.test.tsx tools/recommendations-screen.test.tsx`: 27 passed.
- `npx tsc --noEmit --pretty false`: passed.
- `git diff --check`: passed.

## Release boundary

This source requires the matching Server artist endpoints. No database migration is needed for this feature. No APK was packaged, no device check was performed, and no deployment or push was performed. Album playback and importing continue through the existing album flow. Discography availability still depends on MusicBrainz and the server's existing download sources. These source tests do not establish real-device playback behavior.

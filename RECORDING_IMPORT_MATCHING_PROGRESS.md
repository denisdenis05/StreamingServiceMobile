# Import-backed Jam recording matching

## Source chapter — 2026-11-02

Mobile now supplies the SDK's optional RecordingImportMatcher port with the existing
read-only `Library/playlists/preview-import` endpoint. The SDK owns matching policy;
all application credentials, HTTP routes and account lifecycle checks stay in
Mobile. No playlist-import mutation or new server endpoint is involved.

Foreground connection, headless hosting and headless recording resolution use the
same adapter. Hosting reuses its already captured source and native candidates,
so invoking the translator does not issue a second Spotify search or source lookup.
The adapter submits actual Spotify titles, the first individual artist credit and
available release metadata. It accepts only corresponding ordered responses with
valid recording UUIDs, and marks an import exact only when available, exact and
not suggested. Empty UUIDs remain unmatched. Requests are limited to twenty songs;
HTTP failures remain typed and no automatic retry is added.

Cancellation and account identity are checked before and after the request. Logout
invalidates the old adapter even if the same account later returns. The application
network client retains its existing bounded authentication renewal behavior.
No raw track/account data or network response is logged by this adapter.

## Feature tests

- `tools/spotify-recording-import.test.cjs`: 18 deterministic cases for primary
  credit submission, exact/suggested/unavailable decisions, malformed or reordered
  responses, empty identifiers, cancellation, replaced accounts, typed rate limits,
  empty requests and actual injected headless recording matching.
- `tools/spotify-recording-import-platform.test.ts`: 4 cases for the read-only
  route and credential scope, server mismatch, logout/restoration and late completion.
- `tools/spotify-background-hosting-headless.test.ts`: 5 cases, including actual
  import fallback for featured titles and additional Spotify artist credits.
- `npx tsc --project tsconfig.spotify.json`: passed.
- `node --test tools/spotify-recording-import.test.cjs`: 18 passed.
- `npx jest --runInBand --watchman=false --runTestsByPath
  tools/spotify-recording-import-platform.test.ts
  tools/spotify-background-hosting-headless.test.ts`: 9 passed.
- `npx tsc --noEmit`: passed.

- Full `npm run test:spotify`: 742 Node and 206 Jest cases passed against
  SpotifyJam chapter `46f1585`; log `/tmp/jam-import-matching-spotify.log`.
- Existing background/catalog tests now explicitly require exact title/artist
  matches to tolerate missing or different durations. Release-credit ambiguity
  remains guarded.

The feature suite is included in `npm run test:spotify`. These are source tests
using injected data; no live importer request, Spotify request, playback, APK
installation or device acceptance was performed in this chapter. Real Raid
matching and subsequent hosted queue updates still need cooperative verification.

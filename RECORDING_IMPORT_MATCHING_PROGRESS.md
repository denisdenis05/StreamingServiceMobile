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

## Integrated matching candidate

Final SDK source is `56d9356`, including same-source import equivalence; Mobile
source is `688f2b1`. Root reran `npm run test:spotify`: 742 Node and 206 Jest cases
passed. `npx tsc --noEmit` and 385 `npm run test:player-mobile` cases passed.
SDK `npm test` passed 718 cases. Source logs are in `/tmp/jam-import-matching-final-*`
and `/tmp/jam-import-matching-player.log`.

The deterministic public-name fixtures cover Raid with featured-title/expanded
credits and an actual injected exact import mapping, All Caps without duration,
and Accordion with differing durations. Fixture metadata is constructed test data,
not an assertion about the account's actual Spotify metadata. Unrelated artists,
nonmatching base titles, conflicting codes, unavailable tracks, ambiguous candidates
without exact proof and canceled/stale import results retain dedicated rejection tests.

Root assembled x86_64 release with `:app:assembleRelease` in 25 seconds.
Artifact: `build/spotify-jam/StreamingService-Jam-Matching-688f2b1-x86_64.apk`.
Size 37,303,521 bytes; SHA256
`4c32961ba2aaa0beb3a5c3cca3a93a040f95bc5086f47fc69fc97d5e31e15572`.
APK signature and 16 KiB ZIP alignment checks passed. No phone APK or live playback
acceptance is implied by this build. The next gate is the user's downloaded Raid
selection, actual successful matching/hosting and a subsequent user-led track change.

The in-place emulator install has not completed: `adb install -r --no-streaming`
is waiting while Waydroid's dex2oat32 process remains sleeping with zero CPU ticks.
No emulator restart, data clearing or Spotify process restart was performed.
Do not call this candidate installed or ask the user to test it until installation
actually reports Success and the app reopens. Current installer tool session is
41825 and the compiler process observed was 74908; confirm liveness before acting.

# Scoped observed recording metadata — 2026-10-31

`SpotifyObservedRecordingStore` retains metadata that the app actually observed
for local recordings, for reuse by foreground and headless catalog matching. Its
only library import is the `CatalogSong` type. It has no native player, runtime,
networking, authentication storage or platform dependency, and cannot acquire or
replace playback ownership.

The injected `getScope()` identifies the current account and server. The root
application composes the singleton and connects `observeScope(subscribe)` to real
account/server changes. The subscriber clears stored recordings synchronously on
logout or scope replacement. Every read and write also rechecks that injected
scope. Nothing is persisted and no media addresses, artwork, request headers,
credentials or unrelated track fields are retained.

## Composition contract

- `captureScope()` returns a frozen opaque scope token or null.
- `remember(tracks, capturedScope = captureScope())` captures only supplied real
  recording identifier, title, artist and a valid optional duration.
- `read()` returns a frozen array of frozen `CatalogSong` copies for the current
  scope. It does not return the original track objects.
- `scopeChanged()` is a stable callback. `observeScope(subscribe)` registers it
  and returns the platform unsubscribe callback.

Capture the scope before asynchronous preparation and pass that same token to
`remember` afterward. Tokens use actual object identity as well as the scope's
revision, so prelogout work cannot repopulate a later login to the same account
and server. Forged token copies are rejected. Callers should use raw actual track
metadata before any UI fallback labels are synthesized.

Missing/invalid identifiers, titles or artists cause omission; no identity or
metadata default is created. Missing, invalid, nonpositive or inexact millisecond
durations remain absent. Configuration limits storage to at most 2,001 recordings
and input processing to the last configured number of tracks in each call. An
updated recording replaces its previous observed metadata and becomes most
recently observed; oldest entries are evicted when needed. Remember the selected
current track separately when submitting a larger raw queue whose current track
could otherwise fall outside that input bound.

## Dedicated checks

`tools/spotify-observed-recordings.test.cjs` has ten deterministic cases covering
real metadata copying/freezing, field privacy, missing/invalid metadata, duration
boundaries, account/server replacement, immediate observed logout, same-account
login stale-work rejection, forged tokens, reentrant metadata getters, capacity,
fresh metadata replacement, invalid capacity, throwing providers and unsubscribe.

`node --test tools/spotify-observed-recordings.test.cjs`: 10 passed.
`node node_modules/typescript/bin/tsc --project tsconfig.spotify.json`: passed.
SpotifyJam `npm run build`: architecture source checks and TypeScript passed.
Mobile `git diff --check`: passed. The owning session runs broader integration
checks after composing the actual application and headless callers.
No adb, Gradle, live Spotify operation, pairing, player takeover or commit was
performed for this domain change. Root owns actual application/headless
composition, backend compatibility behavior and device verification.

## Actual current recording duration

`SpotifyObservedRecordingDuration({ store, player }).capture()` uses only injected
observed metadata and `PlayerObservation.getSnapshot`. It captures the opaque
account/server scope before awaiting any native read. Two actual ready snapshots
must retain the same engine/authentication, queue identity/revisions, playback
control revision, current occurrence/recording and positive safe integer duration.
Position/event sequence may progress during sampling; neither supplies duration.
Missing/unready media, interruptions, native errors, changed ownership/cursor,
unknown recordings and scope changes cause omission rather than fabricated data.

The helper fills only missing duration for the exact already observed current
recording. Existing actual duration and changed metadata are retained; duration
from the current audio is never assigned to future queue entries. The store's
input also accepts an optional positive safe integer `durationMilliseconds` so an
actual native value such as 1,001 milliseconds is not lost through floating point
seconds conversion. Existing raw `durationSeconds` inputs retain their validation.

`tools/spotify-observed-duration.test.cjs` adds nine dedicated behaviors: real
current-only duration, supported ready states, absent/unready/invalid duration,
unknown current identity, changed occurrence/recording/duration/cursors, account
replacement and same-account logout, metadata or duration replacement while
sampling, private native failure and retaining existing actual duration.

Spotify TypeScript compilation passed. Observed metadata and duration suites
passed all 19 cases. The root composes the helper before the actual hosting queue
capture and owns final device verification. Upcoming raw recordings without
actual duration remain unmatched/ambiguous under the unchanged strict ranker;
this helper does not establish full backend catalog compatibility or successful
Spotify hosting. No Gradle, adb, playback mutation or native ownership import was
introduced in this helper.

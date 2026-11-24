# Listening country and explicit Jam playback — 2026-10-31

The player Jam sheet and Jam management screen now offer explicit Start sharing
and Join and listen actions. Start sharing creates membership when needed, then
waits for acknowledged app hosting. Join and listen joins with the native control
membership mode, verifies the resulting membership and host, then starts following.
The advanced remote membership mode keeps a separate remote-control-only label.
Membership alone never produces acknowledged hosting. A membership that remains
after playback startup fails is described separately from shared playback.

One injected listening-country store supplies the player sheet, hosting,
shared-playback and recording-selection screens. Device region supplies the initial
value; an account-scoped saved preference can replace it. Account replacement or
logout immediately clears the previous account's value. Delayed reads cannot
replace a newer account or an explicit edit. Invalid countries cannot be persisted;
input is normalized and validated without silently truncating additional characters.
Observer/storage/device-region failures cannot break another screen's preference.
The native session already uses its actual Spotify account country for catalog
search; no Spotify profile request was added.

The country store has injected region/storage dependencies. Concrete storage,
Android region and application-account composition are owned by the main integration
chapter. The controller receives a stable account identity independently of its Jam
scope so creation can transition to hosting without retiring its own action. Changed
account identity, Stop, disposal and duplicate pending actions fence startup.
Safe hosting stage messages explain matching, readiness and activation failures
without copying native messages or private values.

## Dedicated feature tests

- tools/spotify-listening-country.test.cjs: region fallback, validation, saved
  preference, stale account reads, explicit-edit ordering, storage failures,
  observer isolation and failed region lookup.
- tools/spotify-player-jam.test.cjs: create then acknowledge hosting, membership
  without following, account replacement, duplicate startup, known membership
  failures, plus existing queue/control/authority regression cases.
- tools/spotify-player-jam-screen.test.tsx: explicit start/join invitation inputs,
  country and guest gating, pending actions, retained playback after sheet close.
- tools/spotify-screen.test.tsx: explicit unified screen actions and separate
  remote membership mode, existing authentication/membership regressions.
- tools/spotify-hosting-screen.test.tsx, tools/spotify-shared-screen.test.tsx and
  tools/spotify-recording-screen.test.tsx: shared preference injection preserves
  explicit starts, country-dependent matching and permission guards.

## Verification

- npm --prefix ../StreamingServiceSpotifyJam run build: architecture source
  checks and library build passed.
- npx tsc --project tsconfig.spotify.json: passed after library rebuild.
- node --test tools/spotify-listening-country.test.cjs
  tools/spotify-player-jam.test.cjs: 39 passed.
- npx jest --runInBand --watchman=false --runTestsByPath
  tools/spotify-screen.test.tsx tools/spotify-hosting-screen.test.tsx
  tools/spotify-shared-screen.test.tsx tools/spotify-recording-screen.test.tsx
  tools/spotify-player-jam-screen.test.tsx: 71 passed.
- npx tsc --noEmit: passed after the concurrently authored platform test's module
  boundary correction.

No live Spotify request, adb action, emulator installation, audible playback or
cross-account permission result is claimed by this chapter. All source changes
remain uncommitted for integration review.

## Membership retained after failed startup

Review found the main Jam screen's playback progress/error block was inside the
no-membership branch. It now appears in both membership states and includes the
safe hosting stage. A newly created membership with failed catalog matching keeps
its ownership, retained-membership explanation, Backpressure category and matching
stage visible. Membership pending while following starts also keeps the playback
preparation message visible.

Dedicated regression cases in tools/spotify-screen.test.tsx cover both transitions.
Focused Jest: 46 passed. Library build/architecture source checks, full TypeScript
and git diff --check passed. This correction does not establish live playback.

## Upcoming matching preserves current playback

The follower's upcomingQueuePending, upcomingQueueFailure and unavailableUpcomingCount
are projected separately from the current playback failure and user-action pending
state. The shared-playback view and Playing Jam sheet explain background matching
while preserving the current following status and Stop action. A partial queue says
only matched songs are queued and describes stopping/restarting following or choosing
local music. Upcoming matching does not produce a generic current playback failure
or claim that the entire queue is available. Ownership now reads You own this Jam;
only acknowledged hosting uses active-host wording.

Dedicated regressions cover pending matching, unavailable upcoming recordings and
absence of a current playback alert in both views. The controller regression covers
separate metadata, preserved Following state and clearing metadata when detached.
Focused Jest across shared/player/main screens: 63 passed. Library build/architecture
source checks and full TypeScript passed. The owning integration chapter compiles
and runs the new domain regression after the follower library build is finalized.
No live playback result is implied by these source checks.

## Specific player queue corrections

The player Jam snapshot now retains the validated hosting queueIssue. One safe
message helper supplies all three error surfaces: the Hosting view, Playing Jam
sheet and main Jam flow. Empty queues ask the listener to choose a library song;
queues beyond the hosting policy ask for a shorter queue using the policy's actual
maximum; externally controlled queues ask the listener to stop following first.
These specific corrections replace the generic category/stage for recognized queue
issues. Other failures retain their existing safe category/stage messages.

Nine dedicated parameterized UI cases cover all three issues across all three
views, including retained membership on the main screen. Three dedicated domain
cases verify exact queueIssue projection. Focused Jest across these views: 68
passed. Library build/architecture source checks and full TypeScript passed. Root
integration owns the final domain compilation/run and packaged build. No emulator,
Spotify playback, Gradle or commit action ran in this correction.

## Saved Spotify startup belongs to the application

SpotifySavedConnectionStartup now restores a saved Spotify connection once per
application account per app run after application authentication is restored.
It has injected account/controller/authorization-readiness sources and only calls
restore; it never starts hosting, following or playback. Failed restoration is not
retried by observations. Already-connected, manual Connecting and explicit
Disconnecting states consume that account's automatic attempt, preserving an
explicit later disconnect. New account startup waits for old connection retirement;
old asynchronous completion cannot retry or reconnect an account already attempted.
Disposal fences later observations/completions and removes subscriptions.

SpotifyAuthorizationStartup exposes getSnapshot/subscribe readiness after initial
redirect inspection and while no callback is pending or browser flow active.
Pending authorization starts its Connecting operation before readiness listeners
can consider saved restoration. This prevents a concurrent restore from retiring
an OAuth transaction. The root composition injects this barrier into saved startup.
The Jam page no longer owns an independent mount-time restore, avoiding a second
attempt after explicit disconnect or missing saved credentials.

Dedicated tests: tools/spotify-saved-connection-startup.test.cjs covers restored
accounts, logged-out/missing accounts, redirect readiness, manual attempts,
explicit disconnect, failure without retry, account replacement during restore and
manual retirement, disposal. tools/spotify-authorization-recovery.test.cjs adds
readiness regressions for initial-address waiting, pending account callbacks,
Connecting-before-readiness ordering and disposal. Combined startup/recovery Node
suite: 44 passed. Main Jam screen Jest: 49 passed. Domain TypeScript, full TypeScript,
library build/architecture checks and diff checks passed. The new Node suite is
registered in test:spotify. No device, Spotify, Gradle or commit action was used.

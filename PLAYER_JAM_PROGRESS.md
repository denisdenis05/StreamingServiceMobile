# Jam integration in the player — 2026-10-31

The actual Playing screen now contains a Spotify Jam status/control sheet, host
and follow actions, country entry, explicit stop and invitation/QR navigation.
It uses current application/native connection state and exposes no account,
credential or invitation in the player snapshot. Sharing continues when the
sheet closes. Stop remains available while matching; it does not end remote
membership. The player content scrolls, with dismissal restricted to its top.

PlaybackRuntime now injects a generic queue-change lifecycle. Album/search
replacement, loaded playlists, append, selection, remove/reorder/clear and
recommendation continuation reach the same preparation/receipt boundary. While
hosting, new recording mappings are prepared before real queue mutation; a
fresh native cursor/control/occurrence check rejects an older request after a
newer local or remote action. Only an applied operation requests immediate host
publication. Clear withdraws sharing after actual local clear acknowledgement.
The generic player contract has no Spotify dependency.

While following, Play/Pause/Next/Previous/Seek use the actual guarded native
Spotify command path and refresh the authoritative shared queue after receipt.
They never also mutate local audio. Native Dealer events trigger coalesced fresh
follower reads. The transient Jam Operating state retains the same follower;
Uncertain/removed membership still retires it. Unsupported arbitrary remote
select/play is not simulated: owners can explicitly switch to Host from this
player; guests can use allowed queue append or stop following for local playback.
Shuffle/repeat are disabled in both player and Settings under sharing/following.
Ordinary local playback retains its error path and requires no Spotify matching.

## Dedicated source mapping

- tools/spotify-player-jam.test.cjs: explicit host/follow/country, denied roles,
  mapping/publication ordering, cursor/account/Jam retirement, duplicate mappings,
  bounded queue input, remote controls/seek, no local duplicate execution,
  uncertain publication, clear, options, stop ordering, disposal and local errors.
- tools/player-queue-lifecycle.test.cjs: absent integration, attachment replacement,
  detached ownership and stale publication receipts.
- tools/player-jam-runtime.test.cjs: actual player queue replacement/playlist/append/
  selection/clear preparation, preserved old audio on failure and newer remote
  Next overriding older preparation.
- tools/spotify-player-jam-screen.test.tsx: explicit sheet/actions, country/guest
  gating, retained ownership on close, invitation route, failures and cancel.
- tools/spotify-native-follower-context.test.cjs: Operating preserves verified
  following while uncertain membership remains rejected.

## Source results and limits

npm run test:spotify passed 538 Node and 148 Jest cases.
npm run test:player-mobile passed 341; npm run test:settings passed 25 Node and
25 Jest. Full TypeScript passed. Native source: 433 JVM, 236 Rust and 8 probe
example tests; probes: 32 cases. Library: 643 cases. Physical mobile verification
is postponed. No real cross-account permission, audible latency/alignment or
background process-survival claim follows from these tests. Catalog search still
has a current-session diagnosis: approved probe 12242 registered; playback read
and metadata decoding passed, then the single search received actual HTTP 429
from Spotify. No retry followed. Successful candidate search remains unverified;
the registered read-only probe is preserved.

## Bounded player controls and accurate following instructions

The player Jam sheet now has a bounded height and scrollable action content.
The close action stays outside the scroll area. Keyboard taps reach enabled
controls and dragging dismisses the keyboard, allowing invitation and country
input without placing the remaining actions outside the sheet's layout bound.
The dedicated layout test checks these component contracts; it does not establish
actual keyboard or small-screen behavior without a device.

Following instructions now describe permitted remote player controls and the
explicit Stop following action. The former statement that pausing locally stops
following contradicted the current player command routing.

Feature mapping: `tools/spotify-player-jam-screen.test.tsx` covers bounded scroll
content, keyboard interaction properties, Stop/details reachability within the
scroll tree and the fixed close action. `tools/spotify-shared-screen.test.tsx`
covers the rendered remote-controls and explicit-stop explanation.

Ran focused Jest for both files: 22 passed. `npx tsc --noEmit` passed. Emulator
and physical-device checks remain postponed; no playback claim follows.

## Owned Jam queue replacement repair — 2026-11-01

Selecting an app song or collection now starts sharing the actual replacement
queue when an active Jam belongs to the connected account and the native Connect
connection is ready. This applies to an available Jam, a failed hosting attempt,
and an owner currently following Spotify. It does not create membership, take over
a guest Jam, or start hosting from append, reorder, remove or clear commands.
An existing host retains its prepare-before-mutation mapping path.

Owner following is stopped before local replacement. Native authority release
intentionally clears its queue. The app acknowledges only a cleared, empty queue
with matching engine/authentication epochs and no external authority. Already
local playback must retain its exact queue/control cursor during acknowledgement.
New player epochs, competing queues, retained external ownership and stale
account/Jam intents reject the handoff. Subsequent preparation still checks the
confirmed cursor before committing. Hosting starts once, only after the actual
local queue command completes, and uses the existing scoped catalog matching,
request pacing and cancellation. A catalog or host activation failure remains a
reported failure; local playback is not proof of successful Spotify hosting.

| Behavior | Dedicated regression coverage |
| --- | --- |
| Owner following releases before replacement and starts hosting after the receipt | `tools/spotify-player-jam.test.cjs`, `tools/spotify-player-runtime.test.ts` |
| Owned available/failed Jam shares an explicit app replacement without another action | `tools/spotify-player-jam.test.cjs`, `tools/spotify-player-runtime.test.ts` |
| Guest/no-Jam behavior, reconnect readiness, failed acknowledgement and superseded cleanup | `tools/spotify-player-jam.test.cjs`, `tools/spotify-player-runtime.test.ts` |
| Real runtime accepts expected cleared queue or unchanged local queue; rejects foreign queue, engine replacement and retained authority | `tools/player-jam-runtime.test.cjs` |
| Duplicate receipt cannot activate hosting twice | `tools/spotify-player-jam.test.cjs` |

Source checks passed:

- `npx tsc --project tsconfig.spotify.json` and
  `node --test tools/spotify-player-jam.test.cjs`: 50 cases.
- `npm run test:player-mobile`: 382 cases, including the dedicated runtime tests.
- `npx jest --runInBand --watchman=false --runTestsByPath tools/spotify-player-runtime.test.ts`:
  seven cases.
- `npx tsc --noEmit`.

This chapter sent no live Spotify requests and ran no device commands. The owning
session must verify actual host activation, visible Connect device identity,
Spotify queue publication and audio on the emulator after native fixes and APK
integration. A second account is still needed for guest/shared-audio acceptance.

### Explicit host action while following

The explicit host-current-queue action no longer offers a mirrored Spotify queue
as a local hosting candidate. The controller reports no hosting capability while
following is waiting, matching, preparing, active, buffering, stale, unavailable
or stopping. Both explicit hosting commands reject before invoking native host
startup, so they cannot clear the follower queue and then fail with EmptyQueue.
The separate Jam hosting panel now uses this guarded controller instead of calling
the hosting store directly. It directs an owner following Spotify to choose a
song or playlist in the app; the player sheet already shows that selection path.
The owner-only replacement handoff above remains available.

Dedicated regressions: `tools/spotify-player-jam.test.cjs` covers every following
phase; `tools/spotify-hosting-screen.test.tsx` covers the disabled mirrored-queue
button and guarded dispatch; `tools/spotify-player-jam-screen.test.tsx` covers the
absent player host action with owner selection guidance.

Passed `npx tsc --project tsconfig.spotify.json` plus the controller suite (58
cases), the four Spotify screen/hosting/player/composition Jest suites (88 cases),
and `npx tsc --noEmit`. No device or Spotify network operation was performed.

## Catalog request rejection guidance — 2026-11-02

InvalidInput during catalog matching/recording preparation now explains that
Spotify rejected the catalog request and that local playback remains available.
The player modal, hosting panel and membership panel share one detail helper.
Other stages and rate-limit/authentication/network guidance retain their existing
messages. Dedicated helper matrix and each surface's UI regression pass.
Integrated `npm run test:spotify`: 698 Node and 199 Jest passed; TypeScript passes.
These source checks do not establish successful native host activation.

## Equivalent background catalog candidates — 2026-11-02

SpotifyJam `3c7a771` applies strict same-recording duplicate-release selection.
Mobile background tests now separately cover exact equivalent candidates resolving
deterministically and distinct durations remaining ambiguous. Integrated Spotify
checks pass 701 Node and 199 Jest cases; TypeScript passes. On the emulator the
same prior ambiguous recording now reports Matched and reaches Sharing this
player with Spotify. A later publication failure remains under investigation;
this is not sustained playback acceptance.

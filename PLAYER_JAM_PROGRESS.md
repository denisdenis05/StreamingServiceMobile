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

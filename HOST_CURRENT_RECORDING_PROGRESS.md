# Current recording first hosting — 2026-11-02

## Source change

The cooperative Raid test exposed album-wide startup matching: an unmatched
album opener could prevent the actual selected recording from ever being looked
up. Queue capture now includes the actual current occurrence. Startup translates
only that occurrence, revalidates the complete captured queue and current
occurrence, then starts native hosting with its confirmed real Spotify mapping.
No mapping, occurrence or Spotify identifier is fabricated.

Native publication requires a mapped actual current recording. Other missing
mappings are omitted from previous/next arrays while preserving their actual side
of current and playback order. Ambiguous or malformed mappings remain errors.
A previously unknown recording becoming current still enters the existing fenced
pause/resolution path. Hosting is reported again only after a fresh sample,
validated projection and successful publication, so delayed matching cannot claim
that an obsolete current recording is shared. This safety path does not resume
paused local audio automatically.

The coordinator enriches upcoming recordings first, then previous recordings,
through an independent background broker operation. Current publication, commands
and playback continue while that future match is pending. Attempts are separated
by at least 2500 elapsed milliseconds, including a delay after initial activation.
There is one attempt per recording per hosting lifetime, at most 160 distinct
attempts, and one outstanding background match. Genuine NotFound results remain
omitted without retries. Other failures disable further background matching for
that host lifetime, without withdrawing its already matched current recording.
This avoids issuing searches for successive future songs during server cooldown.
The existing native catalog admission/cooldown remains authoritative.

Headless failures now carry only allowlisted integration categories through the
native bridge and broker. Unknown categories become Network. Previously every
failure became NotFound, which erased backpressure and authentication failures.
Concurrent explicit preparation borrows the existing same-recording broker job;
its cancellation cannot cancel the original job. Host retirement still cancels
the owned job, and late results cannot publish into a retired account/session.

Active-host replacement now carries its actual selected recording from both
playTracks and playCollection through the queue lifecycle. Only that selected
recording is prepared before local queue commitment. It must belong to incoming
tracks. Appends and other queue changes do not pretranslate the entire incoming
queue; native current fencing and future enrichment handle the actual result.
Existing account, player epoch, authority-release and commit guards remain.

## Dedicated feature mapping

| Behavior | Tests |
| --- | --- |
| Captured actual selected occurrence after an album opener, missing/changed current and full queue revalidation | tools/spotify-hosting-queue.test.cjs |
| Only selected current matched before activation, unmatched opener ignored, absent current rejected, stale account/cursor/intent | tools/spotify-hosting.test.cjs |
| Sparse previous/next order, required mapped current, no invented identifiers or ambiguous mappings | SpotifyHostPublicationProjectorTest |
| Independent pending/success/failed future mappings, real advancing audio, search pacing, no retry, active commands, promotion to current, fresh-current publication, removed entries, stale accounts and stop cancellation | SpotifyHostCoordinatorTest |
| Same-recording job sharing, borrowed cancellation, safe failure categories and existing claim/deadline/cache fences | SpotifyHostRecordingBrokerTest |
| Safe category preservation, private unknown failures and deadline cleanup | tools/spotify-background-hosting.test.cjs; tools/spotify-background-hosting-headless.test.ts |
| Actual selected recording through runtime and composition; current-only active preparation; append without future matching barrier; invalid selected recording and existing commit/authority fences | tools/player-jam-runtime.test.cjs; tools/spotify-player-runtime.test.ts; tools/spotify-player-jam.test.cjs |

## Verification

- `npx tsc --noEmit`: passed.
- `npx tsc --project tsconfig.spotify.json`: passed.
- `npm run test:player-mobile`: 385 passed.
- `npm run test:spotify`: 724 Node and 201 Jest cases passed.
- `./android/gradlew -p android :app:testDebugUnitTest --tests '*SpotifyHostCoordinatorTest' --tests '*SpotifyHostPublicationProjectorTest' --tests '*SpotifyHostRecordingBrokerTest' -x :app:buildSpotifyLibrespot --no-daemon --console=plain`: 68 tests passed, zero failures/errors in the three suites.
- `git diff --check`: passed.

These are source and host JVM checks. No APK was built or installed by this
chapter, and no live Spotify/device request or song selection was performed.
The owning session must package/install the integrated x86 candidate, keep the
user-selected downloaded Madvillainy recording, then verify initial current-first
hosting, actual Spotify device/current-song display, later local queue changes,
future enrichment and incoming controls. Second-account admission/shared audio,
background lifecycle and reconnection acceptance remain separate live checks.

# Recommendations integration

Implemented on 2026-11-13 against the server's `api/recommendations` contract. See the server's `RECOMMENDATION_IMPLEMENTATION_PROGRESS.md` for ranking, daily persistence, migration and artwork details.

## Entry points

- Home → Recommendations.
- Song menu → Song radio or Artist radio.
- Playlist menu → Smart shuffle or Playlist radio.
- Recommendations → Today's playlist, explicit regeneration, focused mixes, Play selection and Save as playlist.
- Playing → continuation state, retry and stop controls.

Ordinary shuffle remains the player's existing shuffle. Recommendation queues turn native shuffle off to preserve the chosen order; explicitly toggling shuffle stops automatic recommendation continuation. Starting another collection or clearing the queue also stops it. Song radio started on the already playing recording preserves its position and existing queue, appending new candidates.

## Queue and account safety

The continuation controller observes the existing queue and account. Fetches carry encrypted server cursors and queued/seen exclusions. Manual queue edits are checked after HTTP and again before native source preparation commits. An old response cannot replace a newer queue, and no HTTP operation is awaited by play/pause controls. User-created queue order stays authoritative.

An optional generation predicate was added to the app's `PlaybackRuntime.append`, passed down to its existing prepared-append guard. A completed append still acknowledges its Jam queue-change receipt even after that append changes the native view. No player-package or SpotifyJam-package interfaces were changed.

Recommendation session snapshots use serialized local storage writes and are bound to the account and native queue identifier. Restoring a different owner/queue discards the snapshot. Logout clears the owner, cursor and observations. The screen separately fences account/selection generations for loading, saving and starting playback. The generic random end-of-queue fallback is suppressed while a recommendation owner is active, including exhausted recommendation queues.

Playlist artwork is generated on the server from local cover files. The existing image cache displays the immutable address. Playlist viewing requests an owner-checked artwork refresh and uses the returned cover. Generated playlist saves preserve track order and open the ordinary editable playlist view.

## Source verification

- `npm run test:recommendations`: 86 controller/player tests and 15 Home/recommendation screen tests passed.
- Dedicated recommendation controller cases cover prefetch thresholds/exclusions, duplicate response rows, replaced queues, manual edits during HTTP and preparation, stop during initial readiness, account switches, failure cooldown/retry, exhausted owners, restoration and serialized storage writes.
- Dedicated screen cases cover empty route parameters loading the daily mix, song-radio seed forwarding, playback through the controller, explicit versioned regeneration, saving with ordered IDs and cover, safe load failure and abort on unmount.
- Added runtime regression cases prove a canceled append never mutates the queue and a committed append still publishes its queue receipt.
- `npx tsc --noEmit --pretty false`: passed for the complete mobile project. Focused recommendation/player configurations also passed.

## Delivery limits

Source is integrated; no new APK was built, no emulator or physical device was used, and no Spotify process/session was restarted. Background/headless execution, recovered native queues, real audio transitions and actual Jam participant propagation require device verification. Session restoration is implemented and unit-tested, but is not evidence of a complete Android/iOS process-death scenario. Real listening is still needed to tune relevance and descriptor policies.

Deploy the server migration/API before using the new screen. Existing AudioMuse results are reused without reprocessing.

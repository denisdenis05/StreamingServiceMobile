# Playback after reload

Implemented in StreamingServiceMobile on 2026-10-17. No player-library or native code changed for this issue. No commits.

## Findings

The user reported that RNTP used to show a cannot-reinitialize-audio error after refreshing, while the replacement failed without a visible error. The native adapter already supports idempotent initialization. The app had two startup callers, initialized before authentication restoration, cleared native playback on every fresh JS runtime and only logged startup failures. An engine-change callback could also enter reconnect while authentication was already transitioning and invalidate pending playback work. Fast Refresh did not dispose the retired runtime's listeners or pending authentication transition.

The initial emulator checks accepted a local silent source before and after reload; they did not establish the exact failure for the user's original server track. Dedicated tests reproduce the app-side clearing/reconnect races and verify recovery. Both developer reload and code-save refresh were covered rather than assuming the older RNTP error still came from this library.

## Changes

- `PlaybackApplicationLifecycle` shares startup between App and MusicProvider, waits for authentication restoration and gates audio commands until the latest transition is ready. A failed startup is observable and the next Play request can retry. Late failures from an older token transition cannot replace current readiness.
- An ownership receipt stores only server/account identity and native engine/authentication epochs. A fresh JS runtime reattaches only when every field matches the current native session. Unknown ownership, a different account/server, malformed storage or a restarted engine clears/reconfigures safely. Receipts contain no tokens, source headers or request bodies. Storage failure cannot grant ownership.
- Authentication reconnects share an existing transition. Disposal fences late work. Native-session checks precede commands, and repeated epoch changes fail after a fixed bound rather than looping indefinitely. A service-unavailable snapshot gets one coalesced native rebind attempt.
- Metro's hot-dispose handler stops retired authentication observers, progress frames and runtime observation. The installed Metro runtime's dispose contract was checked locally. It does not stop a matching native audio session.
- Startup failures and asynchronous native playback failures now show a message. Repeated snapshots of one native error do not spam notifications. Listening-report/network failures remain separate and do not claim audio failed.

## Tests

- `npm run test:player-mobile`: 319 passed across 18 files, including 26 reload/storage/readiness cases in tools/player-reload-recovery.test.cjs.
- The new cases cover shared startup, restoration ordering, retries, sign-out, rapid token changes, late errors/disposal, stored proof validation/privacy, fresh-runtime attachment, all ownership mismatch fields, service rebind, concurrent rebind, engine recreation/churn, reconnect during startup and asynchronous native error reporting.
- `npm run test:asset-cache`: 58 passed after the cache chapter's final portability/quota checks.
- Full app TypeScript checking passed. Production Android/iOS JavaScript bundles are under /tmp/streaming-reload-*.

## Emulator check

The connected WayDroid device was inspected through the development inspector. A local 30-second silent WAV was created through RNFS inside the app cache; it has no recording identifier, so this check did not create Last.fm/history reports. The native snapshot acknowledged Playing. A developer reload retained the selected fixture and queue, application readiness returned true, and another Play/replacement request succeeded. The rendered UI contained the fixture title. A source-save refresh also retained the fixture and readiness, with three shared runtime/state/reporting observers in the current runtime.

These are command/state/UI checks, not proof of audible output, timing accuracy or the user's authenticated server track after reload. No iPhone runtime was attached. The originally empty queue was restored and the app-cache fixture was removed after checking.

## Resume

Try the user's ordinary server track with their exact refresh action. The app now reports a remaining startup/source failure visibly instead of silently swallowing it. Keep the earlier full iOS host/device validation and deployed image/NAS checks separate from this JS reload fix. No production deployment or server database change was performed.

## Commit authorization

The user authorized committing these completed changes on 2026-10-17. Earlier no-commit statements record the implementation phase. No push, deployment or production migration is included. Local server appsettings files and IDE settings are excluded.

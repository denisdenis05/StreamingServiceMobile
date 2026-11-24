# Playback and Last.fm reporting

Updated: 2026-10-12.

## Change

Track switching previously awaited `/lastfm/stop-playback` before resetting or skipping the native player. Previous/seek paths also awaited reporting before seeking. The start response could arrive after a track change and install an obsolete tracker in the shared reference.

Native playback now runs independently of the reporting queue. Selecting a track detaches the old tracker synchronously and freezes its listened total. The next tracker is attached when native playback starts, before its session request finishes. A delayed response belongs only to that tracker; if it has already stopped, its final report closes that session without replacing the current tracker.

## Ownership and ordering

- `src/services/PlaybackTracker.ts` owns session reporting and listened-time accounting. Pause, resume, seek and stop update local state before returning a reporting promise. Stop is idempotent and clears its interval immediately.
- One `PlaybackReportingQueue` per music provider orders session starts, progress, pause/resume, seeks and stops. Reporting runs alongside native playback. Requests remain ordered because the server's stop path clears Last.fm Now Playing; an older stop must finish before the next session starts reporting.
- Progress advances its accounting timestamp before network work. Fractional listened time is retained, paused time is excluded, and only one periodic progress report per tracker can be pending. Reporting failures are caught without logging request credentials.
- `AudioPlayerService.ts` serializes native track transitions and checks request identity after asynchronous work. A superseded selection cannot install its tracker or continue adding/playing its resolved track. Clear/remove-current invalidate pending selections through the same transition path.
- Seek reporting captures the tracker/request before awaiting native progress. Next-item preparation checks its original request and queue entry, then adds through the native operation queue. Stale suggestion responses cannot replace newer playback.
- Provider teardown invalidates pending selections and stops tracking. Reports already queued remain best effort; there is no persistent delivery outbox in this app.

## Checks performed

No unit or device tests were added or run for this change.

TypeScript compilation reports four diagnostics in unchanged files: `heartEmptyIcon.tsx`, `heartIcon.tsx`, `pauseIcon.tsx` and `ContextMenu.render.tsx`. The diagnostics were compared with compilation using the original AudioPlayerService source. The new tracker and changed service introduce no additional TypeScript diagnostics.

Targeted ESLint leaves the existing unused `playQueueFromStart` error and the existing shadowed `currentTrack` warning. The original source also had two missing-hook-dependency errors; those are resolved. The new tracker has no lint findings. Formatting and `git diff --check` were applied to the changed sources.

## Device checks still needed

Use a slow or unavailable Last.fm endpoint while switching tracks, pressing next/previous and seeking. Playback must not wait for reporting. Switch repeatedly before start responses complete; inspect that each response and stop retain their own session identifier and the latest selected track stays active. Repeat through natural transitions, pause/resume, clearing the queue and provider teardown.

Reporting latency can still delay Last.fm's displayed Now Playing status. Network delivery is best effort and depends on the existing API client's authentication and error handling. No measured startup/seek improvement or native-device compatibility result is claimed here.

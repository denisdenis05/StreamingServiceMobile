# Explicit shared state recovery

Implemented on 2026-10-26.

The Jam screen offers **Refresh shared state** when the connection supports
verification and the current account owns an active Jam with a host device.
The action uses the SDK reconciliation operation and the native Spotify Connect
observation verifier. Browser-only connections do not receive that verifier.
Login, pairing and guest controls keep their existing gates.

Ordinary membership refresh still cannot resolve an unknown queue or playback
edit. Successful explicit verification clears the mobile playback fence only
for the captured runtime, host and exact uncertainty. An unknown recording
selection is cleared only if its coordinator and snapshot still match, requiring
a fresh selection before another submission. Recovery never repeats the earlier
edit or replaces its stored unknown request receipt.

Failures, cancellation, disposal and account replacement do not run recovery
completion. Runtime, host, coordinator and selection replacement guards also
protect against delayed completion clearing newer state.

## Feature and test mapping

| Behavior | Dedicated tests |
| --- | --- |
| Successful playback recovery and a fresh command | `tools/spotify-shared-state-recovery.test.cjs`: successful explicit verification clears playback uncertainty |
| New queue request succeeds; original unknown request remains unknown and is not sent again | Same suite: successful explicit verification permits a new queue request |
| Membership reads preserve the playback fence | Same suite: ordinary membership refresh |
| Failed and canceled verification preserve fences | Same suite: failed and canceled shared state verification |
| Account replacement and disposal cancel pending verification | Same suite: account replacement; disposal |
| Stale runtime, host and newer uncertainty remain protected | Same suite: captured playback recovery replacement runtime, newer uncertainty and host replacement |
| Recording recovery clears only the original unknown selection | Same suite: recording recovery and replacement coordinators/selections |
| Repeated presses cannot duplicate verification | Same suite: repeated recovery press |
| Capability and owned host UI gates; explicit action and busy state | `tools/spotify-screen.test.tsx`: shared state recovery tests |

## Validation

- `npx tsc --project tsconfig.spotify.json` passed.
- `npx tsc --noEmit` passed for the full mobile application.
- `npm run test:spotify` passed: 329 Node cases and 91 Jest cases. This includes
  the first 11 dedicated recovery cases and both new screen cases.
- After adding dedicated host replacement, duplicate recovery and disposal cases,
  `node --test tools/spotify-shared-state-recovery.test.cjs` passed all 14 cases.
- Source review found no comments, unnamed behavioral values or abbreviated
  names in the authored recovery implementation and fixtures.

These are deterministic host checks. APK packaging and device recovery checks
belong to the following integration chapter; this note does not claim physical
Spotify playback, cross-account behavior or native transport verification.

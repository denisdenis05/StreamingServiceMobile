# Spotify Jam personal-test APK

Implemented 2026-10-22 under the workspace streaming-service-quality skill.
This chapter makes the Spotify session library accessible from the mobile app.
It does not implement shared audio playback or queue synchronization.

## Install and use

The installable ARM64 APK is generated at
`build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`. Its SHA-256 is recorded
beside it. It requires Android 7.0/API 24 or newer and contains the production
JavaScript/Hermes bundle; Metro is not required. The release variant uses this
project's existing debug signing configuration for personal testing.

1. Install the APK and sign into StreamingService using the existing login.
2. Open Profile, then Spotify Jam.
3. Paste a current Spotify access token from your own test account. A leading
   `Bearer ` is accepted. No token is bundled into the APK or saved by this flow.
4. The app verifies the authenticated Spotify profile and reads existing Jam
   membership before allowing changes. If that read fails, use Refresh Jam.
5. Create Jam and Share invitation, or paste a Spotify Jam invitation and select
   Join Jam. Full `open.spotify.com` links, `spotify:socialsession` URIs, raw join
   tokens and the observed `spotify.link`/`spotify.app.link` share format are handled.
6. Hosts can end their Jam after confirmation. Guests can leave it. Disconnect
   retires this app's connection without ending or leaving the remote session.

Browser sign-in is not configured: no Spotify developer client ID was supplied.
The temporary-token connection has a local 30-minute lifetime cap; Spotify may
expire or reject the token earlier. Reconnect with a current token when needed.
The flow has no token refresh, desktop credential relay or credential persistence.

Device selection is optional for creating, refreshing and joining in control
mode. Remote membership requires a selected actual Spotify device in this UI.
Public device discovery can be rate-limited independently of Jam operations;
its failure is displayed in the device section and does not disable creation.
An actual device identifier can also be entered manually.

## Implemented behavior

The private authenticated `profileAttributes` persisted query verifies the test
account. Its operation and hash come from the inspected Spotify 1.2.86.502 client
and may change with Spotify deployments. Regional service origins are resolved
through Spotify's resolver and validated before credentialed session requests.
The public resolver never receives the bearer header.

Connection performs a passive current-account read. This avoids creating a new
Jam when the supplied Spotify account is already a guest. Create reactivation is
allowed for the current host; guest creation is forbidden in both the controller
and library. Join/leave are explicitly opted into experimental protocol support.

Snapshots contain display/session/device state and typed failures, never tokens
or invitation values. Invitation access occurs only through the explicit share
action. Account changes/logout, replacement, hot reload and disposal retire old
work and credential providers. Pending actions are blocked from duplicate UI
submission. Unknown mutation outcomes require passive reconciliation.

The end confirmation captures the displayed session and checks its identity and
ownership again before submitting. A session changed while the dialog is open
cannot be ended by that old confirmation.

Short-link resolution fetches a public page without bearer headers or cookies,
accepts trusted initial/final hosts and extracts one unique strict Spotify Jam
token. It treats HTML as data and rejects missing/conflicting candidates.
Redirect following uses the platform fetch behavior: intermediate-hop hosts are
not separately constrained. The page length limit is an acceptance check after
reading, not a streaming allocation bound. A deadline and cancellation remain in
effect while reading. Host tests use the actual mobile URL implementation with a
stub for the unrelated native Blob boundary.

## Feature tests

| Behavior | Dedicated tests |
| --- | --- |
| Account ownership, foreground device refresh, optional account refresh, logout and replacement | `tools/spotify-integration.test.cjs` |
| Token normalization, anonymous rejection, hidden credentials, retired providers and local expiry | `tools/spotify-mobile.test.cjs` |
| Initial membership read, guest-create prevention, failed-read guard, create/join/leave/end and reconciliation | Same controller suite |
| Device discovery isolation, manual/active selection, cancellation and stale completion | Same controller suite |
| Private profile decoding, resolver trust, authorization/rate failures and actual URL parsing | Same gateway suite |
| Full/short invitation parsing, ambiguous HTML, foreign destinations, acceptance limits, deadlines and cancellation | Same invitation suite |
| Screen connection, mode selection, explicit actions/sharing, pending state, end confirmation and changed-session regression | `tools/spotify-screen.test.tsx` |
| Private HTTP membership and current-account snapshots, account guards, ordering, replay and uncertain outcomes | Library `tests/jam-membership.test.mjs` and `tests/jam-current-account.test.mjs` |

## Validation

- `npm run test:spotify`: strict focused compilation, 65 Node cases and 11 rendered
  screen cases passed.
- `./node_modules/.bin/tsc --noEmit --pretty false`: full app checking passed.
- Library `npm test`: 162 cases across ten test files passed; source checks/build
  passed separately and include the new authored mobile feature files/tests.
- `npm run test:player-integration`: seven existing checks passed.
- `npm run test:player-mobile`: 319 existing cases passed.
- ARM64 release packaging and signature verification are recorded in the chapter
  progress notes and build output. No physical Android device was connected for
  installation or execution; no iOS package/device result is claimed here.

Final `:app:assembleRelease` completed successfully. `apksigner verify` passed.
The copied APK is 29,133,041 bytes, contains only `arm64-v8a` native libraries,
and includes a 1,913,600-byte Hermes bundle. Archive/manifest details and the
checksum are saved beside the artifact. These are packaging checks, not a phone
launch or successful guest-join result.

Build with:

```bash
npm run prepare:player
npm run prepare:spotify
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon -Pkotlin.compiler.execution.strategy=in-process
```

The production mobile controller, gateway and session library also performed a
live Node-hosted create/refresh/end cycle with credentials borrowed into memory
from the controlled desktop session. This proves those host-side requests, not
independent mobile login or Android execution. Sanitized evidence is under
`spotify-jam-research/evidence/mobile-controller-live-lifecycle.json` in the
workspace. Private profile and passive account-current requests returned 200;
absence after cleanup returned 404. Public profile/device endpoints returned 429,
which prompted the verified private profile/current-session composition.

## Remaining limits

Guest admission, leave permissions and remote-listening requests have deterministic
tests but have not been exercised with a second controlled account. They can be
rejected by Spotify. The UI labels joining experimental. Passing a remote
membership mode does not make StreamingServicePlayer a Spotify audio endpoint.

This build does not synchronize audio, mirror or modify shared playback queues,
follow playback position, process pushed playback events, or provide independent
Spotify browser login. The playback research plan remains the next implementation
scope. No audio synchronization or background transport correctness is claimed.

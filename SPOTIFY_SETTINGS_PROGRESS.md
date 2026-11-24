# Spotify account settings and Settings navigation — 2026-11-01

## Completed source chapter

Settings now groups account details, connected apps, music library preferences,
listening preferences and app information. Spotify opens its own account settings
page. The Liked Songs row and `LikedSongsSettings` route are reserved for the
parallel liked-playlist implementation. Connection badges distinguish account
sign-in, native reconnecting/failure, Last.fm browser approval and unavailable
Last.fm status.

Spotify settings uses the existing application-owned Spotify controller. Device
pairing is the primary sign-in action. Password and developer connection fields
remain behind Other sign-in options; the password is cleared immediately on
submission. Existing pairing code, expiration, separate email code guidance,
reopen/cancel actions and sanitized authentication-stage failures are retained.
Saved-account reconnection is explicit. Native reconnection does not start another
restore automatically. Disconnect and saved-login removal require confirmation;
a changed snapshot invalidates the confirmation and explains that status changed.

Connected settings shows the Spotify display name, native connection status and
an Open Spotify Jam action. Connection diagnostics require explicit expansion.
Spotify Jam retains actual membership, hosting, following, queue and device
controls. Its disconnected state opens Spotify settings. Manual device identifiers
are collapsed. Existing membership, host, guest admission, native readiness and
uncertain-outcome guards are preserved.

Settings actions now support primary, secondary and destructive presentation,
with the existing appearance as the default. Liked Songs uses a heart icon. The
shared settings frame preserves button presses while editing text fields.

## Feature-specific evidence

| Behavior                                                                                | Dedicated tests                                                                     |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Settings routes, Liked Songs row and actual app connection badges                       | `tools/profile-settings-screen.test.tsx`                                            |
| Explicit primary/alternate Spotify authentication and password clearing                 | `tools/spotify-screen.test.tsx`                                                     |
| Pairing code/email distinction, expiration, reopen, cancel and native bootstrap failure | `tools/spotify-screen.test.tsx`                                                     |
| Saved login removal confirmation and interrupted callback diagnostics                   | `tools/spotify-screen.test.tsx`                                                     |
| Separate Settings/Jam destinations and hidden alternate credentials                     | `tools/spotify-screen.test.tsx`                                                     |
| Reconnecting versus failed native connection and explicit retry                         | `tools/spotify-screen.test.tsx`                                                     |
| Confirmed disconnect, stale confirmation and visible stale-state explanation            | `tools/spotify-screen.test.tsx`                                                     |
| Progressive connection diagnostics and manual device entry                              | `tools/spotify-screen.test.tsx`                                                     |
| Host/guest permissions, uncertain outcomes and changed Jam confirmation                 | `tools/spotify-screen.test.tsx`; existing hosting/membership/playback screen suites |

Commands and results:

- `npx jest --runInBand --watchman=false --runTestsByPath tools/spotify-screen.test.tsx tools/profile-settings-screen.test.tsx tools/spotify-player-jam-screen.test.tsx tools/spotify-hosting-screen.test.tsx tools/spotify-membership-screen.test.tsx tools/spotify-shared-screen.test.tsx tools/spotify-playback-controls-screen.test.tsx` — 110 passed across seven suites.
- `npx tsc --noEmit --pretty false` — passed after the final test-fixture readonly correction.
- `npx eslint src/pages/Settings/Settings.render.tsx src/pages/Settings/Settings.components.tsx src/pages/Settings/Settings.copy.ts src/pages/Settings/Settings.routes.ts src/pages/Settings/Settings.style.ts src/pages/Settings/Settings.icons.tsx src/pages/Settings/SpotifySettings.render.tsx src/pages/Settings/SpotifySettings.copy.ts src/pages/SpotifyJam/SpotifyJam.render.tsx tools/spotify-screen.test.tsx tools/profile-settings-screen.test.tsx` — zero errors; 17 no-void warnings for explicitly detached operations.
- Prettier applied to owned authored changes. `git diff --check` passed.

## Boundaries

No live Spotify request, device/process action, APK packaging, deployment or push
was performed. These checks establish source behavior through injected controller
snapshots. They do not establish actual native pairing, audible shared playback,
background lifecycle or real-device layout. Existing pending acceptance remains
in `SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md` and `SPOTIFY_RATE_LIMIT_PROGRESS.md`.

React Native accessibility roles, component properties, text input configuration,
style keywords and SVG paths retain framework-required literals. Behavior, copy,
routes, presentation sizes and input bounds use named owners. No authored source
comments were added.

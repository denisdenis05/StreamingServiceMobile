# Spotify library integration

## Mobile personal-test chapter — 2026-10-22

The user authorized a mobile implementation and installable APK. The Profile page
now opens Spotify Jam. Implemented temporary-token connection, verified private
profile lookup, passive initial/account refresh, device selection, create/share,
experimental join/leave, host end confirmation and typed failure handling.
Short Spotify share links resolve through a credential-free public page reader.
The end dialog is fenced against a replaced Jam; initial membership must be read
before changes are allowed. Device API failures do not block Jam creation.

Applied the project skill throughout. The collaborating agent implemented and
tested library membership/current-account operations, verified the passive
endpoint and share-link format, and reviewed mobile ownership/confirmation flows.
No player engine, audio synchronization or server code changed in this chapter.

Validation: `npm run test:spotify` passed 65 Node cases and 11 rendered-screen
cases; full app TypeScript passed. Library source checks/build and 162 cases
passed. Seven workspace player checks and 319 player-mobile cases passed.
The live production controller/gateway/library cycle created/refreshed/ended an
owned Jam and confirmed absence on a Node host; this is not Android execution.
Private profile/current-session probes and two public share-link samples passed.
All temporary Jams were removed. Public profile/device discovery returned 429.

The ARM64 release APK is packaged with embedded Hermes output and the existing
test signing key. Final artifact, checksum and install instructions are in
`SPOTIFY_JAM_APK.md` and `build/spotify-jam/`. No attached Android device was
available for installation or audible testing. Join/leave remain unverified
against a second account; playback synchronization and browser sign-in remain
unfinished. No user credential is included in the package.

Next: install and exercise this APK on a controlled phone, supply a second
controlled Spotify account for guest tests, then implement the protocol and player
bridge gates described in the library's PLAYBACK_SYNC_PLAN.md. Keep tokens out of
persisted evidence; changes are committed only in their owning repositories.

## Earlier integration checkpoint

Implemented on 2026-10-21 under the workspace streaming-service-quality rules.

The mobile app links the sibling `StreamingServiceSpotifyJam` package through
`file:../StreamingServiceSpotifyJam`. `prepare:spotify` builds it before the app's
Android/iOS/start scripts; Metro watches its repository and resolves shared React
from the mobile installation. No native dependency or player backend changed.

The startup import composes `spotifyIntegration`, an application-account owner.
Its `connect` method accepts the library's explicitly supplied Spotify credential,
endpoint, recording catalog, mapping store, network, and clock dependencies.
Application identity and Spotify identity are separate. Logout/account changes,
connection replacement, disposal and hot reload retire old work. No account is
connected and no Jam is created automatically.

An optional device-selection provider supplies the actual Spotify device and
unique request identifiers. AppState foreground transitions then perform one
passive refresh. There is no creation polling, native background connection, or
implemented Spotify login screen. Selector/device-provider failures do not
escape the foreground callback. Local audio and reporting remain independent.

Validation:

- `npm run test:spotify`: passed focused strict compilation and 12 cases covering
  package/Metro linking, application ownership, logout/account changes,
  replacement/disposal, stale catalog completion and foreground behavior.
- `./node_modules/.bin/tsc --noEmit --pretty false`: passed full app checking.
- `npm run test:player-integration`: seven existing workspace checks passed.
- Production JavaScript bundles for Android and iOS passed, including the startup
  composition import. These are not APK/IPA or physical-device results.

The library's 116 deterministic cases and the server's 12 catalog cases passed
separately. Live private session operations worked with desktop-session
credentials; standalone mobile credential acquisition, guest joining, push
updates, and real-device foreground/transport behavior remain open. A Spotify
catalog probe returned HTTP 429. See the library PROGRESS.md and VALIDATION.md.

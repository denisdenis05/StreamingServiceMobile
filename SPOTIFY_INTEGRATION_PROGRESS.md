# Spotify library integration

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

# StreamingServiceMobile

StreamingServiceMobile is a React Native music library and player client for a self-hosted StreamingService server. It uses the sibling StreamingServicePlayer for local audio and StreamingServiceSpotifyJam for Spotify Jam integration.

[Quick start](#quick-start) · [What the app does](#what-the-app-does) · [Development](#development-and-checks) · [Documentation](#documentation)

## What the app does

- Browse albums and playlists, play library recordings, and use native background controls.
- Use downloaded media and report listening history with collection context where the source is known.
- Browse data-backed Home recommendations and recent listening sections.
- Manage profile settings, Last.fm authorization, and a playlist-backed Liked Songs collection.
- Connect a Spotify account, inspect recordings, host or follow a Jam, and share an invitation QR code.

Recent-history attribution follows the actual playback selection: album playback is credited to its album, playlist playback to its playlist, and direct track playback to the track alone. The app does not infer missing collection context after playback.

## Quick start

The mobile project and its local packages must be checked out next to each other:

```text
StreamingServiceMobile/
StreamingServicePlayer/
StreamingServiceSpotifyJam/
```

Use Node.js 20 or later for the app and sibling packages. The app manifest accepts Node.js 18 or later, but the local packages require 20. Install each local package and then the app dependencies; `npm install` in the app runs `patch-package` to apply required tracked patches.

```sh
cd StreamingServicePlayer
npm install
cd ../StreamingServiceSpotifyJam
npm install
cd ../StreamingServiceMobile
npm install
```

The current API origin is a source constant in [`src/constants/placeholders.tsx`](src/constants/placeholders.tsx); change that project-owned value when pointing a development build at another server. It is not a settings screen value. Start Metro in one terminal and Android in another:

```sh
npm start
npm run android
```

`start`, `android`, and `ios` prepare both sibling libraries before starting React Native. Android builds require JDK 17, Python 3, the Android SDK/NDK versions declared in [`android/build.gradle`](android/build.gradle), and Rust/Cargo. The current native build script supports a Linux x86_64 build host and the `aarch64-linux-android` and `x86_64-linux-android` Rust targets for arm64 devices and x86_64 emulators. Gradle invokes that script through [`android/app/build.gradle`](android/app/build.gradle). Its default native ABI is arm64; pass `-PreactNativeArchitectures=x86_64` to Gradle when building for an x86_64 emulator. iOS also requires Xcode, CocoaPods, and the configured native package integration. The iOS source path exists, but a complete React Native iOS host/device run remains an acceptance check.

## Spotify and account flows

Connect Spotify from **Profile → Settings → Spotify**. Jam hosting and following are controlled from the Playing/Jam controls. Invitation QR generation is local to the app; scanning hands the invitation to Spotify. The app does not implement an in-app camera scanner. Joining a Jam does not by itself establish active playback or make guest queue commands available. Native guest access is verified separately and can fail closed.

Spotify authentication is separate from StreamingService account authentication. The app owns platform login, secure saved credential storage, country selection, and native session integration. See [Spotify integration progress](SPOTIFY_INTEGRATION_PROGRESS.md), [native follower handoff](SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md), and [QR flow](JAM_QR_PROGRESS.md).

Profile settings provide explicit Last.fm connection status and disconnect controls. Liked Songs uses a playlist selected through settings; heart state reflects membership in that playlist. It is not a separate server-side like store. Home cards and recent history use server and playback data with the attribution rules above. See [profile settings](PROFILE_SETTINGS_PROGRESS.md), [Liked Songs settings](LIKED_SONGS_SETTINGS_PROGRESS.md), and [Home listening](HOME_LISTENING_PROGRESS.md).

## Development and checks

Commands available in `package.json` include:

| Command | Scope |
| --- | --- |
| `npm test` | Jest application tests |
| `npm run test:player-mobile` | Player adapter, queue, source, and reporting checks |
| `npm run test:spotify` | Spotify/Jam TypeScript, service, platform, and screen checks |
| `npm run test:settings` | Profile, Last.fm, and Liked Songs settings checks |
| `npm run test:home` | Home recommendation and query lifecycle checks |
| `npm run test:spotify-native` | Rust/native librespot JNI integration checks |
| `cargo test --manifest-path native/librespot-session/Cargo.toml --locked` | Native Rust crate tests |
| `npx tsc --noEmit` | Application TypeScript check using the repository TypeScript configuration |

These are source checks. They do not establish physical-device audio, cross-account guest permissions, audible Jam timing, or background/reconnect behavior. An earlier emulator run verified remote selection and playback in a candidate build, but current host acceptance and guest/device lifecycle gates remain open. Check [SPOTIFY_JAM_APK.md](SPOTIFY_JAM_APK.md) for the current artifact and acceptance notes instead of relying on old artifact details here.

For Android release packaging, the repository uses commands such as:

```sh
./android/gradlew -p android :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
```

The selected ABI can be changed for a matching emulator or device. Packaging and signing configuration do not by themselves establish a production-signed release or successful playback.

## Documentation

- [Audio migration](AUDIO_MIGRATION_PROGRESS.md): selected player integration and remaining device evidence
- [Player Jam integration](PLAYER_JAM_PROGRESS.md): player and Jam coordination
- [Spotify native follower handoff](SPOTIFY_NATIVE_FOLLOWER_HANDOFF.md): ownership, gates, and recovery
- [Jam queue recovery](JAM_QUEUE_RECOVERY_PROGRESS.md): uncertain queue state and recovery behavior
- [Jam QR flow](JAM_QR_PROGRESS.md): invitation generation and handoff
- [Profile settings](PROFILE_SETTINGS_PROGRESS.md), [Liked Songs settings](LIKED_SONGS_SETTINGS_PROGRESS.md), and [Home listening](HOME_LISTENING_PROGRESS.md): app behavior details
- [UI backlog](UI_BACKLOG.md): remaining UI work

The Server, Player, and SpotifyJam directories are separate repositories. The Player and SpotifyJam directories must be siblings of this checkout for local package dependencies to resolve.

# iOS Spotify login boundary

The mobile iOS project now registers a native module named `SpotifyProofKey` with
the same `generate` result as Android: verifier, challenge and state. The portable
factory requests two separate 32-byte entropy blocks, encodes verifier/state as
unpadded URL-safe Base64 and hashes the encoded verifier for the challenge.
The Apple implementation uses SecRandomCopyBytes and CryptoKit SHA-256.

`SpotifyProofKeyFactory.swift` depends on injected entropy, digest and encoding
interfaces. Its 13 host tests exercise the production factory with deterministic
inputs, supplied reference digest vectors, encoding rules and error boundaries.
Those host tests do not execute Apple's entropy or digest APIs on Linux.

`SpotifyProofKeyBridge.swift` exposes an NSObject bridge. The Objective-C React
Native module calls its compiler-generated throwing selector and returns only a
sanitized failure. `RCT_EXPORT_MODULE`, `RCT_EXPORT_METHOD`,
`requiresMainQueueSetup`, the module name and generated selector are framework
integration syntax. The Xcode project requires opaque object identifiers for
source registration; new entries follow that format without code comments.

The dedicated `streamingservicespotify` URL scheme is registered alongside the
existing app scheme. AppDelegate already forwards opened URLs to RCTLinkingManager.
The existing authorization browser and the library validate the exact callback
and state; registering an iOS scheme does not configure Spotify's redirect allowlist.
The callback is `streamingservicespotify://callback`.

Run `npm run test:spotify-ios` from the mobile repository. The driver performs
Swift source checks using the workspace quality checker, runs all 13 host tests,
compiles factory/platform/bridge against the installed iPhoneOS SDK for arm64
and emits `streamingservice-Swift.h`. It then syntax-checks the Objective-C module
against the actual React Native headers and generated Swift header.

Executed with Swift 6.4, the installed Darwin epoch-3 SDK/iPhoneOS 27.0 and clang
23.1.1. All checks passed. Outputs remain under `.build/spotify-ios-proof`.
The initial Objective-C attempt lacked the RCTDeprecation header search path;
the repeatable driver now includes that existing React Native header directory.
No dependency shim substitutes for the bridge headers.

Saved credentials use the pinned react-native-keychain package with device-only,
noncloud Keychain options. No SwiftPM application, signing change or new biometric
prompt was introduced. Full CocoaPods/React Native/Hermes linking, signed iOS
packaging, actual Keychain execution and phone authorization remain separate
validation gates. No physical iOS login or shared audio result is claimed.

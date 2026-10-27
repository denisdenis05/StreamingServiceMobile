# Application-owned Android Connect runtime — 2026-10-27

The application singleton now owns the Connect owner, bounded operation executors
and native event polling. A React module holds one revocable attachment. Module
invalidation removes its listener and cancels its outstanding command
reservations while retaining the native connection. Creating a replacement
module revokes the previous attachment even when its invalidate callback has not
run. Detached modules cannot read, refresh, submit or cancel commands, or close a
replacement module's connection. Late reads also check the native connection
lifetime; post-dispatch commands preserve unknown-outcome behavior.

A new JavaScript owner identifier can adopt a retained connection after the
start input's stored session account, device, client and device configuration
match the retained identity. Stored-session shape, account binding, schema,
authentication type, canonical nonempty base64 credential data, configuration
fields and text bounds are checked before adoption. Native registration must
confirm that same account and device. The initial native start remains subject
to the existing Rust credential restoration and client configuration validation.
The retained identity contains no credential or token data.

The replacement receives a single bounded bootstrap event containing the real
handle, generation, native timing fields and current lifecycle state. Registered
bootstrap contains only the actual matching device identifier when the native
cluster contained it. Acknowledged observer/device-status verification can retain
an empty device list; no device is invented. Raw cluster contents, credentials,
queue contents and membership events are not retained for replay. A higher
generation without a lifecycle event retains that actual event's type with only
its generation/timing fields, keeping a new store Connecting and preventing an
older Registered event from restoring Ready. Bootstrap failures retire the
connection and emit one sanitized failure even though Owner isolates listener
exceptions.

A validated different account/device/client/configuration start does not share
the retained session. It retires the old owner, waits for native final drain and
starts the requested connection. There is one pending start continuation.
Replacing its React attachment or explicitly closing it cancels the pending
start. The serialized input exists only in that pending operation until cleanup
completes; it is not placed in retained identity, bootstrap, logs or progress
artifacts. Explicit close still waits for native cleanup, and its completion can
immediately start another JavaScript identifier. Polling stops when no native
connection remains; idle executor threads time out.

The native start/event API and TypeScript store contract remain unchanged.
No AppState or JavaScript follower stopping behavior changed. Retaining this
connection does not provide a foreground service, native audio follower,
application-led audio host, credential persistence across process death, or a
guarantee that Android will keep the process alive. Those features still need
the actual native player handoff and device verification. Existing Login5 and
selected player behavior are preserved.

## Dedicated tests

| Behavior | Dedicated tests |
| --- | --- |
| React detach/reattach, new JavaScript identifier adoption, one listener, stale invalidation and identity mismatch rejection | `SpotifyConnectRuntimeTest.kt` |
| Stale reads/refresh/metadata, native connection replacement, canceled queued commands, uncertain in-flight commands and stale command cancellation | `SpotifyConnectRuntimeTest.kt` |
| Explicit cleanup barriers, close/restart, cross-account replacement, canceled/bounded pending starts, native failure suppression and malformed bootstrap retirement | `SpotifyConnectRuntimeTest.kt` |
| Stored credential/configuration validation, required identities, canonical encoding boundary, unsupported playback readiness and duplicate credential aliases | `SpotifyConnectRuntimeProtocolTest.kt` |
| Actual registration account/device/source, empty observer device lists, private-field removal, handle/generation preservation, reconnect/old-generation ordering, higher-generation floor, strict numeric fields and safe failure text | `SpotifyConnectRuntimeProtocolTest.kt` |
| Existing owner cleanup/reservation behavior and native command receipt decoding | `SpotifyConnectOwnerTest.kt`, `SpotifyConnectNativeExecutionTest.kt` |

## Verification

Passed:

```text
cd StreamingServiceMobile/android
./gradlew :app:testDebugUnitTest --tests '*SpotifyConnect*' -x :app:buildSpotifyLibrespot --console=plain
```

Android Kotlin application/test compilation and 70 deterministic Connect cases
passed: 24 runtime, 18 runtime protocol, 16 owner and 12 native execution cases.
`git diff --check` passed. Android production base64 handling uses the existing
Android API boundary, with the equivalent Java encoding adapter injected into
host tests; no Java API requiring Android 26 is introduced into this API-24 app.

An earlier release-unit-test invocation passed the initial 58-case source state.
A later release invocation failed before tests because Metro watched a transient
Rust compiler output directory during parallel native work. Excluding that
failed bundle task then hit a Gradle generated-resource provider dependency.
The final Debug JVM command above avoids release bundling and excludes native
packaging; it verifies the final Kotlin implementation. Fresh release bundle,
APK packaging, actual React recreation, account switching, screen lock and local
audio playback still require separate checks. No physical-device lifecycle or
background audio result is claimed by these JVM tests.

# Explicit orphan logout — 2026-10-27

The native bridge now exposes `shutdown()` for the current React attachment.
It closes the retained application connection even when the new JavaScript
store has not attached. A revoked React attachment cannot invoke this shutdown.
Pending account replacement is canceled, native final drain remains mandatory,
and old close/shutdown completions cannot clear a newer native lifetime.

`SpotifyConnectStore.shutdown()` establishes its cleanup barrier before
publishing Detached, then invokes native shutdown. A new or reentrant attachment
waits for that barrier. Cleanup failures reject with sanitized integration codes.
The native method is optional in the TypeScript interface for existing adapters;
the packaged Android module supplies it. Unsupported platforms retain their
existing credential-only cleanup behavior.

The controller's explicit logout path, including application logout before
Spotify restoration, starts native shutdown before provider logout or saved
grant erasure. Those removals wait for native cleanup. A new login/restore also
waits for the complete native retirement and credential cleanup, so rapid logout
and login cannot persist a new grant ahead of old cleanup. Shutdown failure
preserves the saved grant and reports its failure. Replacement application
account observer ordering and failure isolation retain their existing tests.

Service composition wires the explicit shutdown hook. Ordinary detach, restore,
resume and controller/store disposal do not invoke application shutdown. HMR
retires the old store with `dispose()`; disposed controllers and stores cannot
invoke shutdown into a newer lifetime. Store disposal clears its subscribers.
The existing background AppState follower stop remains in place.

Dedicated new cases cover cold orphan shutdown, revoked React shutdown, pending
replacement cancellation, stale cleanup callbacks, shutdown failure, old store
and controller disposal, reentrant attachment, provider erasure order, cold
application logout, and rapid logout/login. They are in the same runtime/store/
controller/platform test files mapped above.

Validation:

```text
cd StreamingServiceMobile
npx tsc --project tsconfig.spotify.json
node --test tools/spotify-connect-store.test.cjs tools/spotify-mobile.test.cjs
npx jest --runInBand --watchman=false --runTestsByPath tools/spotify-connect-platform.test.ts
cd android
./gradlew :app:testDebugUnitTest --tests '*SpotifyConnect*' -x :app:buildSpotifyLibrespot --console=plain
```

Strict TypeScript compilation, 158 deterministic store/controller cases, four
platform cases and 84 Android Connect JVM cases passed. The final JVM total is
28 runtime, 18 runtime protocol, 16 owner, 12 native execution and 10 observation
decoder cases; the observation decoder belongs to the concurrent native follower
chapter.
`git diff --check` passed. Fresh release packaging and physical React recreation/
logout/background audio checks remain separate; no device playback or Android
process survival result is inferred from this lifecycle work.

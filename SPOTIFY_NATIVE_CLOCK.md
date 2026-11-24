# Native follower observation clock boundary — 2026-10-27

SpotifyConnectObservationDecoder accepts the actual fresh JNI read envelope and
an explicitly captured Android elapsedRealtime request bracket. It validates
handle/generation/host, real current song occurrence and queue revision, request
latency, native sample ordering, strict numeric/boolean fields and supported
playback speed. It advances position only with the Spotify server timestamp and
player anchor. Paused/buffering flags stop progression even if playing remains
true. Duration clamps an otherwise valid end position.

The position anchor is the midpoint of the Android request bracket, with half
its round trip plus native precision as uncertainty. Rust process uptime and
Spotify server epoch are never subtracted from Android elapsedRealtime. An
oversized or reversed bracket, including a sleep-delayed read, is rejected. This
stateless decoder does not establish long-term clock drift or stale membership;
the native follower must still fence ownership and obtain fresh observations.
No sample renews the local player's external-authority lease.

Ten dedicated deterministic tests in SpotifyConnectObservationDecoderTest.kt
cover independent clock origins, current occurrences/revisions, pause/buffering,
speed rejection, foreign ownership, native interval bounds, sleep/overflow,
strict types, unsupported current media, server/position bounds and safe errors.
Android app/test Kotlin compilation and the focused Debug JVM suite passed:

```text
./gradlew :app:testDebugUnitTest --tests '*SpotifyConnectObservationDecoderTest' -x :app:buildSpotifyLibrespot --no-daemon --console=plain
```

These checks are host tests. The decoder is a native follower component awaiting
coordinator composition; it does not enable background audio by itself.

A fresh approved diagnostic session also passed normal live read/metadata and
server-acknowledged pause/resume through the existing library decoder and native
transport. Its read uncertainty was 109.274523 ms. Safe metrics are saved in
build/spotify-jam/live-renewal-integration.json. This was same-account desktop
control, not this new Kotlin decoder on a phone, cross-account admission, forced
401 renewal, or audible local synchronization. Current probe exec63592 retains
the grant in memory; official desktop peer exec67827 was launched for this test.

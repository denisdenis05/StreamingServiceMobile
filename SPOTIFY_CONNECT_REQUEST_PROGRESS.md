# Connect request pacing evidence — 2026-11-02

The emulator reached actual native hosting and the user independently confirmed
that Spotify on their phone displayed the test song for about seven seconds.
A later Publication failure reported RateLimited and stopped hosting. Catalog
search had already succeeded. The previous transport logged only catalog HTTP
receipts, so its exact Connect status/header was not captured.

Native host source published every second even without a state change. Chapter
55fa1b1 replaces this with semantic change publication and a ten-second heartbeat,
while sampling locally each second. Its separate progress file records JVM tests.

Connect HTTP diagnostics now expose only fixed purpose/stage, numeric status,
typed failure and Retry-After seconds. They distinguish admission rejection from
an actual response. They accept no path, response body, account, device, queue,
track, token or headers collection. Dedicated serialization regressions prove
that bounded field set. The Android tag is SpotifyConnectRequest.

An actual noncatalog HTTP429 now sets a process-wide Connect service cooldown.
All subsequent Connect requests, including reconnect/removal/publication, remain
blocked until the full returned duration elapses. Missing integer Retry-After
uses sixty seconds; later shorter responses cannot shorten an existing limit.
There is no automatic replay. Retained observations can still be read locally.
A blocked cleanup remains a failure rather than claiming remote withdrawal.
The process lifetime scope survives native session replacement and reconnects;
it is not disk persistence and must not be reset to manufacture a successful test.

`cargo test --manifest-path native/librespot-session/Cargo.toml --quiet`: 278 passed.
Tests cover full duration, exact expiry, missing-header default, overflow, and
nonshortening cooldowns, plus safe diagnostic serialization. No live retry was
sent in this source chapter. Root must package combined pacing/queue receipt
fixes, run one deliberate host attempt, then inspect actual status/cadence and
honor any new cooldown before testing more actions.

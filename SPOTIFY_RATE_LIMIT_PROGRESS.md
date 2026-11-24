# Catalog search pacing and rate-limit diagnosis — 2026-11-01

## Request trace and current evidence

Hosting translates actual local recordings before native activation. Native search
uses one bounded GET to the fixed public `/v1/search` endpoint, with the actual
account country. Only an actual Unauthorized response permits one native token
renewal and passive request replay. HTTP429 does not renew credentials or retry.
Native retained playback reads use Connect state rather than catalog search.
The previous live result was CatalogMatching/RateLimited; no new live search has
been sent in this chapter before installing the diagnostic update.

A single action can translate different queue recordings, so successful searches
also need pacing. Repeated songs/attempts previously had no native query cache.
The old code discarded response Retry-After and quota reason. Its Android
logger was disabled, so safe catalog diagnostics were not observable there.

## Implemented source

`CatalogSearchTraffic` owns the connection-local search traffic policy. Exact
successful query results, including empty results, are cached for five minutes
with a 64-query bound. Title, artist, actual country and result limit are all part
of the key. Candidates remain actual decoded Spotify data; no match threshold,
recording identity, artist provenance or playability rule changed. Session
retirement discards the cache and pacing state.

New network searches are separated by at least two seconds. The native worker's
existing cancellation covers that wait. HTTP429 records the full valid unsigned
Retry-After seconds without shortening long cooldowns. A missing/malformed header
uses a named 60-second cooldown. This parser handles Spotify's documented delta
seconds; an HTTP-date value is treated as unsupported, not interpreted using an
untrusted clock. A later shorter response cannot reduce an existing deadline.
The guard rejects another uncached search before credential acquisition or HTTP
submission while the cooldown is active. No automatic retry is scheduled.

Only a bounded error body (4 KB, one-second read budget) is inspected for the
exact known QUOTA_EXCEEDED reason, either at the top level or under error.
Malformed/unknown reasons produce no raw diagnostic text. The flag means that
known quota reason was observed; false does not establish which other limit fired.
A slow or malformed body cannot hide the actual HTTP429 category.

Android now writes only the typed SearchDiagnostic JSON through the platform's
log function, under SpotifyCatalog. General Rust/library logging remains disabled.
The C ABI symbol `__android_log_write` and platform types c_int/c_char retain their
required names. This sink receives only the serialized fixed-origin/status/stage,
known failure, actual request count, validated cooldown seconds and recognized
quota flag. It never receives a request URL/query, token, raw error body, account
or song. Desktop probe projection validates each optional field and drops extras.

## Dedicated tests

- `connect_search_traffic`: exact/invalid retry seconds, long and fallback cooldowns,
  boundary rounding, deadline preservation, request spacing, exact/negative cache,
  TTL/new-owner boundaries, eviction, bounded quota recognition and diagnostic privacy.
- `connect_authentication.catalog_rate_limit_never_renews_credentials_or_repeats_the_search`:
  one credential read, one search dispatch, no renewal or replay after HTTP429.
- `connect_http`: an observed HTTP429 remains RateLimited even if reading its
  optional error body reaches a deadline; a new dispatch clears the prior status.
- `tools/spotify-connect-probe.test.cjs`: valid optional traffic diagnostics and
  rejection of negative, infinite, unsafe and arbitrary private values.

Executed Rust cargo test: 252 passed. Probe suites: 35 passed. Integrated Spotify
checks: 651 Node and 178 Jest passed. These deterministic tests send no Spotify
requests. x86 and ARM64 release builds passed for the initial diagnostic source;
the final pre-credential guard is being packaged separately.

## Device and desktop checkpoint

The emulator APK update is pending in Android's dex2oat32 compiler with zero CPU
usage. Read-only inspection confirms the compiler targets this app. There is no
noninteractive administrative capability to cancel that specific compiler. No
compiler/process termination, duplicate installation or emulator restart was
performed. The user declined a restart and requested adb reconnection instead.
Root disconnected/reconnected the known endpoint, reconnected offline transport,
and reset the host adb server. The install client exited with failure on transport
loss; no second installation was started. The final host adb listing is empty,
mDNS reports no devices and the old TCP5555 endpoint is not reachable. Local
WayDroid status reports Session STOPPED, although the user reports a visible
emulator window. No emulator stop/restart was issued. The current reachable adb
endpoint must be established before further device actions. The pending package
predates the final pre-credential and late-body-timeout guards.

Reverse Engineer Anything is not available among connected tools/local skills.
The Linux Spotify process is running and MPRIS playback controls are available.
One Play/Pause sequence changed the actual local status from Paused to Playing
and back to Paused; status changes are asynchronous. No account/song values were
exported. The desktop has no remote-debugging port and exposes no usable Spotify
accessibility tree. These observations do not verify the Jam device/queue UI.

## Live check plan

After the pending installation completes, verify the installed artifact before
opening the app. Submit one deliberate single-recording host action and record
only validated SpotifyCatalog diagnostics. Honor any returned cooldown exactly;
do not send another search merely to prove the guard works. Inspect whether a
known quota reason was reported rather than assuming the test volume caused it.
Then test player queue changes and same-account remote controls if actual host
activation succeeds. A denied catalog request is not host or shared-audio proof.

## Sources

Spotify documents a rolling 30-second API rate-limit window, separate endpoint
limits and Retry-After handling:
https://developer.spotify.com/documentation/web-api/concepts/rate-limits

Spotify documents Development Mode quota and a QUOTA_EXCEEDED reason. Its July
2026 update states that development clients under a developer account share quota:
https://developer.spotify.com/documentation/web-api/concepts/quota-modes
https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates

The running session's actual limiting rule is still unknown until a fresh bounded
response diagnostic is observed. No credential/client identity rotation is used.

## Final source and package checkpoint

Source Mobile `3130e19`, SpotifyJam `135a891`, Player `2a66a2a`. Final source
x86 and ARM64 release builds passed in 40 and 28 seconds. Both packages passed
v2 signature, 16 KB ZIP alignment, sole ABI and native ELF LOAD alignment checks.
Both contain the safe Android catalog tag and typed pacing diagnostic fields.
The quota comparison literal is optimized out of contiguous binary strings; its
behavior is established by Rust tests, not a literal marker check.

Phone: `build/spotify-jam/StreamingService-Jam-paced-final-arm64.apk`; 36,078,556 bytes, SHA-256 `3f66f1f4049acd30f65896b12225c4696058497e63bc64e79c5455def658f27d`.

Emulator: `build/spotify-jam/StreamingService-Jam-paced-final-x86_64.apk`; 37,147,765 bytes, SHA-256 `1820ee9219b34dbf04bf384f0acc38e0de26b57e57f02d2f2caa86c8c39a606f`.

The phone delivery alias now points to the paced ARM64 package. The earlier
2138cf7 artifacts are retained under their exact filenames. These final packages
have not been launched on a device. The intermediate diagnostic install client
exited after transport loss; its committed package state must be inspected on
reconnection before another installation. No new Spotify search was submitted,
so the real Retry-After and quota reason are still unknown.

Read-only inspection of the installed desktop application bundle found the
searchDesktop GraphQL operation and searchV2 response references. Our native
catalog currently uses the public Web API search route. These are different
protocol paths; this observation does not establish the limiting rule or authorize
claims of a working replacement transport. No extracted application artifacts
were added to production code. Actual player Jam verification remains pending
Android reconnection and successful catalog matching.

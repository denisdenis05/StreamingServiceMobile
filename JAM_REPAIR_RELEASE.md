Current package update: read [SPOTIFY_RATE_LIMIT_PROGRESS.md](SPOTIFY_RATE_LIMIT_PROGRESS.md).
The following 2138cf7 release is retained as an earlier tested checkpoint.

# Jam repair release — 2026-11-01

## Implemented source

Mobile source `2138cf7`, SpotifyJam `135a891`, Player `2a66a2a`.

- `3fb2908`: bounded scrollable player controls and accurate following instructions.
- `f40bbaf`: stale queue publication/withdrawal failures cannot overwrite a newer Jam or player action.
- `ecd69d3`: host headless failure cleanup obeys the task deadline.
- `b62e1a9`: reuse verified duration only for exact recording/title/artist; preserve present server metadata and provenance.
- `2007304`: current-match retry fence, synchronous future lookup failure isolation and bounded follower headless cleanup.
- `63751ed`: explicit hosting for an unhosted Jam captures the actual previous Connect device while preserving before/after membership checks and Rust takeover verification.
- `2138cf7`: actual Connect HTTP 429 becomes RateLimited, distinct from local Backpressure; no automatic search retry.
- SpotifyJam `135a891`: unavailable foreground current matches survive fresh position/upcoming-only observations; new occurrence or explicit reattachment permits matching again.

Three requested agents contributed. One follower agent stopped at its usage limit;
root completed its edits, corrected a regression setup and ran integrated checks.
No source work is delegated or running at this checkpoint.

## Source checks

- `npm run test:spotify`: 651 Node and 178 Jest cases passed, including architecture/build checks.
- `npx tsc --noEmit`: passed.
- `npm run test:player-mobile`: 341 passed; settings: 25 Node and 25 Jest passed.
- App and Player `testDebugUnitTest`: 454 and 289 cases passed, zero failures.
- Native `cargo test`: 238 passed. Probe suites: 33 passed.
- SpotifyJam `npm test`: architecture, TypeScript and 656 cases passed.

Source tests, APK compilation and observed emulator behavior are separate evidence.
Feature maps: HOSTING_CONTINUATION_PROGRESS.md, FOLLOWER_QUEUE_PROGRESS.md,
CATALOG_COMPATIBILITY_PROGRESS.md, PLAYER_JAM_PROGRESS.md and SpotifyJam FEATURES.md.

## APKs

Phone: `build/spotify-jam/StreamingService-Jam-final-arm64.apk`

36,061,076 bytes; SHA-256 `ad9eefb77203151a1fb3b132a58ced27214faae1a047fe5231ded76a77b3706b`.

Emulator: `build/spotify-jam/StreamingService-Jam-final-x86_64.apk`

37,129,797 bytes; SHA-256 `5382f0acae79f6fbdd372ef0c8dd9bcab85e8125eb601fea66b545b297db9212`.

The current phone delivery alias is `build/spotify-jam/StreamingService-Spotify-Jam-arm64.apk`.
Both packages passed v2 signature verification, 16 KB ZIP alignment, sole requested
ABI, native ELF LOAD alignment, fresh 2,357,820-byte Hermes bundle and required
headless/action marker checks. The native binary contains the new rate-limit code.
Final x86 and ARM64 build logs and package metadata use `jam-final-*` under the
ignored build/spotify-jam directory. Earlier source checkpoints remain distinct.

## Observed emulator and backend results

The user deployed Server ad35b78 or later and reopened WayDroid. The catalog search
route now returns 401 to an unauthenticated capability check, replacing the prior
404; the existing protected comparison route also returns 401. This does not
constitute an authenticated catalog payload assertion by itself.

The old interrupted package update had completed by the reopened session. Both
new updates installed successfully with `adb install -r --no-incremental` and app
data retained. Real React pages and saved Spotify connection were observed. A
single real local result selected using a synthetic library query reached the
player. Actual song/account text and credentials were not exported.

One explicit player Start sharing attempt passed queue capture and stopped at
CatalogMatching/Backpressure on source 63751ed. That code conflated HTTP 429 and
local capacity, so no status was inferred from it. After installing 2138cf7, one
controlled diagnostic attempt returned CatalogMatching/RateLimited. The new native
HTTP mapping distinguishes actual status 429 from local queue capacity. The UI
reported “Spotify is limiting requests. Wait before trying again.” No subsequent
search was submitted. No mutation was retried after an uncertain outcome.

Neither attempt reached native activation. StreamingService has not been verified
as the active Spotify playback device. Successful candidate search, app-hosted
audio, same-account remote controls, two-account queue propagation, synchronization
timing and host/follower background/reconnect behavior remain unverified live.
A second account is still unavailable. The ARM64 package was not executed on a
physical phone. Source regression coverage does not close these acceptance gates.

## Resume

Preserve the running emulator/native connection and Spotify processes. Do not use
old desktop probe codes or assume that canceled probe is live. Wait for an explicit
later catalog check after Spotify permits requests; do not loop or rotate accounts
to retry. First check whether current local audio/queue and membership are still
valid, then perform one deliberate host action. Success requires actual native
activation/own-device confirmation and publication before claiming shared audio.
If matching still fails, retain the typed stage/category and stop further searches.
Full guest/audio/timing checks require the second account/device. Physical-phone
acceptance remains separate. Pre-existing server appsettings/.idea changes remain
untouched; this session made no production deployment or push.

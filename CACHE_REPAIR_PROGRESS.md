# Image and download cache repairs

Implemented locally on 2026-10-17. No commits or staging. The original investigation is [IMAGE_LOADING_ANALYSIS.md](IMAGE_LOADING_ANALYSIS.md); its defect descriptions describe the baseline.

## Mobile changes

- `AssetCache` owns shared requests, visible/prefetch priority, three concurrent transfers, reference-counted cancellation, one delayed retry for transient failures, generation fences, atomic completion records and a cache byte/age policy. A displayed lease remains pinned until release, so the byte budget may temporarily be exceeded by visible assets. Source identity is SHA256 of scope and complete URL. No URL, token or headers enter telemetry records.
- The RNFS adapter checks status, actual size, bytes written and declared length. It cancels oversized transfers when length/progress callbacks expose the limit. PNG, JPEG, WebP and GIF dimensions are checked from a bounded 256 KiB header before native decoding; both header and decoded size must fit the 16-million-pixel limit; replacement invalidates the earlier completion record and supports iOS RNFS move semantics; audio rejects text/HTML responses and requires a completion checksum. It does not claim a hard native disk-write limit while JavaScript is stalled.
- CachedImage uses the same cache for URL-only views and album views, preserves HTTP headers, displays available thumbnails while full artwork loads, cancels unused requests and prevents old completions/old row images from replacing the current identity. Local decode failures invalidate the displayed asset and retry once. Placeholder pixels are embedded locally instead of loading another remote image.
- Playing, mini-player, Library and Search now use the shared cache. Playback catalog/view metadata preserves small/thumbnail URLs. A native artwork change does not retain obsolete thumbnails. Progress frames remain isolated from artwork consumers.
- Audio cache identity includes server and account. Its completed-file quota rejects new downloads rather than evicting files that a native queue may still reference. Reads require a completed matching file/checksum, downloads use temporary files, duplicate requests share work, partial requests are refused and account changes clear the retired account's cache. Existing unverified legacy audio files are intentionally not accepted as completed downloads. This repairs the helper; it does not add automatic offline downloads or a new downloads screen.
- Cache records live beside files; MMKV availability no longer decides whether image/audio assets can be reused. `clearImageCache` also removes legacy image entries/files while preserving recording lists. New versioned cache directories use bounded eviction; legacy files can be removed with the clearing helper.
- `assetCacheEvents` exposes hit/miss/completion/failure/eviction and image display timing by hashed identity. Image display callbacks measure arrival at React Native's load callback, not an independently measured first painted frame.

## Tests and checks

- `npm run test:asset-cache`: 58 checks passed (27 core cache, 15 service/React integration, nine native-adapter checks and seven image-header checks). The previous research command now runs desired-behavior regression tests.
- `npm run test:player-mobile`: 293 passed, including artwork metadata through catalog mapping, preparation and native queue projection.
- `./node_modules/.bin/tsc --noEmit --pretty false`: passed the full app.
- Android and iOS production JavaScript bundles passed with 19 and 15 image assets, under `/tmp/streaming-reload-*`.
- Server: 38 tests passed, including eleven on a disposable local PostgreSQL database and real FFmpeg decoding/size checks. See [server progress](../StreamingServiceServer/COVER_ASSET_PROGRESS.md).

Host tests and bundles do not establish device latency, decoded image memory or actual deployed NAS/Nginx behavior. No native player code or native application binary changed in this chapter. The existing server appsettings edits remain user-owned and untouched. No Nginx configuration tests were run.

## Deployment

Apply the server's additive CoverAssetJobs migration before deploying the new API. The server progress file documents the SQL, cover-directory permissions and built-in FFmpeg requirement. Reload the app JavaScript after preparing the sibling player as usual. No production deployment or database update was performed.

## Subsequent authorized issue — completed locally

The mobile playback refresh issue was then fixed; see [PLAYBACK_REFRESH_PROGRESS.md](PLAYBACK_REFRESH_PROGRESS.md). Original request: analyze and fix mobile playback failing after an app refresh. User reports that RNTP previously displayed a cannot-reinitialize-audio error, while the current player displays no error. Keep ownership in the mobile app; trace initialization, native-session attachment, authentication readiness and error reporting. No commits.

Image header parsing is covered with real FFmpeg-generated fixtures and malformed/truncated cases. Unsupported formats and dimensions absent from the bounded prefix fail closed. WebP field offsets follow the [RIFF container specification](https://developers.google.com/speed/webp/docs/riff_container). This protects the initial dimension check; device peak decoding memory still needs measurement.

## Commit authorization

The user authorized committing these completed changes on 2026-10-17. Earlier no-commit statements record the implementation phase. No push, deployment or production migration is included. Local server appsettings files and IDE settings are excluded.

## Follow-up review: unresolved transfer lifetime and performance issues

The [image pipeline review](../StreamingServiceServer/IMAGE_CACHE_REVIEW.md) identifies failed-download listener retention, terminal native downloader retention and conditional iOS Promise/slot hangs in the installed RNFS dependency. It also identifies full decoding during validation, directory scans before image delivery and synchronous telemetry searches. Existing mocked transfer tests did not cover these native lifetime paths. These are open findings; this source review did not change runtime code, run tests or measure device memory.

## Transfer lifetime follow-up implemented

[IMAGE_TRANSFER_REPAIR_PROGRESS.md](IMAGE_TRANSFER_REPAIR_PROGRESS.md) records the RNFS patch, watchdog, isolated native attempt paths, cleanup/error handling and tests. The current cache suite has 71 passing tests, playback suite 319, and patch/dependency checks 11. Android RNFS compilation and unsigned xtool downloader harness packaging passed; native heap/device execution remains unverified. Mobile review M4/M8 remain separate performance work.

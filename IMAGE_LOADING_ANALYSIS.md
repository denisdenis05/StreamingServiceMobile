# Image loading and local downloads

Investigated 2026-10-16 after implementing smooth playback progress. This is a source review with eight deterministic reproductions. No production image timings, database contents, NAS latency or deployed Nginx configuration were measured. Image, audio download and server implementation code was left unchanged. No commits.

## Repair status — 2026-10-17

The listed mobile/cache/server implementation defects have been repaired locally without commits. [CACHE_REPAIR_PROGRESS.md](CACHE_REPAIR_PROGRESS.md) and [server progress](../StreamingServiceServer/COVER_ASSET_PROGRESS.md) map the changes to passing regression and PostgreSQL/FFmpeg tests. The sections below retain the original evidence. Production latency, device memory, NAS permissions and the deployed Nginx mapping remain operational checks; no production deployment or migration was performed.

## Findings and fix order

| Priority | Finding | Evidence | Effect |
| --- | --- | --- | --- |
| First | Image cache returns files that no longer exist | Reproduced | Persistent placeholder instead of recovery |
| First | Player/mini-player bypass the app's image disk cache | Source | Repeated full artwork loads depend on native HTTP cache behavior |
| First | Missing requested thumbnail does not fall back to available full cover | Reproduced | Some covers never load despite having a usable URL |
| First | Library response ignores downloaded server covers | Source | Locally available artwork is still requested from external servers |
| First | Cover service and Compose disagree about the external base URL | Source | Some newly constructed cover URLs contain a duplicate release path |
| Next | Old image downloads can replace newer artwork | Reproduced | Stale artwork persists after metadata changes |
| Next | Download jobs can miss each other and wait six hours | Source | Newly added artwork may remain remote for a long time |
| Next | Server download identity, file writes and repair are unsafe | Source | Filename collisions, partial files and missing files can persist |
| Next | Cover upload gives every tier the same original file and URL | Source | Oversized thumbnails and stale device caches |
| Next | Cold image display waits for disk download to finish | Source | First visible pixels wait for download and rename |
| Later | Image download work has no global concurrency limit or visibility priority | Source; performance effect unmeasured | Scrolling can compete with the visible image |
| Separate | Audio download helper has incomplete-file and identity problems | Partly reproduced; helper has no callers | Unsafe to expose as a completed offline-download feature |

## Current path

Album cards and song rows call [CachedImage](src/components/CachedImage.tsx) with release identity and a requested size. It first reads MMKV synchronously. On a miss, [ImageDownloadService](src/services/cache/ImageDownloadService.ts) downloads the entire requested image to a temporary file, renames it, records a path and then gives that file URI to React Native Image. A failed download returns the remote URL for Image to try again.

[Playing artwork](src/pages/Playing/Playing.style.tsx) and the [mini-player](src/components/PlayingOverlay/PlayingOverlay.style.tsx) pass only `source`. That selects plain URL mode and bypasses this disk cache. [PlaybackCatalogMapping](src/services/player/PlaybackCatalogMapping.ts) keeps only `cover` as `artworkAddress`; it discards thumbnail URLs. The library list uses plain Image as well. Native Image can still have its own memory/HTTP cache; bypassing our disk cache does not establish that every render makes a network request.

On the server, [response mapping](../StreamingServiceServer/StreamingServiceServer.Business/Models/MusicSearch/MusicSearchExtensions.cs) normally chooses Local, then Optimized, then original URL. Optimized means a resolved redirect URL, not resized or re-encoded artwork. [CoverOptimizationService](../StreamingServiceServer/StreamingServiceServer.Background/CoverOptimizationService.cs) resolves URLs; [DownloadCoverOptimizationService](../StreamingServiceServer/StreamingServiceServer.Background/DownloadCoverOptimizationService.cs) later downloads them. Server covers are public static `/images` files; they do not use the audio controller's internal X-Accel redirect. External Nginx must point at the same cover directory the server writes. Its actual deployed mapping was not checked or tested.

## Mobile defects

### 1. Missing files are treated as cache hits

`getLocalPathForTier` and `getBestAvailableLocalPath` trust MMKV without checking the file. `getOrDownloadForTier` returns that URI immediately. Image's error callback switches to a placeholder without deleting the invalid entry or retrying. A file removed from the caches directory therefore remains a cache hit on later mounts. `clearImageCache` deletes the directory but does not clear image entries, causing the same problem when called. No current caller of that clearing helper was found; filesystem eviction is enough to reach the missing-file defect.

Fix: verify the requested file asynchronously before accepting a durable cache hit; invalidate missing/corrupt entries and retry once through the downloader. Keep immediate display as an optimistic preview with recovery on decode failure. Coordinate metadata and filesystem clearing using a generation that also invalidates in-flight work. Preserve unrelated cached recording lists.

### 2. Missing thumbnail fields produce placeholders

`urlForTier` returns only the exact tier. Requesting `small` with only `cover` provided returns the placeholder without attempting the full-size URL. The promise resolves successfully, so CachedImage's catch fallback is not used. This also affects playlist cards: the server library response gives playlist entries only a Cover field, while Home requests a small tier.

Fix: define an ordered fallback for each display size, choosing the nearest usable URL. Store the actual source/version with each cached variant. Test cover-only playlists and albums with partial size metadata.

### 3. Player artwork does not reuse these downloads

The Playing screen and mini-player request the full artwork URL in plain mode. A thumbnail already downloaded by Home or song rows cannot act as their preview. Other plain-image paths include Library and Search. Re-rendering with a new source object can rerun the CachedImage effect, although React Native may avoid another download for an unchanged URI.

Fix: preserve release identity and artwork variants in playback view metadata. Use the shared image cache in each view. Display an available thumbnail immediately, then upgrade to the desired display size. Pick sizes from rendered dimensions and screen density; avoid full-size downloads for small rows. Do not route cover downloads through the audio engine.

### 4. URL changes are not fenced against in-flight completion

The in-flight key is release plus tier, without URL/version. A request for new artwork can join the old download and receive its result. The old request then writes its captured URL back to MMKV. Invalidation checks only `cover`, so changed small/verySmall URLs can also be missed when the full URL stays unchanged. Same-URL server overwrites never invalidate this cache.

Fix: key downloads by source identity/version plus variant, and validate that identity again before publishing metadata or UI results. Use content/version-specific filenames. Update each tier independently. An old completion may finish cleanup but cannot publish over the current generation.

### 5. Component reuse can display the previous album

When release identity changes and no new local preview exists, the effect leaves `displayUri` unchanged until the new promise resolves. That can show the previous album during a slow download. Decode errors latch a placeholder without trying another tier; callers can also override the built-in error handler through spread props.

Fix: reset presentation on identity changes, show only previews belonging to the current image identity, compose error handlers and recover through the cache service. Add tests for rapid row reuse, old download completion and local decode failure.

### 6. Success and cleanup are incomplete

A 200 response is accepted without checking bytes or whether the result is a decodable image. The fixture reproduces accepting zero bytes. There is no cache size budget, age policy or removal of superseded files. Multiple tiers that resolve to one URL download and store separate copies. Requests continue after a view unmounts; in-flight deduplication covers only the exact release/tier pair. The directory-ready boolean also assumes the directory remains present for the process lifetime.

Fix: validate download size/type, publish atomically and remove invalid results. Add shared source deduplication, bounded scheduling, visible-image priority, reference-counted cancellation and a byte budget. Re-create a missing directory after filesystem errors. Keep these behind injectable filesystem, storage, network and scheduling interfaces with deterministic tests.

### 7. Cold loads can wait twice

A cache miss displays its placeholder until RNFS completes the whole file and rename. Both configured image timeouts are 30 seconds; these are phase timeouts, not evidence of a fixed total duration. On failure, the code returns the same URL to Image, which can start another network load. There is no global retry/backoff or failure classification.

Fix: use a valid cached thumbnail as preview, separate first-display work from optional higher-quality prefetch, and select one owner for each fetch. Bound retries and handle missing images differently from transient transport errors. Instrument request start, first visible image, bytes, cache result and decode completion before choosing further optimizations.

## Server defects

### 8. Library responses skip Local covers

[LibraryService.GetLibraryAsync](../StreamingServiceServer/StreamingServiceServer.Business/Services/Library/LibraryService.cs) selects Optimized/original fields for saved albums, ignoring Local fields. Other entity mappers prefer Local. The same album can therefore return different artwork hosts depending on the endpoint. Downloading covers on the server does not help this library path.

Fix: share one cover-selection policy across library, metadata, recommendations and dashboard responses. Test all size variants with Local, Optimized and original fallbacks.

### 9. External base URL has conflicting assumptions

[Compose](../StreamingServiceServer/compose.yaml) and [.env.example](../StreamingServiceServer/.env.example) default AlbumCover BaseUrl to `https://coverartarchive.org/release/`. [ImageService](../StreamingServiceServer/StreamingServiceServer.Business/Services/Images/ImageService.cs) appends `release/{identifier}` or `release-group/{identifier}`. With those defaults it constructs `/release/release/{identifier}/front` or `/release/release-group/{identifier}/front`. These are inconsistent with the service's own intended paths. This affects code constructing fresh URLs; existing database URLs may be valid. The user's deployed environment was not read to determine whether it overrides the default.

Fix: define one validated origin/root contract and one URL builder for release and release-group artwork. Add exact URL tests and a plan to repair only database rows known to have the malformed prefix. Do not blindly rewrite every existing URL.

### 10. Two independent six-hour scans make downloads late

Both hosted services start independently. Each scans every release, then every recording in batches of ten with a one-second delay, and waits six hours after completion. Neither filters the query to pending work. If the downloading scan visits an entity before redirect resolution saves its Optimized field, it can skip that entity until the next scan. A newly inserted entity after a completed scan has the same delay. Release/recording propagation fills only empty fields, so it does not refresh changed artwork.

Fix: enqueue one durable cover job when metadata is inserted/changed; resolve and download variants within that job. Use bounded parallelism, per-asset deduplication, persisted retry times and failure state. Keep a filtered repair scan as a fallback. Use stable keyset pagination if a scan remains. Report pending count, oldest pending age and failure reasons.

### 11. The downloader does not reliably reuse or repair files

`DownloadAndSaveAsync` performs HTTP GET before checking whether a destination file exists. GetAsync uses the response-body completion behavior, so the existing-file check comes after fetching content. Recordings that share artwork can therefore repeat remote downloads even if the file is already on disk. Destinations use only the remote basename, which can collide across different URLs. Writes go directly to the final filename. Interrupted writes can leave partial files that a later attempt accepts through File.Exists. A nonempty Local field prevents another download even if the file was deleted. Concurrent variant tasks have no destination lock or atomic publication. Image bytes are held in memory for each download.

Fix: use a stable hash/version identity, check validated stored assets before HTTP work, stream to a unique temporary file, validate and atomically publish. Persist asset state separately from presentation URLs. Repair missing/corrupt local files even when Local is populated. Propagate updates by asset version, not by checking for empty strings.

### 12. Uploads do not create thumbnails or change the cache identity

[DashboardController.UpdateAlbumCover](../StreamingServiceServer/StreamingServiceServer.API/Controllers/DashboardController.cs) writes `{release}_cover.{extension}` and puts the same URL into every size field. Uploading another image with the same extension retains that URL. Mobile disk entries can therefore keep the old image indefinitely, and a song row may download the original upload size. This endpoint is not an image resize pipeline.

Fix: validate/decode the upload, generate the configured display variants and publish versioned/content-addressed assets. Return their new identities. Decide retention for old versions after successful publication. Add tests for repeated uploads, each tier's dimensions and stale client completions.

### 13. Serving policy needs measured follow-up

ASP.NET exposes Cover:Path at `/images`; the external Nginx template aliases an image directory directly. Neither repository path sets an explicit long-lived cache policy for versioned covers. Framework/default ETag or Last-Modified behavior can still exist; this review does not claim those headers are absent. An external Nginx host must see the actual files via its own mount/path. A correct API cover directory alone does not establish that external alias is correct.

After versioned assets exist, configure explicit caching for those assets. Measure cold and warm API/public image paths, TTFB, bytes, image dimensions, status, redirects and cache response headers. Check representative files and read permissions using the server's runtime user. No Nginx configuration tests were run, per the user's earlier instruction. NAS restart, latency and deployed alias behavior remain unverified.

## Audio download logic checked as well

[AudioCacheService](src/services/cache/AudioCacheService.ts) is separate from image caching. No caller of `cacheTrack` or `isTrackCached` was found; current playback only reads existing cache files through [NativeAudioRuntime](src/services/NativeAudioRuntime.ts). Therefore this helper is not a working automatic offline-download pipeline in the migrated app.

Confirmed problems:

- Cache identity extracts only a query `id`; URLs without it share `unknown.mp3`. Server/account are also absent from the key. The collision is reproduced.
- Downloads write directly to the final path. Any nonempty existing file is reused, including a truncated file; reproduced with a small partial file. Playback's current readable-file check also cannot distinguish this from a completed asset.
- Concurrent downloads are not deduplicated. One failure can unlink a path another request is writing.
- Success accepts any 2xx response with positive size; no expected length, media identity or completion manifest is checked. `isTrackCached` only tests existence.

Before exposing offline downloading: use server/account/media identity, a completion manifest, temporary files with atomic publication, deduplication, cancellation and account-scoped cleanup. Keep streaming available on cache failure. These were already partly identified in the workspace's earlier security/performance review; they remain unfixed. They do not establish the cause of the reported image delay.

## Reproductions and remaining measurements

Run from StreamingServiceMobile:

```sh
node --test tools/image-loading-research.cjs
```

Eight checks passed. They intentionally assert the observed defects: deleted cache file, clear retaining stale metadata, missing thumbnail fallback, old URL completion, empty image success, audio filename collision, partial audio reuse and previous-release image retention. They use actual transpiled service/component source with injected filesystems, storage and React fixtures. They make no HTTP requests or device filesystem changes. This research script is separate from product acceptance tests; convert its expectations when fixing each defect.

The server findings are source evidence, not executed C# or production integration tests. No server settings or secrets were copied into this report. The remaining measurement pass should use a real slow image from the affected screen and compare first open/reopen, app restart and valid/deleted disk entry. Capture which URL/tier was actually selected and whether the delay is metadata, network, disk or decode. Then measure a warm locally served cover against its remote fallback. This is needed to rank the observed user's delay by elapsed time; the defects above are established independently.

## Implementation sequence

1. Recover invalid local image entries, add tier fallback, fence URL changes and reset reused components. Convert the corresponding reproduction checks to desired behavior tests.
2. Unify server cover URL construction/selection, repair malformed entries safely and test each response endpoint.
3. Pass image identity/variants to Playing, mini-player and remaining lists. Reuse thumbnails as previews with tests for URL changes and account/session transitions where relevant.
4. Replace independent scans with durable asset jobs; add validated atomic storage, missing-file repair and consistent thumbnail generation.
5. Add versioned serving/cache policy, a bounded mobile image scheduler and instrumentation. Profile on the emulator/device before claiming a performance gain.
6. Address audio downloading as its own feature, with completion integrity and ownership tests before enabling it.

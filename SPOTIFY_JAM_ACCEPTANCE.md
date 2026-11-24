# Spotify Jam device and account acceptance

## Packaged source versus observed behavior

The latest APK and source checks are recorded in SPOTIFY_JAM_APK.md. Release
assembly, signature, alignment, unit tests and bundle markers establish packaged
source. They do not establish installation, guest permission, audio timing or
Android process/lifecycle behavior. Emulator verification resumed at the user's
request. The latest APK installed and the actual hosting action stopped at
CatalogMatching/RateLimited, before native activation. Read JAM_REPAIR_RELEASE.md
for that artifact identity, source checks and the remaining live gates.
The newer paced packages and current pending adb reconnection are recorded in
SPOTIFY_RATE_LIMIT_PROGRESS.md; they have not been installed successfully.
Physical-phone verification remains separate.

## Required setup

For emulator checks, preserve the running WayDroid x86_64 session. The installed current package is StreamingService-Jam-final-x86_64.apk. For physical checks, connect an ARM64 Android device with USB debugging enabled and authorize adb.
Install the recorded APK, restore the StreamingService account and pair Spotify
through Profile → Settings → Spotify & Jam. A second Spotify account/device is required for guest admission,
shared queue and simultaneous playback acceptance. The host machine's read-only
probe is a separate native session and cannot establish Android playback results.

## Scenarios and evidence

| Scenario | Required observation |
| --- | --- |
| Profile and Settings | Check actual name persistence per account, all Settings routes/back navigation, Last.fm authorization/cancel/disconnect, shuffle/repeat and artwork-cache clear; no audio cache deletion |
| Native sign-in and restore | Actual registered native handle/generation; no credentials or raw account/song logging |
| Catalog translation | Current-session native search returns decoded candidates; permission, throttling and queue-capacity failures stay explicit |
| App-led host activation | Explicit action captures the actual app queue and epochs; native activation and fresh own-device verification succeed |
| Remote actions | Pause/resume/seek/skip/add queue are acknowledged only after real app player receipts; duplicates do not execute again |
| Player integration and local queue changes | Host from the player; switching songs prepares mappings before queue mutation and publishes actual occurrences after receipt. A failed preparation preserves the old queue. Incoming remote changes retire stale local preparations; unprepared external additions still pause safely |
| Player controls while following | Allowed pause/resume/next/previous/seek use one real remote command and authoritative follower refresh, without duplicate local mutation; arbitrary remote select/reorder remains unavailable |
| Invitation QR | Generated QR contains exactly the current real invitation, scans in Spotify, clears on session/account/invitation rotation and retains accessible text/share alternatives |
| Shared queue | Repeated recording occurrences and order agree across accounts; uncertain edits do not replay |
| Guest admission and permissions | The second account is actually admitted; permitted reads/actions succeed, denied roles remain denied; guards are not removed by inference |
| Following | Host playback changes map to actual library audio; drift is measured rather than inferred from source clocks |
| Hosting/following exclusivity | Starting either owner waits for previous cleanup; no simultaneous native owners or implicit fallback |
| Screen lock and background | Native source/publication continues without screen polling; recording and authentication headless tasks complete in the captured scope |
| Network and reconnect | Following recovers only the same verified Jam/host at a newer actual generation; hosting retires without implicit authority takeover |
| Credentials and account replacement | Actual app token renewal commits before acknowledgement; logout/replacement stops old jobs and stale callbacks |
| Cleanup and uncertain responses | Host withdrawal removes controllability; failed withdrawal remains fenced until actual native retirement and binding release |
| Android process death | No stale persisted native session starts automatically; restore requires actual fresh ownership and explicit supported actions |

Capture safe status, timing, counters and failure categories. Keep account, song,
credential, join-token and invitation data out of logs and exported reports.
Record each result as passed, failed, or unverified. A pairing approval or a
registration acknowledgement is not a playback result.

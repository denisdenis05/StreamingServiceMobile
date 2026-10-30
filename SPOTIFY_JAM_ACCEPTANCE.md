# Spotify Jam device and account acceptance

## Packaged source versus observed behavior

The latest APK and source checks are recorded in SPOTIFY_JAM_APK.md. Release
assembly, signature, alignment, unit tests and bundle markers establish packaged
source. They do not establish installation, guest permission, audio timing or
Android process/lifecycle behavior. No Android device is currently attached.

## Required setup

Connect an ARM64 Android device with USB debugging enabled and authorize adb.
Install the recorded APK, restore the StreamingService account and pair Spotify
through the app. A second Spotify account/device is required for guest admission,
shared queue and simultaneous playback acceptance. The host machine's read-only
probe is a separate native session and cannot establish Android playback results.

## Scenarios and evidence

| Scenario | Required observation |
| --- | --- |
| Native sign-in and restore | Actual registered native handle/generation; no credentials or raw account/song logging |
| Catalog translation | Current-session native search returns decoded candidates; permission, throttling and queue-capacity failures stay explicit |
| App-led host activation | Explicit action captures the actual app queue and epochs; native activation and fresh own-device verification succeed |
| Remote actions | Pause/resume/seek/skip/add queue are acknowledged only after real app player receipts; duplicates do not execute again |
| Local queue changes | Known recordings publish the real order; unknown recordings pause and use a bounded headless match; Play afterward is explicit |
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

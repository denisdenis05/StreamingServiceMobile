# Host lifecycle follow-up — 2026-10-25

The new probe uses production native grant IPC and the production TypeScript
login/session/runtime with the mobile regional service resolver. After user
pairing, absent/present membership reads, owned active Jam creation, invitation
generation and native saved-session restoration succeeded. One participant and
no host device were observed. A second-account invitation check is pending;
this temporary Jam is still active, with cleanup tracked in the mobile progress.
No control command or guest/audio success is claimed. Private IPC carries native
grants only between local child/parent processes and is not console output.

# Live-tested paired Login5 — 2026-10-25

The user approved browser pairing for a local runner using the actual library
broker and pinned Librespot revision 99b6088. The first approved run reproduced
Keymaster HTTP 403 after successful access-point connection. Upstream Login5
succeeded. A subsequent polling process exited on a transient network failure
before receiving approval; its private in-memory transaction was lost. The
runner now resumes existing pending tickets after bounded transient failures,
respects Retry-After, and never replays an already consumed approval.

The next approved run remained open for rebuilt native probes. Its live results:

| Step | Result |
| --- | --- |
| Browser device authorization and approval | Completed |
| Approved bearer, public profile GET | HTTP 429; first run returned 503 |
| Approved bearer, passive current-Jam GET | HTTP 404; no admission claim |
| Native access-point connection | Succeeded on Linux |
| Keymaster, all five account/playback scopes | HTTP 403 |
| Keymaster, streaming alone | HTTP 403 |
| Upstream Login5 stored-credential exchange | Succeeded on Linux |
| Dedicated Login5 request without client-token | Succeeded on Linux |
| Same request with Android-style user agent | Succeeded, from Linux |
| Actual production bootstrap with dedicated exchange | Succeeded, validated native grant |
| Actual production restore from returned reusable record | Succeeded |

The Android-user-agent request used the pinned mobile version and representative
Android 14 metadata through a separate reqwest client. It was not execution on
an Android device. During the interactive run, both direct request outcomes used
the old login5-without-client-token stage label; the second was the Android-user-agent
call. The two runtime outcomes were production bootstrap followed by restore.
The tool now emits distinct descriptive labels for future runs.

Production paired sessions now use stored-credential Login5 without client-token,
keeping the original desktop client/device/account binding. Password sessions
retain upstream Login5 and platform client tokens. The previous Keymaster route
is removed from production minting. No fallback replays rejected credentials
under another identity. The protocol validates token/expiry/account and bounded
response/challenge data; injected HTTP, clock and solver support deterministic
tests. Hashcash rounds use Librespot's bounded solver. Code verification remains
unsupported. Transient/verification categories retain their recovery behavior.

Primary upstream context: https://github.com/librespot-org/librespot/issues/1532
reports Keymaster 403 and recommends Login5. The local live results above are
independent evidence. Issue 1771 documents Login5 503 elsewhere; the local
Login5 request succeeded and does not reproduce that separate issue.

Credentials stayed in process memory. The token reached the native executable
through stdin, never command arguments. Probe outputs contain only fixed stages,
platform, sanitized categories and structured HTTP status. No user account,
access/reusable/refresh credential, request URI or private response payload was
printed or saved. The interactive runner was stopped after verification, closing
that token's local lifetime. Browser sign-in remained on Spotify's own page.
No Jam was created or changed by these tests.

Feature mapping and validation:
- native/librespot-session/tests/desktop_login5.rs: 13 tests for endpoint/header
  binding, canonical account/token/expiry, malformed and oversized replies,
  transient errors, verification, hashcash context/solution and solver failures,
  challenge bounds and request limits.
- native/librespot-session/tests/token_exchange.rs and session_boundaries.rs:
  26 routing, failure, credential, cancellation and lifecycle cases.
- native/librespot-session/examples/session_probe.rs: three report/deadline tests.
- tools/spotify-device-probe.test.cjs: nine output sanitization, storage isolation,
  resume/no-replay, rejection, Retry-After, retry bound and cancellation cases.
- npm run test:spotify-native passed all 39 native cases and actual host JNI smoke.
- :app:testReleaseUnitTest :app:assembleRelease passed with 23 JVM cases.

Commands:
- cargo build --locked --manifest-path native/librespot-session/Cargo.toml --example session_probe
- node tools/probe-spotify-device-login.cjs --interactive
- cargo test --locked --manifest-path native/librespot-session/Cargo.toml --example session_probe
- node --test tools/spotify-device-probe.test.cjs

HTTP/protobuf become direct production dependencies at the same versions already
used transitively. reqwest is a diagnostic dev-dependency at the existing locked
version. Existing third-party notices already cover all three packages.

APK details are in SPOTIFY_JAM_APK.md. No TypeScript runtime, React Native bridge
signature, native reusable record schema or pending pairing schema changed.
The release bundle is reused because JavaScript did not change; Android native
code was rebuilt. Next: install the new APK, start fresh pairing on the phone,
and verify sign-in and saved-session restoration. Actual Android execution,
secure mobile persistence, private Jam admission and playback remain unverified.

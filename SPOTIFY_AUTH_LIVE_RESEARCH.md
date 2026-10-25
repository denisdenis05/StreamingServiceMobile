# Live pairing and native-token investigation — 2026-10-25

The user approved a desktop-browser device pairing for the local diagnostic
runner. The runner used the actual library device-authorization broker, its five
configured scopes, an isolated in-memory pending store and the pinned native
Librespot dependency. It sent the approved token to the diagnostic executable
through stdin. No access/reusable/refresh credentials were written to disk or
printed. The user's existing browser handled sign-in and approval.

| Live step | Result |
| --- | --- |
| Device authorization and approval | Completed |
| Approved token, public profile GET | HTTP 503; not a successful profile check |
| Approved token, passive current-Jam GET | HTTP 404; not proof of Jam admission |
| Native access-point connection | Succeeded on Linux |
| Keymaster with the five playback/account scopes | HTTP 403 |
| Keymaster with streaming alone | HTTP 403 |
| Upstream Login5 stored-credential token exchange | Succeeded on Linux |

This reproduces the current token rejection after successful native connection.
It invalidates the earlier assumption that Keymaster was the right fix. Do not
ship another Keymaster-based APK as repaired from unit tests alone. The original
Android Login5 failure is still unexplained; Linux success does not prove its
Android client-token/user-agent/device-metadata behavior.

Primary upstream context:
https://github.com/librespot-org/librespot/issues/1532
reports Keymaster 403 and recommends Login5; the local live result is independent
of that report. Upstream issue 1771 separately documents Login5 HTTP 503; this
session's Linux Login5 call succeeded, so that issue is not the observed failure.

The native example session_probe compares both Keymaster scopes, upstream Login5
and a diagnostic stored-credential Login5 request without client-token. It emits
only platform, fixed stage/status, sanitized category and optional HTTP status.
It never formats upstream error text, URI, response payload, account or tokens.
Each network step has a sixty-second deadline. The diagnostic direct request is
not production authentication and reports verification challenges as unsupported.

The Node runner validates and projects native reports before printing, opens the
pairing page and keeps pending state in memory. --interactive retains the approved
token only in the running process so retry can execute a rebuilt probe without
another approval; stop ends that session. Closing the process discards it.
It performs passive HTTP checks only and does not create or modify a Jam.

Commands:
- cargo build --locked --manifest-path native/librespot-session/Cargo.toml --example session_probe
- node tools/probe-spotify-device-login.cjs --interactive
- cargo test --locked --manifest-path native/librespot-session/Cargo.toml --example session_probe
- node --test tools/spotify-device-probe.test.cjs

Dedicated tests passed: three native report/deadline tests and three Node report
validation/private-field rejection/in-memory isolation tests. HTTP and protobuf
are added only as dev-dependencies, already present at identical locked versions
in the native dependency graph. Production native routing has not changed in
this diagnostic chapter; no new APK has been built.

At this checkpoint the second browser pairing is waiting for the user's approval.
The additional no-client-token result is unverified. Next: collect it, compare
Android metadata if needed, implement the evidenced exchange and then verify
native grant restoration and build an APK. Android hardware remains disconnected.

# Native rejected-token recovery — 2026-10-27

Implemented a purpose-based authenticated request boundary around native Connect
HTTP. Primary paired Desktop observation and metadata reads renew after a rejected
bearer once, preserving method/path/body/media type, within a total 15-second
budget. A repeated 401 clears the rejected token and surfaces Unauthorized.
Queue/playback commands and removal never automatically repeat. Explicit future
operations may acquire a fresh token; no old mutation receipt is replayed.

Existing account-bound paired Login5 is reused. The separate upstream password
client token cache cannot be invalidated through its public API, so that path
does not pretend to renew on rejection; ordinary expiry behavior is preserved.
No credentials or HTTP payloads are added to logs or exported failures.

Source review additionally found that a very old pending acknowledgement could
fall outside the bounded recent-ID window. The pending map now independently
rejects reuse, preserving uncertainty for both callers instead of overwriting
one pending sender. A reproducing rollover regression covers this ordering.

| Feature | Dedicated tests |
| --- | --- |
| Success and exact safe-read renewal, bounded second rejection and fresh-token use | native/librespot-session/tests/connect_authentication.rs |
| Commands/removal never replay; 403/transient failures do not trigger renewal | Same suite |
| Initial/renewal authentication failures, unsupported upstream cache and total deadline | Same suite |
| Pending ack reuse after recent-window rollover | native/librespot-session/tests/connect_command_journal.rs |

Focused authentication nine and journal nine cases passed. The full
npm run test:spotify-native check passed all 143 Rust cases and JNI loading.
Android compilation and packaging follow the combined runtime source freeze. The currently delivered receipt
APK predates this chapter. Live forced rejection, device expiry/background and
guest audio remain unverified; the main objective remains active.

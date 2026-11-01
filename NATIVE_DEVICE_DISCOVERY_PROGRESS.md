# Native Spotify device discovery — 2026-11-01

Librespot connections now populate the device picker from their own Connect
cluster. They no longer send their native session token to the public Spotify
Web API device endpoint. Missing native support and native failures remain typed
errors; they never trigger a public API fallback. Browser OAuth and temporary
OAuth connections retain their existing gateway behavior.

`SpotifyConnectStore.readDevices(accountIdentifier, cancellation)` reads through
the existing native observation port. Both dispatch and completion require the
same ready account binding, native handle and generation. The decoder accepts
only bounded device/name data, deduplicates actual identifiers, excludes hidden,
nonplayable and noncontrollable devices, and preserves the real cluster device
names. The actual active device comes first and remains present when the visible
list is capped. An omitted or hidden observer is never invented as an available
StreamingService playback device.

A newly ready native generation requests one passive refresh. It waits for an
existing app operation to finish, captures the account and cancellation lifetime,
and retires on reconnect, generation change or account replacement. Repeated
cluster/read events in the same ready generation do not form a refresh loop.
Native selection follows the cluster's actual active device; OAuth preserves an
existing user selection while that device is still present.

| Behavior | Dedicated tests |
| --- | --- |
| Native names, activity, deduplication, immutable output and active-device retention at the list bound | `tools/spotify-connect-store.test.cjs` |
| Hidden/control-only device filtering, absent observer, malformed flags/name, cluster capacity and native failure privacy | `tools/spotify-connect-store.test.cjs` |
| Foreign account, nonready binding, pre-cancellation, prompt cancellation, handle/generation mismatch and late reconnect receipt | `tools/spotify-connect-store.test.cjs` |
| Native-only Librespot discovery, typed error with no public fallback, unsupported port and unchanged OAuth gateway | `tools/spotify-mobile.test.cjs` |
| Late account replacement, once-per-ready discovery, deferred idle refresh, retirement and actual native active selection | `tools/spotify-mobile.test.cjs` |

Passed:

- `npx tsc --project tsconfig.spotify.json`
- `node --test tools/spotify-connect-store.test.cjs tools/spotify-mobile.test.cjs`:
  194 cases.
- `npx tsc --noEmit`

These are injected source checks. No live Spotify request, pairing, device command
or catalog query was made in this chapter. Actual native hosting visibility still
requires successful host activation and a fresh emulator cluster read. Guest
permissions and shared audio still require a second account for acceptance.

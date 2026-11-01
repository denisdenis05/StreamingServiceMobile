# Native-session catalog provider — 2026-11-01

## Why the provider changed

The first live catalog request from the repaired Android app returned HTTP429
with Retry-After56 before native hosting activation. No conclusion about actual
quota exhaustion follows from that response alone. The root agent owns cooldowns
and all live actions; this chapter sends no Spotify requests.

The previous native provider sent its session token to the public Web API search
surface. A primary open-source client documents the same persistent rejection
with native keymaster grants and implements catalog search through the Partner
Pathfinder surface instead. This is supporting evidence, not our own live proof:

- https://github.com/ralph/Spotifly/blob/main/plans/done/single-grant-partner-api.md
- https://github.com/ralph/Spotifly/blob/main/Spotifly/PartnerAPI/PartnerAPI.swift
- https://github.com/ralph/Spotifly/blob/main/Spotifly/PartnerAPI/PathfinderOperations.swift
- https://github.com/ralph/Spotifly/blob/main/Spotifly/PartnerAPI/PathfinderSearch.swift
- https://github.com/ralph/Spotifly/blob/main/Spotifly/Auth/ClientTokenProvider.swift

Read-only inspection of the installed desktop bundle confirmed searchTracks and
searchDesktop operations. No extracted bundle or application artifact is included
in production. The pinned librespot source supplies the existing protocol types
and hashcash solver. Its generic platform helper changes client identifiers on
Android, so this implementation deliberately binds its client-token request to
our existing authenticated native session instead.

## Implementation

Native catalog search now sends one passive searchTracks GraphQL POST to the
fixed Partner origin and path. The operation hash and version are named protocol
constants taken from the primary implementation above. Variables, path, method,
media type and operation are validated before dispatch. The developer OAuth
provider in the separate JavaScript composition is unchanged.

The request keeps the actual native session account, client and device identity.
The client-token request declares the actual compile target platform, omits
optional hardware claims and never tries an alternative client identifier.
Requests include the bound session bearer, client token and fixed xpui origin and
referrer. No guessed App-Platform header is added.

A client-token exchange permits an initial request and at most one hashcash
answer. Unknown challenges, multiple challenges and repeated challenges fail
explicitly. Difficulty and prefix length are bounded. The pinned solver itself
has a five-second deadline and runs outside the async worker. The existing
fifteen-second catalog deadline bounds the exchange and search lifetime.
Replacement account/device scope after dispatch or solving prevents adoption or
answer submission. Tokens stay in the native connection and are not logged or
returned through the JavaScript bridge.

Positive protocol grant lifetimes are accepted, with refresh no later than expiry.
The local cache expires at the earlier of the refresh boundary and twenty-four
hours. This accepts normal long-lived protocol grants without retaining them for
their entire lifetime. The cache is account/client/device scoped and is cleared
before renewing. A real catalog HTTP401 invalidates the client-token cache before
the existing single rejected-bearer renewal. A client-token HTTP401 is classified
separately and does not trigger that bearer replay.

The existing exact-query cache, two-second request spacing, actual catalog request
counter and full Retry-After cooldown remain in force. Client-token requests also
respect the same cooldown and can extend it after an actual HTTP429. There is no
provider fallback, account rotation, client identifier rotation or rate-limit
retry loop.

The decoder checks GraphQL errors even with HTTP200. A retired persisted query
returns Unsupported rather than empty success or a hash search loop. Actual
returned track identifiers and URIs must agree. Artist names, versioned title,
duration and explicit playability are retained; no recording code, identity or
availability is invented. Search uses the actual signed-in account context. The
market remains part of the existing scoped input/cache key, with account-country
precedence, rather than a fabricated Partner query variable.

Android SpotifyCatalog diagnostics are emitted directly by the typed Rust sink;
there is no Kotlin origin parser to update. Partner catalog and client-token
stages have distinct fixed origins. The desktop probe validates their exact
origin/stage pairing and drops all other fields, including tokens, challenges,
queries, account/song metadata and raw failures.

## Dedicated tests

| Behavior | Test source |
| --- | --- |
| Fixed passive Partner query, escaped metadata, bounds, operation/hash tampering and rejected foreign paths/credentials | `native/librespot-session/tests/connect_search.rs` |
| Actual result identity, artist/duration/version metadata, availability, duplicates and unknown/retired GraphQL failures | `native/librespot-session/tests/connect_search.rs` |
| Existing client/device identity, one bound hashcash answer and unsupported/repeated/excessive challenge rejection | `native/librespot-session/tests/connect_client_token.rs` |
| Account replacement before/after dispatch or while solving, cancellation, deadline/rate-limit propagation and malformed/oversized responses | `native/librespot-session/tests/connect_client_token.rs` |
| Account/device scoped cache, exact refresh expiry and long protocol grant with local retention clamp | `native/librespot-session/tests/connect_client_token.rs` |
| Fixed diagnostic origins/stages and private-field exclusion | `native/librespot-session/tests/connect_search.rs`, `tools/spotify-connect-probe.test.cjs` |
| HTTP429 never renews credentials or repeats search; cache/pacing/cooldown semantics | Existing `connect_authentication` and `connect_search_traffic` suites |

`cargo test --manifest-path native/librespot-session/Cargo.toml --quiet` passes the
full native suite: 270 passed. Node probe checks pass 20 cases with
`node --test tools/spotify-connect-probe.test.cjs tools/spotify-native-search-probe.test.cjs`.
These tests use injected transport, solver and identity collaborators and send no
Spotify request.

Root must build both Android native architectures, package the integrated source,
and run one deliberate current-session Partner search after the prior cooldown.
Actual client-token acceptance, persisted-query availability, returned matching
metadata and host activation remain live gates. A successful catalog search alone
does not verify device visibility, incoming commands or synchronized playback.

# Native catalog search investigation — 2026-10-27

Status: implemented in native Rust and exposed through the diagnostic probe's
fixed `search` operation. The token remains inside NativeConnectSession. The
current-session live permission check remains outstanding because the prior probe
is no longer registered. The existing foreground SpotifyConnectCatalog search
still delegates to SpotifyWebCatalog; native search is not silently substituted
for the existing catalog path.

## Public search boundary

Spotify's current [Search for Item reference](https://developer.spotify.com/documentation/web-api/reference/search)
describes the OAuth 2.0 `GET https://api.spotify.com/v1/search` endpoint, track and
artist field filters, a maximum limit of ten and an account-country preference
over a supplied market. This is a documented request/response contract; it does
not establish whether the independently paired Desktop Login5 token currently
held by NativeConnectSession is accepted there.

The retained approved-session probe exposes observations, metadata, membership
and commands without exporting its bearer. It has no controlled catalog search
action. Public search permission must therefore be tested through a new fixed
native-only search operation. The bearer must remain inside NativeConnectSession;
no generic URL/request action or token-export action is needed.

Proposed request: bounded nonempty title and author, uppercase two-letter market
and a positive limit capped at ten. Native code constructs the fixed endpoint
with quoted/escaped track and artist filters. A typed bounded response retains
actual track identity, title, artists, duration, ISRC and explicit availability.
Malformed identities, local tracks and contradictory relinking identities must
not silently become another matched song. Matching confidence, version conflicts,
recording-code conflicts and explicit user choice remain library decisions.

A safe public read may use the existing rejected-token renewal policy: a known
HTTP 401 can renew the independently owned Desktop token once. Cancellation,
response-size bounds, deadline, repeated 401, forbidden and rate-limit outcomes
need dedicated tests. No endpoint success is inferred from another API working.

## Installed private search candidate

The installed `/opt/spotify/Apps/xpui.spa` was read as a static ZIP artifact.
Its SHA-256 is
`9f2270fe5cfd92892077f2141a8808403dcd21def2f69469c31a1b0f1565288a`.
The selected member `xpui-routes-search.js` has 61,258 bytes and SHA-256
`e927f1916a77ea47de40bfd79e72121ebb2533ddf3ba38f7f5c8763d74025ba1`.
The separate research tree contains that exact member and provenance at
`spotify-jam-research/artifacts/native-search-static/`.

The member constructs the persisted query `searchTracks` with SHA-256
`59ee4a659c32e9ad894a71308207594a65ba67bb6b632b183abe97303a51fa55`
and reads `data.searchV2.tracksV2`. Its category caller supplies `searchTerm`,
`offset`, `limit`, `includeAudiobooks`, `includePreReleases` and `includeAuthors`,
with default `includePreReleases: false` and `numberOfTopResults: 20`.
The retained installed snapshot defines the partner origin as
`https://api-partner.spotify.com` and partner path prefixes `/pathfinder/v1`
and `/pathfinder/v2`. These are static candidates; the exact current search
request version, headers, accepted Login5 session and response schema still
need a controlled authenticated read. The persisted hash alone proves none of
those runtime properties.

The existing installed REA 6.7.0 CLI analyzed only that selected JavaScript
member as inert source. Evidence identifier:
`ev_898c411e46d73b63952d06efedf613f9f52c8ae4e4728b07d6e6804850fb93a7`.
The retained full evidence is outside production sources at
`spotify-jam-research/evidence/rea-native-search-2026-10-27.json`.
REA reports incomplete graph coverage and unresolved relationships through
unselected sources. It did not execute the bundle or establish live requests.
The static archive inspection and focused source searches were separate Python
reads; they are not native decompilation or network captures.

No official-client userdata, cookie, stored authorization, live bearer or account/
song payload was read or printed. No official-client state was changed.

## Next concrete check

Run the fixed probe search against a newly retained approved native session and
record only HTTP outcome, bounded candidate count and validation flags. If the
actual Login5 session cannot use the public endpoint, derive and verify the
private persisted-query request against that same independent native session
before enabling it in production. Do not add automatic public/private fallback or
advertise native search from static strings.

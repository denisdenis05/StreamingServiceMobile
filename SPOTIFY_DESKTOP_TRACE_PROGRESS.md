# Safe official desktop Spotify trace

## Implemented

`tools/trace-spotify-desktop.cjs` attaches to the already running official desktop
client's loopback Chrome DevTools Protocol endpoint. It enables Network events
only. It does not send Spotify commands, search, read response bodies, proxy TLS,
change accounts, or restart the client. Restarting the official client with the
loopback debugger was separately authorized by the user and is owned by the
integration session.

Run from the mobile repository with Node 22 or newer:

```sh
node tools/trace-spotify-desktop.cjs 90 /tmp/spotify-desktop-safe-trace.jsonl
```

The optional duration defaults to 90 seconds, accepts 1–300 seconds, and the
capture stops after 10,000 records. Ctrl+C finishes the file. The output file is
created exclusively with mode 0600; choose a new path for each capture. Existing
files are never overwritten. Console output contains the schema, record count,
completion reason and chosen file path. Errors are fixed labels, without raw
exception text. The target must be an xpui page exposed by
`http://127.0.0.1:9222/json/list`, with its debugger WebSocket on that same
loopback host and port.

## Data retained

Sanitization happens before each write. HTTP records contain relative capture
time, a locally assigned sequential integer, fixed origin and endpoint classes,
allowlisted method and integer HTTP status. Endpoint classes cover Partner
Pathfinder, client-token exchange, Connect device publication, Connect transfer,
and Connect player command paths including `/from/<device>/to/<device>`.
Unknown endpoints become `unclassified`; their paths and hostnames are discarded.
Redirects retain the local integer while updating the destination class.

WebSocket records contain only the same safe envelope, direction, opcode and
byte count. Payload bytes, message contents and raw socket IDs are not saved.
The file contains no raw URLs, query strings, credentials, cookies, headers,
bodies, account identifiers, device identifiers, Spotify URIs or track names.
No raw traffic file is created before sanitization.

## Dedicated source verification

```sh
node --test tools/spotify-desktop-trace.test.cjs
```

10 tests pass. The feature map covers fixed endpoint classification and path ID
redaction; body/header/query/request ID privacy; method allowlisting and redirect
classification; text/binary socket direction and byte counts; malformed,
unknown and oversized events; loopback and duration limits; Network subscription
and deterministic deadline cleanup; interruption and malformed event cleanup;
rejected Network subscription privacy; and bounded sequential request IDs.
Clock, transport, discovery, timers, interruption source and writer are injected.
Tests use no Spotify session, network service or real timing delays.

## Verification limits

This trace sees renderer Network events exposed by Chromium. Native Spotify
Connect, Dealer or audio traffic outside that renderer may be absent. An empty
Connect trace does not establish that the official app sent no Connect events.
Partner GraphQL operation names are intentionally not extracted from bodies.
The tool does not prove audible playback, matching queue contents, account
identity, native device publication or cross-account synchronization. The root
integration session owns actual capture and comparison with emulator evidence;
no live attachment was run for this implementation chapter.

Raw debugger discovery responses and incoming event payloads exist only in
process memory while selected fields are sanitized. Debugging should remain
bound to loopback. Source tests do not establish that every installed desktop
client exposes the same CDP events.

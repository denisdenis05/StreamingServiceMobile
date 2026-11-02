# Native desktop Spotify TLS trace

## Actual integration failed

The root session attempted a bounded 180-second native capture on 2026-11-02.
GDB exited with status 1 after a native debugger backtrace. Only two sanitized
HTTP/1 records reached `/tmp/spotify-native-safe-20261102.jsonl`: an unclassified
GET and an HTTP 101 upgrade response. This is not evidence of the Connect command
flow, matching official requests or complete native traffic visibility.

All Spotify processes ended during that failure. The root restored the official
client normally with its existing profile and loopback CDP. No credentials,
account data or track metadata appeared in the reported backtrace. No raw
backtrace file was created. The diagnostic tool is **not ready for live use**;
there has been no second native attempt by this implementation agent.

The Python fake debugger tests exercise our callback code, not GDB's real
multithreaded breakpoint machinery. They cannot reproduce or rule out a native
GDB failure around optimized functions, return breakpoints, thread exit or
concurrent event handling. The exact native crash cause remains undiagnosed.
The successful pure parser tests do not change this integration failure.

A follow-up source fix now captures GDB stdout and stderr only in memory and
rebuilds its console summary from fixed fields and bounded integer counters.
A nonzero debugger exit emits `debugger-failed`, never a partial success claim.
Raw debugger output and arbitrary exception text are not forwarded or saved.
This improves diagnostic privacy; it does **not** prevent the debugger from
crashing or terminating its inferior.

Do not repeat native instrumentation during the user's manual playback tests.
A future approach requires a separate design and a disposable-process stability
check before touching the live client. Replacing FinishBreakpoint with static
return-address breakpoints would still require thread/recursion fencing and
careful unwinding; it is not an established fix. A maintained tracing runtime
with native function interception could avoid this GDB path, but its stability
and compatibility have not been established here.

## Why this exists

The official client's renderer CDP capture exposed only two events during a
90-second check while remote playback controls changed the Android host state.
That is evidence that renderer capture does not expose all relevant native
traffic. It does not show the native requests themselves.

Read-only inspection of the installed `/opt/spotify/spotify` executable found
exported OpenSSL functions in the executable itself, rather than `libcef.so`:

| Symbol | Installed executable offset |
| --- | --- |
| `ssl_write_internal` | `0x23dc9f0` |
| `ssl_read_internal` | `0x23dc4f0` |
| `SSL_write` | `0x23dcca0` |
| `SSL_write_ex` | `0x23dcd20` |
| `SSL_read` | `0x23dc6a0` |
| `SSL_read_ex` | `0x23dc720` |

Disassembly confirms that both write wrappers call the same internal function.
The trace hooks the internal read/write functions once to avoid wrapper
duplicates. It resolves symbols at launch; these offsets are evidence for this
installed version and are not hardcoded into the tool. `SSL_free` removes the
corresponding in-memory decoder state. There are no calls into the inferior to
read server names or change verification behavior.

## Original diagnostic invocation, currently unverified after failure

The user explicitly authorized gracefully restarting the official client for
instrumentation. The tool refuses to launch if an official Spotify process is
already running. The integration session must close it gracefully first,
preserving the existing profile and credentials. The tool itself does not stop
an existing client or modify its profile.

The host has GDB, x86_64 Linux and ptrace_scope 1. Parent launch through GDB works
with that policy; unrelated sibling attachment is not required. Install the
small pure Python HPACK dependency into a temporary directory:

```sh
python3 -m pip install --target /tmp/streaming-service-spotify-trace-dependencies 'hpack==4.1.0'
```

It was installed there for this chapter. Both the host Python and GDB embedded
Python successfully import it. No system Python package was changed.

After the integration session gracefully closes Spotify:

```sh
python3 tools/trace-spotify-native.py --duration-seconds 90 --output /tmp/spotify-native-safe-trace.jsonl
```

The dependency directory can be overridden with `--dependency-directory`. The
duration accepts 1–300 seconds. Output is created exclusively with mode 0600.
Existing files are never overwritten. The debugger launches the same installed
client and profile with the loopback CDP flags on port 9222. It does not disable
TLS certificate verification, replace a CA, proxy traffic or disable Chromium's
sandbox. It does not send playback or search commands.

The launched inferior's stdout and stderr go to `/dev/null`. GDB initialization
files and auto-loading are disabled. Core dumps are disabled for the launched
process tree. Thread messages, frame argument printing and debugger logging
are disabled. The script captures debugger command output in memory and prints
only its fixed summary. Its intended deadline behavior is to stop its own child, remove its breakpoints
and detach, leaving Spotify running. The actual failed integration did not
reach or prove this behavior. Native child
processes are detached on fork. No attach, restart or live capture was performed
by the implementation agent; the root integration session owns that check.

## What is recorded

Only successful completed TLS reads/writes are parsed. Return breakpoints read
the actual returned byte count, bounded by both the requested length and 64 KiB.
Failed reads and writes do not produce requests. The x86_64 System V argument
registers and 64-bit little-endian size pointers are an explicit platform
boundary of this tool. Both the launcher host and GDB target are checked for
x86_64 before capture. Successful returns use the signed 32-bit result from
`$rax`, not `FinishBreakpoint.return_value`, which may be unavailable for this
stripped executable even when dynamic function symbols exist.

HTTP/1 header fragmentation and Content-Length bodies are handled without
saving bodies. HTTP/2 preface fragmentation, frame boundaries, HEADERS with
padding/priority, CONTINUATION and separate per-direction HPACK tables are
handled. Compressed and decoded headers are kept only in bounded process memory.
HPACK uses the maintained [python-hyper implementation](https://github.com/python-hyper/hpack),
whose [Decoder API](https://python-hyper.org/projects/hpack/en/latest/api.html)
provides decoded-header size limits.

Every persisted event has relative time, a locally assigned connection integer,
direction and protocol. Request events add an allowlisted HTTP method and fixed
origin/endpoint labels. Response events add HTTP status and the matching request's
safe destination labels. No raw hostname, path, query, header, body, socket/SSL
pointer, Spotify URI, account, device identifier, track title or payload is saved.
Connect command device path segments become the fixed `connect-player-command`
label. Partner, client-token, device publication, transfer and Dealer endpoints
have fixed classes; unknown endpoints become `unclassified`.

The final safe summary includes event count, successful bounded transfer count,
discarded transfer count, instrumentation error count and completion reason.
A TLS transfer count with zero decoded events establishes only that the hook saw
bytes; it does not establish a request method, endpoint or successful action.

## Bounds and unsupported cases

There are at most 256 live connection decoders, 1,024 pending request mappings,
64 KiB stream buffers, 32 KiB compressed/decoded header blocks, 16 KiB HPACK table
limits, 64 KiB individual frame payloads and 10,000 persisted events. Invalid or
oversized data stops the affected direction instead of guessing its contents.
An oversized or otherwise missing successful transfer invalidates that direction
so later fragments are not mistaken for complete messages.

HTTP/1 chunked transfer encoding, unknown-length response bodies, protocol
upgrades, HTTP/2 server push and malformed HPACK stop the relevant decoder.
HTTP/2 trailers produce no event without method/status headers. Interim HTTP
responses, HEAD responses, request rejection before consuming a body, unusual
SETTINGS table changes and stream cancellation are not fully modeled; compare
those cases against separate device evidence before trusting pairing/order.
WebSocket message contents, proprietary non-HTTP protocols, TLS sent through
another TLS implementation, and calls bypassing the hooked functions are absent.
This is a bounded diagnostic capture, not a complete implementation of HTTP.

GDB breakpoint overhead can affect playback timing. A capture showing actual
method/status classes helps compare client behavior, but cannot prove audible
alignment or cross-account synchronization. A missing endpoint is not proof
that the desktop client never sent that operation.

## Dedicated source verification

```sh
python3 -m unittest discover -s tools -p 'spotify_native_*test.py'
```

20 tests pass. The feature map covers endpoint and header privacy; fragmented
HTTP/1 headers and body skipping; fragmented HTTP/2 preface and continuation;
stateful HPACK; server frames arriving before protocol detection; malformed and
oversized payload rejection; unknown protocol and chunked failure behavior;
ignored DATA contents; continuation stream fencing; actual successful byte counts;
oversized returned length rejection; invalidation after a missing transfer; and
a fake debugger lifecycle with completed read/write callbacks, private file mode,
fixed summaries, child stdio suppression, breakpoint cleanup and detach. The
launcher also has a regression test refusing an already running client without
starting or stopping any process. Further regressions cover stripped symbols
with no debug return type, signed native return values and both host/target
architecture guards before output or process actions. Follow-up privacy tests
cover native crash output suppression, partial-success rejection, fixed-field
summary reconstruction, malformed summary rejection and launcher pipe wiring.

The fake debugger tests perform no live process attachment, Spotify request or
real timer delay. The actual parent launch failed before native Connect visibility or deadline
detach was established. Continued desktop playback was restored by the root
session after that failure, independently of this tool.

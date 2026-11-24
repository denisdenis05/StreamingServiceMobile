# Responsive native transport and membership — 2026-10-27

One joined worker owns the mutable native session, HTTP client and token cache.
The actor continues consuming Dealer input, replying to incoming commands and
expiring receipts while an HTTP operation awaits the network. Work/completion
channels have capacity one; competing HTTP operations fail before dispatch with
Backpressure. Stale/canceled generations retain Canceled instead. This avoids
unbounded request queues and does not replay mutations. The worker is canceled
and joined at generation retirement; accepted mutation receipts remain uncertain
on shutdown instead of losing their sender.

Checked commands have separate preflight and mutation phases. The actor rechecks
newer host authority before dispatch, reserves the delivery window and retains
bounded early acknowledgements. Success still needs the exact server HTTP ack ID
and a matching Dealer observation on the expected host/generation after dispatch.
The ten-second deadline includes HTTP waiting. Previous IDs, old samples, host
replacement, conflicting revisions, history overflow, cancellation and expiry
cannot invent success or a queue revision.

Current membership uses the existing authenticated regional session and exact
/social-connect/v2/sessions/current endpoint. Only HTTP404 maps to no membership.
The bounded codec retains actual session/host/role/active state and participant
IDs. It ignores invitation credentials and display names. The actual wire host
field is hostActiveDeviceId; the exported field is hostDeviceIdentifier. The
JNI connectMembership response binds handle/generation and includes the native
authenticated account separately from membership, including when no Jam exists.
Paired Desktop safe membership reads get the same bounded401 renewal rule as
metadata/observation. No membership mutation or extra credential is introduced.

The host-only owner-permission Unix channel supports membership as a typed read.
The retained approved grant was used to restart the native child and perform a
real membership read. It returned an authenticated account and no current Jam;
only boolean/count metrics were printed. This does not prove guest permission,
active Jam playback or forced401 recovery. No raw account or response was saved.

| Behavior | Dedicated verification |
| --- | --- |
| Stalled read/metadata/publication, incoming commands/replies/expiry, busy admission, shutdown, early command ack and host retirement | tests/connect_actor.rs:40 total cases |
| Exact early ack, predispatch/old samples, conflicting/overflow proof, deadline and cancellation plus prior receipt behavior | tests/connect_command_journal.rs:15 total cases |
| Strict current membership, optional host, role/participant identity, size/type bounds and private-field removal | tests/connect_membership.rs:8 cases |
| Membership safe-read renewal and mutation non-replay | tests/connect_authentication.rs:9 cases |
| Native membership handle/generation entry point | tools/fixtures/librespot-jni/com/streamingservice/spotify/SpotifyLibrespotNative.java |
| Typed local membership response and existing socket ownership/cancellation | diagnostic example:8 cases |

Full npm run test:spotify-native passed184 Rust cases and actual JNI loading.
The diagnostic example suite passed8 cases. Final Kotlin compilation and the
complete Debug JVM suite passed187 cases with the follower/source components.
The current delivered APK predates this chapter. App-led host activation,
incoming real player execution, production follower/resolver composition and
physical-device/background verification remain unfinished. Busy read arbitration
with foreground queue observation also needs integration testing before handoff.

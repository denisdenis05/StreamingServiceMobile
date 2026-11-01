# Current player heart status

Implemented on 2026-11-01 under the StreamingService quality skill.

The Playing screen reads current account and recording membership from the
server. It no longer trusts a queued recording's old `isLiked` value or a global
recording cache key. A pending request shows a spinner and blocks heart presses.
A successful toggle uses the server's returned boolean. A failed or malformed
read/write leaves membership unknown, shows a neutral symbol, and offers an
explicit status retry. A failed write may have reached the server, so the UI does
not guess by reversing an optimistic value. The heart target is accessible and
has a named minimum touch size.

`RecordingLikeService` owns scope fencing, cancellation, pending serialization,
response validation and safe public messages. Account and recording replacement
retire previous work. Duplicate toggles are ignored. External library changes
while toggling defer a fresh read until the write completes.

`RecordingLikePlatform` composes the service with a client bound to the current
account credentials. It subscribes to account and library changes, publishes
successful toggles for other library views, and suppresses its own synchronous
change notification to avoid redundant GET loops. Account logout clears state
without waiting for network completion. React Native accessibility properties,
SVG icon props, Jest APIs and existing network response fields are framework or
API contracts; behavioral copy, routes and touch sizes use named policy values.

## Feature tests

| Behavior | Test file and case |
| --- | --- |
| Real GET and authoritative toggle result | `tools/recording-like.test.ts`: Loads authoritative membership and returns server toggle state |
| Duplicate presses | Double presses cause one toggle and preserve the authoritative heart while saving |
| GET failure and explicit retry | Failed GET exposes an unknown heart and prevents guessing or toggling until retry |
| Uncertain write failure | Failed toggle clears certainty because the server may have committed before disconnect |
| Stale account GET and logout GET | Late account reads are discarded after replacement |
| Stale song write | Late song toggles cannot mutate the next song or notify its library |
| Stale account write | Late account toggle cannot overwrite the next account heart |
| Refresh after concurrent membership change | Library changes during toggle trigger a new authoritative read after the write |
| Invalid response payloads | Malformed read and toggle payloads never become guessed boolean hearts |
| Disposal | Dispose aborts pending work and ignores late completion |
| Credential scope and external refresh | `tools/recording-like-platform.test.tsx`: Hook requests account scoped membership and refreshes after library changes |
| No notification loop | Successful toggle publishes changes without refreshing itself in a loop |
| Logout integration | Logout immediately clears membership and never requests another account with old credentials |
| Current song integration | Changing track checks its authoritative membership instead of queued metadata |

Validation:

- `npx jest --runInBand --watchman=false --runTestsByPath tools/recording-like.test.ts tools/recording-like-platform.test.tsx` passed 15 cases.
- `npx tsc --noEmit --pretty false` passed for the complete mobile source tree.
- Targeted ESLint passed with zero errors and five warnings: detached promise
  `void` policy warnings and the existing Playing progress bar inline style.
- Prettier applied to this chapter's source and tests; staged diff checked.

No device, native package build, server connection or playback behavior was
exercised. Shared LibraryChanges and collection refresh integration belong to the
parent settings chapter. A canceled request can already have committed remotely;
only current scope completions are allowed to publish UI results. These tests
establish deterministic service and hook behavior, not physical screen layout.

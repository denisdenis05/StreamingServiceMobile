# Mobile data and search progress

Updated 2026-10-17. Implements O06 and O10 from `../REMAINING_OPTIMIZATION_REVIEW.md`.

## Implemented

The old global response object and its separate promise/subscriber registries are replaced by `AccountQueryStore`. Account changes and logout cancel active requests, clear personal data and change the scope identity. Refreshing a token for the same account preserves its cache. Old responses and old updater callbacks cannot publish into a newer scope. Fast Refresh releases the authentication subscription and clears the old store.

The store shares requests between observers. Removing the last observer aborts unfinished work; removing one of several observers leaves it running. Invalidation cancels the old generation and reloads through the remaining observer. An optimistic update supersedes an in-flight response. Errors settle loading and explicit invalidation can retry.

Inactive results are retained for five minutes, with a maximum of 256 inactive entries. Entries with mounted consumers remain available and are not evicted underneath those consumers. Thus total entries are bounded by active query keys plus the inactive allowance, rather than a hard limit that breaks mounted screens. Expiry is checked on lookup/observation and cleanup occurs during lifecycle operations; there is no background expiry timer. Home and library fetchers now pass the cancellation signal to Axios.

Search uses request identity rather than comparing query text. Clearing, replacing, repeating a query, unmounting and changing account abort the preceding generation. Stale database completions cannot issue an external follow-up. Both requests and pagination receive cancellation signals. Pagination is disabled until the current first page completes, and old pagination completion cannot change the next query's loading state. Database results take precedence if an external result later appears in a local page. Account changes close selected-track actions as well as clearing rows.

## Checks

- `npm run test:query-lifecycle`: 20 passed. Includes pure store/request-scope cases, mounted React hook cases and actual Search component effects against a mocked transport/timer/native view boundary.
- `./node_modules/.bin/tsc --noEmit`: passed.
- `npm run test:player-mobile`: 319 passed.
- `npm run test:asset-cache`: 73 passed.

Dedicated regressions cover shared requests, invalidation, optimistic false values, account/logout/token-refresh behavior, inactive retention/expiry, errors, stale observer cleanup, unmount cancellation, query-key render changes, clear/A-B-A searches, pagination during debounce, account changes with pending external results, duplicate result precedence and track-menu cleanup.

React's test renderer prints its existing deprecation notice. These tests establish lifecycle behavior; they do not measure device heap, scrolling smoothness or production latency. No provider, production database or NAS was accessed. Player/native code was not changed in this repository chapter.

## Remaining

- O05 collection virtualization and O04 incremental playlist playback remain open.
- O11–O15 cache admission, decoding, disk indexing, audio hashing and native queue projection remain open.
- The provider interface still cannot cancel underlying MusicBrainz HTTP work after the server stops waiting. That is O20.
- The recording-list MMKV cache used by album/playlist pages is a separate cache from `useData`; its account lifecycle needs the same review before claiming every application cache is account isolated.
- Search retains its existing database-first/external-second request order. This chapter removes stale work without changing ranking or launching both searches concurrently.

No deployment or emulator performance run is included.

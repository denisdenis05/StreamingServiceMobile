# Profile and Settings

## Completed chapter

Implemented the approved Profile → Settings hierarchy with the app's cream surfaces, forest actions, Lora headings, Outfit body text, vector icons, outlined profile editor action, grouped settings rows, live Spotify status, and explicit sign-out confirmation.

Profile shows the current account's saved local display name, or the neutral “Your account” label. Edit profile updates a name scoped to account and server on this device. Account identifiers come from authentication state. No backend account editor or photo endpoint exists, so the screen explains device-local name storage and does not invent a remote editor.

The mock's liked songs and recent history tiles had no supported mobile destination in the inspected contracts. Profile instead opens the existing music library and playlist creation routes.

Settings opens account, the existing Spotify & Jam screen, Last.fm, Playback, Downloads & storage, and About. Playback uses the real current queue shuffle/repeat settings, with changes disabled during external Spotify authority. Storage measures artwork cache, current-account/server cached audio and free disk; clearing artwork requires confirmation. Audio files are not removed while a queue may still reference them. About obtains its version from package metadata.

Last.fm now has an injected domain controller. It reads status/username/connection date, opens authorization only on user action, processes an active flow's callback once, refreshes on app foreground, disconnects explicitly, and supports cancellation. Account changes and logout abort pending requests and discard delayed results. Deep-link errors deliver a sanitized lifecycle event; existing notification navigation remains intact. No credentials or raw server errors are logged.

## Feature-specific tests

| Feature | Dedicated evidence |
| --- | --- |
| Profile → Settings, editor, library and creation navigation | `tools/profile-settings-screen.test.tsx` |
| Settings destinations and back navigation | `tools/profile-settings-screen.test.tsx` |
| Local name editor wiring | `tools/profile-settings-screen.test.tsx`; domain persistence tests owned by parent |
| Real shuffle/repeat commands and external-control disabling | `tools/profile-settings-screen.test.tsx`; playback domain tests owned by parent |
| Storage metrics and explicit artwork removal | `tools/profile-settings-screen.test.tsx`; storage domain tests owned by parent |
| Live Spotify status, vector icons, accessible back target, subtle sign out | `tools/profile-settings-screen.test.tsx` |
| Explicit sign-out confirmation | `tools/profile-settings-screen.test.tsx` |
| Last.fm status and disconnect | `tools/profile-settings-lastfm.test.ts` |
| Last.fm stale account results, logout and late connection completion | `tools/profile-settings-lastfm.test.ts` |
| Last.fm cancellation before authorization URL/browser completion | `tools/profile-settings-lastfm.test.ts` |
| Last.fm foreground refresh, callback deduplication and duplicate connect presses | `tools/profile-settings-lastfm.test.ts` |
| Last.fm browser/status failures and authorization rejection | `tools/profile-settings-lastfm.test.ts` |
| Last.fm deep-link success, sanitized failure, notification behavior and cleanup | `tools/profile-settings-deeplink.test.ts` |

Commands already run:

- `npx jest --runInBand --watchman=false --runTestsByPath tools/profile-settings-lastfm.test.ts tools/profile-settings-screen.test.tsx tools/profile-settings-deeplink.test.ts` — initially 20 tests passed; final count recorded below after the added cancellation/duplicate tests.
- `npx tsc --noEmit --pretty false` — passed across the mobile source tree after these screens and the parent services were present.
- `npx eslint src/pages/Profile src/pages/Settings src/services/settings/LastFmController.ts src/services/settings/SettingsRuntime.ts src/services/DeepLinkHandler.ts tools/profile-settings-lastfm.test.ts tools/profile-settings-screen.test.tsx tools/profile-settings-deeplink.test.ts` — no errors, 16 existing-policy `no-void` warnings for explicitly detached promises.
- Prettier applied to owned new and changed source/test files.

## Boundaries and remaining verification

Mobile verification is postponed by instruction. No adb commands or Spotify process actions ran. No device, native packaging or visual runtime claim follows from these host checks.

Last.fm authorization cancellation retires local processing; an HTTP request that has already committed on the server cannot be undone locally. A callback without a live authorization initiated for the current app account is ignored; after a process restart the user can refresh status or initiate authorization again. The existing backend callback has no per-attempt state identifier, so stronger cross-process correlation needs a backend contract change.

React Native style keywords, accessibility roles, component properties and SVG path syntax are framework contracts. Behavioral values, route names, copy and layout sizes are held in named constants/enumerations or styles. No authored implementation comments were added.

Recommended chapter commit: `Add profile and supported settings screens` with the Profile/Settings files, App route/lifecycle changes, Last.fm controller/runtime/deep-link changes, parent-provided profile/playback/storage services and their dedicated tests. No commit performed in this shared working tree.

## Integrated service verification

`npm run test:settings` passes 25 deterministic domain cases and 25 Jest cases.
`tools/settings-services.test.cjs` maps profile restore/edit validation and
serialized persistence, account/logout/disposal and delayed-read/write fences;
actual shuffle/repeat receipts, external ownership, account replacement and busy
serialization; account-scoped storage measurements, explicit artwork-only clear,
refresh/clear ordering, invalid metrics, filesystem bounds and failures. Last.fm
now copies only validated status fields, and failing observers cannot block other
status/deep-link observers. Raw messages never enter public failures. Profile
initials preserve non-BMP code points. The final full TypeScript check passed.

The complete source integration also passed 503 Spotify Node, 106 Spotify Jest,
415 Android JVM, 329 player/mobile, 73 cache and 235 Rust cases. These host results
do not establish real-device layout, audio, Spotify permission or background
execution. No phone was accessed in this implementation chapter.

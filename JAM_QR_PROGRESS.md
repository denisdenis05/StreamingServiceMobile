# Jam invitation QR — 2026-10-31

## Scope and research

The explicit Show Jam QR code action obtains the current real invitation from
SpotifyMobileController.invitationAddress(). No developer address, replacement
join token, remote QR endpoint, camera permission, image upload, persistence,
logging or analytics is involved. The QR is a Spotify invitation, not an app
connection credential or a StreamingService deep link.

Primary sources consulted on 2026-10-31:

- [Spotify Jam support](https://support.spotify.com/us/article/jam/) documents
  invitation links, QR scans and an explicit Join choice. Hosting and remote
  participation have Spotify account requirements; displaying this QR does not
  bypass Spotify permission or prove guest admission.
- [qrcode-generator API](https://github.com/kazuhikoarase/qrcode-generator/blob/master/js/README.md)
  documents automatic versions, Byte encoding, error correction and matrix reads.
- [Official npm package](https://www.npmjs.com/package/qrcode-generator) and
  `npm view qrcode-generator version dependencies types main` confirmed 2.0.4,
  built-in declarations and no runtime dependencies. The owner installed the exact
  version in package.json/package-lock.json. Its MIT implementation stays in
  node_modules as third-party code.
- [DENSO WAVE quiet-zone guidance](https://www.qrcode.com/en/howto/code.html/index.html)
  requires four modules of clear margin on all sides.

Selected qrcode-generator over a React wrapper or node/canvas image generator:
its pure matrix API needs no browser, filesystem or native camera bridge, works
without network access, and renders through the already installed react-native-svg.
The adapter uses a typed static CommonJS require because the feature compiler
uses CommonJS without esModuleInterop while the app compiler targets ES modules.
Metro requires the package specifier to remain a literal in that require. SVG
path grammar likewise retains its command letters; the unit square command has
a named policy value. Neither boundary weakens authored source naming rules.

## Implemented behavior

SpotifyJamQr owns a private, view-lifetime invitation and derived geometry. It
requires connected, idle, Ready, active account/Jam membership. Source observation
clears geometry and text synchronously on logout, account/Jam replacement,
non-ready state, pending operations, inactive/removed membership or invitation
rotation. Closing and removal of the last UI subscription clear private values.
Generation and share failures cannot update a later request or retired scope.
Ordinary mobile/runtime snapshots still contain no invitation address or token.
The feature snapshot carries only private-view geometry and fixed state flags.

Encoding uses the original printable ASCII Spotify invitation address, never a
guessed normalization. Supported inputs are Spotify socialsession URIs and
open.spotify.com socialsession/jam HTTPS invitations and the existing supported
spotify.link / spotify.app.link invitation forms. Short links are encoded unchanged
without fetching or rewriting. The maximum input is 512
ASCII characters; the generated matrix is bounded to 77 modules per side. Larger
or unsupported real invitations fail with fixed guidance to use the existing
Share invitation action. Error correction is M. Rendering is undecorated black
on white with four complete quiet-zone modules, in a responsive square up to
280 display points. Cream, forest, Lora and the existing Outfit text remain in
the surrounding modal. No logo obscures modules. Physical scan readability is
still an acceptance gate, especially on smaller screens.

The modal explains that anyone receiving the invitation can ask to join. Showing
the QR, revealing selectable invitation text, and invoking platform sharing each
require explicit presses. The QR has an accessible image description and text/
share alternatives. Close and Android back dismiss and retire it. Fixed failures
never copy raw encoder/platform errors into the UI.

## Coordinated guest queue projection

The owning session authorized a small shared-controls projection in this chapter.
SpotifyMobileSnapshot.canSubmitGuestCommands is true only for native Librespot
authentication with an explicitly composed JamSessionClient guest verifier.
Disconnect, account replacement and native-to-browser replacement reset it.
The parent Jam screen exposes direct queue controls to an owner or a guest with
that explicit capability and matching current-account participant membership;
active/ready/actual-host checks still guard Add. End Jam remains owner-only.
Recording enqueue and fresh native permission verification are owned by the
shared-controls chapter. This boolean is availability, not Spotify permission.

Five dedicated controller regression cases in tools/spotify-mobile.test.cjs
cover native availability and refresh, disconnect, browser exclusion, account
replacement, native-to-browser replacement and absent verifier. Three parent
screen cases in tools/spotify-screen.test.tsx cover admitted guest queue visibility,
owner-only End, missing capability and absent participant membership.

## Actual scan and connection journey

SpotifyMobileController already resolves pasted supported invitations through
SpotifyInvitationResolver and joins through the current runtime. Native joining
continues to require its existing registered connection and supported mode.
The application DeepLinkHandler currently accepts Last.fm callbacks and player
notification routes; the separate Spotify callback is authentication. Neither
routes Spotify Jam invitation URLs into the app automatically.

Therefore a phone camera scan opens the encoded Spotify link according to the
phone/Spotify/browser handlers. It does not automatically connect or join this
StreamingService app. A guest can instead paste a supported invitation into the
existing Jam input and explicitly Join. Source checks establish these handlers;
actual scanner routing, second-account joining, permission and shared playback
remain unverified. No adb, device access, pairing, native session restart or
live Spotify command was performed.

## Dedicated feature tests

| Behavior | Dedicated tests in tools/spotify-jam-qr.test.tsx |
| --- | --- |
| Explicit generation; original invitation; no runtime snapshot leak | QR generation and invitation access require an explicit open action |
| Explicit selectable text and platform sharing | Text and platform sharing each require explicit consent |
| Logout, account/Jam replacement, readiness, pending operations, inactive/removed membership | Parameterized synchronous clearing cases |
| Same-Jam invitation rotation | Invitation rotation within the same Jam clears the old QR |
| Close, replacement, transient readiness loss, subscription retirement | Dedicated pending/stale generation and last subscriber cases |
| Invalid, absent, Unicode, oversized payload and excessive module density | Invalid invitations and maximum ASCII payload cases |
| Encoder and share exceptions without raw private errors | Encoder rejection, delayed share rejection and current share failure cases |
| Quiet zone and production encoder | Geometry margin and deterministic real finder-pattern cases |
| Accessible modal, explicit reveal/share/close and logout/failure UI | Dedicated QR UI cases |

Host commands executed:

- `npx tsc --noEmit`: passed after typed dependency adapter correction.
- `npx tsc --project tsconfig.spotify.json`: passed.
- `npx jest --runInBand --watchman=false --runTestsByPath tools/spotify-jam-qr.test.tsx tools/spotify-screen.test.tsx`:
  74 cases across two suites passed, including reentrant retirement guards.
- `node --test tools/spotify-mobile.test.cjs`: 118 cases passed.
- `git diff --check`: passed.

## Remaining acceptance

Physical scan on Android/iOS, camera/browser/Spotify routing, small-screen font
scaling/layout, an actual second-account Join, guest permission, shared audio and
screen-lock/network lifecycle remain postponed by the user. Unit tests and
TypeScript compilation do not establish those outcomes. No APK is built or
installed by this QR chapter. The owner will integrate chapter scripts, perform
shared checks and commit the reviewed files in the mobile repository.

Root integration added short-invitation coverage and observer isolation. The final
combined Spotify run passed 538 Node and 148 Jest cases, including the player
controls and QR screens; full TypeScript passed. Physical scan remains unverified.

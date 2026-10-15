# Mobile dependency audit

Checked: 2026-10-15. Repository: StreamingServiceMobile, branch feat/streaming-service-player-audio-migration. Baseline: a75fd66, before the pending dependency security changes. Player prerequisite: a986902.

## Result

The pending dependency changes are reviewed and pass a clean installation, full app type check, deterministic tests, both production JavaScript bundles and the Android APK build. The lockfile is reproducible in the tested environment. This is not a zero-vulnerability dependency tree.

| Dependency tree | Critical | High | Moderate | Low | Total affected packages |
| --- | ---: | ---: | ---: | ---: | ---: |
| Committed baseline | 4 | 68 | 18 | 1 | 91 |
| Updated full tree | 0 | 56 | 6 | 0 | 62 |
| Updated tree with dev dependencies omitted | 0 | 25 | 6 | 0 | 31 |

These are npm's affected-package counts, including propagation through parent packages. They are not distinct exploit counts. The updated tree has two root advisory packages: braces and sprintf-js. npm's production classification includes Node tooling brought in through react-native dependencies; it does not prove code is shipped in a mobile bundle.

## Changes

- Keep the pending lockfile refresh, including axios 1.20.0 and Babel core 7.29.7. Existing manifest ranges allow these versions.
- Align the three direct React Native CLI packages at 19.1.2; the CLI server API resolves to 19.1.2 as well.
- Constrain react-native-screens to ~4.18.0; the lock resolves 4.18.0. The clean Android native build passes with this version.
- Remove unused react-native-image-colors and its declaration. No application imports remain. This also removes its old image-processing dependency branch.
- Override fast-xml-parser to ^5.11.2, resolving 5.11.2.
- Override Metro's image-size to ^2.0.4, resolving 2.0.4. The committed Metro patch uses the named binary API and reads image files as bytes in both JavaScript and Flow.
- Add patch-package ^8.0.1 and postinstall with --error-on-fail. A fresh npm ci applies the Metro patch automatically and fails if that patch cannot be applied.
- Expand test:dependency-security to include package/lock/installed-version checks, removed dependency checks and all Metro asset/patch regression tests.

The updated audit no longer reports root advisories for axios, the CLI server API, fast-xml-parser, image-size, Babel and several older transitive utility packages. New advisory data can change this result; rerun the commands below rather than treating this snapshot as permanent.

## Unresolved advisories

| Package / installed version | Severity | Advisory | Published fixed version at check time |
| --- | --- | --- | --- |
| braces 3.0.3 | High | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested brace patterns can exhaust the Node call stack | None; npm latest is 3.0.3 |
| sprintf-js 1.0.3 | Moderate | [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): unbounded precision specifiers can cause denial of service | None; npm latest 1.1.3 is also affected |

Observed dependency paths:

- Jest / Metro / patch-package paths reach micromatch and braces. Replacing Jest alone does not remove Metro's remaining path.
- Metro configuration and Babel coverage instrumentation reach js-yaml 3.x, argparse 1.x and sprintf-js.

The full audit has 62 affected-package entries because these issues propagate to consumers. The production-only audit has the same two root advisory packages. Neither an automatic forced framework upgrade nor suppressing audit entries would establish a fix. No force update, audit suppression or package source patch was introduced for these two advisories.

Remaining remediation: adopt a published fixed dependency when available, or prepare and review a maintained replacement/backport with dedicated denial-of-service regression tests and Metro/Jest compatibility checks. Until then, these are open findings. Validate actual reachability for any new use of untrusted patterns or format strings.

## Commands and evidence

Audit commands, from the relevant manifest/lock directory:

```sh
npm audit --package-lock-only --json --fetch-retries=0 --fetch-timeout=20000 --cache /tmp/streaming-mmkv-nitro-npm-cache
npm audit --json --fetch-retries=0 --fetch-timeout=20000 --cache /tmp/streaming-mmkv-nitro-npm-cache
npm audit --omit=dev --json --fetch-retries=0 --fetch-timeout=20000 --cache /tmp/streaming-mmkv-nitro-npm-cache
npm ls braces js-yaml sprintf-js @react-native-community/cli-server-api --all --omit=optional
npm view braces version dist-tags --json
npm view sprintf-js version dist-tags --json
```

Audit returns a nonzero exit code for the unresolved findings. That is expected here and is not a passing security gate.

Clean validation used /tmp/streaming-mobile-dependency-validation with sibling mobile/player source exports. The mobile export received exactly the pending manifest, lockfile and security test, and removed the unused declaration. There were no existing node_modules or native build outputs in that copy. npm and Gradle download caches were reused. npm ci did not alter the lockfile. The validation host used Node 26.11.1 and npm 12.2.0 on Linux.

```sh
npm ci --cache /tmp/streaming-mmkv-nitro-npm-cache --no-audit
npm run prepare:player
npm run test:dependency-security
npm run test:player-mobile
./node_modules/.bin/tsc --noEmit --pretty false
npm run test:player-integration
npm run test:player-android-app
node node_modules/react-native/cli.js bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/mobile-clean-android.bundle --sourcemap-output /tmp/mobile-clean-android.map --assets-dest /tmp/mobile-clean-android-assets
node node_modules/react-native/cli.js bundle --platform ios --dev false --entry-file index.js --bundle-output /tmp/mobile-clean-ios.bundle --sourcemap-output /tmp/mobile-clean-ios.map --assets-dest /tmp/mobile-clean-ios-assets
```

- Clean npm ci: passed; 1,015 packages installed and metro 0.82.5 patched automatically.
- prepare:player: passed. npm blocked the linked package's automatic prepare script under its install-script policy; the project's explicit preparation command generated the required specs successfully. No install-script policy was relaxed.
- Dependency/Metro regressions: 11 passed. Six new checks cover each pending dependency/setup decision. The tests inspect the configured version ranges and actual lock/installation; they do not replace a current advisory query.
- Mobile runtime tests: all 287 passed.
- Full app TypeScript check: passed.
- Workspace/Metro/export integration: seven passed.
- Android APK integration: all 11 passed, building all four configured ABIs from clean native outputs in about 164 seconds.
- Android/iOS production bundles and image assets: passed. Source maps list 1,058 Android and 1,055 iOS modules; neither includes node_modules/braces or node_modules/sprintf-js. This describes these bundles, not every possible tooling or future application entry point.

The actual iOS native app still requires its macOS/Xcode host check; JavaScript bundling is not that check. No device playback was tested in this chapter.

Updated lockfile SHA-256: `887ebece1d3546953637472e35296547c204d3f8230c7f15c665c156c6881e24`.

## Remaining affected package entries

These names come directly from the updated npm audit. A production mark means the entry also appears with --omit=dev, not that it is reachable in the shipped app.

| Package | Severity | Present with --omit=dev |
| --- | --- | --- |
| @istanbuljs/load-nyc-config | moderate | Yes |
| @jest/console | high | No |
| @jest/core | high | No |
| @jest/environment | high | Yes |
| @jest/expect | high | No |
| @jest/fake-timers | high | Yes |
| @jest/globals | high | No |
| @jest/reporters | high | No |
| @jest/test-result | high | No |
| @jest/test-sequencer | high | No |
| @jest/transform | high | Yes |
| @react-native-community/cli | high | Yes |
| @react-native-community/cli-clean | high | Yes |
| @react-native-community/cli-config | high | Yes |
| @react-native-community/cli-config-android | high | Yes |
| @react-native-community/cli-config-apple | high | Yes |
| @react-native-community/cli-doctor | high | Yes |
| @react-native-community/cli-platform-android | high | Yes |
| @react-native-community/cli-platform-apple | high | Yes |
| @react-native-community/cli-platform-ios | high | Yes |
| @react-native/community-cli-plugin | high | Yes |
| @react-native/eslint-config | high | No |
| @react-native/metro-config | high | No |
| @types/jest | high | No |
| @typescript-eslint/eslint-plugin | high | No |
| @typescript-eslint/parser | high | No |
| @typescript-eslint/type-utils | high | No |
| @typescript-eslint/typescript-estree | high | No |
| @typescript-eslint/utils | high | No |
| argparse | moderate | Yes |
| babel-jest | high | Yes |
| babel-plugin-istanbul | moderate | Yes |
| braces | high | Yes |
| cosmiconfig | moderate | Yes |
| create-jest | high | No |
| eslint-plugin-jest | high | No |
| expect | high | No |
| fast-glob | high | Yes |
| find-yarn-workspace-root | high | No |
| globby | high | No |
| jest | high | No |
| jest-circus | high | No |
| jest-cli | high | No |
| jest-config | high | No |
| jest-environment-node | high | Yes |
| jest-haste-map | high | Yes |
| jest-message-util | high | Yes |
| jest-resolve | high | No |
| jest-resolve-dependencies | high | No |
| jest-runner | high | No |
| jest-runtime | high | No |
| jest-snapshot | high | No |
| jest-watcher | high | No |
| js-yaml | moderate | Yes |
| metro | high | Yes |
| metro-config | high | Yes |
| metro-file-map | high | Yes |
| metro-transform-worker | high | Yes |
| micromatch | high | Yes |
| patch-package | high | No |
| react-native | high | Yes |
| sprintf-js | moderate | Yes |

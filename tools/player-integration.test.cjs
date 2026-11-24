const { test } = require('node:test');
const { strict: assertion } = require('node:assert');
const { resolve, dirname } = require('node:path');
const { createRequire } = require('node:module');

const ApplicationDirectory = resolve(__dirname, '..');
const PlayerDirectory = resolve(ApplicationDirectory, '../StreamingServicePlayer');
const DependenciesDirectory = resolve(ApplicationDirectory, 'node_modules');
const PackageManifestFilename = 'package.json';
const PlayerPackageName = 'streaming-service-player';
const PlayerDependencyAddress = 'file:../StreamingServicePlayer';
const SharedRuntimePackages = ['react', 'react-native'];
const applicationManifest = require('../package.json');
const metroConfiguration = require('../metro.config.js');
const applicationRequire = createRequire(resolve(ApplicationDirectory, PackageManifestFilename));

test('the mobile app declares the workspace player dependency', () => {
  assertion.equal(applicationManifest.dependencies[PlayerPackageName], PlayerDependencyAddress);
});

test('the installed player resolves to the sibling repository', () => {
  assertion.equal(dirname(applicationRequire.resolve(`${PlayerPackageName}/${PackageManifestFilename}`)), PlayerDirectory);
});

test('Metro watches the workspace player', () => {
  assertion.ok(metroConfiguration.watchFolders.includes(PlayerDirectory));
});

test('Metro resolves player dependencies from the mobile installation', () => {
  assertion.ok(metroConfiguration.resolver.nodeModulesPaths.includes(DependenciesDirectory));
});

for (const runtimePackage of SharedRuntimePackages) {
  test(`Metro uses the mobile ${runtimePackage} runtime for the player`, () => {
    assertion.equal(metroConfiguration.resolver.extraNodeModules[runtimePackage], resolve(DependenciesDirectory, runtimePackage));
  });
}

test('the player package exposes its compiled Android and Apple adapters', () => {
  const playerExports = applicationRequire(PlayerPackageName);
  assertion.equal(typeof playerExports.AndroidStreamingPlayer, 'function');
  assertion.equal(typeof playerExports.AppleStreamingPlayer, 'function');
  assertion.equal(typeof playerExports.PlayerStateStore, 'function');
});

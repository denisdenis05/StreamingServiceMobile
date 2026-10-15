const { test } = require('node:test');
const { strict: assertion } = require('node:assert');
const { getAssetSize } = require('metro/src/Assets');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const semver = require('semver');

const ImageFilename = 'fixture.png';
const ImageType = 'png';
const Base64Encoding = 'base64';
const SinglePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=';
const SinglePixelDimensions = { width: 1, height: 1 };
const DependencyPolicy = Object.freeze({
  manifestFilename: '../package.json', lockFilename: '../package-lock.json', sourceDeclaration: '../src/types/react-native-image-colors.d.ts',
  encoding: 'utf8', rootPackage: '', installedPrefix: 'node_modules/', parser: 'fast-xml-parser', parserRange: '^5.11.2',
  metro: 'metro', imageSize: 'image-size', imageSizeRange: '^2.0.4', removedPackage: 'react-native-image-colors',
  screens: 'react-native-screens', screensRange: '~4.18.0', patchPackage: 'patch-package', patchRange: '^8.0.1',
  postinstall: 'patch-package --error-on-fail', commandLineVersion: '19.1.2',
  commandLinePackages: Object.freeze(['@react-native-community/cli', '@react-native-community/cli-platform-android', '@react-native-community/cli-platform-ios']),
  installationDirectory: '../node_modules', packageFilename: 'package.json',
});
const manifest = JSON.parse(readFileSync(resolve(__dirname, DependencyPolicy.manifestFilename), DependencyPolicy.encoding));
const lockfile = JSON.parse(readFileSync(resolve(__dirname, DependencyPolicy.lockFilename), DependencyPolicy.encoding));
function installedVersion(packageName) {
  return JSON.parse(readFileSync(resolve(__dirname, DependencyPolicy.installationDirectory,
    packageName, DependencyPolicy.packageFilename), DependencyPolicy.encoding)).version;
}
function lockedVersion(packageName) {
  return lockfile.packages[DependencyPolicy.installedPrefix + packageName].version;
}

test('dependency installation applies Metro patches and fails when a patch cannot apply', () => {
  assertion.equal(manifest.scripts.postinstall, DependencyPolicy.postinstall);
  assertion.equal(manifest.devDependencies[DependencyPolicy.patchPackage], DependencyPolicy.patchRange);
  assertion.ok(semver.satisfies(installedVersion(DependencyPolicy.patchPackage), DependencyPolicy.patchRange));
  assertion.equal(lockfile.packages[DependencyPolicy.rootPackage].hasInstallScript, true);
});

test('the parser override resolves the expected fixed version range in the lock and installation', () => {
  assertion.equal(manifest.overrides[DependencyPolicy.parser], DependencyPolicy.parserRange);
  assertion.ok(semver.satisfies(lockedVersion(DependencyPolicy.parser), DependencyPolicy.parserRange));
  assertion.equal(installedVersion(DependencyPolicy.parser), lockedVersion(DependencyPolicy.parser));
});

test('Metro uses the patched image-size binary API version range', () => {
  assertion.equal(manifest.overrides[DependencyPolicy.metro][DependencyPolicy.imageSize], DependencyPolicy.imageSizeRange);
  assertion.ok(semver.satisfies(lockedVersion(DependencyPolicy.imageSize), DependencyPolicy.imageSizeRange));
  assertion.equal(installedVersion(DependencyPolicy.imageSize), lockedVersion(DependencyPolicy.imageSize));
});

test('the React Native command line packages use the same reviewed release', () => {
  for (const packageName of DependencyPolicy.commandLinePackages) {
    assertion.equal(manifest.devDependencies[packageName], DependencyPolicy.commandLineVersion);
    assertion.equal(lockedVersion(packageName), DependencyPolicy.commandLineVersion);
    assertion.equal(installedVersion(packageName), DependencyPolicy.commandLineVersion);
  }
});

test('native screens stays within its reviewed minor release', () => {
  assertion.equal(manifest.dependencies[DependencyPolicy.screens], DependencyPolicy.screensRange);
  assertion.ok(semver.satisfies(lockedVersion(DependencyPolicy.screens), DependencyPolicy.screensRange));
  assertion.equal(installedVersion(DependencyPolicy.screens), lockedVersion(DependencyPolicy.screens));
});

test('the unused image-colors package and its stale declaration are removed', () => {
  assertion.equal(manifest.dependencies[DependencyPolicy.removedPackage], undefined);
  assertion.equal(lockfile.packages[DependencyPolicy.installedPrefix + DependencyPolicy.removedPackage], undefined);
  assertion.equal(existsSync(resolve(__dirname, DependencyPolicy.sourceDeclaration)), false);
});

test('Metro reads PNG dimensions with the patched image-size API', () => {
  const imageContent = Buffer.from(SinglePixelPng, Base64Encoding);
  assertion.deepEqual(getAssetSize(ImageType, imageContent, ImageFilename), SinglePixelDimensions);
});

test('Metro rejects empty image assets before parsing dimensions', () => {
  const emptyImageContent = Buffer.from('');
  assertion.throws(() => getAssetSize(ImageType, emptyImageContent, ImageFilename), /cannot be an empty file/);
});

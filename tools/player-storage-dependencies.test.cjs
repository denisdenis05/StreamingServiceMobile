const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const StorageDependencyPolicy = Object.freeze({
  storagePackage: 'react-native-mmkv',
  runtimePackage: 'react-native-nitro-modules',
  storageVersion: '4.3.2',
  runtimeVersion: '0.35.9',
  generatorPackage: 'nitrogen',
  projectDirectory: '..',
  packageFilename: 'package.json',
  lockFilename: 'package-lock.json',
  modulesDirectory: 'node_modules',
  lockPackagePrefix: 'node_modules/',
  lockRootPackage: '',
  sourceEncoding: 'utf8',
  kotlinRuntimePath: 'android/src/main/java/com/margelo/nitro/core/HybridObject.kt',
  kotlinSpecificationPath: 'nitrogen/generated/android/kotlin/com/margelo/nitro/mmkv/HybridMMKVPlatformContextSpec.kt',
});
const TestNames = Object.freeze({
  pins: 'the app pins the reviewed MMKV and Nitro version pair',
  lock: 'the lockfile resolves the reviewed native storage version pair',
  installed: 'the installed native storage packages match the reviewed pair',
  generator: 'the installed Nitro runtime matches the version used to generate MMKV',
  kotlin: 'the Nitro Kotlin runtime provides the backing API used by generated MMKV',
});
const projectDirectory = resolve(__dirname, StorageDependencyPolicy.projectDirectory);
const readConfiguration = filename => JSON.parse(readFileSync(filename, StorageDependencyPolicy.sourceEncoding));
const manifest = readConfiguration(resolve(projectDirectory, StorageDependencyPolicy.packageFilename));
const lock = readConfiguration(resolve(projectDirectory, StorageDependencyPolicy.lockFilename));
const installedConfiguration = packageName => readConfiguration(resolve(projectDirectory, StorageDependencyPolicy.modulesDirectory,
  packageName, StorageDependencyPolicy.packageFilename));
const storage = installedConfiguration(StorageDependencyPolicy.storagePackage);
const runtime = installedConfiguration(StorageDependencyPolicy.runtimePackage);
const reviewedPackages = Object.freeze([
  [StorageDependencyPolicy.storagePackage, StorageDependencyPolicy.storageVersion],
  [StorageDependencyPolicy.runtimePackage, StorageDependencyPolicy.runtimeVersion],
]);

test(TestNames.pins, () => {
  for (const [name, version] of reviewedPackages) assertion.equal(manifest.dependencies[name], version);
});
test(TestNames.lock, () => {
  for (const [name, version] of reviewedPackages) {
    assertion.equal(lock.packages[StorageDependencyPolicy.lockPackagePrefix + name].version, version);
    assertion.equal(lock.packages[StorageDependencyPolicy.lockRootPackage].dependencies[name], version);
  }
});
test(TestNames.installed, () => {
  assertion.equal(storage.version, StorageDependencyPolicy.storageVersion);
  assertion.equal(runtime.version, StorageDependencyPolicy.runtimeVersion);
});
test(TestNames.generator, () => {
  assertion.equal(storage.devDependencies[StorageDependencyPolicy.generatorPackage], runtime.version);
  assertion.equal(storage.devDependencies[StorageDependencyPolicy.runtimePackage], runtime.version);
});
const BackingApiPatterns = Object.freeze({
  backingClass: /class CxxPart\b/,
  initializer: /fun initHybrid\(/,
  factory: /fun createCxxPart\(/,
  generatedBaseClass: /HybridObject\.CxxPart\(/,
});
test(TestNames.kotlin, () => {
  const runtimeSource = readFileSync(resolve(projectDirectory, StorageDependencyPolicy.modulesDirectory,
    StorageDependencyPolicy.runtimePackage, StorageDependencyPolicy.kotlinRuntimePath), StorageDependencyPolicy.sourceEncoding);
  const generatedSource = readFileSync(resolve(projectDirectory, StorageDependencyPolicy.modulesDirectory,
    StorageDependencyPolicy.storagePackage, StorageDependencyPolicy.kotlinSpecificationPath), StorageDependencyPolicy.sourceEncoding);
  assertion.match(runtimeSource, BackingApiPatterns.backingClass);
  assertion.match(runtimeSource, BackingApiPatterns.initializer);
  assertion.match(runtimeSource, BackingApiPatterns.factory);
  assertion.match(generatedSource, BackingApiPatterns.generatedBaseClass);
});

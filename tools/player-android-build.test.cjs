const { test, before } = require('node:test');
const { strict: assertion } = require('node:assert');
const { readFileSync, existsSync, unlinkSync, readdirSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { tmpdir: temporaryDirectory } = require('node:os');
const { spawnSync } = require('node:child_process');

const ApplicationRelativeDirectory = '..';
const PlayerRelativeDirectory = '../StreamingServicePlayer';
const AndroidFolderName = 'android';
const GeneratedSourceRelativeDirectory = 'android/player/build/generated/source/codegen';
const PreparedSpecificationRelativeFilename = 'generated-specs/NativeStreamingPlayer.ts';
const LibraryOutputRelativeDirectory = 'android/player/build/outputs/aar';
const ApplicationDirectory = resolve(__dirname, ApplicationRelativeDirectory);
const PlayerDirectory = resolve(ApplicationDirectory, PlayerRelativeDirectory);
const AndroidDirectory = resolve(ApplicationDirectory, AndroidFolderName);
const GeneratedDirectory = resolve(PlayerDirectory, GeneratedSourceRelativeDirectory);
const PreparedSpecificationFilename = resolve(PlayerDirectory, PreparedSpecificationRelativeFilename);
const JavaBridgeFilename = 'java/com/streamingservice/player/bridge/NativeStreamingPlayerSpec.java';
const NativeBindingFilename = 'jni/StreamingServicePlayerSpec-generated.cpp';
const NativeBuildFilename = 'jni/CMakeLists.txt';
const LibraryOutputDirectory = resolve(PlayerDirectory, LibraryOutputRelativeDirectory);
const LibraryArchiveSuffix = '-debug.aar';
const SchemaFilename = 'schema.json';
const SchemaModuleIdentifier = 'NativeStreamingPlayer';
const NativeBuildTarget = 'react_codegen_StreamingServicePlayerSpec';
const RegisteredModuleName = 'StreamingPlayer';
const BridgeNamespace = 'package com.streamingservice.player.bridge;';
const PreparedRegistryCall = 'TurboModuleRegistry.getEnforcing<Spec>("StreamingPlayer")';
const SourceEncoding = 'utf8';
const SuccessfulExitCode = 0;
const ExpectedLibraryArchiveCount = 1;
const FirstArchiveIndex = 0;
const BuildTimeoutMilliseconds = 300000;
const MaximumBuildOutputBytes = 16777216;
const GradleExecutable = './gradlew';
const BuildArguments = [
  ':streaming-service-player:clean',
  ':streaming-service-player:assembleDebug',
  '--no-daemon',
  '-Pkotlin.compiler.execution.strategy=in-process',
];
const ArchiveListingExecutable = 'unzip';
const ArchiveListingArgument = '-Z1';
const ArchiveExtractionArgument = '-p';
const JavaArchiveExecutable = 'jar';
const JavaArchiveListingArgument = 'tf';
const TemporaryArchivePrefix = 'streaming-player-android-library-';
const ArchiveMemberSeparator = '\n';
const JavaMethodOpeningDelimiter = '(';
const CompiledClassesFilename = 'classes.jar';
const AndroidManifestFilename = 'AndroidManifest.xml';
const RequiredCompiledClasses = [
  'com/streamingservice/player/bridge/NativeStreamingPlayerSpec.class',
  'com/streamingservice/player/bridge/StreamingPlayerModule.class',
  'com/streamingservice/player/bridge/StreamingPlayerPackage.class',
  'com/streamingservice/player/playback/StreamingPlaybackService.class',
  'com/streamingservice/player/playback/MediaRenderersFactory.class',
];
const RequiredNativeMethods = [
  'initialize', 'configureMediaServer', 'clearSession',
  'registerMediaSource', 'releaseMediaSource',
  'registerMediaCredential', 'updateMediaCredential', 'releaseMediaCredential',
  'executeCommand', 'getSnapshot', 'addListener', 'removeListeners',
];
const TestNames = {
  preparation: 'Gradle regenerates the missing prepared specification from authored source',
  schema: 'Gradle generates the player module through the mobile workspace link',
  methods: 'Gradle schema contains every public native transport method',
  namespace: 'Gradle generates the Java bridge in the player manifest namespace',
  javaMethods: 'generated Java bridge declares every public native transport method',
  nativeBinding: 'Gradle generates the player native dispatch bindings and CMake target',
  library: 'the mobile host builds an Android player library with compiled classes and a manifest',
  compiledBridge: 'the Android library contains compiled generated bridge and player implementation classes',
};

before(() => {
  if (existsSync(PreparedSpecificationFilename)) unlinkSync(PreparedSpecificationFilename);
  const result = spawnSync(GradleExecutable, BuildArguments, {
    cwd: AndroidDirectory,
    encoding: SourceEncoding,
    timeout: BuildTimeoutMilliseconds,
    maxBuffer: MaximumBuildOutputBytes,
  });
  assertion.ifError(result.error);
  assertion.equal(result.status, SuccessfulExitCode, result.stdout + result.stderr);
});

function readGeneratedSource(filename) {
  return readFileSync(join(GeneratedDirectory, filename), SourceEncoding);
}

function readPlayerModule() {
  return JSON.parse(readGeneratedSource(SchemaFilename)).modules[SchemaModuleIdentifier];
}

function findLibraryArchive() {
  const libraryArchives = readdirSync(LibraryOutputDirectory).filter(filename => filename.endsWith(LibraryArchiveSuffix));
  assertion.equal(libraryArchives.length, ExpectedLibraryArchiveCount);
  return join(LibraryOutputDirectory, libraryArchives[FirstArchiveIndex]);
}

test(TestNames.preparation, () => {
  assertion.ok(readFileSync(PreparedSpecificationFilename, SourceEncoding).includes(PreparedRegistryCall));
});

test(TestNames.schema, () => {
  assertion.equal(readPlayerModule().moduleName, RegisteredModuleName);
});

test(TestNames.methods, () => {
  const methodNames = readPlayerModule().spec.methods.map(method => method.name);
  assertion.deepEqual(methodNames.sort(), [...RequiredNativeMethods].sort());
});

test(TestNames.namespace, () => {
  assertion.ok(readGeneratedSource(JavaBridgeFilename).includes(BridgeNamespace));
});

test(TestNames.javaMethods, () => {
  const generatedBridge = readGeneratedSource(JavaBridgeFilename);
  for (const methodName of RequiredNativeMethods) assertion.ok(generatedBridge.includes(methodName + JavaMethodOpeningDelimiter), methodName);
});

test(TestNames.nativeBinding, () => {
  const generatedBinding = readGeneratedSource(NativeBindingFilename);
  for (const methodName of RequiredNativeMethods) assertion.ok(generatedBinding.includes(methodName), methodName);
  assertion.ok(readGeneratedSource(NativeBuildFilename).includes(NativeBuildTarget));
});

test(TestNames.library, () => {
  const result = spawnSync(ArchiveListingExecutable, [ArchiveListingArgument, findLibraryArchive()], {
    encoding: SourceEncoding,
  });
  assertion.ifError(result.error);
  assertion.equal(result.status, SuccessfulExitCode, result.stderr);
  const archiveMembers = result.stdout.split(ArchiveMemberSeparator);
  assertion.ok(archiveMembers.includes(CompiledClassesFilename));
  assertion.ok(archiveMembers.includes(AndroidManifestFilename));
});

test(TestNames.compiledBridge, () => {
  const extraction = spawnSync(ArchiveListingExecutable, [ArchiveExtractionArgument, findLibraryArchive(), CompiledClassesFilename]);
  assertion.ifError(extraction.error);
  assertion.equal(extraction.status, SuccessfulExitCode, extraction.stderr.toString());
  const archiveDirectory = mkdtempSync(join(temporaryDirectory(), TemporaryArchivePrefix));
  try {
    const classesArchiveFilename = join(archiveDirectory, CompiledClassesFilename);
    writeFileSync(classesArchiveFilename, extraction.stdout);
    const listing = spawnSync(JavaArchiveExecutable, [JavaArchiveListingArgument, classesArchiveFilename], { encoding: SourceEncoding });
    assertion.ifError(listing.error);
    assertion.equal(listing.status, SuccessfulExitCode, listing.stderr);
    const compiledClasses = listing.stdout.split(ArchiveMemberSeparator);
    for (const className of RequiredCompiledClasses) assertion.ok(compiledClasses.includes(className), className);
  } finally {
    rmSync(archiveDirectory, { recursive: true, force: true });
  }
});

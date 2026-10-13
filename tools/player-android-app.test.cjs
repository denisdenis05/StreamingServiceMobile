const { test, before } = require('node:test');
const { strict: assertion } = require('node:assert');
const { readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const ApplicationRelativeDirectory = '..';
const AndroidFolderName = 'android';
const ApplicationArchiveRelativeFilename = 'app/build/outputs/apk/debug/app-debug.apk';
const AutolinkingRelativeDirectory = 'app/build/generated/autolinking/src/main';
const ApplicationDirectory = resolve(__dirname, ApplicationRelativeDirectory);
const AndroidDirectory = resolve(ApplicationDirectory, AndroidFolderName);
const ApplicationArchiveFilename = resolve(AndroidDirectory, ApplicationArchiveRelativeFilename);
const AutolinkingDirectory = resolve(AndroidDirectory, AutolinkingRelativeDirectory);
const PackageListFilename = 'java/com/facebook/react/PackageList.java';
const NativeDispatchFilename = 'jni/autolinking.cpp';
const NativeBuildFilename = 'jni/Android-autolinking.cmake';
const GradlePropertiesFilename = 'gradle.properties';
const ArchitecturesPropertyPattern = /^reactNativeArchitectures=(.+)$/m;
const ArchitectureSeparator = ',';
const ArchiveMemberSeparator = '\n';
const ArchivePathSeparator = '/';
const LibrariesDirectoryName = 'lib';
const SoftwareDecoderFilename = 'libffmpegJNI.so';
const NativeApplicationModulesFilename = 'libappmodules.so';
const PackageImport = 'import com.streamingservice.player.bridge.StreamingPlayerPackage;';
const PackageConstruction = 'new StreamingPlayerPackage()';
const NativeModuleProvider = 'StreamingServicePlayerSpec_ModuleProvider';
const NativeBuildTarget = 'react_codegen_StreamingServicePlayerSpec';
const PlaybackServiceClass = 'com.streamingservice.player.playback.StreamingPlaybackService';
const PlaybackForegroundPermission = 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK';
const DefaultAndroidSoftwareDevelopmentKitDirectory = '/opt/android-sdk';
const ManifestToolRelativeFilename = 'build-tools/35.0.0/aapt2';
const AndroidManifestFilename = 'AndroidManifest.xml';
const ManifestDumpCommand = 'dump';
const ManifestTreeCommand = 'xmltree';
const ManifestFilenameOption = '--file';
const ManifestDumpArguments = [ManifestDumpCommand, ManifestTreeCommand, ApplicationArchiveFilename, ManifestFilenameOption, AndroidManifestFilename];
const GradleExecutable = './gradlew';
const BuildArguments = [':app:assembleDebug', '--no-daemon', '-Pkotlin.compiler.execution.strategy=in-process'];
const ArchiveListingExecutable = 'unzip';
const ArchiveListingArgument = '-Z1';
const SourceEncoding = 'utf8';
const SuccessfulExitCode = 0;
const BuildTimeoutMilliseconds = 600000;
const MaximumBuildOutputBytes = 16777216;
const FirstCaptureIndex = 1;
const TestNames = {
  package: 'the Android app registers the player package through autolinking',
  nativeModule: 'the Android app links the generated player module provider',
  manifest: 'the packaged Android manifest contains the player service and playback foreground permission',
};
const architectureMatch = readFileSync(join(AndroidDirectory, GradlePropertiesFilename), SourceEncoding).match(ArchitecturesPropertyPattern);
assertion.ok(architectureMatch);
const architectures = architectureMatch[FirstCaptureIndex].split(ArchitectureSeparator);
let archiveMembers;

before(() => {
  const build = spawnSync(GradleExecutable, BuildArguments, {
    cwd: AndroidDirectory,
    encoding: SourceEncoding,
    timeout: BuildTimeoutMilliseconds,
    maxBuffer: MaximumBuildOutputBytes,
  });
  assertion.ifError(build.error);
  assertion.equal(build.status, SuccessfulExitCode, build.stdout + build.stderr);
  const listing = spawnSync(ArchiveListingExecutable, [ArchiveListingArgument, ApplicationArchiveFilename], { encoding: SourceEncoding });
  assertion.ifError(listing.error);
  assertion.equal(listing.status, SuccessfulExitCode, listing.stderr);
  archiveMembers = new Set(listing.stdout.split(ArchiveMemberSeparator));
});

test(TestNames.package, () => {
  const packageList = readFileSync(join(AutolinkingDirectory, PackageListFilename), SourceEncoding);
  assertion.ok(packageList.includes(PackageImport));
  assertion.ok(packageList.includes(PackageConstruction));
});

test(TestNames.nativeModule, () => {
  assertion.ok(readFileSync(join(AutolinkingDirectory, NativeDispatchFilename), SourceEncoding).includes(NativeModuleProvider));
  assertion.ok(readFileSync(join(AutolinkingDirectory, NativeBuildFilename), SourceEncoding).includes(NativeBuildTarget));
});

for (const architecture of architectures) {
  test(`the Android APK packages FFmpeg for ${architecture}`, () => {
    assertion.ok(archiveMembers.has([LibrariesDirectoryName, architecture, SoftwareDecoderFilename].join(ArchivePathSeparator)));
  });
  test(`the Android APK packages linked application modules for ${architecture}`, () => {
    assertion.ok(archiveMembers.has([LibrariesDirectoryName, architecture, NativeApplicationModulesFilename].join(ArchivePathSeparator)));
  });
}

test(TestNames.manifest, () => {
  const softwareDevelopmentKitDirectory = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? DefaultAndroidSoftwareDevelopmentKitDirectory;
  const result = spawnSync(join(softwareDevelopmentKitDirectory, ManifestToolRelativeFilename), ManifestDumpArguments, { encoding: SourceEncoding });
  assertion.ifError(result.error);
  assertion.equal(result.status, SuccessfulExitCode, result.stderr);
  assertion.ok(result.stdout.includes(PlaybackServiceClass));
  assertion.ok(result.stdout.includes(PlaybackForegroundPermission));
});

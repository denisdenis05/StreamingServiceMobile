from pathlib import Path
import os
import shutil
import subprocess

ProjectDirectory = Path(__file__).resolve().parent.parent
BuildDirectory = ProjectDirectory / '.build' / 'spotify-ios-proof'
SourceDirectory = ProjectDirectory / 'ios' / 'streamingservice'
CompilerName = 'swiftc'
ObjectiveCCompilerName = 'clang'
CompilerLanguage = '6'
LanguageVersionArgument = '-swift-version'
ParseAsLibraryArgument = '-parse-as-library'
ModuleCacheArgument = '-module-cache-path'
OutputArgument = '-o'
SoftwareDevelopmentKitArgument = '-sdk'
TargetArgument = '-target'
ResourceDirectoryArgument = '-resource-dir'
FrontendArgument = '-Xfrontend'
CrossImportOverlaysArgument = '-enable-cross-import-overlays'
EmitModuleArgument = '-emit-module'
ModuleNameArgument = '-module-name'
ModuleOutputArgument = '-emit-module-path'
EmitObjectiveCHeaderArgument = '-emit-objc-header'
ObjectiveCHeaderPathArgument = '-emit-objc-header-path'
SourceEncoding = 'utf8'
FactoryFilename = 'SpotifyProofKeyFactory.swift'
PlatformFilename = 'SpotifyProofKeyPlatform.swift'
BridgeFilename = 'SpotifyProofKeyBridge.swift'
TestsFilename = 'spotify-ios-proof-tests.swift'
ObjectiveCModuleFilename = 'SpotifyProofKeyModule.m'
ModuleName = 'streamingservice'
HeaderFilename = 'streamingservice-Swift.h'
ModuleFilename = 'streamingservice.swiftmodule'
TestBinaryFilename = 'SpotifyProofTests'
SourceCheckDirectoryName = 'source-check'
ModuleCacheDirectoryName = 'module-cache'
SoftwareDevelopmentKitEnvironmentName = 'STREAMING_PLAYER_DARWIN_SDK'
DefaultSoftwareDevelopmentKit = Path.home() / '.swiftpm' / 'swift-sdks' / 'darwin.artifactbundle'
SoftwareDevelopmentKitRelativeDirectory = 'Developer/Platforms/iPhoneOS.platform/Developer/SDKs'
SoftwareDevelopmentKitPattern = 'iPhoneOS*.sdk'
SwiftResourceRelativeDirectory = 'Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift'
AppleTarget = 'arm64-apple-ios15.1'
PolicyTool = ProjectDirectory.parent / 'StreamingServicePlayer' / 'tools' / 'check-swift-architecture.py'
PolicyEnvironmentName = 'STREAMING_PLAYER_SWIFT_SOURCE_DIRECTORY'
PythonName = 'python3'
LastPosition = -1
CommandTimeoutSeconds = 120
RequiredSelector = 'generateProofAndReturnError'
MissingSoftwareDevelopmentKit = 'No installed Darwin iPhoneOS SDK was found.'
HeadersDirectoryName = 'headers'
NativeReactDirectory = ProjectDirectory / 'node_modules' / 'react-native'
HeaderLinks = {'React': NativeReactDirectory / 'React' / 'Base',
    'RCTDeprecation': NativeReactDirectory / 'ReactApple' / 'Libraries' / 'RCTFoundation' / 'RCTDeprecation' / 'Exported'}
IncludeArgument = '-I'
ObjectiveCSoftwareDevelopmentKitArgument = '-isysroot'
ObjectiveCOptions = ['-fsyntax-only', '-fobjc-arc', '-fblocks', '-fmodules', '-Wno-nullability-completeness']
ObjectiveCCacheArgumentPrefix = '-fmodules-cache-path='
ObjectiveCCacheDirectoryName = 'clang-cache'
MissingSelector = 'The generated Objective-C proof-key selector differs from the registered bridge.'
SuccessMessage = 'Spotify proof-key host tests, Apple SDK Swift compilation and Objective-C bridge syntax passed; full React Native linking remains unverified.'


def execute(arguments, environment=None):
    subprocess.run(arguments, cwd=ProjectDirectory, env=environment, check=True, timeout=CommandTimeoutSeconds)


BuildDirectory.mkdir(parents=True, exist_ok=True)
source_check_directory = BuildDirectory / SourceCheckDirectoryName
source_check_directory.mkdir(parents=True, exist_ok=True)
for filename in [FactoryFilename, PlatformFilename, BridgeFilename]:
    shutil.copyfile(SourceDirectory / filename, source_check_directory / filename)
shutil.copyfile(ProjectDirectory / 'tools' / TestsFilename, source_check_directory / TestsFilename)
policy_environment = os.environ.copy()
policy_environment[PolicyEnvironmentName] = str(source_check_directory)
execute([PythonName, str(PolicyTool)], policy_environment)
module_cache_directory = BuildDirectory / ModuleCacheDirectoryName
module_cache_directory.mkdir(parents=True, exist_ok=True)
common_arguments = [CompilerName, LanguageVersionArgument, CompilerLanguage, ParseAsLibraryArgument, ModuleCacheArgument, str(module_cache_directory)]
test_binary = BuildDirectory / TestBinaryFilename
execute(common_arguments + [str(SourceDirectory / FactoryFilename), str(ProjectDirectory / 'tools' / TestsFilename), OutputArgument, str(test_binary)])
execute([str(test_binary)])
software_development_kit = Path(os.environ.get(SoftwareDevelopmentKitEnvironmentName, str(DefaultSoftwareDevelopmentKit)))
software_development_kit_roots = sorted((software_development_kit / SoftwareDevelopmentKitRelativeDirectory).glob(SoftwareDevelopmentKitPattern))
if not software_development_kit_roots:
    raise RuntimeError(MissingSoftwareDevelopmentKit)
header = BuildDirectory / HeaderFilename
execute(common_arguments + [SoftwareDevelopmentKitArgument, str(software_development_kit_roots[LastPosition]), TargetArgument, AppleTarget,
    ResourceDirectoryArgument, str(software_development_kit / SwiftResourceRelativeDirectory), FrontendArgument, CrossImportOverlaysArgument,
    EmitModuleArgument, ModuleNameArgument, ModuleName, str(SourceDirectory / FactoryFilename), str(SourceDirectory / PlatformFilename),
    str(SourceDirectory / BridgeFilename), ModuleOutputArgument, str(BuildDirectory / ModuleFilename),
    EmitObjectiveCHeaderArgument, ObjectiveCHeaderPathArgument, str(header)])
if RequiredSelector not in header.read_text(encoding=SourceEncoding):
    raise RuntimeError(MissingSelector)
headers_directory = BuildDirectory / HeadersDirectoryName
headers_directory.mkdir(parents=True, exist_ok=True)
for module_name, source_directory in HeaderLinks.items():
    header_link = headers_directory / module_name
    if not header_link.exists():
        header_link.symlink_to(source_directory, target_is_directory=True)
execute([ObjectiveCCompilerName, TargetArgument, AppleTarget, ObjectiveCSoftwareDevelopmentKitArgument,
    str(software_development_kit_roots[LastPosition])] + ObjectiveCOptions +
    [ObjectiveCCacheArgumentPrefix + str(BuildDirectory / ObjectiveCCacheDirectoryName), IncludeArgument,
    str(headers_directory), IncludeArgument, str(BuildDirectory), str(SourceDirectory / ObjectiveCModuleFilename)])
print(SuccessMessage)

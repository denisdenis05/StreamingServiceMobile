const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const directory = mkdtempSync(join(tmpdir(), 'streaming-transfer-ios-'));
const nativeDirectory = join(directory, 'Sources', 'NativeTransfer');
const applicationDirectory = join(directory, 'Sources', 'TransferLifetimeHarness');
mkdirSync(nativeDirectory, { recursive: true }); mkdirSync(applicationDirectory, { recursive: true });
for (const filename of ['Downloader.m', 'Downloader.h']) copyFileSync(require.resolve('react-native-fs/' + filename), join(nativeDirectory, filename));
writeFileSync(join(nativeDirectory, 'LifetimeChecks.h'), '#import <Foundation/Foundation.h>\nint RNFSRunCancellationCheck(void);\n');
writeFileSync(join(nativeDirectory, 'LifetimeChecks.m'), `#import "Downloader.h"
#import "LifetimeChecks.h"
int RNFSRunCancellationCheck(void) {
    __block NSInteger completedCallbacks = 0;
    RNFSDownloadParams *parameters = [RNFSDownloadParams new];
    parameters.errorCallback = ^(NSError *failure) { completedCallbacks += 1; };
    RNFSDownloader *downloader = [RNFSDownloader new];
    [downloader setValue:parameters forKey:@"params"];
    [downloader stopDownload];
    [downloader stopDownload];
    return completedCallbacks == 1 ? 0 : 1;
}
`);
writeFileSync(join(applicationDirectory, 'Application.swift'), `import SwiftUI
import NativeTransfer
@main struct TransferLifetimeHarness: App {
    private let result = RNFSRunCancellationCheck()
    var body: some Scene { WindowGroup { Text(result == 0 ? "Transfer cleanup passed" : "Transfer cleanup failed") } }
}
`);
writeFileSync(join(directory, 'Package.swift'), `// swift-tools-version: 6.4
import PackageDescription
let package = Package(name: "TransferLifetimeHarness", platforms: [.iOS("15.1")],
    products: [.library(name: "TransferLifetimeHarness", targets: ["TransferLifetimeHarness"])],
    targets: [.target(name: "NativeTransfer", publicHeadersPath: ".", cSettings: [.unsafeFlags(["-fobjc-arc"])]),
        .target(name: "TransferLifetimeHarness", dependencies: ["NativeTransfer"])])
`);
writeFileSync(join(directory, 'xtool.yml'), 'version: 1\nbundleID: dev.streamingservice.transfer.harness\n');
const result = spawnSync('xtool', ['dev', 'build', '--configuration', 'release'], { cwd: directory, stdio: 'inherit' });
process.stdout.write('Harness directory: ' + directory + '\n');
process.exitCode = result.status ?? 1;

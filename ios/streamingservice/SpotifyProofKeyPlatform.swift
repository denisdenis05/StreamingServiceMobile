import CryptoKit
import Foundation
import Security

struct SpotifySystemProofEntropy: SpotifyProofEntropy {
    func generateBytes(byteCount: Int) throws -> [UInt8] {
        guard byteCount > SpotifyPlatformProofPolicy.emptyByteCount else { throw SpotifyProofKeyFailure.invalidEntropy }
        var bytes = [UInt8](repeating: SpotifyPlatformProofPolicy.emptyByte, count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            guard let address = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, buffer.count, address)
        }
        guard status == errSecSuccess else { throw SpotifyProofKeyFailure.entropyUnavailable }
        return bytes
    }
}

struct SpotifySystemProofDigest: SpotifyProofDigest {
    func digest(bytes: [UInt8]) throws -> [UInt8] {
        Array(SHA256.hash(data: Data(bytes)))
    }
}

private enum SpotifyPlatformProofPolicy {
    static let emptyByteCount = 0
    static let emptyByte: UInt8 = 0
}

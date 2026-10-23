import Foundation

@objc(SpotifyProofKeyBridge)
public final class SpotifyProofKeyBridge: NSObject {
    private let factory: SpotifyProofKeyFactory

    public override init() {
        factory = SpotifyProofKeyFactory(entropy: SpotifySystemProofEntropy(), digest: SpotifySystemProofDigest())
        super.init()
    }

    @objc public func generateProof() throws -> [String: String] {
        try factory.generate().dictionary()
    }
}

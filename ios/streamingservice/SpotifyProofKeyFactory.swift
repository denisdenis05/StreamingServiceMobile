import Foundation

enum SpotifyProofKeyPolicy {
    static let entropyByteCount = 32
    static let digestByteCount = 32
    static let encodedCharacterCount = 43
    static let allowedCharacters = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".utf8)
    static let base64Plus = "+"
    static let base64Slash = "/"
    static let base64Padding = "="
    static let urlMinus = "-"
    static let urlUnderscore = "_"
    static let emptyText = ""
    static let verifierField = "verifier"
    static let challengeField = "challenge"
    static let stateField = "state"
}

enum SpotifyProofKeyFailure: Error, Equatable {
    case entropyUnavailable
    case invalidEntropy
    case digestUnavailable
    case invalidDigest
    case encodingUnavailable
    case invalidEncoding
}

protocol SpotifyProofEntropy {
    func generateBytes(byteCount: Int) throws -> [UInt8]
}

protocol SpotifyProofDigest {
    func digest(bytes: [UInt8]) throws -> [UInt8]
}

protocol SpotifyProofEncoding {
    func encode(bytes: [UInt8]) throws -> String
}

struct SpotifyProofBase64Encoding: SpotifyProofEncoding {
    func encode(bytes: [UInt8]) throws -> String {
        Data(bytes).base64EncodedString()
            .replacingOccurrences(of: SpotifyProofKeyPolicy.base64Plus, with: SpotifyProofKeyPolicy.urlMinus)
            .replacingOccurrences(of: SpotifyProofKeyPolicy.base64Slash, with: SpotifyProofKeyPolicy.urlUnderscore)
            .replacingOccurrences(of: SpotifyProofKeyPolicy.base64Padding, with: SpotifyProofKeyPolicy.emptyText)
    }
}

struct SpotifyProofKey: Equatable {
    let verifier: String
    let challenge: String
    let state: String

    func dictionary() -> [String: String] {
        [SpotifyProofKeyPolicy.verifierField: verifier, SpotifyProofKeyPolicy.challengeField: challenge,
         SpotifyProofKeyPolicy.stateField: state]
    }
}

struct SpotifyProofKeyFactory {
    private let entropy: any SpotifyProofEntropy
    private let digest: any SpotifyProofDigest
    private let encoding: any SpotifyProofEncoding

    init(entropy: any SpotifyProofEntropy, digest: any SpotifyProofDigest,
         encoding: any SpotifyProofEncoding = SpotifyProofBase64Encoding()) {
        self.entropy = entropy
        self.digest = digest
        self.encoding = encoding
    }

    func generate() throws -> SpotifyProofKey {
        let verifierBytes = try entropyBytes()
        let stateBytes = try entropyBytes()
        let verifier = try encode(bytes: verifierBytes)
        let challenge = try encode(bytes: digestBytes(verifier: verifier))
        let state = try encode(bytes: stateBytes)
        return SpotifyProofKey(verifier: verifier, challenge: challenge, state: state)
    }

    private func entropyBytes() throws -> [UInt8] {
        let bytes: [UInt8]
        do { bytes = try entropy.generateBytes(byteCount: SpotifyProofKeyPolicy.entropyByteCount) }
        catch { throw SpotifyProofKeyFailure.entropyUnavailable }
        guard bytes.count == SpotifyProofKeyPolicy.entropyByteCount else { throw SpotifyProofKeyFailure.invalidEntropy }
        return bytes
    }

    private func digestBytes(verifier: String) throws -> [UInt8] {
        let bytes: [UInt8]
        do { bytes = try digest.digest(bytes: Array(verifier.utf8)) }
        catch { throw SpotifyProofKeyFailure.digestUnavailable }
        guard bytes.count == SpotifyProofKeyPolicy.digestByteCount else { throw SpotifyProofKeyFailure.invalidDigest }
        return bytes
    }

    private func encode(bytes: [UInt8]) throws -> String {
        let encoded: String
        do { encoded = try encoding.encode(bytes: bytes) }
        catch { throw SpotifyProofKeyFailure.encodingUnavailable }
        guard encoded.utf8.count == SpotifyProofKeyPolicy.encodedCharacterCount,
              encoded.utf8.allSatisfy({ character in SpotifyProofKeyPolicy.allowedCharacters.contains(character) }) else {
            throw SpotifyProofKeyFailure.invalidEncoding
        }
        return encoded
    }
}

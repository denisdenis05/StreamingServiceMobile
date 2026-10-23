import Foundation
import Testing

private enum ProofFixture {
    static let referenceVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    static let referenceChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    static let zeroByte: UInt8 = 0
    static let alternateByte: UInt8 = 255
    static let byteCount = 32
    static let invalidByteCount = 31
    static let initialCalls = 0
    static let callIncrement = 1
    static let twoEntropyCalls = 2
    static let oneDigestCall = 1
    static let oneCharacter = "x"
    static let invalidCharacter = "+"
    static let encodedCharacterCount = 43
    static let missingPaddingCount = 1
    static let base64Padding = "="
    static let base64Plus = "+"
    static let base64Slash = "/"
    static let urlMinus = "-"
    static let urlUnderscore = "_"
    static let emptyText = ""
    static let firstPosition = 0
}

private struct FixtureFailure: Error {}

private final class FixtureEntropy: SpotifyProofEntropy {
    var requestedCounts: [Int] = []
    var blocks = [[UInt8](repeating: ProofFixture.zeroByte, count: ProofFixture.byteCount),
                  [UInt8](repeating: ProofFixture.alternateByte, count: ProofFixture.byteCount)]
    var failureAfterCalls: Int?

    func generateBytes(byteCount: Int) throws -> [UInt8] {
        if requestedCounts.count == failureAfterCalls { throw FixtureFailure() }
        requestedCounts.append(byteCount)
        return blocks.removeFirst()
    }
}

private final class FixtureDigest: SpotifyProofDigest {
    var inputs: [[UInt8]] = []
    var output = [UInt8](repeating: ProofFixture.zeroByte, count: ProofFixture.byteCount)
    var fails = false

    func digest(bytes: [UInt8]) throws -> [UInt8] {
        inputs.append(bytes)
        if fails { throw FixtureFailure() }
        return output
    }
}

private struct FixtureEncoding: SpotifyProofEncoding {
    let text: String?
    func encode(bytes: [UInt8]) throws -> String {
        guard let text else { throw FixtureFailure() }
        return text
    }
}

private func decodeReference(_ text: String) -> [UInt8] {
    let base64 = text.replacingOccurrences(of: ProofFixture.urlMinus, with: ProofFixture.base64Plus)
        .replacingOccurrences(of: ProofFixture.urlUnderscore, with: ProofFixture.base64Slash)
        + String(repeating: ProofFixture.base64Padding, count: ProofFixture.missingPaddingCount)
    return Array(Data(base64Encoded: base64)!)
}

struct SpotifyProofKeyFactoryTests {
    @Test func referenceVerifierAndChallengeVector() throws {
        let entropy = FixtureEntropy()
        entropy.blocks = [decodeReference(ProofFixture.referenceVerifier), entropy.blocks.removeLast()]
        let digest = FixtureDigest()
        digest.output = decodeReference(ProofFixture.referenceChallenge)
        let proof = try SpotifyProofKeyFactory(entropy: entropy, digest: digest).generate()
        #expect(proof.verifier == ProofFixture.referenceVerifier)
        #expect(proof.challenge == ProofFixture.referenceChallenge)
        #expect(digest.inputs == [Array(ProofFixture.referenceVerifier.utf8)])
    }

    @Test func verifierAndStateRequestIndependentEntropy() throws {
        let entropy = FixtureEntropy()
        let proof = try SpotifyProofKeyFactory(entropy: entropy, digest: FixtureDigest()).generate()
        #expect(entropy.requestedCounts == [ProofFixture.byteCount, ProofFixture.byteCount])
        #expect(proof.verifier != proof.state)
    }

    @Test func outputUsesUnpaddedUrlSafeBase64() throws {
        let proof = try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: FixtureDigest()).generate()
        for value in [proof.verifier, proof.challenge, proof.state] {
            #expect(value.utf8.count == ProofFixture.encodedCharacterCount)
            #expect(!value.contains(ProofFixture.base64Padding))
            #expect(!value.contains(ProofFixture.base64Plus))
            #expect(!value.contains(ProofFixture.base64Slash))
        }
        #expect(proof.state.contains(ProofFixture.urlUnderscore))
    }

    @Test func challengeHashesEncodedVerifierInsteadOfEntropy() throws {
        let digest = FixtureDigest()
        let proof = try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: digest).generate()
        #expect(digest.inputs.count == ProofFixture.oneDigestCall)
        #expect(digest.inputs[ProofFixture.firstPosition] == Array(proof.verifier.utf8))
        #expect(digest.inputs[ProofFixture.firstPosition].count == ProofFixture.encodedCharacterCount)
    }

    @Test func dictionaryMatchesTheJavaScriptContract() throws {
        let proof = try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: FixtureDigest()).generate()
        #expect(proof.dictionary() == [SpotifyProofKeyPolicy.verifierField: proof.verifier,
            SpotifyProofKeyPolicy.challengeField: proof.challenge, SpotifyProofKeyPolicy.stateField: proof.state])
    }

    @Test func verifierEntropyFailureIsTyped() {
        let entropy = FixtureEntropy()
        entropy.failureAfterCalls = ProofFixture.initialCalls
        #expect(throws: SpotifyProofKeyFailure.entropyUnavailable) {
            try SpotifyProofKeyFactory(entropy: entropy, digest: FixtureDigest()).generate()
        }
    }

    @Test func stateEntropyFailureCannotProducePartialProof() {
        let entropy = FixtureEntropy()
        entropy.failureAfterCalls = ProofFixture.callIncrement
        let digest = FixtureDigest()
        #expect(throws: SpotifyProofKeyFailure.entropyUnavailable) {
            try SpotifyProofKeyFactory(entropy: entropy, digest: digest).generate()
        }
        #expect(digest.inputs.isEmpty)
    }

    @Test func incorrectEntropyLengthIsRejected() {
        let entropy = FixtureEntropy()
        entropy.blocks = [[UInt8](repeating: ProofFixture.zeroByte, count: ProofFixture.invalidByteCount)]
        #expect(throws: SpotifyProofKeyFailure.invalidEntropy) {
            try SpotifyProofKeyFactory(entropy: entropy, digest: FixtureDigest()).generate()
        }
    }

    @Test func digestFailureIsTyped() {
        let digest = FixtureDigest()
        digest.fails = true
        #expect(throws: SpotifyProofKeyFailure.digestUnavailable) {
            try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: digest).generate()
        }
    }

    @Test func incorrectDigestLengthIsRejected() {
        let digest = FixtureDigest()
        digest.output = []
        #expect(throws: SpotifyProofKeyFailure.invalidDigest) {
            try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: digest).generate()
        }
    }

    @Test func encodingFailureIsTyped() {
        #expect(throws: SpotifyProofKeyFailure.encodingUnavailable) {
            try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: FixtureDigest(), encoding: FixtureEncoding(text: nil)).generate()
        }
    }

    @Test func incorrectEncodingLengthIsRejected() {
        #expect(throws: SpotifyProofKeyFailure.invalidEncoding) {
            try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: FixtureDigest(),
                encoding: FixtureEncoding(text: ProofFixture.oneCharacter)).generate()
        }
    }

    @Test func nonUrlSafeEncodingIsRejected() {
        #expect(throws: SpotifyProofKeyFailure.invalidEncoding) {
            try SpotifyProofKeyFactory(entropy: FixtureEntropy(), digest: FixtureDigest(),
                encoding: FixtureEncoding(text: String(repeating: ProofFixture.invalidCharacter, count: ProofFixture.encodedCharacterCount))).generate()
        }
    }
}

@main struct SpotifyProofTestsMain {
    static func main() async {
        await Testing.__swiftPMEntryPoint() as Never
    }
}

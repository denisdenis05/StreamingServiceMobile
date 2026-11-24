package com.streamingservice.spotify

import java.security.MessageDigest
import java.security.SecureRandom

data class SpotifyProofKey(val verifier: String, val challenge: String, val state: String)

class SpotifyProofKeyFactory(
    private val randomness: SecureRandom,
    private val encode: (ByteArray) -> String
) {
    fun generate(): SpotifyProofKey {
        val verifierBytes = ByteArray(ENTROPY_BYTES)
        val stateBytes = ByteArray(ENTROPY_BYTES)
        randomness.nextBytes(verifierBytes)
        randomness.nextBytes(stateBytes)
        val verifier = encode(verifierBytes)
        val challenge = encode(MessageDigest.getInstance(HASH_ALGORITHM).digest(verifier.toByteArray(Charsets.US_ASCII)))
        return SpotifyProofKey(verifier, challenge, encode(stateBytes))
    }

    companion object {
        private const val ENTROPY_BYTES = 32
        private const val HASH_ALGORITHM = "SHA-256"
    }
}

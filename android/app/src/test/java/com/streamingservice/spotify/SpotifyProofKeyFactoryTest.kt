package com.streamingservice.spotify

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class SpotifyProofKeyFactoryTest {
    private class CountingRandomness : SecureRandom() {
        private var value = INITIAL_BYTE
        override fun nextBytes(bytes: ByteArray) {
            bytes.fill(value.toByte())
            value += BYTE_INCREMENT
        }
    }

    @Test
    fun generatesIndependentStateAndVerifierFromInjectedEntropy() {
        val proof = factory().generate()
        assertEquals(ENCODED_ENTROPY_CHARACTERS, proof.verifier.length)
        assertEquals(ENCODED_ENTROPY_CHARACTERS, proof.state.length)
        assertNotEquals(proof.verifier, proof.state)
        assertEquals(Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(ENTROPY_BYTES) { INITIAL_BYTE.toByte() }), proof.verifier)
    }

    @Test
    fun challengeIsUnpaddedUrlSafeSha256OfVerifier() {
        val proof = factory().generate()
        val expected = Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance(HASH_ALGORITHM).digest(proof.verifier.toByteArray(Charsets.US_ASCII)))
        assertEquals(expected, proof.challenge)
        assertEquals(ENCODED_ENTROPY_CHARACTERS, proof.challenge.length)
        assertEquals(true, URL_SAFE_PATTERN.matches(proof.challenge))
    }

    @Test
    fun eachAttemptConsumesFreshEntropy() {
        val factory = factory()
        val first = factory.generate()
        val second = factory.generate()
        assertNotEquals(first.verifier, second.verifier)
        assertNotEquals(first.state, second.state)
        assertNotEquals(first.challenge, second.challenge)
    }

    private fun factory() = SpotifyProofKeyFactory(CountingRandomness()) { bytes -> Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) }

    companion object {
        private const val INITIAL_BYTE = 1
        private const val BYTE_INCREMENT = 1
        private const val ENTROPY_BYTES = 32
        private const val ENCODED_ENTROPY_CHARACTERS = 43
        private const val HASH_ALGORITHM = "SHA-256"
        private val URL_SAFE_PATTERN = Regex("^[A-Za-z0-9_-]+$")
    }
}

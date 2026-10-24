package com.streamingservice.spotify

import java.net.URI
import java.net.URISyntaxException

class SpotifyAuthorizationReturnStore(private val nowMilliseconds: () -> Long) {
    private data class RetainedReturn(val address: String, val receivedAtMilliseconds: Long)

    private var retained: RetainedReturn? = null

    @Synchronized
    fun capture(address: String?) {
        if (address == null || address.length > MAXIMUM_CALLBACK_CHARACTERS) return
        val parsed = try {
            URI(address)
        } catch (failure: URISyntaxException) {
            return
        }
        if (!EXPECTED_SCHEME.equals(parsed.scheme, ignoreCase = true)
            || !EXPECTED_HOST.equals(parsed.host, ignoreCase = true)) return
        val receivedAtMilliseconds = nowMilliseconds()
        if (receivedAtMilliseconds < MINIMUM_TIMESTAMP_MILLISECONDS) return
        retained = RetainedReturn(address, receivedAtMilliseconds)
    }

    @Synchronized
    fun read(): String? {
        val current = retained ?: return null
        val currentMilliseconds = nowMilliseconds()
        if (currentMilliseconds < current.receivedAtMilliseconds
            || currentMilliseconds - current.receivedAtMilliseconds >= MAXIMUM_AGE_MILLISECONDS) {
            retained = null
            return null
        }
        return current.address
    }

    @Synchronized
    fun clear() {
        retained = null
    }

    companion object {
        private const val EXPECTED_SCHEME = "streamingservicespotify"
        private const val EXPECTED_HOST = "callback"
        private const val MAXIMUM_CALLBACK_CHARACTERS = 16384
        private const val MAXIMUM_AGE_MILLISECONDS = 600000L
        private const val MINIMUM_TIMESTAMP_MILLISECONDS = 0L
    }
}

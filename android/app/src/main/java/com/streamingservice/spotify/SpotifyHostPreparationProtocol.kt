package com.streamingservice.spotify

import org.json.JSONArray

object SpotifyHostPreparationProtocol {
    fun decode(serialized: String): List<String> {
        if (serialized.length > MaximumSerializedCharacters) invalid()
        val identifiers = try { JSONArray(serialized) } catch (_failure: Throwable) { invalid() }
        if (identifiers.length() > SpotifyHostingPolicy.MaximumQueueTracks) invalid()
        return (FirstIndex until identifiers.length()).map { position ->
            val identifier = identifiers.opt(position) as? String ?: invalid()
            if (identifier.isBlank() || identifier.length > SpotifyHostingPolicy.MaximumIdentifierCharacters
                || identifier.any { character -> character.isWhitespace() || character.isISOControl() }) invalid()
            identifier
        }.distinct()
    }
    private fun invalid(): Nothing = throw SpotifyConnectFailure(SpotifyConnectFailureCode.InvalidInput.wireValue)
    private const val FirstIndex = 0
    private const val MaximumSerializedCharacters = 131072
}

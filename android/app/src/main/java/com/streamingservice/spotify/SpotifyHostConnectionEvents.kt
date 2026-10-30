package com.streamingservice.spotify

import org.json.JSONObject

enum class SpotifyHostConnectionDecision { Ignore, Current, Retire }

class SpotifyHostConnectionEvents {
    fun inspect(batch: SpotifyConnectBatch, identity: SpotifyHostIdentity): SpotifyHostConnectionDecision {
        try {
            if (batch.serialized.length > MaximumBatchCharacters) return SpotifyHostConnectionDecision.Retire
            val value = JSONObject(batch.serialized)
            if (integer(value, HandleField) != identity.handle) return SpotifyHostConnectionDecision.Ignore
            if (batch.finished) return SpotifyHostConnectionDecision.Retire
            val events = value.getJSONArray(EventsField)
            if (events.length() > MaximumBatchEvents) return SpotifyHostConnectionDecision.Retire
            for (position in FirstIndex until events.length()) {
                val event = events.getJSONObject(position)
                val generation = integer(event, GenerationField)
                if (generation < identity.generation) continue
                val data = event.getJSONObject(DataField)
                val type = data.get(TypeField) as? String ?: return SpotifyHostConnectionDecision.Retire
                if (generation > identity.generation || type in UnavailableTypes
                    || type == RegisteredType && data.opt(AccountField) != identity.spotifyAccountIdentifier) return SpotifyHostConnectionDecision.Retire
            }
            return SpotifyHostConnectionDecision.Current
        } catch (_failure: Throwable) { return SpotifyHostConnectionDecision.Retire }
    }
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: throw SpotifyConnectFailure(InvalidResponse)
        if (!number.toDouble().isFinite() || number.toDouble() != number.toLong().toDouble()
            || number.toLong() !in FirstIdentifier..SpotifyHostingPolicy.MaximumSafeInteger) throw SpotifyConnectFailure(InvalidResponse)
        return number.toLong()
    }
    companion object {
        private const val MaximumBatchCharacters = 1048576
        private const val MaximumBatchEvents = 4
        private const val FirstIndex = 0
        private const val FirstIdentifier = 1L
        private const val InvalidResponse = "invalid-response"
        private const val HandleField = "handle"
        private const val EventsField = "events"
        private const val GenerationField = "generation"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val AccountField = "accountIdentifier"
        private const val RegisteredType = "registered"
        private const val ConnectingType = "connecting"
        private const val ReconnectingType = "reconnecting"
        private const val StoppedType = "stopped"
        private val UnavailableTypes = setOf(ConnectingType, ReconnectingType, StoppedType)
    }
}

package com.streamingservice.spotify

import org.json.JSONObject

data class SpotifyHostIncomingCommand(val key: String, val request: SpotifyHostCommandRequest?,
    val receivedAtElapsedMilliseconds: Long, val deadlineElapsedMilliseconds: Long)

class SpotifyHostCommandEventDecoder(
    private val clock: SpotifyNativeFollowerClock,
    private val commands: SpotifyHostCommandDecoder = SpotifyHostCommandDecoder()
) {
    fun decode(batch: SpotifyConnectBatch, identity: SpotifyHostIdentity): List<SpotifyHostIncomingCommand> {
        if (batch.finished) return emptyList()
        try {
            if (batch.serialized.length > MaximumBatchCharacters) fail()
            val value = JSONObject(batch.serialized)
            if (integer(value, HandleField) != identity.handle) return emptyList()
            val sampledNativeMilliseconds = integer(value, SampledNativeField)
            val events = value.getJSONArray(EventsField)
            if (events.length() > MaximumBatchEvents) fail()
            return (FirstIndex until events.length()).mapNotNull { position ->
                val event = events.getJSONObject(position)
                val data = event.getJSONObject(DataField)
                if (integer(event, GenerationField) != identity.generation || data.opt(TypeField) != CommandType) return@mapNotNull null
                decode(data, integer(event, ObservedNativeField), sampledNativeMilliseconds, batch)
            }
        } catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail() }
    }
    private fun decode(data: JSONObject, observedNativeMilliseconds: Long, sampledNativeMilliseconds: Long,
        batch: SpotifyConnectBatch): SpotifyHostIncomingCommand {
        val key = data.get(KeyField) as? String ?: fail()
        if (key.isBlank() || key.length > MaximumKeyCharacters || key.any { character -> character.isISOControl() }) fail()
        val now = clock.nowElapsedRealtimeMilliseconds()
        fun refused() = SpotifyHostIncomingCommand(key, null, now, now)
        val started = batch.requestStartedElapsedMilliseconds ?: return refused()
        val completed = batch.requestCompletedElapsedMilliseconds ?: return refused()
        if (started !in MinimumMilliseconds..SpotifyHostingPolicy.MaximumSafeInteger || completed !in started..now
            || completed - started > SpotifyHostingPolicy.MaximumClockUncertaintyMilliseconds) return refused()
        val receivedNative = integer(data, ReceivedNativeField)
        val deadlineNative = integer(data, DeadlineNativeField)
        if (receivedNative > observedNativeMilliseconds || observedNativeMilliseconds > sampledNativeMilliseconds
            || deadlineNative <= receivedNative || deadlineNative - receivedNative > SpotifyHostingPolicy.MaximumIncomingCommandLifetimeMilliseconds) fail()
        val receivedElapsed = started + receivedNative - sampledNativeMilliseconds - SpotifyHostingPolicy.NativeClockPrecisionMilliseconds
        val deadlineElapsed = started + deadlineNative - sampledNativeMilliseconds - SpotifyHostingPolicy.NativeClockPrecisionMilliseconds
        if (receivedElapsed < MinimumMilliseconds || deadlineElapsed <= now || deadlineElapsed > SpotifyHostingPolicy.MaximumSafeInteger) return refused()
        val request = try { commands.decode(key, data.getJSONObject(RequestField).toString()) } catch (_failure: SpotifyPlayerFailure) { null }
        return SpotifyHostIncomingCommand(key, request, receivedElapsed, deadlineElapsed)
    }
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail()
        if (!number.toDouble().isFinite() || number.toDouble() != number.toLong().toDouble()
            || number.toLong() !in MinimumMilliseconds..SpotifyHostingPolicy.MaximumSafeInteger) fail()
        return number.toLong()
    }
    private fun fail(): Nothing = throw SpotifyConnectFailure(InvalidResponse)
    companion object {
        private const val MaximumBatchCharacters = 1048576
        private const val MaximumBatchEvents = 4
        private const val MaximumKeyCharacters = 2048
        private const val FirstIndex = 0
        private const val MinimumMilliseconds = 0L
        private const val InvalidResponse = "invalid-response"
        private const val HandleField = "handle"
        private const val GenerationField = "generation"
        private const val SampledNativeField = "sampledNativeMonotonicMilliseconds"
        private const val EventsField = "events"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val CommandType = "command"
        private const val ObservedNativeField = "observedMonotonicMilliseconds"
        private const val KeyField = "key"
        private const val ReceivedNativeField = "receivedNativeMonotonicMilliseconds"
        private const val DeadlineNativeField = "deadlineNativeMonotonicMilliseconds"
        private const val RequestField = "request"
    }
}

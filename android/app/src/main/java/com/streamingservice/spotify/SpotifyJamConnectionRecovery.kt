package com.streamingservice.spotify

import org.json.JSONObject
import java.util.concurrent.Executor

class SpotifyJamConnectionRecovery(
    private val executor: Executor,
    private val unavailable: (Long, Long) -> Unit,
    private val registered: (Long, Long, String) -> Unit,
    private val stopped: (Long, Long) -> Unit,
    private val retire: () -> Unit
) {
    fun accept(batch: SpotifyConnectBatch) {
        try {
            val value = JSONObject(batch.serialized)
            val handle = value.getLong(HandleField)
            val events = value.getJSONArray(EventsField)
            for (eventIndex in FirstIndex until events.length()) {
                val event = events.getJSONObject(eventIndex)
                val generation = event.getLong(GenerationField)
                val data = event.getJSONObject(DataField)
                when (data.getString(TypeField)) {
                    ConnectingType, ReconnectingType -> unavailable(handle, generation)
                    RegisteredType -> {
                        val account = data.getString(AccountField)
                        executor.execute { registered(handle, generation, account) }
                    }
                    StoppedType -> executor.execute { stopped(handle, generation) }
                }
            }
        } catch (_failure: Throwable) {
            retire()
        }
    }
    companion object {
        private const val FirstIndex = 0
        private const val HandleField = "handle"
        private const val EventsField = "events"
        private const val GenerationField = "generation"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val AccountField = "accountIdentifier"
        private const val ConnectingType = "connecting"
        private const val ReconnectingType = "reconnecting"
        private const val RegisteredType = "registered"
        private const val StoppedType = "stopped"
    }
}

package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SpotifyJamConnectionRecoveryTest {
    @Test fun interruptionIsImmediateWhileRegistrationAndStopAreSerialized() {
        val pending = mutableListOf<Runnable>()
        val calls = mutableListOf<String>()
        val recovery = SpotifyJamConnectionRecovery(pending::add,
            { _, _ -> calls.add(Reconnecting) }, { _, _, _ -> calls.add(Registered) },
            { _, _ -> calls.add(Stopped) }, { calls.add(Failed) })
        recovery.accept(batch(Reconnecting, Registered, Stopped))
        assertEquals(listOf(Reconnecting), calls)
        pending.forEach(Runnable::run)
        assertEquals(listOf(Reconnecting, Registered, Stopped), calls)
    }
    @Test fun malformedBatchAndRejectedExecutorRetireInsteadOfLeavingUnobservedPlayback() {
        var retirements = EmptyCount
        val recovery = SpotifyJamConnectionRecovery({ throw IllegalStateException(Failed) }, { _, _ -> Unit },
            { _, _, _ -> Unit }, { _, _ -> Unit }, { retirements += SingleCount })
        recovery.accept(batch(Registered))
        recovery.accept(SpotifyConnectBatch(Failed, false))
        assertEquals(DoubleCount, retirements)
    }
    @Test fun unrelatedNativeEventsDoNotChangeTheFollower() {
        var calls = EmptyCount
        val recovery = SpotifyJamConnectionRecovery(Runnable::run, { _, _ -> calls += SingleCount },
            { _, _, _ -> calls += SingleCount }, { _, _ -> calls += SingleCount }, { calls += SingleCount })
        recovery.accept(batch(Cluster))
        assertEquals(EmptyCount, calls)
    }
    private fun batch(vararg types: String): SpotifyConnectBatch {
        val events = JSONArray()
        types.forEach { type -> events.put(JSONObject().put(GenerationField, Generation)
            .put(DataField, JSONObject().put(TypeField, type).put(AccountField, Account))) }
        return SpotifyConnectBatch(JSONObject().put(HandleField, Handle).put(EventsField, events).toString(), false)
    }
    companion object {
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val DoubleCount = 2
        private const val Handle = 7L
        private const val Generation = 3L
        private const val Account = "synthetic-account"
        private const val Reconnecting = "reconnecting"
        private const val Registered = "registered"
        private const val Stopped = "stopped"
        private const val Cluster = "cluster"
        private const val Failed = "failed"
        private const val HandleField = "handle"
        private const val EventsField = "events"
        private const val GenerationField = "generation"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val AccountField = "accountIdentifier"
    }
}

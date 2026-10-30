package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SpotifyHostConnectionEventsTest {
    private val events = SpotifyHostConnectionEvents()
    private val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
    @Test fun sameConnectionRegistrationAndNormalEventsRetainHosting() {
        assertEquals(SpotifyHostConnectionDecision.Current, events.inspect(batch(), identity))
        assertEquals(SpotifyHostConnectionDecision.Current, events.inspect(batch(type = Command), identity))
    }
    @Test fun connectingReconnectingAndStoppedImmediatelyRetireHosting() {
        for (type in listOf(Connecting, Reconnecting, Stopped)) assertEquals(SpotifyHostConnectionDecision.Retire, events.inspect(batch(type = type), identity))
    }
    @Test fun higherGenerationCannotAutomaticallyReactivateHosting() {
        assertEquals(SpotifyHostConnectionDecision.Retire, events.inspect(batch(generation = NextGeneration), identity))
    }
    @Test fun oldGenerationsAndForeignHandlesCannotRetireTheCurrentHost() {
        assertEquals(SpotifyHostConnectionDecision.Current, events.inspect(batch(generation = PreviousGeneration, type = Stopped), identity))
        assertEquals(SpotifyHostConnectionDecision.Ignore, events.inspect(batch(handle = ForeignHandle, type = Stopped), identity))
    }
    @Test fun registeredAccountReplacementAndFinalBatchRetireHosting() {
        assertEquals(SpotifyHostConnectionDecision.Retire, events.inspect(batch(account = OtherAccount), identity))
        assertEquals(SpotifyHostConnectionDecision.Retire, events.inspect(batch().copy(finished = true), identity))
    }
    @Test fun malformedOrCoercedEnvelopesFailClosed() {
        assertEquals(SpotifyHostConnectionDecision.Retire, events.inspect(SpotifyConnectBatch(InvalidJson, false, true), identity))
        val value = JSONObject(batch().serialized).put(HandleField, Handle.toString())
        assertEquals(SpotifyHostConnectionDecision.Retire, events.inspect(batch().copy(serialized = value.toString()), identity))
    }
    private fun batch(handle: Long = Handle, generation: Long = Generation, type: String = Registered, account: String = SpotifyAccount): SpotifyConnectBatch =
        SpotifyConnectBatch(JSONObject().put(HandleField, handle).put(EventsField, JSONArray().put(JSONObject().put(GenerationField, generation)
            .put(DataField, JSONObject().put(TypeField, type).put(AccountField, account)))).toString(), false, true)
    companion object {
        private const val Account = "synthetic-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val OtherAccount = "synthetic-other-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Handle = 3L
        private const val ForeignHandle = 4L
        private const val Generation = 7L
        private const val PreviousGeneration = 6L
        private const val NextGeneration = 8L
        private const val InvalidJson = "synthetic-invalid-json"
        private const val Registered = "registered"
        private const val Connecting = "connecting"
        private const val Reconnecting = "reconnecting"
        private const val Stopped = "stopped"
        private const val Command = "command"
        private const val HandleField = "handle"
        private const val EventsField = "events"
        private const val GenerationField = "generation"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val AccountField = "accountIdentifier"
    }
}

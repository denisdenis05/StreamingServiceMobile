package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyHostCommandEventDecoderTest {
    private var now = CompletedElapsedMilliseconds
    private val decoder = SpotifyHostCommandEventDecoder(SpotifyNativeFollowerClock { now })
    private val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))

    @Test fun nativeDeadlineMapsConservativelyFromTheActualPollStart() {
        val command = decoder.decode(batch(), identity).single()
        assertEquals(ExpectedReceivedElapsedMilliseconds, command.receivedAtElapsedMilliseconds)
        assertEquals(ExpectedDeadlineElapsedMilliseconds, command.deadlineElapsedMilliseconds)
        assertEquals(SpotifyHostCommand.Pause, command.request?.command)
    }
    @Test fun delayedDeliveryNeverRenewsTheOriginalPermissionWindow() {
        val original = decoder.decode(batch(), identity).single()
        now = ExpectedDeadlineElapsedMilliseconds - BeforeDeadlineMilliseconds
        assertEquals(original, decoder.decode(batch(), identity).single())
        now = ExpectedDeadlineElapsedMilliseconds
        assertNull(decoder.decode(batch(), identity).single().request)
    }
    @Test fun missingOrUncertainPollBracketsRefuseExecution() {
        val original = batch()
        assertNull(decoder.decode(original.copy(requestStartedElapsedMilliseconds = null), identity).single().request)
        assertNull(decoder.decode(original.copy(requestCompletedElapsedMilliseconds = null), identity).single().request)
        assertNull(decoder.decode(original.copy(requestStartedElapsedMilliseconds = MinimumElapsedMilliseconds), identity).single().request)
        assertNull(decoder.decode(original.copy(requestCompletedElapsedMilliseconds = FutureElapsedMilliseconds), identity).single().request)
    }
    @Test fun oldHandlesGenerationsAndFinishedBatchesCannotDispatch() {
        assertTrue(decoder.decode(batch(), identity.copy(handle = OtherHandle)).isEmpty())
        assertTrue(decoder.decode(batch(), identity.copy(generation = OtherGeneration)).isEmpty())
        assertTrue(decoder.decode(batch().copy(finished = true), identity).isEmpty())
    }
    @Test fun unsupportedCommandsRetainTheirKeyForNegativeAcknowledgement() {
        val value = envelope(); value.getJSONArray(EventsField).getJSONObject(FirstIndex).getJSONObject(DataField)
            .getJSONObject(RequestField).getJSONObject(CommandField).put(EndpointField, UnsupportedEndpoint)
        val command = decoder.decode(batch(value), identity).single()
        assertEquals(Key, command.key); assertNull(command.request)
    }
    @Test fun invalidNativeChronologyAndExcessiveLifetimeFailSafely() {
        for ((field, value) in listOf(ReceivedField to FutureNativeMilliseconds, DeadlineField to ReceivedNativeMilliseconds,
            DeadlineField to ExcessiveDeadlineMilliseconds, ReceivedField to ReceivedNativeMilliseconds.toString())) {
            val envelope = envelope(); envelope.getJSONArray(EventsField).getJSONObject(FirstIndex).getJSONObject(DataField).put(field, value)
            try { decoder.decode(batch(envelope), identity); throw AssertionError(ExpectedFailure) }
            catch (failure: SpotifyConnectFailure) { assertEquals(InvalidResponse, failure.code) }
        }
    }
    @Test fun nonCommandEventsNeverProducePlayerActions() {
        val value = envelope(); value.getJSONArray(EventsField).getJSONObject(FirstIndex).getJSONObject(DataField).put(TypeField, ClusterType)
        assertTrue(decoder.decode(batch(value), identity).isEmpty())
    }
    private fun batch(value: JSONObject = envelope()) = SpotifyConnectBatch(value.toString(), false, true, StartedElapsedMilliseconds, CompletedElapsedMilliseconds)
    private fun envelope(): JSONObject = JSONObject().put(HandleField, Handle).put(SampledField, SampledNativeMilliseconds)
        .put(EventsField, JSONArray().put(JSONObject().put(GenerationField, Generation).put(ObservedField, ObservedNativeMilliseconds)
            .put(DataField, JSONObject().put(TypeField, CommandType).put(KeyField, Key).put(ReceivedField, ReceivedNativeMilliseconds)
                .put(DeadlineField, DeadlineNativeMilliseconds).put(RequestField, JSONObject().put(MessageField, MessageIdentifier)
                    .put(SenderField, Sender).put(CommandField, JSONObject().put(EndpointField, PauseEndpoint))))))
    companion object {
        private const val Account = "synthetic-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Sender = "synthetic-sender"
        private const val Key = "synthetic-command-key"
        private const val Handle = 3L
        private const val OtherHandle = 4L
        private const val Generation = 7L
        private const val OtherGeneration = 8L
        private const val MessageIdentifier = 42L
        private const val ReceivedNativeMilliseconds = 1000L
        private const val ObservedNativeMilliseconds = 1010L
        private const val SampledNativeMilliseconds = 1500L
        private const val DeadlineNativeMilliseconds = 11000L
        private const val StartedElapsedMilliseconds = 5000L
        private const val CompletedElapsedMilliseconds = 5020L
        private const val ExpectedReceivedElapsedMilliseconds = 4498L
        private const val ExpectedDeadlineElapsedMilliseconds = 14498L
        private const val BeforeDeadlineMilliseconds = 1L
        private const val MinimumElapsedMilliseconds = 0L
        private const val FutureElapsedMilliseconds = 6000L
        private const val FutureNativeMilliseconds = 2000L
        private const val ExcessiveDeadlineMilliseconds = 11001L
        private const val FirstIndex = 0
        private const val ExpectedFailure = "Expected safe timing rejection"
        private const val InvalidResponse = "invalid-response"
        private const val HandleField = "handle"
        private const val GenerationField = "generation"
        private const val SampledField = "sampledNativeMonotonicMilliseconds"
        private const val EventsField = "events"
        private const val ObservedField = "observedMonotonicMilliseconds"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val CommandType = "command"
        private const val ClusterType = "cluster"
        private const val KeyField = "key"
        private const val ReceivedField = "receivedNativeMonotonicMilliseconds"
        private const val DeadlineField = "deadlineNativeMonotonicMilliseconds"
        private const val RequestField = "request"
        private const val MessageField = "message_id"
        private const val SenderField = "sent_by_device_id"
        private const val CommandField = "command"
        private const val EndpointField = "endpoint"
        private const val PauseEndpoint = "pause"
        private const val UnsupportedEndpoint = "transfer"
    }
}

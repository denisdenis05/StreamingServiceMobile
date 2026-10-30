package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture

class SpotifyHostCommandDispatcherTest {
    private class Timer(val action: () -> Unit, var cancelled: Boolean = false)
    private class Fixture {
        var now = ElapsedMilliseconds
        var current = true
        var failures = EmptyCount
        var cancellations = EmptyCount
        var samples = EmptyCount
        val timers = mutableListOf<Timer>()
        val receipts = mutableListOf<SpotifyHostPlayerAccepted>()
        val replies = mutableListOf<Pair<String, Boolean>>()
        var acknowledgement = CompletableFuture.completedFuture(Unit)
        var sampling: CompletableFuture<SpotifyHostPlayerQueue>? = null
        val operations = mutableListOf<Pair<SpotifyHostCommandRequest, CompletableFuture<SpotifyHostPlayerAccepted>>>()
        val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        val cursor = SpotifyHostPlayerCursor(QueueIdentifier, Revision, Revision, Revision)
        val snapshot = SpotifyHostPlayerSnapshot(identity, cursor, Occurrence, PositionMilliseconds, DurationMilliseconds, now, true, true, false, true)
        val queue = SpotifyHostPlayerQueue(snapshot, listOf(SpotifyHostQueueEntry(Occurrence, Recording)), false, RepeatMode, PlaybackRate)
        val player = object : SpotifyHostPlayer {
            override fun sampleQueue(identity: SpotifyHostIdentity): CompletableFuture<SpotifyHostPlayerQueue> {
                samples += SingleCount; return sampling ?: CompletableFuture.completedFuture(queue)
            }
            override fun execute(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor, request: SpotifyHostCommandRequest,
                receivedAtElapsedMilliseconds: Long, deadlineElapsedMilliseconds: Long): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> {
                assertEquals(cursor, expected); assertEquals(ReceivedElapsedMilliseconds, receivedAtElapsedMilliseconds)
                assertEquals(DeadlineElapsedMilliseconds, deadlineElapsedMilliseconds)
                val result = CompletableFuture<SpotifyHostPlayerAccepted>(); operations.add(request to result)
                return SpotifyPlayerOperation(result) { cancellations += SingleCount }
            }
            override fun pause(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor): CompletableFuture<Unit> = throw UnsupportedOperationException()
            override fun retire() { throw UnsupportedOperationException() }
        }
        val transport = object : SpotifyHostControlTransport {
            override fun reply(identity: SpotifyHostIdentity, key: String, accepted: Boolean): SpotifyPlayerOperation<Unit> {
                replies.add(key to accepted); return SpotifyPlayerOperation(acknowledgement) {}
            }
            override fun registration(identity: SpotifyHostIdentity): SpotifyPlayerOperation<SpotifyHostNativeRegistration> = throw UnsupportedOperationException()
            override fun preflight(identity: SpotifyHostIdentity, expectedHostDeviceIdentifier: String): SpotifyPlayerOperation<SpotifyHostClockAnchor> = throw UnsupportedOperationException()
            override fun retirementAnchor(identity: SpotifyHostIdentity): SpotifyPlayerOperation<SpotifyHostClockAnchor> = throw UnsupportedOperationException()
            override fun activate(identity: SpotifyHostIdentity, queue: SpotifyHostPlayerQueue, snapshot: JSONObject, activation: JSONObject): SpotifyPlayerOperation<Unit> = throw UnsupportedOperationException()
            override fun publish(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> = throw UnsupportedOperationException()
            override fun withdraw(identity: SpotifyHostIdentity, registration: SpotifyHostNativeRegistration): SpotifyPlayerOperation<Unit> = throw UnsupportedOperationException()
            override fun deactivate(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> = throw UnsupportedOperationException()
        }
        val clock = SpotifyNativeFollowerClock { now }
        val dispatcher = SpotifyHostCommandDispatcher(identity, player, transport, SpotifyHostCommandEventDecoder(clock), clock,
            { _, action -> val timer = Timer(action); timers.add(timer); SpotifyNativeFollowerCancellation { timer.cancelled = true } },
            { current }, { receipt -> receipts.add(receipt) }, { failures += SingleCount })
        fun accept(key: String = Key, endpoint: String = Pause, enabled: Boolean = true) {
            if (enabled) dispatcher.setAccepting()
            val request = JSONObject().put(MessageField, MessageIdentifier).put(SenderField, Sender).put(CommandField, JSONObject().put(EndpointField, endpoint))
            val value = JSONObject().put(HandleField, Handle).put(SampledField, NativeMilliseconds).put(EventsField,
                JSONArray().put(JSONObject().put(GenerationField, Generation).put(ObservedField, NativeMilliseconds).put(DataField,
                    JSONObject().put(TypeField, CommandType).put(KeyField, key).put(ReceivedField, NativeMilliseconds)
                        .put(DeadlineField, NativeDeadlineMilliseconds).put(RequestField, request))))
            dispatcher.accept(SpotifyConnectBatch(value.toString(), false, true, ElapsedMilliseconds, ElapsedMilliseconds))
        }
        fun complete(position: Int = FirstIndex) {
            val (request, completion) = operations[position]
            completion.complete(SpotifyHostPlayerAccepted(request, snapshot, emptyList(), emptyList()))
        }
    }
    @Test fun onlyAnActualPlayerReceiptPermitsPositiveAcknowledgement() {
        val fixture = Fixture(); fixture.accept()
        assertTrue(fixture.replies.isEmpty()); assertTrue(fixture.receipts.isEmpty())
        fixture.complete()
        assertEquals(listOf(Key to true), fixture.replies); assertEquals(SingleCount, fixture.receipts.size)
        assertTrue(fixture.timers.single().cancelled)
    }
    @Test fun duplicateDeliveryCannotExecuteOrAcknowledgeTwice() {
        val fixture = Fixture(); fixture.accept(); fixture.accept(); fixture.complete(); fixture.accept()
        assertEquals(SingleCount, fixture.operations.size); assertEquals(SingleCount, fixture.replies.size)
    }
    @Test fun conflictingDuplicateIsRefusedWithoutReplacingTheOriginal() {
        val fixture = Fixture(); fixture.accept(); fixture.accept(endpoint = Resume); fixture.complete()
        assertEquals(listOf(Key to false, Key to true), fixture.replies); assertEquals(SingleCount, fixture.operations.size)
    }
    @Test fun commandsWaitForThePreviousActualReceiptBeforeSamplingThePlayer() {
        val fixture = Fixture(); fixture.accept(); fixture.accept(OtherKey)
        assertEquals(SingleCount, fixture.samples); fixture.complete()
        assertEquals(TwoCount, fixture.samples); assertEquals(TwoCount, fixture.operations.size)
        fixture.complete(SecondIndex); assertEquals(listOf(Key to true, OtherKey to true), fixture.replies)
    }
    @Test fun inactiveAndUnsupportedCommandsNeverReachThePlayer() {
        val fixture = Fixture(); fixture.accept(enabled = false); fixture.accept(OtherKey, Unsupported)
        assertTrue(fixture.operations.isEmpty()); assertEquals(listOf(Key to false, OtherKey to false), fixture.replies)
    }
    @Test fun retirementCancelsTheActiveOperationAndIgnoresItsLateReceipt() {
        val fixture = Fixture(); fixture.accept(); fixture.accept(OtherKey); fixture.dispatcher.retire(); fixture.complete()
        fixture.accept()
        assertEquals(SingleCount, fixture.cancellations); assertTrue(fixture.replies.isEmpty()); assertTrue(fixture.receipts.isEmpty())
        assertFalse(fixture.dispatcher.isReady(fixture.identity)); assertEquals(SingleCount, fixture.operations.size)
    }
    @Test fun samplingCompletionAfterTheOriginalDeadlineCannotExecute() {
        val fixture = Fixture(); fixture.sampling = CompletableFuture(); fixture.accept()
        fixture.now = DeadlineElapsedMilliseconds; fixture.sampling!!.complete(fixture.queue)
        assertTrue(fixture.operations.isEmpty()); assertEquals(listOf(Key to false), fixture.replies)
    }
    @Test fun expiredPendingPlayerOperationRetiresTheDispatcherWithoutALatePositiveReply() {
        val fixture = Fixture(); fixture.accept(); fixture.now = DeadlineElapsedMilliseconds
        fixture.timers.single().action(); fixture.complete()
        assertEquals(SingleCount, fixture.failures); assertEquals(SingleCount, fixture.cancellations)
        assertTrue(fixture.receipts.isEmpty()); assertTrue(fixture.replies.isEmpty())
    }
    @Test fun unknownPlayerOutcomeRetiresInsteadOfDispatchingTheNextCommand() {
        val fixture = Fixture(); fixture.accept(); fixture.accept(OtherKey)
        fixture.operations.single().second.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.UnknownOutcome))
        assertEquals(SingleCount, fixture.failures); assertEquals(SingleCount, fixture.operations.size)
    }
    @Test fun acknowledgementFailureRetiresWithoutReplayingThePlayerMutation() {
        val fixture = Fixture(); fixture.acknowledgement = CompletableFuture(); fixture.accept(); fixture.complete()
        fixture.acknowledgement.completeExceptionally(SpotifyConnectFailure(Network))
        assertEquals(SingleCount, fixture.failures); assertEquals(SingleCount, fixture.operations.size)
    }
    @Test fun replacedAccountDuringSamplingCannotExecuteOrReply() {
        val fixture = Fixture(); fixture.sampling = CompletableFuture(); fixture.accept()
        fixture.current = false; fixture.sampling!!.complete(fixture.queue)
        assertTrue(fixture.operations.isEmpty()); assertTrue(fixture.replies.isEmpty())
    }
    companion object {
        private const val Account = "synthetic-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val QueueIdentifier = "synthetic-queue"
        private const val Occurrence = "synthetic-occurrence"
        private const val Recording = "synthetic-recording"
        private const val Sender = "synthetic-sender"
        private const val Key = "synthetic-command"
        private const val OtherKey = "synthetic-other-command"
        private const val RepeatMode = "off"
        private const val PlaybackRate = 1.0
        private const val Handle = 3L
        private const val Generation = 7L
        private const val Revision = 1L
        private const val PositionMilliseconds = 0L
        private const val DurationMilliseconds = 180000L
        private const val ElapsedMilliseconds = 5000L
        private const val ReceivedElapsedMilliseconds = 4998L
        private const val DeadlineElapsedMilliseconds = 14998L
        private const val NativeMilliseconds = 1000L
        private const val NativeDeadlineMilliseconds = 11000L
        private const val MessageIdentifier = 42L
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val TwoCount = 2
        private const val FirstIndex = 0
        private const val SecondIndex = 1
        private const val Pause = "pause"
        private const val Resume = "resume"
        private const val Unsupported = "transfer"
        private const val Network = "network"
        private const val HandleField = "handle"
        private const val GenerationField = "generation"
        private const val SampledField = "sampledNativeMonotonicMilliseconds"
        private const val EventsField = "events"
        private const val ObservedField = "observedMonotonicMilliseconds"
        private const val DataField = "data"
        private const val TypeField = "type"
        private const val CommandType = "command"
        private const val KeyField = "key"
        private const val ReceivedField = "receivedNativeMonotonicMilliseconds"
        private const val DeadlineField = "deadlineNativeMonotonicMilliseconds"
        private const val RequestField = "request"
        private const val MessageField = "message_id"
        private const val SenderField = "sent_by_device_id"
        private const val CommandField = "command"
        private const val EndpointField = "endpoint"
    }
}

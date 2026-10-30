package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

class SpotifyHostCoordinatorTest {
    private class Decisions : Executor {
        val pending = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { pending.addLast(command) }
        fun drain() { while (pending.isNotEmpty()) pending.removeFirst().run() }
    }
    private class Timer(val action: () -> Unit, var cancelled: Boolean = false)
    private class Fixture {
        val decisions = Decisions()
        val timers = mutableListOf<Timer>()
        var now = ElapsedMilliseconds
        var current = true
        var host = PreviousHost
        var activatedHost = Device
        var onSnapshot: (SpotifyHostSnapshot) -> Unit = {}
        var nextSequence = FirstSequence
        var pauseCount = EmptyCount
        var retired = false
        var externalAuthorityAbsent = true
        var publicationFailure: String? = null
        var demotionFailure: String? = null
        var activationCompletion = CompletableFuture.completedFuture(Unit)
        var sampleCompletion: CompletableFuture<SpotifyHostPlayerQueue>? = null
        val activations = mutableListOf<JSONObject>()
        val publications = mutableListOf<JSONObject>()
        val deactivations = mutableListOf<JSONObject>()
        val snapshots = mutableListOf<SpotifyHostSnapshot>()
        val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        var cursor = SpotifyHostPlayerCursor(QueueIdentifier, Revision, Revision, Revision)
        var recording = Recording
        val mappings = listOf(SpotifyHostRecordingMapping(Occurrence, Recording, Track))
        fun queue(): SpotifyHostPlayerQueue = SpotifyHostPlayerQueue(SpotifyHostPlayerSnapshot(identity, cursor, Occurrence, PositionMilliseconds,
            DurationMilliseconds, now, true, false, false, externalAuthorityAbsent), listOf(SpotifyHostQueueEntry(Occurrence, recording)), false, RepeatMode, PlaybackRate)
        val player = object : SpotifyHostPlayer {
            override fun sampleQueue(identity: SpotifyHostIdentity): CompletableFuture<SpotifyHostPlayerQueue> = sampleCompletion ?: CompletableFuture.completedFuture(queue())
            override fun pause(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor): CompletableFuture<Unit> {
                pauseCount += SingleCount
                return if (expected == cursor) CompletableFuture.completedFuture(Unit) else failed(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Conflict))
            }
            override fun retire() { retired = true }
            override fun execute(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor, request: SpotifyHostCommandRequest,
                receivedAtElapsedMilliseconds: Long, deadlineElapsedMilliseconds: Long): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> = throw UnsupportedOperationException()
        }
        val transport = object : SpotifyHostControlTransport {
            override fun registration(identity: SpotifyHostIdentity) = operation(SpotifyHostNativeRegistration(SpotifyHostPublicationIdentity(Device, NativeSession), nextSequence))
            override fun preflight(identity: SpotifyHostIdentity, expectedHostDeviceIdentifier: String): SpotifyPlayerOperation<SpotifyHostClockAnchor> =
                if (expectedHostDeviceIdentifier == host) operation(anchor()) else SpotifyPlayerOperation(failed(SpotifyConnectFailure(Superseded))) {}
            override fun retirementAnchor(identity: SpotifyHostIdentity) = operation(anchor())
            override fun activate(identity: SpotifyHostIdentity, queue: SpotifyHostPlayerQueue, snapshot: JSONObject, activation: JSONObject): SpotifyPlayerOperation<Unit> {
                activations.add(snapshot); nextSequence = snapshot.getLong(SequenceField) + SequenceIncrement; host = activatedHost
                return SpotifyPlayerOperation(activationCompletion) {}
            }
            override fun publish(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> {
                publications.add(snapshot); nextSequence = snapshot.getLong(SequenceField) + SequenceIncrement
                return publicationFailure?.let { failure -> SpotifyPlayerOperation(failed<Unit>(SpotifyConnectFailure(failure))) {} } ?: operation(Unit)
            }
            override fun deactivate(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> {
                deactivations.add(snapshot)
                return demotionFailure?.let { failure -> SpotifyPlayerOperation(failed<Unit>(SpotifyConnectFailure(failure))) {} } ?: operation(Unit)
            }
            override fun reply(identity: SpotifyHostIdentity, key: String, accepted: Boolean): SpotifyPlayerOperation<Unit> = throw UnsupportedOperationException()
        }
        fun anchor() = SpotifyHostClockAnchor(identity, NativeMilliseconds, NativeMilliseconds, now, ServerMilliseconds + now, PrecisionMilliseconds, host)
        val coordinator = SpotifyHostCoordinator(identity, player, transport, { now },
            { _, action -> val timer = Timer(action); timers.add(timer); SpotifyNativeFollowerCancellation { timer.cancelled = true } },
            decisions, { Request }, { current }, { snapshot -> snapshots.add(snapshot); onSnapshot(snapshot) })
        fun start(): CompletableFuture<SpotifyHostSnapshot> { val result = coordinator.start(PreviousHost, cursor, mappings); decisions.drain(); return result }
        fun tick() { now += PublishIntervalMilliseconds; timers.last().action(); decisions.drain() }
        fun stop(): CompletableFuture<Unit> { val result = coordinator.stop(); decisions.drain(); return result }
        fun <Response> operation(value: Response) = SpotifyPlayerOperation(CompletableFuture.completedFuture(value)) {}
        fun <Response> failed(failure: Throwable) = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(failure) }
    }
    @Test fun hostChangeBeforeActivationConfirmationNeverReportsHosting() {
        val fixture = Fixture(); fixture.activatedHost = ForeignHost
        val result = fixture.start()
        assertTrue(result.isCompletedExceptionally)
        assertTrue(fixture.snapshots.none { snapshot -> snapshot.status == SpotifyHostStatus.Hosting })
        assertEquals(SingleCount, fixture.deactivations.size)
    }
    @Test fun startupDeadlineRetiresALateSamplingResultWithoutActivation() {
        val fixture = Fixture(); fixture.sampleCompletion = CompletableFuture(); val result = fixture.start()
        fixture.timers.first().action(); fixture.decisions.drain()
        assertTrue(result.isCompletedExceptionally)
        fixture.sampleCompletion!!.complete(fixture.queue()); fixture.decisions.drain()
        assertTrue(fixture.activations.isEmpty()); assertTrue(fixture.retired)
    }
    @Test fun reentrantStopFromAStartingObserverCannotActivate() {
        val fixture = Fixture(); fixture.onSnapshot = { snapshot -> if (snapshot.status == SpotifyHostStatus.Starting) fixture.coordinator.stop() }
        val result = fixture.start(); assertTrue(result.isCompletedExceptionally)
        assertTrue(fixture.activations.isEmpty()); assertTrue(fixture.retired)
    }
    @Test fun reentrantStopFromAHostingObserverCannotAcknowledgeTheStart() {
        val fixture = Fixture(); fixture.onSnapshot = { snapshot -> if (snapshot.status == SpotifyHostStatus.Hosting) fixture.coordinator.stop() }
        val result = fixture.start(); assertTrue(result.isCompletedExceptionally)
        assertEquals(SpotifyHostStatus.Stopped, fixture.coordinator.snapshot().status)
        assertEquals(SingleCount, fixture.deactivations.size)
    }
    @Test fun hostingAcknowledgementRequiresActivationAndFreshLocalHostVerification() {
        val fixture = Fixture(); fixture.activationCompletion = CompletableFuture()
        val started = fixture.start(); assertFalse(started.isDone)
        fixture.activationCompletion.complete(Unit); fixture.decisions.drain()
        assertEquals(SpotifyHostStatus.Hosting, started.get().status); assertEquals(SingleCount, fixture.activations.size)
        assertTrue(fixture.coordinator.commandHandlingReady(fixture.identity))
    }
    @Test fun timerPublishesTheActualQueueWithStrictlyIncreasingNativeSequences() {
        val fixture = Fixture(); fixture.start().get(); fixture.tick(); fixture.tick()
        assertEquals(TwoCount, fixture.publications.size)
        assertEquals(FirstSequence + SequenceIncrement, fixture.publications.first().getLong(SequenceField))
        assertEquals(FirstSequence + SequenceIncrement + SequenceIncrement, fixture.publications.last().getLong(SequenceField))
        assertEquals(Occurrence, fixture.publications.last().getJSONObject(TrackField).getString(OccurrenceField))
    }
    @Test fun changedInitialCursorCannotActivate() {
        val fixture = Fixture(); val expected = fixture.cursor; fixture.cursor = fixture.cursor.copy(controlRevision = OtherRevision)
        val result = fixture.coordinator.start(PreviousHost, expected, fixture.mappings); fixture.decisions.drain()
        assertTrue(result.isCompletedExceptionally); assertTrue(fixture.activations.isEmpty()); assertTrue(fixture.retired)
    }
    @Test fun unknownPublicationIsNeverRetriedAndCleanupUsesTheActualNextSequence() {
        val fixture = Fixture(); fixture.start().get(); fixture.publicationFailure = UnknownOutcome; fixture.tick()
        assertEquals(SingleCount, fixture.publications.size); assertEquals(SingleCount, fixture.deactivations.size)
        assertEquals(fixture.nextSequence, fixture.deactivations.single().getLong(SequenceField))
        assertEquals(SpotifyHostStatus.Failed, fixture.coordinator.snapshot().status)
    }
    @Test fun explicitStopPausesDemotesAndRetiresBeforeCompleting() {
        val fixture = Fixture(); fixture.start().get(); val stopped = fixture.stop(); stopped.get()
        assertEquals(SingleCount, fixture.pauseCount); assertEquals(SingleCount, fixture.deactivations.size); assertTrue(fixture.retired)
        assertFalse(fixture.coordinator.commandHandlingReady(fixture.identity)); assertEquals(SpotifyHostStatus.Stopped, fixture.coordinator.snapshot().status)
        assertTrue(fixture.timers.all { timer -> timer.cancelled })
    }
    @Test fun stopDuringActivationWaitsForTheUncertainMutationBeforeDemotion() {
        val fixture = Fixture(); fixture.activationCompletion = CompletableFuture(); fixture.start()
        val stopped = fixture.stop(); assertFalse(stopped.isDone); assertTrue(fixture.deactivations.isEmpty())
        fixture.activationCompletion.completeExceptionally(SpotifyConnectFailure(UnknownOutcome)); fixture.decisions.drain()
        stopped.get(); assertEquals(SingleCount, fixture.deactivations.size)
    }
    @Test fun stopDuringSamplingPreventsLateActivation() {
        val fixture = Fixture(); fixture.sampleCompletion = CompletableFuture(); fixture.start()
        val stopped = fixture.stop(); fixture.sampleCompletion!!.complete(fixture.queue()); fixture.decisions.drain()
        stopped.get(); assertTrue(fixture.activations.isEmpty()); assertTrue(fixture.deactivations.isEmpty())
    }
    @Test fun demotionFailureCannotReportSuccessfulCleanup() {
        val fixture = Fixture(); fixture.start().get(); fixture.demotionFailure = UnknownOutcome
        val stopped = fixture.stop(); assertTrue(stopped.isCompletedExceptionally)
        assertEquals(SpotifyHostStatus.Failed, fixture.coordinator.snapshot().status); assertTrue(fixture.retired)
    }
    @Test fun unexpectedLocalQueueMappingRetiresInsteadOfPublishingAFabricatedTrack() {
        val fixture = Fixture(); fixture.start().get(); fixture.recording = OtherRecording; fixture.tick()
        assertTrue(fixture.publications.isEmpty()); assertEquals(SpotifyHostStatus.Failed, fixture.coordinator.snapshot().status)
    }
    @Test fun foreignHostTakeoverDemotesWithoutPublishingNewAuthority() {
        val fixture = Fixture(); fixture.start().get(); fixture.host = ForeignHost; fixture.tick()
        assertTrue(fixture.publications.isEmpty()); assertEquals(SingleCount, fixture.deactivations.size)
        assertEquals(SpotifyHostStatus.Failed, fixture.coordinator.snapshot().status)
    }
    @Test fun externalAuthorityPreventsActivation() {
        val fixture = Fixture(); fixture.externalAuthorityAbsent = false; val result = fixture.start()
        assertTrue(result.isCompletedExceptionally); assertTrue(fixture.activations.isEmpty())
    }
    @Test fun repeatedStartAndStopNeverRepeatActivationOrDemotion() {
        val fixture = Fixture(); fixture.start().get(); fixture.start().get(); fixture.stop().get(); fixture.stop().get()
        assertEquals(SingleCount, fixture.activations.size); assertEquals(SingleCount, fixture.deactivations.size)
    }
    companion object {
        private const val Account = "synthetic-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val PreviousHost = "synthetic-previous-host"
        private const val ForeignHost = "synthetic-foreign-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val QueueIdentifier = "synthetic-queue"
        private const val Occurrence = "synthetic-occurrence"
        private const val Recording = "synthetic-recording"
        private const val OtherRecording = "synthetic-other-recording"
        private const val Track = "4uLU6hMCjMI75M1A2tKUQC"
        private const val NativeSession = "synthetic-native-session"
        private const val Request = "synthetic-activation-request"
        private const val RepeatMode = "off"
        private const val PlaybackRate = 1.0
        private const val Handle = 3L
        private const val Generation = 7L
        private const val Revision = 1L
        private const val OtherRevision = 2L
        private const val FirstSequence = 9L
        private const val SequenceIncrement = 1L
        private const val PositionMilliseconds = 0L
        private const val DurationMilliseconds = 180000L
        private const val ElapsedMilliseconds = 5000L
        private const val NativeMilliseconds = 1000L
        private const val ServerMilliseconds = 1700000000000L
        private const val PrecisionMilliseconds = 2L
        private const val PublishIntervalMilliseconds = 1000L
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val TwoCount = 2
        private const val SequenceField = "sequence"
        private const val TrackField = "track"
        private const val OccurrenceField = "occurrenceIdentifier"
        private const val Superseded = "superseded"
        private const val UnknownOutcome = "unknown-outcome"
    }
}

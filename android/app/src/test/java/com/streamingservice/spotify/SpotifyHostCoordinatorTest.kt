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
    private class Fixture(mappingEnabled: Boolean = false) {
        var cachedTrack: String? = null
        val mapping = CompletableFuture<String>()
        var mappingCancellations = EmptyCount
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
        var buffering = false
        var paused = false
        var positionMilliseconds = PositionMilliseconds
        var preflightCount = EmptyCount
        var durationMilliseconds: Long? = DurationMilliseconds
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
        fun queue(): SpotifyHostPlayerQueue = SpotifyHostPlayerQueue(SpotifyHostPlayerSnapshot(identity, cursor, Occurrence, positionMilliseconds,
            durationMilliseconds, now, !buffering, paused, buffering, externalAuthorityAbsent), listOf(SpotifyHostQueueEntry(Occurrence, recording)), false, RepeatMode, PlaybackRate)
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
                run { preflightCount += SingleCount
                    if (expectedHostDeviceIdentifier == host) operation(anchor()) else SpotifyPlayerOperation(failed(SpotifyConnectFailure(Superseded))) {} }
            override fun retirementAnchor(identity: SpotifyHostIdentity) = operation(anchor())
            override fun activate(identity: SpotifyHostIdentity, queue: SpotifyHostPlayerQueue, snapshot: JSONObject, activation: JSONObject): SpotifyPlayerOperation<Unit> {
                activations.add(snapshot); nextSequence = snapshot.getLong(SequenceField) + SequenceIncrement; host = activatedHost
                return SpotifyPlayerOperation(activationCompletion) {}
            }
            override fun publish(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> {
                publications.add(snapshot); nextSequence = snapshot.getLong(SequenceField) + SequenceIncrement
                return publicationFailure?.let { failure -> SpotifyPlayerOperation(failed<Unit>(SpotifyConnectFailure(failure))) {} } ?: operation(Unit)
            }
            override fun withdraw(identity: SpotifyHostIdentity, registration: SpotifyHostNativeRegistration): SpotifyPlayerOperation<Unit> {
                deactivations.add(JSONObject().put(SequenceField, registration.nextPublicationSequence))
                return demotionFailure?.let { failure -> SpotifyPlayerOperation(failed<Unit>(SpotifyConnectFailure(failure))) {} } ?: operation(Unit)
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
            decisions, { Request }, { current }, { snapshot -> snapshots.add(snapshot); onSnapshot(snapshot) },
            if (!mappingEnabled) null else object : SpotifyHostQueueMappingSource {
                override fun cached(identity: SpotifyHostIdentity, recordingIdentifier: String): String? = cachedTrack
                override fun resolve(identity: SpotifyHostIdentity, recordingIdentifier: String): SpotifyPlayerOperation<String> = SpotifyPlayerOperation(mapping) {
                    mappingCancellations += SingleCount; mapping.completeExceptionally(SpotifyConnectFailure(Superseded))
                }
            })
        fun start(): CompletableFuture<SpotifyHostSnapshot> { val result = coordinator.start(PreviousHost, cursor, mappings); decisions.drain(); return result }
        fun tick(elapsedMilliseconds: Long = HeartbeatMilliseconds) { now += elapsedMilliseconds; timers.last().action(); decisions.drain() }
        fun stop(): CompletableFuture<Unit> { val result = coordinator.stop(); decisions.drain(); return result }
        fun <Response> operation(value: Response) = SpotifyPlayerOperation(CompletableFuture.completedFuture(value)) {}
        fun <Response> failed(failure: Throwable) = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(failure) }
    }
    @Test fun newQueueEntriesPauseAndResolveThroughBackgroundWorkBeforeFreshPublication() {
        val fixture = Fixture(true); fixture.start().get(); fixture.recording = OtherRecording; fixture.tick()
        assertEquals(SpotifyHostStatus.Resolving, fixture.coordinator.snapshot().status); assertEquals(SingleCount, fixture.pauseCount)
        assertTrue(fixture.publications.isEmpty()); fixture.mapping.complete(Track); fixture.decisions.drain()
        assertEquals(SpotifyHostStatus.Hosting, fixture.coordinator.snapshot().status); assertEquals(SingleCount, fixture.publications.size)
    }
    @Test fun preparedLocalSelectionPublishesTheActualOccurrenceWithoutPausingOrRestartingHosting() {
        val fixture = Fixture(true); fixture.start().get(); fixture.cachedTrack = Track; fixture.recording = OtherRecording
        val requested = fixture.coordinator.publishLocalChanges(); fixture.decisions.drain(); requested.get()
        assertEquals(EmptyCount, fixture.pauseCount); assertEquals(SingleCount, fixture.publications.size)
        assertEquals(SingleCount, fixture.activations.size); assertTrue(fixture.deactivations.isEmpty())
        assertEquals(Occurrence, fixture.publications.single().getJSONObject(TrackField).getString(OccurrenceField))
    }
    @Test fun preparingLocalOutputKeepsTheJamActiveUntilTheActualDurationIsAvailable() {
        val fixture = Fixture(); fixture.start().get(); fixture.buffering = true; fixture.durationMilliseconds = null; fixture.tick()
        assertTrue(fixture.publications.isEmpty()); assertTrue(fixture.deactivations.isEmpty()); assertEquals(EmptyCount, fixture.pauseCount)
        fixture.durationMilliseconds = DurationMilliseconds; fixture.buffering = false; fixture.tick()
        assertEquals(SingleCount, fixture.publications.size); assertEquals(SingleCount, fixture.activations.size)
    }
    @Test fun preparingOutputCannotKeepAnUnpublishableHostActiveBeyondItsDeadline() {
        val fixture = Fixture(); fixture.start().get(); fixture.buffering = true; fixture.durationMilliseconds = null; fixture.tick()
        fixture.now += PlayerPreparationDeadlineMilliseconds; fixture.tick()
        assertEquals(SpotifyHostStatus.Failed, fixture.coordinator.snapshot().status); assertEquals(SingleCount, fixture.deactivations.size)
    }
    @Test fun localPublicationDuringAnOutstandingSampleCoalescesTheIdenticalFollowup() {
        val fixture = Fixture(); fixture.start().get(); fixture.sampleCompletion = CompletableFuture(); fixture.tick()
        fixture.coordinator.publishLocalChanges(); fixture.decisions.drain()
        val pending = fixture.sampleCompletion!!; fixture.sampleCompletion = null; pending.complete(fixture.queue()); fixture.decisions.drain()
        assertEquals(SingleCount, fixture.publications.size); assertEquals(EmptyCount, fixture.pauseCount)
    }
    @Test fun reentrantStopFromResolvingCannotIssueANewPauseOrMapping() {
        val fixture = Fixture(true); fixture.start().get()
        fixture.onSnapshot = { snapshot -> if (snapshot.status == SpotifyHostStatus.Resolving) fixture.coordinator.stop() }
        fixture.recording = OtherRecording; fixture.tick()
        assertEquals(SingleCount, fixture.pauseCount); assertEquals(SpotifyHostStatus.Stopped, fixture.coordinator.snapshot().status)
        assertTrue(fixture.publications.isEmpty()); assertFalse(fixture.mapping.isDone)
    }
    @Test fun stoppingBackgroundMappingCancelsTheJobAndStillWithdraws() {
        val fixture = Fixture(true); fixture.start().get(); fixture.recording = OtherRecording; fixture.tick()
        fixture.stop().get(); assertEquals(SingleCount, fixture.mappingCancellations); assertEquals(SingleCount, fixture.deactivations.size)
        assertTrue(fixture.publications.isEmpty())
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
    @Test fun rateLimitedPublicationStopsWithoutAutomaticRetryOrExtraSampling() {
        val fixture = Fixture(); fixture.start().get(); fixture.publicationFailure = RateLimited; fixture.tick()
        assertEquals(SingleCount, fixture.publications.size); assertEquals(SingleCount, fixture.deactivations.size)
        assertEquals(RateLimited, fixture.coordinator.snapshot().failure)
        assertEquals(SpotifyHostFailureStage.Publication, fixture.coordinator.snapshot().failureStage)
        fixture.coordinator.publishLocalChanges(); fixture.decisions.drain()
        assertEquals(SingleCount, fixture.publications.size)
        assertTrue(fixture.timers.all { timer -> timer.cancelled })
    }
    @Test fun asynchronousActivationRetainsWrappedSafeCategoryAndActivationStage() {
        val fixture = Fixture()
        fixture.activationCompletion = fixture.failed(java.util.concurrent.CompletionException(java.util.concurrent.ExecutionException(SpotifyConnectFailure(UnknownOutcome))))
        val started = fixture.start()
        assertTrue(started.isCompletedExceptionally)
        assertEquals(UnknownOutcome, fixture.coordinator.snapshot().failure)
        assertEquals(SpotifyHostFailureStage.NativeActivation, fixture.coordinator.snapshot().failureStage)
    }
    @Test fun publicationAndCleanupFailuresReportTheirActualStages() {
        val publication = Fixture(); publication.start().get(); publication.publicationFailure = UnknownOutcome; publication.tick()
        assertEquals(SpotifyHostFailureStage.Publication, publication.coordinator.snapshot().failureStage)
        val cleanup = Fixture(); cleanup.start().get(); cleanup.demotionFailure = UnknownOutcome; cleanup.stop()
        assertEquals(SpotifyHostFailureStage.Cleanup, cleanup.coordinator.snapshot().failureStage)
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
        assertEquals(SingleCount, fixture.deactivations.size)
    }
    @Test fun missingPlayerQueueAfterStartupCannotBlockNativeWithdrawal() {
        val fixture = Fixture(); fixture.start().get(); fixture.sampleCompletion = fixture.failed(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable))
        fixture.stop().get(); assertEquals(SingleCount, fixture.deactivations.size)
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
    @Test fun unchangedPausedPlayerSamplesDoNotPreflightOrPublishUntilHeartbeat() {
        val fixture = Fixture(); fixture.paused = true; fixture.start().get()
        val startupPreflightCount = fixture.preflightCount
        repeat(HeartbeatSampleCount - SingleCount) { fixture.tick(PublishIntervalMilliseconds) }
        assertTrue(fixture.publications.isEmpty()); assertEquals(startupPreflightCount, fixture.preflightCount)
        fixture.tick(PublishIntervalMilliseconds)
        assertEquals(SingleCount, fixture.publications.size)
        assertEquals(startupPreflightCount + SingleCount, fixture.preflightCount)
    }
    @Test fun duplicateLocalNotificationsDoNotPublishButPauseChangesPublishImmediately() {
        val fixture = Fixture(); fixture.start().get()
        repeat(HeartbeatSampleCount) { fixture.coordinator.publishLocalChanges() }; fixture.decisions.drain()
        assertTrue(fixture.publications.isEmpty())
        fixture.paused = true; fixture.coordinator.publishLocalChanges(); fixture.decisions.drain()
        assertEquals(SingleCount, fixture.publications.size)
        fixture.coordinator.publishLocalChanges(); fixture.decisions.drain()
        assertEquals(SingleCount, fixture.publications.size)
    }
    @Test fun normalPlayingProgressDoesNotPublishEverySample() {
        val fixture = Fixture(); fixture.start().get()
        repeat(HeartbeatSampleCount - SingleCount) {
            fixture.positionMilliseconds += PublishIntervalMilliseconds; fixture.tick(PublishIntervalMilliseconds)
        }
        assertTrue(fixture.publications.isEmpty())
        fixture.positionMilliseconds += PublishIntervalMilliseconds; fixture.tick(PublishIntervalMilliseconds)
        assertEquals(SingleCount, fixture.publications.size)
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
        private const val PublishIntervalMilliseconds = SpotifyHostingPolicy.HostPlayerSampleIntervalMilliseconds
        private const val HeartbeatMilliseconds = SpotifyHostingPolicy.HostPublicationHeartbeatMilliseconds
        private const val HeartbeatSampleCount = 10
        private const val PlayerPreparationDeadlineMilliseconds = 15000L
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val TwoCount = 2
        private const val SequenceField = "sequence"
        private const val TrackField = "track"
        private const val OccurrenceField = "occurrenceIdentifier"
        private const val Superseded = "superseded"
        private const val UnknownOutcome = "unknown-outcome"
        private const val RateLimited = "rate-limited"
    }
}

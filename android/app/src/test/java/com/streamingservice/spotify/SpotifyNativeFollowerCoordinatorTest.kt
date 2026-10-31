package com.streamingservice.spotify

import com.streamingservice.player.bridge.PlayerOperation
import com.streamingservice.player.bridge.PlayerProtocol
import com.streamingservice.player.bridge.ProtocolFields
import com.streamingservice.player.playback.AudioOutputStatus
import com.streamingservice.player.playback.MediaServer
import com.streamingservice.player.playback.QueueAudioOutput
import com.streamingservice.player.playback.StreamingPlaybackCoordinator
import com.streamingservice.player.queue.PlaybackIntent
import com.streamingservice.player.queue.QueueState
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

class SpotifyNativeFollowerCoordinatorTest {
    private class MainQueue : Executor {
        val operations = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { operations.addLast(command) }
        fun drain() { while (operations.isNotEmpty()) operations.removeFirst().run() }
    }
    private class Clock : SpotifyNativeFollowerClock {
        var elapsedMilliseconds = InitialElapsedMilliseconds
        override fun nowElapsedRealtimeMilliseconds(): Long = elapsedMilliseconds
    }
    private class Scheduler(private val clock: Clock) : SpotifyNativeFollowerScheduler {
        data class Task(val dueMilliseconds: Long, val action: () -> Unit, var cancelled: Boolean = false)
        val tasks = mutableListOf<Task>()
        override fun schedule(delayMilliseconds: Long, action: () -> Unit): SpotifyNativeFollowerCancellation {
            val task = Task(clock.elapsedMilliseconds + delayMilliseconds, action)
            tasks.add(task)
            return SpotifyNativeFollowerCancellation { task.cancelled = true }
        }
        fun fireDue() {
            tasks.filter { task -> !task.cancelled && task.dueMilliseconds <= clock.elapsedMilliseconds }.toList().forEach { task -> task.cancelled = true; task.action() }
        }
    }
    private class Output : QueueAudioOutput {
        override var positionMilliseconds = InitialPositionMilliseconds
        override var durationMilliseconds: Long? = LocalDurationMilliseconds
        override val bufferedPositionMilliseconds get() = positionMilliseconds
        override var playing = false
        override var seekable = true
        override var playbackStatus = AudioOutputStatus.Ready
        val states = mutableListOf<QueueState>()
        override fun reconcile(state: QueueState, resetPosition: Boolean) {
            states.add(state)
            if (resetPosition) positionMilliseconds = InitialPositionMilliseconds
            playing = state.playbackIntent == PlaybackIntent.Play && playbackStatus == AudioOutputStatus.Ready
        }
        override fun pause() { playing = false }
        override fun stop() { playing = false }
        override fun seek(positionMilliseconds: Long) { this.positionMilliseconds = positionMilliseconds }
        override fun setRate(playbackRate: Double) = Unit
    }
    private class Source(private val clock: Clock) : SpotifyNativeFollowerObservationSource {
        data class Request(val identity: SpotifyNativeFollowerIdentity, val result: CompletableFuture<SpotifyConnectPlaybackObservation>, var cancelled: Boolean = false)
        val requests = mutableListOf<Request>()
        var automatic = true
        var occurrenceIdentifier = FirstOccurrence
        var trackIdentifier = FirstTrack
        var positionMilliseconds = SourcePositionMilliseconds
        var durationMilliseconds = SourceDurationMilliseconds
        var progressing = true
        var buffering = false
        var uncertaintyMilliseconds = SourceUncertaintyMilliseconds
        var failure: Throwable? = null
        fun observation(identity: SpotifyNativeFollowerIdentity): SpotifyConnectPlaybackObservation = SpotifyConnectPlaybackObservation(
            identity.handle, identity.generation, identity.hostDeviceIdentifier, QueueRevision, trackIdentifier, occurrenceIdentifier,
            positionMilliseconds, durationMilliseconds, progressing, buffering, clock.elapsedMilliseconds.toDouble(), clock.elapsedMilliseconds,
            uncertaintyMilliseconds, ServerMilliseconds, ServerMilliseconds
        )
        override fun read(identity: SpotifyNativeFollowerIdentity): SpotifyFollowerOperation<SpotifyConnectPlaybackObservation> {
            val request = Request(identity, CompletableFuture())
            requests.add(request)
            if (automatic) { if (failure == null) request.result.complete(observation(identity)) else request.result.completeExceptionally(requireNotNull(failure)) }
            return SpotifyFollowerOperation(request.result) { request.cancelled = true }
        }
    }
    private class Resolver : SpotifyNativeFollowerRecordingResolver {
        data class Request(val identity: SpotifyNativeFollowerIdentity, val trackIdentifier: String, val result: CompletableFuture<SpotifyFollowerRecordingResolution>, var cancelled: Boolean = false)
        val requests = mutableListOf<Request>()
        var automatic = true
        var selected: SpotifyFollowerRecordingResolution = SpotifyFollowerRecordingResolution.Matched(SpotifyFollowerRecording(RecordingIdentifier, RecordingTitle, RecordingArtist))
        override fun resolve(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<SpotifyFollowerRecordingResolution> {
            val request = Request(identity, spotifyTrackIdentifier, CompletableFuture())
            requests.add(request)
            if (automatic) request.result.complete(selected)
            return SpotifyFollowerOperation(request.result) { request.cancelled = true }
        }
    }
    private class Fixture {
        val mainQueue = MainQueue()
        val clock = Clock()
        val scheduler = Scheduler(clock)
        val output = Output()
        var sequence = EmptyCount
        val actual = StreamingPlaybackCoordinator(output, MediaServer(), { RandomValue }, { clock.elapsedMilliseconds }, { IdentifierPrefix + ++sequence })
        val commands = mutableListOf<JSONObject>()
        var beforeExecute: (JSONObject) -> Unit = {}
        val adapter = object : SpotifyPlayerCoordinator {
            override fun configure(baseAddress: String, accessToken: String) = actual.configure(baseAddress, accessToken)
            override fun clearSession() = actual.clearSession()
            override fun playbackOutputReady(): Boolean = actual.playbackOutputReady()
            override fun snapshot(): JSONObject = actual.snapshot()
            override fun execute(payload: String): String {
                val command = JSONObject(payload); beforeExecute(command); commands.add(command)
                return actual.execute(payload)
            }
        }
        val player = SpotifyPlayerServicePort(adapter, mainQueue, { IdentifierPrefix + ++sequence })
        val source = Source(clock)
        val resolver = Resolver()
        val snapshots = mutableListOf<SpotifyNativeFollowerSnapshot>()
        val coordinator = SpotifyNativeFollowerCoordinator(player, source, resolver, clock, scheduler, mainQueue, snapshots::add)
        val identity: SpotifyNativeFollowerIdentity
        init {
            val cursor = actual.snapshot().getJSONObject(ProtocolFields.Cursor)
            val playerIdentity = SpotifyPlayerIdentity(cursor.getString(ProtocolFields.EngineEpoch), cursor.getString(ProtocolFields.AuthenticationEpoch))
            val configuration = player.configureAuthentication(playerIdentity, StreamingAccount, BaseAddress, AccessToken, false)
            mainQueue.drain(); configuration.result.get()
            identity = SpotifyNativeFollowerIdentity(StreamingAccount, SpotifyAccount, JamSession, HostDevice, Handle, Generation, playerIdentity)
        }
        fun start() { coordinator.start(identity); mainQueue.drain() }
        fun tick(elapsedMilliseconds: Long = TickMilliseconds) { clock.elapsedMilliseconds += elapsedMilliseconds; scheduler.fireDue(); mainQueue.drain() }
        fun operations(operation: PlayerOperation): List<JSONObject> = commands.filter { command -> command.getString(ProtocolFields.Operation) == operation.protocolValue }
        fun currentOccurrence(): String? = actual.snapshot().optJSONObject(ProtocolFields.CurrentEntry)?.optString(ProtocolFields.EntryIdentifier)
    }

    @Test fun sourceEventsRefreshImmediatelyAndCoalesceBehindOneRead() {
        val fixture = Fixture(); fixture.source.automatic = false; fixture.start()
        fixture.coordinator.sourceChanged(); fixture.coordinator.sourceChanged(); fixture.mainQueue.drain()
        assertEquals(SingleCount, fixture.source.requests.size)
        val request = fixture.source.requests.single()
        request.result.complete(fixture.source.observation(request.identity)); fixture.mainQueue.drain()
        assertEquals(DoubleCount, fixture.source.requests.size)
        val second = fixture.source.requests.last()
        second.result.complete(fixture.source.observation(second.identity)); fixture.mainQueue.drain()
        assertEquals(DoubleCount, fixture.source.requests.size)
    }
    @Test fun sourceEventCancelsPendingTimerWithoutWaitingForReconcileInterval() {
        val fixture = Fixture(); fixture.start()
        fixture.coordinator.sourceChanged(); fixture.coordinator.sourceChanged(); fixture.mainQueue.drain()
        assertEquals(DoubleCount, fixture.source.requests.size)
        assertTrue(fixture.scheduler.tasks.dropLast(SingleCount).all { task -> task.cancelled })
    }
    @Test fun sourceEventsAfterDisconnectOrStopCannotRestartReads() {
        val fixture = Fixture(); fixture.start()
        fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        fixture.coordinator.sourceChanged(); fixture.mainQueue.drain()
        assertEquals(SingleCount, fixture.source.requests.size)
        fixture.coordinator.stop(); fixture.mainQueue.drain()
        fixture.coordinator.sourceChanged(); fixture.mainQueue.drain()
        assertEquals(SingleCount, fixture.source.requests.size)
    }
    @Test fun explicitStartWaitsForFreshSourceBeforeClaimAndNeverUsesScreenPolling() {
        val fixture = Fixture(); fixture.source.automatic = false; fixture.start()
        assertTrue(fixture.commands.isEmpty())
        assertEquals(SpotifyNativeFollowerStatus.Waiting, fixture.coordinator.snapshot().status)
        val request = fixture.source.requests.single(); request.result.complete(fixture.source.observation(request.identity)); fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerStatus.Following, fixture.coordinator.snapshot().status)
        fixture.tick(); assertEquals(DoubleCount, fixture.source.requests.size)
    }
    @Test fun realPlayerPreparesServerRecordingAndSpotifyOccurrencePausedThenSeeksAndPlays() {
        val fixture = Fixture(); fixture.start()
        val replace = fixture.operations(PlayerOperation.Replace).single()
        assertFalse(replace.getBoolean(ProtocolFields.PlayWhenReady))
        assertEquals(FirstOccurrence, replace.getString(ProtocolFields.ActiveEntryIdentifier))
        assertEquals(RecordingIdentifier, replace.getJSONArray(ProtocolFields.Entries).getJSONObject(FirstIndex).getString(ProtocolFields.RecordingIdentifier))
        assertEquals(SourcePositionMilliseconds, fixture.output.positionMilliseconds)
        assertTrue(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Following, fixture.coordinator.snapshot().status)
    }
    @Test fun nativeSourceAndResolverReceiveBothAccountsJamHostAndExactHandleGeneration() {
        val fixture = Fixture(); fixture.start()
        assertEquals(fixture.identity, fixture.source.requests.single().identity)
        assertEquals(fixture.identity, fixture.resolver.requests.single().identity)
    }
    @Test fun nativeReadinessAndActualDurationGatePlaybackAfterPausedPreparation() {
        val fixture = Fixture(); fixture.output.playbackStatus = AudioOutputStatus.Buffering; fixture.start()
        assertEquals(SpotifyNativeFollowerStatus.Buffering, fixture.coordinator.snapshot().status)
        assertTrue(fixture.operations(PlayerOperation.Play).isEmpty())
        fixture.output.playbackStatus = AudioOutputStatus.Ready; fixture.output.durationMilliseconds = null; fixture.tick()
        assertFalse(fixture.output.playing)
        fixture.output.durationMilliseconds = LocalDurationMilliseconds; fixture.tick()
        assertTrue(fixture.output.playing)
    }
    @Test fun unseenOccurrencePausesBeforeStartingRecordingResolution() {
        val fixture = Fixture(); fixture.start(); fixture.resolver.automatic = false
        fixture.source.occurrenceIdentifier = SecondOccurrence; fixture.source.trackIdentifier = SecondTrack
        fixture.tick()
        assertFalse(fixture.output.playing)
        assertEquals(DoubleCount, fixture.resolver.requests.size)
        assertEquals(SpotifyNativeFollowerStatus.Resolving, fixture.coordinator.snapshot().status)
        assertEquals(PlayerOperation.Pause.protocolValue, fixture.commands.last().getString(ProtocolFields.Operation))
    }
    @Test fun newerSourceKeepsPollingDuringResolutionAndUsesLatestTargetPosition() {
        val fixture = Fixture(); fixture.resolver.automatic = false; fixture.start()
        fixture.source.positionMilliseconds = LaterSourcePositionMilliseconds; fixture.tick(); fixture.tick()
        assertEquals(TripleCount, fixture.source.requests.size)
        assertEquals(SingleCount, fixture.resolver.requests.size)
        fixture.resolver.requests.single().result.complete(fixture.resolver.selected); fixture.mainQueue.drain()
        assertEquals(LaterSourcePositionMilliseconds, fixture.output.positionMilliseconds)
        assertTrue(fixture.output.playing)
    }
    @Test fun repeatedTrackOccurrencesPrepareSeparatelyAndNeverUseTrackAsOccurrence() {
        val fixture = Fixture(); fixture.start(); fixture.source.occurrenceIdentifier = SecondOccurrence; fixture.tick()
        assertEquals(DoubleCount, fixture.operations(PlayerOperation.Replace).size)
        assertEquals(SecondOccurrence, fixture.currentOccurrence())
        assertNotEquals(FirstTrack, fixture.currentOccurrence())
    }
    @Test fun changedOccurrenceCancelsStaleResolutionAndIgnoresLateMatch() {
        val fixture = Fixture(); fixture.resolver.automatic = false; fixture.start()
        val previous = fixture.resolver.requests.single()
        fixture.source.occurrenceIdentifier = SecondOccurrence; fixture.source.trackIdentifier = SecondTrack; fixture.tick()
        assertTrue(previous.cancelled)
        previous.result.complete(fixture.resolver.selected); fixture.mainQueue.drain()
        assertTrue(fixture.operations(PlayerOperation.Replace).isEmpty())
        fixture.resolver.requests.last().result.complete(fixture.resolver.selected); fixture.mainQueue.drain()
        assertEquals(SecondOccurrence, fixture.currentOccurrence())
    }
    @Test fun changedTrackUnderSameOccurrenceFailsAndReleasesExactAuthority() {
        val fixture = Fixture(); fixture.start(); fixture.source.trackIdentifier = SecondTrack; fixture.tick()
        assertEquals(SpotifyNativeFollowerStatus.Failed, fixture.coordinator.snapshot().status)
        assertEquals(SpotifyNativeFollowerFailureReason.InvalidObservation, fixture.coordinator.snapshot().failure)
        assertFalse(fixture.output.playing)
        assertFalse(fixture.actual.hasExternalAuthority)
    }
    @Test fun sourceErrorsPauseImmediatelyWithoutRenewingAndFreshSourceCanRecover() {
        val fixture = Fixture(); fixture.start(); val renewals = fixture.operations(PlayerOperation.RenewExternalAuthority).size
        fixture.source.failure = SpotifyNativeFollowerFailure(SpotifyNativeFollowerFailureReason.SourceUnavailable); fixture.tick()
        assertFalse(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Stale, fixture.coordinator.snapshot().status)
        assertEquals(renewals, fixture.operations(PlayerOperation.RenewExternalAuthority).size)
        fixture.source.failure = null; fixture.tick()
        assertTrue(fixture.output.playing)
    }
    @Test fun rejectedAuthorizationStopsPollingAndReleasesTheExactLeaseUntilAnotherExplicitStart() {
        for (failureCode in listOf(SpotifyConnectFailureCode.Unauthorized, SpotifyConnectFailureCode.Forbidden)) {
            val fixture = Fixture(); fixture.start()
            fixture.source.failure = SpotifyConnectFailure(failureCode.wireValue)
            fixture.tick()
            assertEquals(SpotifyNativeFollowerStatus.Failed, fixture.coordinator.snapshot().status)
            assertEquals(SpotifyNativeFollowerFailureReason.AuthorizationRequired, fixture.coordinator.snapshot().failure)
            assertFalse(fixture.output.playing)
            assertFalse(fixture.actual.hasExternalAuthority)
            val readCount = fixture.source.requests.size
            fixture.tick(WatchdogGapMilliseconds)
            assertEquals(readCount, fixture.source.requests.size)
        }
    }
    @Test fun excessiveSourceUncertaintyHoldsWithoutPreparingOrRenewing() {
        val fixture = Fixture(); fixture.source.uncertaintyMilliseconds = ExcessiveUncertaintyMilliseconds; fixture.start()
        assertEquals(SpotifyNativeFollowerStatus.Stale, fixture.coordinator.snapshot().status)
        assertTrue(fixture.commands.isEmpty())
    }
    @Test fun sourceBufferingAndRemotePauseHoldLocalOutput() {
        val fixture = Fixture(); fixture.start(); fixture.source.buffering = true; fixture.tick()
        assertFalse(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Buffering, fixture.coordinator.snapshot().status)
        fixture.source.buffering = false; fixture.source.progressing = false; fixture.tick()
        assertFalse(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Following, fixture.coordinator.snapshot().status)
    }
    @Test fun driftInsideUncertaintyThresholdDoesNotSeekAndOutsideThresholdDoes() {
        val fixture = Fixture(); fixture.start(); val seeks = fixture.operations(PlayerOperation.Seek).size
        fixture.source.positionMilliseconds = SourcePositionMilliseconds + SmallDriftMilliseconds; fixture.tick()
        assertEquals(seeks, fixture.operations(PlayerOperation.Seek).size)
        fixture.source.positionMilliseconds = SourcePositionMilliseconds + LargeDriftMilliseconds; fixture.tick()
        assertEquals(seeks + SingleCount, fixture.operations(PlayerOperation.Seek).size)
    }
    @Test fun unseekableDriftFailsAndReleasesWithoutBlindPlayback() {
        val fixture = Fixture(); fixture.output.seekable = false; fixture.start()
        assertEquals(SpotifyNativeFollowerFailureReason.Unsupported, fixture.coordinator.snapshot().failure)
        assertFalse(fixture.output.playing)
        assertFalse(fixture.actual.hasExternalAuthority)
    }
    @Test fun shorterLocalRecordingAtSourcePositionIsUnavailable() {
        val fixture = Fixture(); fixture.output.durationMilliseconds = ShortDurationMilliseconds; fixture.start()
        assertEquals(SpotifyNativeFollowerStatus.Unavailable, fixture.coordinator.snapshot().status)
        assertEquals(SpotifyNativeFollowerFailureReason.Unsupported, fixture.coordinator.snapshot().failure)
        assertFalse(fixture.output.playing)
    }
    @Test fun localSafetyPauseIsTerminalAndNoTimerCanResumeOrReclaim() {
        val fixture = Fixture(); fixture.start(); fixture.actual.pause(); fixture.tick()
        assertEquals(SpotifyNativeFollowerStatus.Suspended, fixture.coordinator.snapshot().status)
        val claims = fixture.operations(PlayerOperation.SetExternalAuthority).size
        fixture.tick(WatchdogGapMilliseconds)
        assertFalse(fixture.output.playing)
        assertEquals(claims, fixture.operations(PlayerOperation.SetExternalAuthority).size)
    }
    @Test fun watchdogGapRequiresAnotherFreshReadAndNewAuthorityBeforePlayback() {
        val fixture = Fixture(); fixture.start()
        val oldAuthority = fixture.actual.snapshot().getString(ProtocolFields.ExternalAuthorityIdentifier)
        val reads = fixture.source.requests.size
        fixture.tick(WatchdogGapMilliseconds)
        val newAuthority = fixture.actual.snapshot().getString(ProtocolFields.ExternalAuthorityIdentifier)
        assertNotEquals(oldAuthority, newAuthority)
        assertTrue(fixture.source.requests.size >= reads + DoubleCount)
        assertTrue(fixture.output.playing)
        assertEquals(DoubleCount, fixture.operations(PlayerOperation.Replace).size)
    }
    @Test fun localPauseBetweenExpiredSampleAndRecoveryPreventsNewClaim() {
        val fixture = Fixture(); fixture.start()
        fixture.source.automatic = false; fixture.tick(WatchdogGapMilliseconds)
        val first = fixture.source.requests.last(); first.result.complete(fixture.source.observation(first.identity)); fixture.mainQueue.drain()
        val freshRecovery = fixture.source.requests.last()
        fixture.actual.pause()
        freshRecovery.result.complete(fixture.source.observation(freshRecovery.identity)); fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerStatus.Suspended, fixture.coordinator.snapshot().status)
        assertFalse(fixture.output.playing)
        assertEquals(SingleCount, fixture.operations(PlayerOperation.Replace).size)
    }
    @Test fun stopCancelsReadResolutionAndTimerThenRetiresExactRealPlayerLease() {
        val fixture = Fixture(); fixture.resolver.automatic = false; fixture.start()
        val resolution = fixture.resolver.requests.single()
        val stop = fixture.coordinator.stop(); fixture.mainQueue.drain(); stop.get()
        assertTrue(resolution.cancelled)
        assertFalse(fixture.actual.hasExternalAuthority)
        resolution.result.complete(fixture.resolver.selected); fixture.mainQueue.drain(); fixture.tick()
        assertEquals(SpotifyNativeFollowerStatus.Detached, fixture.coordinator.snapshot().status)
        assertFalse(fixture.output.playing)
    }
    @Test fun replacementLifetimeFencesOldSourceCompletionAndPreservesNewAccountBinding() {
        val fixture = Fixture(); fixture.source.automatic = false; fixture.start()
        val old = fixture.source.requests.single()
        fixture.coordinator.start(fixture.identity.copy(jamSessionIdentifier = OtherJamSession)); fixture.mainQueue.drain()
        assertTrue(old.cancelled)
        old.result.complete(fixture.source.observation(old.identity)); fixture.mainQueue.drain()
        assertTrue(fixture.commands.isEmpty())
        val current = fixture.source.requests.last(); current.result.complete(fixture.source.observation(current.identity)); fixture.mainQueue.drain()
        assertEquals(OtherJamSession, fixture.coordinator.snapshot().identity?.jamSessionIdentifier)
        assertTrue(fixture.output.playing)
    }
    @Test fun backgroundResolverAuthorizationOrScopeFailureEndsTheCurrentHandoffWithoutRepeatedMatching() {
        for (failureCode in listOf(SpotifyConnectFailureCode.Unauthorized, SpotifyConnectFailureCode.Superseded)) {
            val fixture = Fixture(); fixture.resolver.automatic = false; fixture.start()
            fixture.resolver.requests.last().result.completeExceptionally(SpotifyConnectFailure(failureCode.wireValue))
            fixture.mainQueue.drain()
            assertEquals(SpotifyNativeFollowerStatus.Failed, fixture.coordinator.snapshot().status)
            assertEquals(if (failureCode == SpotifyConnectFailureCode.Unauthorized) SpotifyNativeFollowerFailureReason.AuthorizationRequired
                else SpotifyNativeFollowerFailureReason.Superseded, fixture.coordinator.snapshot().failure)
            assertFalse(fixture.actual.hasExternalAuthority)
            val requests = fixture.resolver.requests.size
            fixture.tick(WatchdogGapMilliseconds)
            assertEquals(requests, fixture.resolver.requests.size)
        }
    }
    @Test fun ambiguousAndUnavailableMatchingDoNotPrepareAudio() {
        val fixture = Fixture(); fixture.resolver.selected = SpotifyFollowerRecordingResolution.Ambiguous; fixture.start()
        assertEquals(SpotifyNativeFollowerFailureReason.AmbiguousRecording, fixture.coordinator.snapshot().failure)
        assertTrue(fixture.operations(PlayerOperation.Replace).isEmpty())
        fixture.resolver.selected = SpotifyFollowerRecordingResolution.Unavailable; fixture.tick()
        assertEquals(SpotifyNativeFollowerFailureReason.RecordingUnavailable, fixture.coordinator.snapshot().failure)
    }
    @Test fun cachedObservationOlderThanNativeReadIsRejectedWithoutLeaseRenewal() {
        val fixture = Fixture(); fixture.start(); fixture.source.automatic = false
        val cached = fixture.source.observation(fixture.identity); fixture.tick()
        fixture.source.requests.last().result.complete(cached); fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerFailureReason.InvalidObservation, fixture.coordinator.snapshot().failure)
        assertFalse(fixture.output.playing)
    }
    @Test fun foreignHostHandleAndGenerationCannotClaimTheRealPlayer() {
        val fixture = Fixture(); fixture.source.automatic = false; fixture.start()
        val request = fixture.source.requests.single()
        request.result.complete(fixture.source.observation(fixture.identity).copy(hostDeviceIdentifier = OtherHost)); fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerFailureReason.Superseded, fixture.coordinator.snapshot().failure)
        assertTrue(fixture.commands.isEmpty())
    }
    @Test fun actualAuthenticationChangeFencesDelayedMatchingBeforePrepare() {
        val fixture = Fixture(); fixture.resolver.automatic = false; fixture.start(); fixture.actual.clearSession()
        fixture.resolver.requests.single().result.complete(fixture.resolver.selected); fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerFailureReason.Superseded, fixture.coordinator.snapshot().failure)
        assertTrue(fixture.operations(PlayerOperation.Replace).isEmpty())
    }

    @Test fun reconnectPausesAndWaitsForVerifiedNewGenerationWithoutReclaimingPlayer() {
        val fixture = Fixture(); fixture.start()
        val claims = fixture.operations(PlayerOperation.SetExternalAuthority).size
        fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        assertFalse(fixture.output.playing)
        fixture.source.automatic = false
        fixture.coordinator.reconnect(fixture.identity.copy(generation = ReconnectedGeneration)); fixture.mainQueue.drain()
        assertFalse(fixture.output.playing)
        val request = fixture.source.requests.last()
        assertEquals(ReconnectedGeneration, request.identity.generation)
        request.result.complete(fixture.source.observation(request.identity)); fixture.mainQueue.drain()
        assertTrue(fixture.output.playing)
        assertEquals(claims, fixture.operations(PlayerOperation.SetExternalAuthority).size)
        assertEquals(ReconnectedGeneration, fixture.coordinator.snapshot().identity?.generation)
    }
    @Test fun disconnectedSourceCannotCompleteOrPollAndOldFailureCannotTerminateRecovery() {
        val fixture = Fixture(); fixture.start(); fixture.source.automatic = false; fixture.tick()
        val previous = fixture.source.requests.last()
        fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        assertTrue(previous.cancelled)
        val requests = fixture.source.requests.size
        fixture.tick()
        assertEquals(requests, fixture.source.requests.size)
        previous.result.completeExceptionally(SpotifyNativeFollowerFailure(SpotifyNativeFollowerFailureReason.Superseded))
        fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerStatus.Stale, fixture.coordinator.snapshot().status)
    }
    @Test fun reconnectRejectsForeignHostAndDoesNotRestartTerminalFollower() {
        val fixture = Fixture(); fixture.start()
        fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        fixture.coordinator.reconnect(fixture.identity.copy(generation = ReconnectedGeneration, hostDeviceIdentifier = OtherHost))
        fixture.mainQueue.drain()
        assertEquals(SpotifyNativeFollowerStatus.Failed, fixture.coordinator.snapshot().status)
        fixture.coordinator.reconnect(fixture.identity.copy(generation = ReconnectedGeneration)); fixture.mainQueue.drain()
        assertFalse(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Failed, fixture.coordinator.snapshot().status)
    }
    @Test fun localPauseDuringReconnectCannotBeOverriddenByFreshSourceOrRegistration() {
        val fixture = Fixture(); fixture.start(); fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        fixture.actual.pause()
        fixture.coordinator.reconnect(fixture.identity.copy(generation = ReconnectedGeneration)); fixture.mainQueue.drain()
        assertFalse(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Suspended, fixture.coordinator.snapshot().status)
        fixture.tick()
        assertFalse(fixture.output.playing)
    }
    @Test fun reconnectCannotUseOldResolutionForAnUnseenOccurrence() {
        val fixture = Fixture(); fixture.resolver.automatic = false; fixture.start()
        val previous = fixture.resolver.requests.single()
        fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        assertTrue(previous.cancelled)
        fixture.coordinator.reconnect(fixture.identity.copy(generation = ReconnectedGeneration)); fixture.mainQueue.drain()
        previous.result.complete(fixture.resolver.selected); fixture.mainQueue.drain()
        assertTrue(fixture.operations(PlayerOperation.Replace).isEmpty())
        fixture.resolver.requests.last().result.complete(fixture.resolver.selected); fixture.mainQueue.drain()
        assertTrue(fixture.output.playing)
    }
    @Test fun repeatedAndOlderRegistrationCannotResumeDisconnectedPlayback() {
        val fixture = Fixture(); fixture.start(); fixture.coordinator.connectionUnavailable(); fixture.mainQueue.drain()
        fixture.coordinator.reconnect(fixture.identity); fixture.mainQueue.drain()
        assertFalse(fixture.output.playing)
        assertEquals(SpotifyNativeFollowerStatus.Stale, fixture.coordinator.snapshot().status)
    }

    companion object {
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val DoubleCount = 2
        private const val TripleCount = 3
        private const val FirstIndex = 0
        private const val Handle = 1L
        private const val Generation = 2L
        private const val ReconnectedGeneration = 3L
        private const val InitialElapsedMilliseconds = 10000L
        private const val InitialPositionMilliseconds = 0L
        private const val SourcePositionMilliseconds = 5000L
        private const val LaterSourcePositionMilliseconds = 8000L
        private const val SourceDurationMilliseconds = 30000L
        private const val LocalDurationMilliseconds = 30000L
        private const val ShortDurationMilliseconds = 1000L
        private const val TickMilliseconds = 1000L
        private const val WatchdogGapMilliseconds = 6000L
        private const val SmallDriftMilliseconds = 100L
        private const val LargeDriftMilliseconds = 1000L
        private const val SourceUncertaintyMilliseconds = 20.0
        private const val ExcessiveUncertaintyMilliseconds = 751.0
        private const val ServerMilliseconds = 1700000000000L
        private const val RandomValue = 0.5
        private const val StreamingAccount = "streaming-account"
        private const val SpotifyAccount = "spotify-account"
        private const val JamSession = "jam-session"
        private const val OtherJamSession = "other-jam-session"
        private const val HostDevice = "host-device"
        private const val OtherHost = "other-host"
        private const val BaseAddress = "https://media.example.test"
        private const val AccessToken = "test-token"
        private const val FirstOccurrence = "first-occurrence"
        private const val SecondOccurrence = "second-occurrence"
        private const val FirstTrack = "AAAAAAAAAAAAAAAAAAAAAA"
        private const val SecondTrack = "BBBBBBBBBBBBBBBBBBBBBB"
        private const val QueueRevision = "queue-revision"
        private const val RecordingIdentifier = "recording"
        private const val RecordingTitle = "Recording title"
        private const val RecordingArtist = "Recording artist"
        private const val IdentifierPrefix = "identifier-"
    }
}

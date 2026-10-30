package com.streamingservice.spotify

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
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor

class SpotifyHostPlayerPortTest {
    private class MainQueue : Executor {
        val operations = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { operations.addLast(command) }
        fun drain() { while (operations.isNotEmpty()) operations.removeFirst().run() }
    }
    private class Output : QueueAudioOutput {
        override var positionMilliseconds = InitialPositionMilliseconds
        override var durationMilliseconds: Long? = DurationMilliseconds
        override val bufferedPositionMilliseconds get() = positionMilliseconds
        override var playing = false
        override var seekable = true
        override var playbackStatus = AudioOutputStatus.Ready
        override fun reconcile(state: QueueState, resetPosition: Boolean) { playing = state.playbackIntent == PlaybackIntent.Play; if (resetPosition) positionMilliseconds = InitialPositionMilliseconds }
        override fun pause() { playing = false }
        override fun stop() { playing = false }
        override fun seek(positionMilliseconds: Long) { this.positionMilliseconds = positionMilliseconds }
        override fun setRate(playbackRate: Double) = Unit
    }
    private class Scheduler : SpotifyNativeFollowerScheduler {
        val tasks = mutableListOf<() -> Unit>()
        override fun schedule(delayMilliseconds: Long, action: () -> Unit): SpotifyNativeFollowerCancellation {
            tasks.add(action); return SpotifyNativeFollowerCancellation { tasks.remove(action) }
        }
    }
    private class Resolver : SpotifyHostRecordingResolver {
        var automatic = true
        var canceled = false
        val pending = mutableListOf<CompletableFuture<SpotifyHostRecordingResolution>>()
        override fun resolve(identity: SpotifyHostIdentity, spotifyTrackIdentifier: String): SpotifyPlayerOperation<SpotifyHostRecordingResolution> {
            val result = CompletableFuture<SpotifyHostRecordingResolution>(); pending.add(result)
            if (automatic) result.complete(match())
            return SpotifyPlayerOperation(result) { canceled = true }
        }
        fun match(): SpotifyHostRecordingResolution.Matched = SpotifyHostRecordingResolution.Matched(RecordingIdentifier, Title, Artist)
    }
    private class Fixture(maximumJournalEntries: Int = JournalCapacity) {
        val main = MainQueue(); val output = Output(); val resolver = Resolver(); val scheduler = Scheduler()
        var sequence = EmptyCount; var current = true; var elapsed = ReceivedMilliseconds
        var mapSnapshot: (JSONObject) -> JSONObject = { value -> value }
        var onExecute: () -> Unit = {}; var receiptOverride: String? = null
        val actual = StreamingPlaybackCoordinator(output, MediaServer(), { RandomValue }, { elapsed }, { IdentifierPrefix + ++sequence })
        val executions = mutableListOf<JSONObject>()
        val adapter = object : SpotifyPlayerCoordinator {
            override fun configure(baseAddress: String, accessToken: String) = actual.configure(baseAddress, accessToken)
            override fun clearSession() = actual.clearSession()
            override fun playbackOutputReady(): Boolean = actual.playbackOutputReady()
            override fun snapshot(): JSONObject = mapSnapshot(actual.snapshot())
            override fun execute(payload: String): String { executions.add(JSONObject(payload)); onExecute(); return receiptOverride ?: actual.execute(payload) }
        }
        val identity: SpotifyHostIdentity
        val port: SpotifyHostPlayerPort
        init {
            actual.configure(BaseAddress, AccessToken)
            val cursor = actual.snapshot().getJSONObject(ProtocolFields.Cursor)
            identity = SpotifyHostIdentity(AppAccount, SpotifyAccount, JamSession, Device, Handle, Generation,
                SpotifyPlayerIdentity(cursor.getString(ProtocolFields.EngineEpoch), cursor.getString(ProtocolFields.AuthenticationEpoch)))
            port = SpotifyHostPlayerPort(adapter, main, resolver, scheduler, { elapsed }, { IdentifierPrefix + ++sequence }, { selected -> current && selected == identity }, maximumJournalEntries)
        }
        fun sample(): SpotifyHostPlayerSnapshot { val result = port.sample(identity); main.drain(); return result.get() }
        fun request(command: SpotifyHostCommand, key: String = Request): SpotifyHostCommandRequest = SpotifyHostCommandRequest(key, MessageIdentifier, Sender, SessionCommand, command)
        fun execute(command: SpotifyHostCommand, key: String = Request): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> = execute(request(command, key))
        fun execute(request: SpotifyHostCommandRequest): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> = port.execute(identity, sample().cursor, request, elapsed, elapsed + CommandLifetimeMilliseconds)
        fun play() { val operation = execute(SpotifyHostCommand.Play(listOf(SpotifyHostTrack(TrackIdentifier, FirstOccurrence), SpotifyHostTrack(TrackIdentifier, SecondOccurrence)), false), InitialPlayRequest); main.drain(); operation.result.get() }
        fun queueLength(): Int = actual.snapshot().getInt(ProtocolFields.QueueLength)
    }

    @Test fun hostRetirementPauseUsesTheActualCursorAndReceipt() {
        val fixture = Fixture(); fixture.play(); val cursor = fixture.sample().cursor
        val paused = fixture.port.pause(fixture.identity, cursor); fixture.main.drain(); paused.get()
        assertFalse(fixture.output.playing); assertTrue(fixture.sample().paused)
    }
    @Test fun retirementPauseCannotOverrideANewerLocalControl() {
        val fixture = Fixture(); fixture.play(); val cursor = fixture.sample().cursor
        val next = fixture.execute(SpotifyHostCommand.Next); fixture.main.drain(); next.result.get()
        val paused = fixture.port.pause(fixture.identity, cursor); fixture.main.drain()
        try { paused.get(); throw AssertionError() } catch (failure: ExecutionException) {
            assertEquals(SpotifyPlayerFailureReason.Conflict, (failure.cause as SpotifyPlayerFailure).reason)
        }
        assertTrue(fixture.output.playing)
    }
    @Test fun malformedRetirementPauseReceiptRemainsUncertain() {
        val fixture = Fixture(); fixture.play(); val cursor = fixture.sample().cursor
        fixture.receiptOverride = JSONObject().toString()
        val paused = fixture.port.pause(fixture.identity, cursor); fixture.main.drain()
        try { paused.get(); throw AssertionError() } catch (failure: ExecutionException) {
            assertEquals(SpotifyPlayerFailureReason.UnknownOutcome, (failure.cause as SpotifyPlayerFailure).reason)
        }
    }
    @Test fun alreadyPausedRetirementNeedsNoAdditionalPlayerCommand() {
        val fixture = Fixture(); fixture.play()
        val pause = fixture.execute(SpotifyHostCommand.Pause); fixture.main.drain(); pause.result.get()
        val before = fixture.executions.size
        val paused = fixture.port.pause(fixture.identity, fixture.sample().cursor); fixture.main.drain(); paused.get()
        assertEquals(before, fixture.executions.size)
    }
    @Test fun inlinePlayUsesTheRealNormalQueueAndPreservesTwoOccurrencesOfTheSameSong() {
        val fixture = Fixture(); fixture.play()
        assertEquals(TwoEntries, fixture.queueLength()); assertTrue(fixture.output.playing)
        assertNull(fixture.actual.snapshot().opt(ProtocolFields.ExternalAuthorityIdentifier).takeUnless { value -> value == JSONObject.NULL })
        val next = fixture.execute(SpotifyHostCommand.Next); fixture.main.drain(); val accepted = next.result.get()
        assertEquals(SecondOccurrence, accepted.snapshot.occurrenceIdentifier); assertEquals(SessionCommand, accepted.request.sessionCommandIdentifier)
    }
    @Test fun pauseResumeSeekAndPreviousUseAcceptedRealCoordinatorReceipts() {
        val fixture = Fixture(); fixture.play()
        val pause = fixture.execute(SpotifyHostCommand.Pause, PauseRequest); fixture.main.drain(); assertTrue(pause.result.get().snapshot.paused)
        val resume = fixture.execute(SpotifyHostCommand.Resume, ResumeRequest); fixture.main.drain(); resume.result.get(); assertTrue(fixture.output.playing)
        val seek = fixture.execute(SpotifyHostCommand.Seek(SeekPositionMilliseconds), SeekRequest); fixture.main.drain(); seek.result.get(); assertEquals(SeekPositionMilliseconds, fixture.output.positionMilliseconds)
        val previous = fixture.execute(SpotifyHostCommand.Previous, PreviousRequest); fixture.main.drain(); previous.result.get()
    }
    @Test fun appendAssignsAnActualNativeEntryIdentifierWhenTheIncomingIntentOmitsOne() {
        val fixture = Fixture(); fixture.play()
        val append = fixture.execute(SpotifyHostCommand.AddToQueue(SpotifyHostTrack(TrackIdentifier, null))); fixture.main.drain(); val accepted = append.result.get()
        assertEquals(ThreeEntries, fixture.queueLength())
        val entries = fixture.executions.last().getJSONArray(ProtocolFields.Entries)
        val identifier = entries.getJSONObject(FirstIndex).getString(ProtocolFields.EntryIdentifier)
        assertTrue(identifier.startsWith(IdentifierPrefix)); assertNotEquals(FirstOccurrence, identifier)
        assertEquals(identifier, accepted.acceptedTracks.single().occurrenceIdentifier)
        assertEquals(TrackIdentifier, accepted.acceptedTracks.single().spotifyTrackIdentifier)
    }
    @Test fun exactDuplicatesShareTheAcceptedReceiptAndNeverRunTwice() {
        val fixture = Fixture(); fixture.play()
        val request = fixture.request(SpotifyHostCommand.Pause)
        val cursor = fixture.sample().cursor
        val first = fixture.port.execute(fixture.identity, cursor, request, fixture.elapsed, fixture.elapsed + CommandLifetimeMilliseconds)
        val duplicate = fixture.port.execute(fixture.identity, cursor, request, fixture.elapsed, fixture.elapsed + CommandLifetimeMilliseconds)
        assertSame(first.result, duplicate.result); fixture.main.drain(); first.result.get()
        assertEquals(TwoExecutions, fixture.executions.size)
        val conflicting = fixture.execute(fixture.request(SpotifyHostCommand.Resume)); assertFailure(conflicting.result, SpotifyPlayerFailureReason.Conflict)
    }
    @Test fun localControlsDuringResolutionPreventLateQueueMutation() {
        val fixture = Fixture(); fixture.play(); fixture.resolver.automatic = false
        val append = fixture.execute(SpotifyHostCommand.AddToQueue(SpotifyHostTrack(TrackIdentifier, ThirdOccurrence))); fixture.main.drain()
        fixture.actual.pause(); fixture.resolver.pending.last().complete(fixture.resolver.match()); fixture.main.drain()
        assertFailure(append.result, SpotifyPlayerFailureReason.Conflict); assertEquals(TwoEntries, fixture.queueLength())
    }
    @Test fun cancellationBeforeDispatchPreventsPlayerWorkAndCanceledDuplicateNeverReplays() {
        val fixture = Fixture(); fixture.play()
        val request = fixture.request(SpotifyHostCommand.Pause); val cursor = fixture.sample().cursor
        val operation = fixture.port.execute(fixture.identity, cursor, request, fixture.elapsed, fixture.elapsed + CommandLifetimeMilliseconds)
        operation.cancel(); fixture.main.drain(); assertFailure(operation.result, SpotifyPlayerFailureReason.Cancelled)
        val duplicate = fixture.port.execute(fixture.identity, cursor, request, fixture.elapsed, fixture.elapsed + CommandLifetimeMilliseconds)
        assertSame(operation.result, duplicate.result); assertEquals(SingleExecution, fixture.executions.size); assertTrue(fixture.output.playing)
    }
    @Test fun cancellationDuringActualExecutionIsUnknownAndCannotBecomeAnAcknowledgement() {
        val fixture = Fixture(); fixture.play()
        lateinit var operation: SpotifyPlayerOperation<SpotifyHostPlayerAccepted>
        fixture.onExecute = { operation.cancel() }
        operation = fixture.execute(SpotifyHostCommand.Pause); fixture.main.drain()
        assertFailure(operation.result, SpotifyPlayerFailureReason.UnknownOutcome); assertFalse(fixture.output.playing)
    }
    @Test fun accountRetirementAndDeadlineCancelPendingResolutionWithoutLateExecution() {
        val fixture = Fixture(); fixture.play(); fixture.resolver.automatic = false
        val append = fixture.execute(SpotifyHostCommand.AddToQueue(SpotifyHostTrack(TrackIdentifier, ThirdOccurrence))); fixture.main.drain()
        fixture.port.retire(); fixture.resolver.pending.last().complete(fixture.resolver.match()); fixture.main.drain()
        assertFailure(append.result, SpotifyPlayerFailureReason.Cancelled); assertEquals(TwoEntries, fixture.queueLength())
        assertTrue(fixture.resolver.canceled)
    }
    @Test fun boundedJournalRejectsNewRequestsWithoutEvictingExecutionHistory() {
        val fixture = Fixture(SingleExecution); fixture.play()
        val operation = fixture.execute(SpotifyHostCommand.Pause); assertFailure(operation.result, SpotifyPlayerFailureReason.Capacity)
        assertEquals(SingleExecution, fixture.executions.size)
    }
    @Test fun malformedReceiptsStayUnknownAndNeverAcknowledgeExecution() {
        val fixture = Fixture(); fixture.play(); fixture.receiptOverride = MalformedReceipt
        val operation = fixture.execute(SpotifyHostCommand.Pause); fixture.main.drain(); assertFailure(operation.result, SpotifyPlayerFailureReason.UnknownOutcome)
    }
    @Test fun externalFollowerAuthorityCannotBeUsedForHosting() {
        val fixture = Fixture(); fixture.play()
        val player = SpotifyPlayerServicePort(fixture.adapter, fixture.main, { AuthorityIdentifier })
        val configured = player.configureAuthentication(fixture.identity.playerIdentity, AppAccount, BaseAddress, AccessToken, false); fixture.main.drain(); configured.result.get()
        val acquired = player.acquire(fixture.identity.playerIdentity, AppAccount); fixture.main.drain(); acquired.result.get()
        val result = fixture.port.sample(fixture.identity); fixture.main.drain(); assertFailure(result, SpotifyPlayerFailureReason.Conflict)
    }
    @Test fun deadlineExpiryCancelsResolutionAndIgnoresItsLateMatch() {
        val fixture = Fixture(); fixture.play(); fixture.resolver.automatic = false
        val append = fixture.execute(SpotifyHostCommand.AddToQueue(SpotifyHostTrack(TrackIdentifier, ThirdOccurrence))); fixture.main.drain()
        fixture.elapsed += CommandLifetimeMilliseconds; fixture.scheduler.tasks.toList().forEach { action -> action() }
        fixture.resolver.pending.last().complete(fixture.resolver.match()); fixture.main.drain()
        assertFailure(append.result, SpotifyPlayerFailureReason.Cancelled); assertEquals(TwoEntries, fixture.queueLength())
    }
    @Test fun authenticationReplacementRejectsAnOldResolutionBeforeItTouchesTheNewPlayerSession() {
        val fixture = Fixture(); fixture.play(); fixture.resolver.automatic = false
        val append = fixture.execute(SpotifyHostCommand.AddToQueue(SpotifyHostTrack(TrackIdentifier, ThirdOccurrence))); fixture.main.drain()
        fixture.actual.clearSession(); fixture.resolver.pending.last().complete(fixture.resolver.match()); fixture.main.drain()
        assertFailure(append.result, SpotifyPlayerFailureReason.Superseded); assertEquals(SingleExecution, fixture.executions.size)
    }
    @Test fun actualOutputReadinessKeepsPausedLoadingSeparateFromPausedReady() {
        val fixture = Fixture(); fixture.play(); fixture.actual.pause(); fixture.output.playbackStatus = AudioOutputStatus.Idle
        val loading = fixture.sample(); assertTrue(loading.paused); assertFalse(loading.ready)
        fixture.output.playbackStatus = AudioOutputStatus.Buffering
        val buffering = fixture.sample(); assertTrue(buffering.paused); assertTrue(buffering.buffering); assertFalse(buffering.ready)
        fixture.output.playbackStatus = AudioOutputStatus.Ready
        val ready = fixture.sample(); assertTrue(ready.paused); assertFalse(ready.buffering); assertTrue(ready.ready)
    }
    @Test fun queueSamplingReadsRealOccurrenceOrderAndRecordingIdentityWithoutMutatingPlayback() {
        val fixture = Fixture(); fixture.play(); val before = fixture.sample()
        val result = fixture.port.sampleQueue(fixture.identity); fixture.main.drain()
        val queue = result.get()
        assertEquals(before.cursor, queue.snapshot.cursor)
        assertEquals(listOf(FirstOccurrence, SecondOccurrence), queue.entries.map { entry -> entry.occurrenceIdentifier })
        assertEquals(listOf(RecordingIdentifier, RecordingIdentifier), queue.entries.map { entry -> entry.recordingIdentifier })
        assertEquals(before.cursor, fixture.sample().cursor)
    }
    @Test fun queueSamplingRejectsAControlChangeDuringTheNativePageRead() {
        val fixture = Fixture(); fixture.play(); fixture.onExecute = { fixture.actual.pause() }
        val result = fixture.port.sampleQueue(fixture.identity); fixture.main.drain()
        assertFailure(result, SpotifyPlayerFailureReason.Conflict)
    }
    @Test fun queueSamplingRejectsMalformedPagesAndQueuesBeyondThePublicationBound() {
        val malformed = Fixture(); malformed.play(); malformed.receiptOverride = MalformedReceipt
        val invalid = malformed.port.sampleQueue(malformed.identity); malformed.main.drain()
        assertFailure(invalid, SpotifyPlayerFailureReason.InvalidResponse)
        val excessive = Fixture(); excessive.mapSnapshot = { value -> value.put(ProtocolFields.QueueLength, ExcessiveQueueEntries) }
        val bounded = excessive.port.sampleQueue(excessive.identity); excessive.main.drain()
        assertFailure(bounded, SpotifyPlayerFailureReason.Unavailable)
    }
    @Test fun acceptedMediaCommandsRetainTheActualResolvedRecordingAndAssignedOccurrence() {
        val fixture = Fixture(); val operation = fixture.execute(SpotifyHostCommand.Play(listOf(SpotifyHostTrack(TrackIdentifier, null)), true))
        fixture.main.drain(); val accepted = operation.result.get()
        assertEquals(RecordingIdentifier, accepted.resolvedTracks.single().recordingIdentifier)
        assertEquals(fixture.actual.snapshot().getJSONObject(ProtocolFields.CurrentEntry).getString(ProtocolFields.EntryIdentifier),
            accepted.resolvedTracks.single().track.occurrenceIdentifier)
    }
    @Test fun serviceOwnedHostAdapterCannotOutliveItsAuthenticatedBinding() {
        val fixture = Fixture()
        val service = SpotifyPlayerServicePort(fixture.adapter, fixture.main, { IdentifierPrefix + ++fixture.sequence })
        val configured = service.configureAuthentication(fixture.identity.playerIdentity, AppAccount, BaseAddress, AccessToken, false)
        fixture.main.drain(); configured.result.get()
        val host = service.hosting(fixture.resolver, fixture.scheduler, { fixture.elapsed }, { true })
        val sample = host.sample(fixture.identity); fixture.main.drain(); sample.get()
        service.close(); fixture.main.drain()
        val retired = host.sample(fixture.identity); fixture.main.drain()
        assertFailure(retired, SpotifyPlayerFailureReason.Superseded)
    }
    private fun assertFailure(result: CompletableFuture<*>, reason: SpotifyPlayerFailureReason) {
        try { result.get(); throw AssertionError(ExpectedFailure) }
        catch (failure: ExecutionException) { assertEquals(reason, (failure.cause as SpotifyPlayerFailure).reason) }
    }
    companion object {
        private const val InitialPositionMilliseconds = 0L
        private const val DurationMilliseconds = 180000L
        private const val SeekPositionMilliseconds = 1200L
        private const val ReceivedMilliseconds = 1000L
        private const val CommandLifetimeMilliseconds = 10000L
        private const val EmptyCount = 0
        private const val FirstIndex = 0
        private const val SingleExecution = 1
        private const val TwoExecutions = 2
        private const val TwoEntries = 2
        private const val ThreeEntries = 3
        private const val ExcessiveQueueEntries = 81
        private const val JournalCapacity = 128
        private const val RandomValue = 0.5
        private const val IdentifierPrefix = "synthetic-host-native-entry-"
        private const val RecordingIdentifier = "synthetic-recording"
        private const val Title = "Synthetic title"
        private const val Artist = "Synthetic artist"
        private const val BaseAddress = "https://synthetic.invalid"
        private const val AccessToken = "synthetic-access-token"
        private const val AppAccount = "synthetic-app-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val JamSession = "synthetic-jam-session"
        private const val Device = "synthetic-device"
        private const val Handle = 1L
        private const val Generation = 7L
        private const val MessageIdentifier = 42L
        private const val Sender = "synthetic-sender"
        private const val SessionCommand = "synthetic-command"
        private const val TrackIdentifier = "4uLU6hMCjMI75M1A2tKUQC"
        private const val FirstOccurrence = "synthetic-first-occurrence"
        private const val SecondOccurrence = "synthetic-second-occurrence"
        private const val ThirdOccurrence = "synthetic-third-occurrence"
        private const val Request = "synthetic-request"
        private const val InitialPlayRequest = "synthetic-initial-play"
        private const val PauseRequest = "synthetic-pause"
        private const val ResumeRequest = "synthetic-resume"
        private const val SeekRequest = "synthetic-seek"
        private const val PreviousRequest = "synthetic-previous"
        private const val AuthorityIdentifier = "synthetic-follower-authority"
        private const val MalformedReceipt = "invalid receipt"
        private const val ExpectedFailure = "Expected a failed host player operation"
    }
}

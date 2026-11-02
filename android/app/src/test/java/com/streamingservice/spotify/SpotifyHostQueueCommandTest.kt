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

class SpotifyHostQueueCommandTest {
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

    private fun remember(fixture: Fixture) {
        fixture.port.rememberMappings(listOf(SpotifyHostRecordingMapping(FirstOccurrence, RecordingIdentifier, TrackIdentifier),
            SpotifyHostRecordingMapping(SecondOccurrence, RecordingIdentifier, TrackIdentifier)))
    }
    @Test fun directedSpotifySkipSelectsTheRealExistingOccurrenceWithoutReplacingItsQueue() {
        val fixture = Fixture(); fixture.play(); remember(fixture); val before = fixture.sample()
        val resolvedBefore = fixture.resolver.pending.size
        val selected = fixture.execute(SpotifyHostCommand.Select(SpotifyHostTrack(TrackIdentifier, SecondOccurrence)))
        fixture.main.drain(); val accepted = selected.result.get()
        assertEquals(SecondOccurrence, accepted.snapshot.occurrenceIdentifier)
        assertEquals(before.cursor.queueIdentifier, accepted.snapshot.cursor.queueIdentifier)
        assertEquals(TwoEntries, fixture.queueLength()); assertEquals(resolvedBefore, fixture.resolver.pending.size)
    }
    @Test fun uriOnlyDirectedSkipRejectsAnAmbiguousRepeatedRecordingWithoutSelectingTheWrongOccurrence() {
        val fixture = Fixture(); fixture.play(); remember(fixture); val before = fixture.sample()
        val selected = fixture.execute(SpotifyHostCommand.Select(SpotifyHostTrack(TrackIdentifier, null)))
        fixture.main.drain(); assertFailure(selected.result, SpotifyPlayerFailureReason.Unavailable)
        assertEquals(before.cursor, fixture.sample().cursor)
    }
    @Test fun directedSkipRejectsAnOccurrenceThatDoesNotBelongToTheSuppliedSpotifyTrack() {
        val fixture = Fixture(); fixture.play(); remember(fixture)
        val selected = fixture.execute(SpotifyHostCommand.Select(SpotifyHostTrack(OtherTrackIdentifier, SecondOccurrence)))
        fixture.main.drain(); assertFailure(selected.result, SpotifyPlayerFailureReason.Unavailable)
        assertEquals(FirstOccurrence, fixture.sample().occurrenceIdentifier)
    }
    @Test fun setQueueMergesParticipantTracksAndRetainsCurrentPositionIntentAndQueueIdentity() {
        val fixture = Fixture(); fixture.play(); remember(fixture); fixture.output.positionMilliseconds = SeekPositionMilliseconds
        val before = fixture.sample(); val resolvedBefore = fixture.resolver.pending.size
        val queued = fixture.execute(SpotifyHostCommand.SetQueue(emptyList(), listOf(SpotifyHostTrack(TrackIdentifier, ThirdOccurrence),
            SpotifyHostTrack(TrackIdentifier, SecondOccurrence))))
        fixture.main.drain(); val accepted = queued.result.get()
        assertEquals(ThreeEntries, fixture.queueLength()); assertEquals(FirstOccurrence, accepted.snapshot.occurrenceIdentifier)
        assertEquals(SeekPositionMilliseconds, fixture.output.positionMilliseconds); assertTrue(fixture.output.playing)
        assertEquals(before.cursor.queueIdentifier, accepted.snapshot.cursor.queueIdentifier)
        assertEquals(resolvedBefore, fixture.resolver.pending.size)
        val queue = fixture.port.sampleQueue(fixture.identity); fixture.main.drain()
        assertEquals(listOf(FirstOccurrence, ThirdOccurrence, SecondOccurrence), queue.get().entries.map { entry -> entry.occurrenceIdentifier })
    }
    @Test fun setQueueRetainsPausedIntentAndDoesNotRestartTheCurrentOccurrenceWhenReordering() {
        val fixture = Fixture(); fixture.play(); remember(fixture); fixture.actual.pause(); fixture.output.positionMilliseconds = SeekPositionMilliseconds
        val queued = fixture.execute(SpotifyHostCommand.SetQueue(listOf(SpotifyHostTrack(TrackIdentifier, SecondOccurrence)), emptyList()))
        fixture.main.drain(); queued.result.get(); assertFalse(fixture.output.playing)
        assertEquals(FirstOccurrence, fixture.sample().occurrenceIdentifier); assertEquals(SeekPositionMilliseconds, fixture.output.positionMilliseconds)
    }
    @Test fun explicitSelectedOccurrenceStartsTheRequestedTrackInsteadOfTheFirstQueueItem() {
        val fixture = Fixture()
        val played = fixture.execute(SpotifyHostCommand.Play(listOf(SpotifyHostTrack(TrackIdentifier, FirstOccurrence),
            SpotifyHostTrack(TrackIdentifier, SecondOccurrence)), false, SecondOccurrence))
        fixture.main.drain(); assertEquals(SecondOccurrence, played.result.get().snapshot.occurrenceIdentifier)
    }
    @Test fun preservePositionPlayUpdatesTheQueueAroundTheActualSelectedCurrentOccurrence() {
        val fixture = Fixture(); fixture.play(); remember(fixture); fixture.output.positionMilliseconds = SeekPositionMilliseconds
        val played = fixture.execute(SpotifyHostCommand.Play(listOf(SpotifyHostTrack(TrackIdentifier, SecondOccurrence),
            SpotifyHostTrack(TrackIdentifier, FirstOccurrence)), false, FirstOccurrence, true))
        fixture.main.drain(); assertEquals(FirstOccurrence, played.result.get().snapshot.occurrenceIdentifier)
        assertEquals(SeekPositionMilliseconds, fixture.output.positionMilliseconds)
    }
    @Test fun failedIncomingTrackResolutionDoesNotPoisonTheNextValidDirectedSkip() {
        val fixture = Fixture(); fixture.play(); remember(fixture); fixture.resolver.automatic = false
        val queued = fixture.execute(SpotifyHostCommand.AddToQueue(SpotifyHostTrack(OtherTrackIdentifier, ThirdOccurrence)))
        fixture.main.drain(); fixture.resolver.pending.last().complete(SpotifyHostRecordingResolution.Unavailable); fixture.main.drain()
        assertFailure(queued.result, SpotifyPlayerFailureReason.Unavailable)
        val selected = fixture.execute(SpotifyHostCommand.Select(SpotifyHostTrack(TrackIdentifier, SecondOccurrence)), ResumeRequest)
        fixture.main.drain(); assertEquals(SecondOccurrence, selected.result.get().snapshot.occurrenceIdentifier)
    }
    private fun assertFailure(result: CompletableFuture<*>, reason: SpotifyPlayerFailureReason) {
        try { result.get(); throw AssertionError(ExpectedFailure) }
        catch (failure: ExecutionException) { assertEquals(reason, (failure.cause as SpotifyPlayerFailure).reason) }
    }
    @Test fun staleRemoteQueueRevisionCannotOverwriteANewerLocalQueue() {
        val fixture = Fixture(); fixture.play(); remember(fixture); val before = fixture.sample()
        val queued = fixture.execute(SpotifyHostCommand.SetQueue(emptyList(), emptyList(), StaleQueueRevision))
        fixture.main.drain(); assertFailure(queued.result, SpotifyPlayerFailureReason.Conflict)
        assertEquals(before.cursor, fixture.sample().cursor)
    }
    @Test fun matchingPublishedQueueRevisionAllowsAnActualQueueUpdate() {
        val fixture = Fixture(); fixture.play(); remember(fixture); val before = fixture.sample()
        val queued = fixture.execute(SpotifyHostCommand.SetQueue(emptyList(), emptyList(), before.cursor.queueIdentifier + QueueRevisionSeparator + before.cursor.contentRevision))
        fixture.main.drain(); assertEquals(SingleExecution, queued.result.get().acceptedTracks.size)
        assertEquals(FirstOccurrence, fixture.sample().occurrenceIdentifier)
    }
    companion object {
        private const val StaleQueueRevision = "synthetic-stale-revision"
        private const val QueueRevisionSeparator = ":"
        private const val OtherTrackIdentifier = "0123456789abcdefghijkl"
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

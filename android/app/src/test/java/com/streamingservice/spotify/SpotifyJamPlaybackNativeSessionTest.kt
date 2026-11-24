package com.streamingservice.spotify

import com.streamingservice.player.bridge.ProtocolFields
import com.streamingservice.player.playback.AudioOutputStatus
import com.streamingservice.player.playback.MediaServer
import com.streamingservice.player.playback.QueueAudioOutput
import com.streamingservice.player.playback.StreamingPlaybackCoordinator
import com.streamingservice.player.queue.QueueState
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor

class SpotifyJamPlaybackNativeSessionTest {
    private class MainQueue : Executor {
        val commands = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { commands.addLast(command) }
        fun drain() { while (commands.isNotEmpty()) commands.removeFirst().run() }
    }
    private class Output : QueueAudioOutput {
        override val positionMilliseconds = PositionMilliseconds
        override val durationMilliseconds = DurationMilliseconds
        override val bufferedPositionMilliseconds = PositionMilliseconds
        override val playing = false
        override val seekable = true
        override val playbackStatus = AudioOutputStatus.Ready
        override fun reconcile(state: QueueState, resetPosition: Boolean) = Unit
        override fun pause() = Unit
        override fun stop() = Unit
        override fun seek(positionMilliseconds: Long) = Unit
        override fun setRate(playbackRate: Double) = Unit
    }
    private class Fixture {
        val mainQueue = MainQueue()
        var sequence = EmptyCount
        var current = true
        var unbinds = EmptyCount
        var elapsedMilliseconds = ElapsedMilliseconds
        val scheduled = mutableListOf<() -> Unit>()
        val scheduler = SpotifyNativeFollowerScheduler { _, action -> scheduled.add(action); SpotifyNativeFollowerCancellation {} }
        val actual = StreamingPlaybackCoordinator(Output(), MediaServer(), { FixedRandom }, { elapsedMilliseconds }, { IdentifierPrefix + ++sequence })
        val configuredTokens = mutableListOf<String>()
        val player = SpotifyPlayerServicePort(object : SpotifyPlayerCoordinator {
            override fun configure(baseAddress: String, accessToken: String) { configuredTokens.add(accessToken); actual.configure(baseAddress, accessToken) }
            override fun clearSession() = actual.clearSession()
            override fun playbackOutputReady(): Boolean = actual.playbackOutputReady()
            override fun snapshot(): JSONObject = actual.snapshot()
            override fun execute(payload: String): String = actual.execute(payload)
        }, mainQueue, { IdentifierPrefix + ++sequence })
        val bindingCompletion = CompletableFuture<SpotifyPlayerServicePort>()
        val reads = mutableListOf<Pair<SpotifyNativeFollowerIdentity, CompletableFuture<SpotifyConnectPlaybackObservation>>>()
        var canceledReads = EmptyCount
        val source = object : SpotifyNativeFollowerObservationSource {
            override fun read(identity: SpotifyNativeFollowerIdentity): SpotifyFollowerOperation<SpotifyConnectPlaybackObservation> {
                val result = CompletableFuture<SpotifyConnectPlaybackObservation>(); reads.add(identity to result)
                return SpotifyFollowerOperation(result) { canceledReads += SingleCount }
            }
        }
        val metadata = CompletableFuture<String>()
        val recordingRequests = mutableListOf<String>()
        val broker = SpotifyBackgroundRecordingBroker(object : SpotifyFollowerMetadataSource {
            override fun read(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<String> = SpotifyFollowerOperation(metadata) {}
        }, object : SpotifyBackgroundRecordingRunner {
            override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation {
                recordingRequests.add(requestIdentifier)
                return SpotifyNativeFollowerCancellation {}
            }
        }, scheduler, { IdentifierPrefix + ++sequence }, { Market }, { current }, { _, _ -> CompletableFuture.completedFuture(Unit) })
        val snapshots = mutableListOf<SpotifyNativeFollowerSnapshot>()
        val session = SpotifyJamPlaybackNativeSession(SpotifyJamPlaybackConfiguration(SpotifyJamPlaybackAccount(AppAccount, BaseAddress, SpotifyAccount,
            JamSession, HostDevice, Handle, Generation, Market), AccessToken, TokenExpiry), object : SpotifyJamPlaybackPlayerBinding {
            override fun bind(): CompletableFuture<SpotifyPlayerServicePort> = bindingCompletion
            override fun unbind(): CompletableFuture<Unit> { unbinds += SingleCount; return player.close().result }
        }, source, broker, { elapsedMilliseconds }, scheduler, mainQueue, { current }, snapshots::add)
        fun bind() { bindingCompletion.complete(player); mainQueue.drain() }
        fun completeLatestRead() {
            val request = reads.last()
            request.second.complete(SpotifyConnectPlaybackObservation(Handle, request.first.generation, HostDevice, QueueRevision, TrackIdentifier, Occurrence,
                PositionMilliseconds, DurationMilliseconds, false, false, elapsedMilliseconds.toDouble(), elapsedMilliseconds,
                UncertaintyMilliseconds, ServerMilliseconds, ServerMilliseconds))
            mainQueue.drain()
        }
    }
    @Test fun startupWaitsForVerifiedPreflightThenAnotherFreshSourceAndActualPlayerLease() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        assertFalse(startup.isDone)
        assertFalse(fixture.actual.hasExternalAuthority)
        assertTrue(fixture.configuredTokens.isEmpty())
        fixture.completeLatestRead()
        assertEquals(SingleCount, fixture.configuredTokens.size)
        assertEquals(DoubleCount, fixture.reads.size)
        assertFalse(startup.isDone)
        assertFalse(fixture.actual.hasExternalAuthority)
        fixture.completeLatestRead(); startup.get()
        assertTrue(fixture.actual.hasExternalAuthority)
        assertEquals(SpotifyNativeFollowerStatus.Resolving, fixture.snapshots.last().status)
    }
    @Test fun reconnectKeepsPlayerAuthenticationAndRetiresOldRecordingJobs() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        fixture.completeLatestRead(); fixture.completeLatestRead(); startup.get()
        val oldIdentity = fixture.reads.last().first
        fixture.session.connectionUnavailable(); fixture.mainQueue.drain()
        fixture.session.reconnect(Generation + SingleCount.toLong()); fixture.mainQueue.drain()
        assertEquals(Generation + SingleCount.toLong(), fixture.reads.last().first.generation)
        assertEquals(oldIdentity.playerIdentity, fixture.reads.last().first.playerIdentity)
        assertEquals(SingleCount, fixture.configuredTokens.size)
        fixture.completeLatestRead()
        assertEquals(SpotifyNativeFollowerStatus.Resolving, fixture.snapshots.last().status)
    }
    @Test fun reconnectDuringPreflightRetiresStartupBeforeAuthenticationIsChanged() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        fixture.session.connectionUnavailable(); fixture.mainQueue.drain()
        fixture.completeLatestRead()
        assertTrue(startup.isCompletedExceptionally)
        assertTrue(fixture.configuredTokens.isEmpty())
    }
    @Test fun claimedHeadlessRecordingIncludesExactNativeCatalogBaseAddress() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        fixture.completeLatestRead(); fixture.completeLatestRead(); startup.get()
        fixture.metadata.complete(JSONObject().put(SpotifyJamPlaybackProtocol.HandleField, Handle).put(SpotifyJamPlaybackProtocol.GenerationField, Generation).toString())
        val serialized = fixture.session.claimRecording(fixture.recordingRequests.single())
        assertEquals(BaseAddress, JSONObject(requireNotNull(serialized)).getString(SpotifyJamPlaybackProtocol.BaseAddressField))
    }
    @Test fun stopDuringBindingRejectsStartupAndCachesExactCleanup() {
        val fixture = Fixture(); val startup = fixture.session.start()
        val stopped = fixture.session.stop(); fixture.mainQueue.drain(); stopped.get()
        assertTrue(startup.isCompletedExceptionally)
        assertTrue(fixture.bindingCompletion.isCancelled)
        assertSame(stopped, fixture.session.stop())
        assertEquals(SingleCount, fixture.unbinds)
    }
    @Test fun stopDuringPreflightCancelsReadAndLateCompletionCannotConfigureOrClaim() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind()
        val stopped = fixture.session.stop(); fixture.mainQueue.drain(); stopped.get()
        fixture.completeLatestRead()
        assertEquals(SingleCount, fixture.canceledReads)
        assertTrue(fixture.configuredTokens.isEmpty())
        assertFalse(fixture.actual.hasExternalAuthority)
    }
    @Test fun timeoutRetiresBindingAndNeverAcknowledgesUnverifiedSource() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        fixture.scheduled.first()(); fixture.mainQueue.drain()
        assertTrue(startup.isCompletedExceptionally)
        assertFalse(fixture.actual.hasExternalAuthority)
        assertEquals(SingleCount, fixture.unbinds)
    }
    @Test fun refreshedCredentialDuringPreflightIsAppliedBeforeActualLeaseStartup() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        fixture.session.synchronizeAuthentication(RefreshedToken).get()
        fixture.completeLatestRead(); fixture.completeLatestRead(); startup.get()
        assertEquals(listOf(RefreshedToken), fixture.configuredTokens)
    }
    @Test fun retiredAccountBeforePreflightCompletesCannotResetPlayerAuthentication() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind(); fixture.current = false
        fixture.completeLatestRead()
        assertTrue(startup.isCompletedExceptionally)
        assertTrue(fixture.configuredTokens.isEmpty())
        assertFalse(fixture.actual.hasExternalAuthority)
    }
    @Test fun failedPreflightRejectsStartupAndReleasesBinding() {
        val fixture = Fixture(); val startup = fixture.session.start(); fixture.bind()
        fixture.reads.single().second.completeExceptionally(SpotifyConnectFailure(Unauthorized)); fixture.mainQueue.drain()
        try { startup.get(); throw AssertionError(MissingFailure) } catch (_failure: ExecutionException) { Unit }
        assertEquals(SingleCount, fixture.unbinds)
        assertFalse(fixture.actual.hasExternalAuthority)
    }
    companion object {
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val DoubleCount = 2
        private const val PositionMilliseconds = 0L
        private const val DurationMilliseconds = 30000L
        private const val ElapsedMilliseconds = 10000L
        private const val ServerMilliseconds = 1700000000000L
        private const val TokenExpiry = 2000L
        private const val Handle = 1L
        private const val Generation = 2L
        private const val UncertaintyMilliseconds = 20.0
        private const val FixedRandom = 0.5
        private const val IdentifierPrefix = "identifier-"
        private const val AppAccount = "app-account"
        private const val SpotifyAccount = "spotify-account"
        private const val JamSession = "jam-session"
        private const val HostDevice = "host-device"
        private const val Market = "RO"
        private const val BaseAddress = "https://media.example.test/"
        private const val AccessToken = "test-token"
        private const val RefreshedToken = "refreshed-token"
        private const val TrackIdentifier = "AAAAAAAAAAAAAAAAAAAAAA"
        private const val Occurrence = "occurrence"
        private const val QueueRevision = "queue-revision"
        private const val Unauthorized = "unauthorized"
        private const val MissingFailure = "Expected startup failure"
    }
}

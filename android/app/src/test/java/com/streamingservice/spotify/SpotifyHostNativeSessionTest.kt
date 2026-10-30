package com.streamingservice.spotify

import com.streamingservice.player.bridge.ProtocolFields
import com.streamingservice.player.playback.AudioOutputStatus
import com.streamingservice.player.playback.MediaServer
import com.streamingservice.player.playback.QueueAudioOutput
import com.streamingservice.player.playback.StreamingPlaybackCoordinator
import com.streamingservice.player.queue.QueueState
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

class SpotifyHostNativeSessionTest {
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
        var sequence = EmptyCount
        var current = true
        var attached = false
        var unbinds = EmptyCount
        var clears = EmptyCount
        var starts = EmptyCount
        var stops = EmptyCount
        var events = EmptyCount
        var readyAtStart = false
        var listener: ((SpotifyConnectBatch) -> Unit)? = null
        val timers = mutableListOf<() -> Unit>()
        val tokens = mutableListOf<String>()
        val main = MainQueue()
        val actual = StreamingPlaybackCoordinator(Output(), MediaServer(), { FixedRandom }, { ElapsedMilliseconds }, { Prefix + ++sequence })
        val player = SpotifyPlayerServicePort(object : SpotifyPlayerCoordinator {
            override fun configure(baseAddress: String, accessToken: String) { tokens.add(accessToken); actual.configure(baseAddress, accessToken) }
            override fun clearSession() { clears += SingleCount; actual.clearSession() }
            override fun snapshot(): JSONObject = actual.snapshot()
            override fun execute(payload: String): String = actual.execute(payload)
        }, main, { Prefix + ++sequence })
        val binding = CompletableFuture<SpotifyPlayerServicePort>()
        val startup = CompletableFuture<SpotifyHostSnapshot>()
        var cleanup = CompletableFuture.completedFuture(Unit)
        val configuration: SpotifyHostConfiguration
        val session: SpotifyHostNativeSession
        init {
            actual.configure(Address, Token)
            val cursor = actual.snapshot().getJSONObject(ProtocolFields.Cursor)
            val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation,
                SpotifyPlayerIdentity(cursor.getString(ProtocolFields.EngineEpoch), cursor.getString(ProtocolFields.AuthenticationEpoch)))
            val expected = SpotifyHostPlayerCursor(cursor.getString(ProtocolFields.QueueIdentifier), cursor.getLong(ProtocolFields.QueueRevision),
                cursor.getLong(ProtocolFields.QueueContentRevision), cursor.getLong(ProtocolFields.PlaybackControlRevision))
            configuration = SpotifyHostConfiguration(SpotifyJamPlaybackConfiguration(SpotifyJamPlaybackAccount(Account, Address, SpotifyAccount, Jam,
                Device, Handle, Generation, Market), Token, ExpirySeconds), identity, PreviousHost, expected, emptyList())
            session = SpotifyHostNativeSession(configuration, object : SpotifyJamPlaybackPlayerBinding {
                override fun bind() = binding
                override fun unbind(): CompletableFuture<Unit> { unbinds += SingleCount; return CompletableFuture.completedFuture(Unit) }
            }, object : SpotifyHostRecordingResolver {
                override fun resolve(identity: SpotifyHostIdentity, spotifyTrackIdentifier: String): SpotifyPlayerOperation<SpotifyHostRecordingResolution> = throw UnsupportedOperationException()
            }, { _, action -> timers.add(action); SpotifyNativeFollowerCancellation {} }, { ElapsedMilliseconds }, { selected ->
                listener = selected; attached = true; SpotifyNativeFollowerCancellation { attached = false }
            }, { _, ready -> object : SpotifyHostSessionCoordinator {
                override fun start(previousHostDeviceIdentifier: String, expectedCursor: SpotifyHostPlayerCursor, initialMappings: List<SpotifyHostRecordingMapping>): CompletableFuture<SpotifyHostSnapshot> {
                    starts += SingleCount; assertEquals(configuration.expectedCursor, expectedCursor)
                    readyAtStart = ready(configuration.identity); return startup
                }
                override fun stop(): CompletableFuture<Unit> { stops += SingleCount; return cleanup }
                override fun snapshot() = SpotifyHostSnapshot(identity, SpotifyHostStatus.Starting)
                override fun accept(batch: SpotifyConnectBatch) { events += SingleCount }
                override fun commandHandlingReady(selected: SpotifyHostIdentity): Boolean = true
            } }, { current })
        }
        fun bind() { binding.complete(player); main.drain() }
        fun completeStart() { startup.complete(SpotifyHostSnapshot(configuration.identity, SpotifyHostStatus.Hosting)) }
    }
    @Test fun startupTimeoutDuringBindingRejectsLateActivation() {
        val fixture = Fixture(); val started = fixture.session.start(); fixture.timers.single()()
        assertTrue(started.isCompletedExceptionally); fixture.bind()
        assertEquals(EmptyCount, fixture.starts); assertEquals(SingleCount, fixture.unbinds)
    }
    @Test fun stoppedConnectionRemovesIncomingHandlingBeforeHostCleanup() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind(); fixture.completeStart(); fixture.cleanup = CompletableFuture()
        fixture.listener!!(SpotifyConnectBatch(JSONObject().put(HandleField, Handle).toString(), true, false))
        assertFalse(fixture.attached); assertEquals(SingleCount, fixture.stops); assertEquals(EmptyCount, fixture.unbinds)
        assertFalse(fixture.session.commandHandlingReady(fixture.configuration.identity))
        fixture.cleanup.complete(Unit); assertEquals(SingleCount, fixture.unbinds)
    }
    @Test fun realPlayerConfigurationPreservesEpochsAndAttachesObservationBeforeActivation() {
        val fixture = Fixture(); val started = fixture.session.start(); fixture.bind()
        assertFalse(started.isDone); assertTrue(fixture.attached); assertTrue(fixture.readyAtStart)
        assertEquals(EmptyCount, fixture.clears); assertEquals(listOf(Token), fixture.tokens)
        fixture.completeStart(); assertEquals(fixture.configuration.identity, started.get().identity)
    }
    @Test fun nativeEventsContinueWithoutAReactAttachmentAndRetireBeforeCleanup() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind(); fixture.completeStart()
        val batch = SpotifyConnectBatch(JSONObject().put(HandleField, Handle).put(EventsField, JSONArray()).toString(), false, true)
        fixture.listener!!(batch); assertEquals(SingleCount, fixture.events)
        fixture.session.stop().get(); fixture.listener!!(batch)
        assertEquals(SingleCount, fixture.events); assertFalse(fixture.attached)
    }
    @Test fun cleanupBarrierFinishesBeforeUnbinding() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind(); fixture.completeStart(); fixture.cleanup = CompletableFuture()
        val stopped = fixture.session.stop(); assertFalse(stopped.isDone); assertEquals(EmptyCount, fixture.unbinds)
        fixture.cleanup.complete(Unit); stopped.get(); assertEquals(SingleCount, fixture.unbinds)
    }
    @Test fun failedDemotionRetainsTheBindingAndReportsFailure() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind(); fixture.completeStart(); fixture.cleanup = CompletableFuture()
        val stopped = fixture.session.stop(); fixture.cleanup.completeExceptionally(SpotifyConnectFailure(UnknownOutcome))
        assertTrue(stopped.isCompletedExceptionally); assertEquals(EmptyCount, fixture.unbinds)
        assertFalse(fixture.session.commandHandlingReady(fixture.configuration.identity))
    }
    @Test fun stopDuringBindingWaitsForActualBindingBeforeUnbindingAndNeverActivates() {
        val fixture = Fixture(); val started = fixture.session.start(); val stopped = fixture.session.stop()
        assertFalse(stopped.isDone); fixture.bind(); stopped.get()
        assertTrue(started.isCompletedExceptionally); assertEquals(EmptyCount, fixture.starts); assertEquals(SingleCount, fixture.unbinds)
    }
    @Test fun replacedScopeDuringPlayerConfigurationCannotActivate() {
        val fixture = Fixture(); val started = fixture.session.start(); fixture.binding.complete(fixture.player)
        fixture.current = false; fixture.main.drain()
        assertTrue(started.isCompletedExceptionally); assertEquals(EmptyCount, fixture.starts)
    }
    @Test fun tokenRenewalDuringStartupMustBeAppliedBeforeStartupAcknowledgement() {
        val fixture = Fixture(); fixture.session.start(); fixture.binding.complete(fixture.player)
        val refreshed = fixture.session.synchronizeAuthentication(RefreshedToken); fixture.main.drain()
        assertEquals(listOf(Token, RefreshedToken), fixture.tokens); assertFalse(refreshed.isDone)
        fixture.completeStart(); refreshed.get()
    }
    @Test fun tokenRenewalAfterStartupPreservesEpochsAndUsesActualPlayerCompletion() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind(); fixture.completeStart()
        val refreshed = fixture.session.synchronizeAuthentication(RefreshedToken); assertFalse(refreshed.isDone)
        fixture.main.drain(); refreshed.get(); assertEquals(listOf(Token, RefreshedToken), fixture.tokens)
        assertEquals(EmptyCount, fixture.clears)
    }
    @Test fun repeatedStartAndStopCannotCreateAnotherHostLifetime() {
        val fixture = Fixture(); fixture.session.start(); fixture.bind(); fixture.completeStart(); fixture.session.start().get()
        fixture.session.stop().get(); fixture.session.stop().get()
        assertEquals(SingleCount, fixture.starts); assertEquals(SingleCount, fixture.stops); assertEquals(SingleCount, fixture.unbinds)
    }
    companion object {
        private const val HandleField = "handle"
        private const val EventsField = "events"
        private const val Account = "synthetic-account"
        private const val Address = "https://synthetic.example/"
        private const val Token = "synthetic-token"
        private const val RefreshedToken = "synthetic-refreshed-token"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val PreviousHost = "synthetic-previous-host"
        private const val Market = "GB"
        private const val Prefix = "synthetic-identifier-"
        private const val Handle = 3L
        private const val Generation = 7L
        private const val ExpirySeconds = 2000000000L
        private const val ElapsedMilliseconds = 5000L
        private const val PositionMilliseconds = 0L
        private const val DurationMilliseconds = 180000L
        private const val FixedRandom = 0.5
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val UnknownOutcome = "unknown-outcome"
    }
}

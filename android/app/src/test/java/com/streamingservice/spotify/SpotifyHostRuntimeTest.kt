package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture

class SpotifyHostRuntimeTest {
    private class Session(val identity: SpotifyHostIdentity) : SpotifyHostRuntimeSession {
        val started = CompletableFuture<SpotifyHostSnapshot>()
        var cleanup = CompletableFuture.completedFuture(Unit)
        var stops = EmptyCount
        var publications = EmptyCount
        var releases = EmptyCount
        val tokens = mutableListOf<String>()
        override fun publishLocalChanges(): CompletableFuture<Unit> { publications += SingleCount; return CompletableFuture.completedFuture(Unit) }
        override fun start() = started
        override fun stop(): CompletableFuture<Unit> { stops += SingleCount; return cleanup }
        override fun synchronizeAuthentication(accessToken: String): CompletableFuture<Unit> { tokens.add(accessToken); return CompletableFuture.completedFuture(Unit) }
        override fun releaseAfterConnectionRetired(): CompletableFuture<Unit> { releases += SingleCount; return CompletableFuture.completedFuture(Unit) }
        fun ready() { started.complete(SpotifyHostSnapshot(identity, SpotifyHostStatus.Hosting)) }
    }
    private class Fixture(preparationEnabled: Boolean = false) {
        val preparations = mutableListOf<String>()
        var broker: SpotifyHostRecordingBroker? = null
        val pending = ArrayDeque<Runnable>()
        val sessions = mutableListOf<Session>()
        val configurations = mutableListOf<SpotifyHostConfiguration>()
        val observers = mutableListOf<(SpotifyHostSnapshot) -> Unit>()
        var connected = true
        var followerCleanup = CompletableFuture.completedFuture(Unit)
        val tokens = SpotifyJamPlaybackProtocol(object : SpotifyJamPlaybackTokenDecoder {
            override fun payload(serialized: String) = JSONObject().put(SubjectField, Account).put(ExpiryField, ExpirySeconds).toString()
        })
        val runtime = SpotifyHostRuntime(SpotifyHostConfigurationProtocol(tokens), tokens, { configuration, observer ->
            configurations.add(configuration); observers.add(observer)
            val session = Session(configuration.identity); sessions.add(session)
            broker = if (!preparationEnabled) null else SpotifyHostRecordingBroker(configuration, object : SpotifyBackgroundRecordingRunner {
                override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation {
                    preparations.add(requestIdentifier); return SpotifyNativeFollowerCancellation {}
                }
            }, { _, _ -> SpotifyNativeFollowerCancellation {} }, { PreparationPrefix + preparations.size },
                { action -> pending.addLast(action) }, { _, _, _ -> throw AssertionError() }, { connected })
            SpotifyHostSessionResources(session, hostingRecordings = broker)
        }, { work -> pending.addLast(work) }, { connected }, { followerCleanup })
        val events = mutableListOf<SpotifyHostSnapshot?>()
        val attachment = runtime.attach(events::add)
        fun drain() { while (pending.isNotEmpty()) pending.removeFirst().run() }
        fun begin(selected: SpotifyHostRuntime.Attachment = attachment, device: String = Device): CompletableFuture<SpotifyHostSnapshot> {
            val result = runtime.start(selected, configuration(device).toString()); drain(); return result
        }
        fun start() { begin(); sessions.single().ready(); drain() }
    }
    @Test fun activePreparationWaitsForScopedMatchingAndPublicationUsesTheRetainedSession() {
        val fixture = Fixture(true); fixture.start()
        val prepared = fixture.runtime.prepareRecordings(fixture.attachment, JSONArray(listOf(Recording)).toString()); fixture.drain()
        assertFalse(prepared.isDone); val request = fixture.preparations.single(); fixture.broker!!.claim(request); fixture.broker!!.complete(request, Track)
        prepared.get(); val publication = fixture.runtime.publishLocalChanges(fixture.attachment); fixture.drain(); publication.get()
        assertEquals(SingleCount, fixture.sessions.single().publications); assertEquals(SingleCount, fixture.sessions.size)
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun accountReplacementCancelsPreparedSelectionBeforeItCanAuthorizePlayback() {
        val fixture = Fixture(true); fixture.start()
        val prepared = fixture.runtime.prepareRecordings(fixture.attachment, JSONArray(listOf(Recording)).toString()); fixture.drain()
        fixture.runtime.updateAccount(fixture.attachment, OtherAccount, null); fixture.drain()
        assertTrue(prepared.isCompletedExceptionally); assertEquals(EmptyCount, fixture.sessions.single().publications)
    }
    @Test fun detachedViewCannotPrepareRecordingsOrRequestPublication() {
        val fixture = Fixture(true); fixture.start(); fixture.runtime.attach {}
        val prepared = fixture.runtime.prepareRecordings(fixture.attachment, JSONArray(listOf(Recording)).toString())
        val publication = fixture.runtime.publishLocalChanges(fixture.attachment); fixture.drain()
        assertTrue(prepared.isCompletedExceptionally); assertTrue(publication.isCompletedExceptionally); assertTrue(fixture.preparations.isEmpty())
    }
    @Test fun startupWaitsForBothFollowerCleanupAndTheActualHostAcknowledgement() {
        val fixture = Fixture(); fixture.followerCleanup = CompletableFuture(); val result = fixture.begin()
        assertTrue(fixture.sessions.isEmpty()); assertFalse(result.isDone)
        fixture.followerCleanup.complete(Unit); fixture.drain(); assertEquals(SingleCount, fixture.sessions.size)
        fixture.sessions.single().ready(); fixture.drain(); assertEquals(SpotifyHostStatus.Hosting, result.get().status)
    }
    @Test fun detachedReactViewsDoNotStopTheRetainedNativeHost() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.detach(fixture.attachment)
        val replacement = fixture.runtime.attach {}; val result = fixture.begin(replacement)
        assertEquals(SpotifyHostStatus.Hosting, result.get().status); assertEquals(SingleCount, fixture.sessions.size)
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun replacementCannotCreateAnotherSessionBeforeTheOldCleanupBarrier() {
        val fixture = Fixture(); fixture.start(); fixture.sessions.single().cleanup = CompletableFuture()
        val replacement = fixture.begin(device = OtherDevice); assertFalse(replacement.isDone); assertEquals(SingleCount, fixture.sessions.size)
        fixture.sessions.single().cleanup.complete(Unit); fixture.drain(); assertEquals(TwoCount, fixture.sessions.size)
    }
    @Test fun failedCleanupRemainsABarrierAcrossRepeatedReplacementAttempts() {
        val fixture = Fixture(); fixture.start(); fixture.sessions.single().cleanup = CompletableFuture()
        val replacement = fixture.begin(device = OtherDevice)
        fixture.sessions.single().cleanup.completeExceptionally(SpotifyConnectFailure(UnknownOutcome)); fixture.drain()
        assertTrue(replacement.isCompletedExceptionally)
        val repeated = fixture.begin(device = OtherDevice); assertTrue(repeated.isCompletedExceptionally)
        assertEquals(SingleCount, fixture.sessions.size)
    }
    @Test fun stopImmediatelyRevokesCommandPermissionButRetainsCleanupOwnership() {
        val fixture = Fixture(); fixture.start(); val configuration = fixture.configurations.single()
        fixture.sessions.single().cleanup = CompletableFuture()
        val stop = fixture.runtime.stop(fixture.attachment)
        assertFalse(fixture.runtime.isActiveConfiguration(configuration, configuration.identity))
        assertTrue(fixture.runtime.ownsConfiguration(configuration, configuration.identity)); fixture.drain(); assertFalse(stop.isDone)
        fixture.sessions.single().cleanup.complete(Unit); fixture.drain(); stop.get()
        assertFalse(fixture.runtime.ownsConfiguration(configuration, configuration.identity))
    }
    @Test fun accountReplacementCannotLeaveOldCommandsEnabled() {
        val fixture = Fixture(); fixture.start(); val configuration = fixture.configurations.single()
        fixture.runtime.updateAccount(fixture.attachment, OtherAccount, null)
        assertFalse(fixture.runtime.isActiveConfiguration(configuration, configuration.identity)); fixture.drain()
        assertEquals(SingleCount, fixture.sessions.single().stops)
    }
    @Test fun tokenUpdatesUseTheActualRetainedSessionWithoutStartingAnotherHost() {
        val fixture = Fixture(); fixture.start()
        val updated = fixture.runtime.updateAccount(fixture.attachment, Account, Token); fixture.drain(); updated.get()
        assertEquals(listOf(Token), fixture.sessions.single().tokens); assertEquals(SingleCount, fixture.sessions.size)
    }
    @Test fun staleViewsCannotStopOrReadTheNewView() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.attach {}
        try { fixture.runtime.stop(fixture.attachment); throw AssertionError() } catch (failure: SpotifyConnectFailure) { assertEquals(Canceled, failure.code) }
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun actualNativeRetirementCanReleaseAFailedCleanupBindingAndClearTheFence() {
        val fixture = Fixture(); fixture.start(); fixture.sessions.single().cleanup = CompletableFuture()
        fixture.runtime.stop(fixture.attachment); fixture.drain()
        fixture.sessions.single().cleanup.completeExceptionally(SpotifyConnectFailure(UnknownOutcome)); fixture.drain()
        fixture.connected = false
        val release = fixture.runtime.releaseRetiredConnections(); fixture.drain(); release.get()
        assertEquals(SingleCount, fixture.sessions.single().releases)
        fixture.connected = true; val next = fixture.begin(); assertFalse(next.isCompletedExceptionally); assertEquals(TwoCount, fixture.sessions.size)
    }
    @Test fun oldObserversCannotReplaceANewerLifetime() {
        val fixture = Fixture(); fixture.start(); fixture.begin(device = OtherDevice)
        fixture.sessions.last().ready(); fixture.drain()
        fixture.observers.first()(SpotifyHostSnapshot(fixture.sessions.first().identity, SpotifyHostStatus.Failed)); fixture.drain()
        assertEquals(OtherDevice, fixture.runtime.snapshot(fixture.attachment)?.identity?.deviceIdentifier)
    }
    @Test fun startupRejectionsPreserveEveryKnownSafeNativeFailureThroughCompletionWrappers() {
        SpotifyConnectFailureCode.entries.forEach { code ->
            val fixture = Fixture(); val result = fixture.begin()
            fixture.sessions.single().cleanup = CompletableFuture()
            fixture.sessions.single().started.completeExceptionally(java.util.concurrent.CompletionException(SpotifyConnectFailure(code.wireValue)))
            fixture.drain()
            assertTrue(result.isCompletedExceptionally)
            assertEquals(code.wireValue, fixture.runtime.snapshot(fixture.attachment)?.failure)
            try { result.join(); throw AssertionError() } catch (failure: java.util.concurrent.CompletionException) {
                assertEquals(code.wireValue, (failure.cause as SpotifyConnectFailure).code)
            }
            assertEquals(SingleCount, fixture.sessions.single().stops)
        }
    }
    @Test fun unknownStartupRejectionsNeverExposePrivateErrorDetails() {
        val fixture = Fixture(); val result = fixture.begin()
        fixture.sessions.single().cleanup = CompletableFuture()
        fixture.sessions.single().started.completeExceptionally(SpotifyConnectFailure(PrivateFailure))
        fixture.drain()
        assertTrue(result.isCompletedExceptionally)
        assertEquals(StartupFailed, fixture.runtime.snapshot(fixture.attachment)?.failure)
    }
    companion object {
        private const val Recording = "synthetic-recording"
        private const val Track = "4uLU6hMCjMI75M1A2tKUQC"
        private const val PreparationPrefix = "synthetic-preparation-"
        private const val Account = "synthetic-account"
        private const val OtherAccount = "synthetic-other-account"
        private const val Address = "https://synthetic.example/"
        private const val Token = "header.payload.signature"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val OtherDevice = "synthetic-other-device"
        private const val PreviousHost = "synthetic-previous-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Market = "GB"
        private const val Queue = "synthetic-queue"
        private const val Handle = 3L
        private const val Generation = 7L
        private const val Revision = 0L
        private const val ExpirySeconds = 2000000000L
        private const val SubjectField = "sub"
        private const val ExpiryField = "exp"
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val TwoCount = 2
        private const val UnknownOutcome = "unknown-outcome"
        private const val Canceled = "canceled"
        private const val PrivateFailure = "synthetic-private-failure"
        private const val StartupFailed = "host-startup-failed"
        private fun configuration(device: String): JSONObject = JSONObject().put(SpotifyJamPlaybackProtocol.AppAccountField, Account)
            .put(SpotifyJamPlaybackProtocol.BaseAddressField, Address).put(SpotifyJamPlaybackProtocol.AccessTokenField, Token)
            .put(SpotifyJamPlaybackProtocol.SpotifyAccountField, SpotifyAccount).put(SpotifyJamPlaybackProtocol.SessionField, Jam)
            .put(SpotifyJamPlaybackProtocol.HostField, device).put(SpotifyJamPlaybackProtocol.HandleField, Handle)
            .put(SpotifyJamPlaybackProtocol.GenerationField, Generation).put(SpotifyJamPlaybackProtocol.MarketField, Market)
            .put(SpotifyHostConfigurationProtocol.EngineField, Engine).put(SpotifyHostConfigurationProtocol.AuthenticationField, Authentication)
            .put(SpotifyHostConfigurationProtocol.PreviousHostField, PreviousHost).put(SpotifyHostConfigurationProtocol.CursorField,
                JSONObject().put(SpotifyHostConfigurationProtocol.QueueField, Queue).put(SpotifyHostConfigurationProtocol.QueueRevisionField, Revision)
                    .put(SpotifyHostConfigurationProtocol.ContentRevisionField, Revision).put(SpotifyHostConfigurationProtocol.ControlRevisionField, Revision))
            .put(SpotifyHostConfigurationProtocol.MappingsField, JSONArray())
    }
}

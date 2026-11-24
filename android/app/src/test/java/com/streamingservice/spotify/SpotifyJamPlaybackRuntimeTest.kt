package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException

class SpotifyJamPlaybackRuntimeTest {
    private class Session : SpotifyJamPlaybackSession {
        var interruptions = EmptyCount
        val generations = mutableListOf<Long>()
        override fun connectionUnavailable() { interruptions += SingleCount }
        override fun reconnect(generation: Long) { generations.add(generation) }
        val startup = CompletableFuture<Unit>()
        var cleanup = CompletableFuture.completedFuture(Unit)
        var stops = EmptyCount
        var tokenCompletion: CompletableFuture<Unit>? = null
        val tokens = mutableListOf<String>()
        val completedJobs = mutableListOf<String>()
        var pending = true
        override fun start(): CompletableFuture<Unit> = startup
        override fun stop(): CompletableFuture<Unit> { stops += SingleCount; return cleanup }
        override fun synchronizeAuthentication(accessToken: String): CompletableFuture<Unit> { tokens.add(accessToken); return tokenCompletion ?: CompletableFuture.completedFuture(Unit) }
        override fun claimRecording(requestIdentifier: String): String? = if (pending) requestIdentifier else null
        override fun isRecordingPending(requestIdentifier: String): Boolean = pending
        override fun completeRecording(requestIdentifier: String, serialized: String) { completedJobs.add(requestIdentifier); pending = false }
        override fun failRecording(requestIdentifier: String, code: String) { pending = false }
        override fun synchronizeRecordingAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String): CompletableFuture<Unit> = CompletableFuture.completedFuture(Unit)
    }
    private class Fixture(authenticationFactory: SpotifyJamAuthenticationRenewalFactory? = null) {
        val sessions = mutableListOf<Session>()
        val configurations = mutableListOf<SpotifyJamPlaybackConfiguration>()
        val observers = mutableListOf<(SpotifyNativeFollowerSnapshot) -> Unit>()
        val protocol = SpotifyJamPlaybackProtocol(object : SpotifyJamPlaybackTokenDecoder {
            override fun payload(serialized: String): String = String(Base64.getUrlDecoder().decode(serialized), Charsets.UTF_8)
        })
        var owned = true
        val runtime = SpotifyJamPlaybackRuntime(protocol, { configuration, observer ->
            configurations.add(configuration); observers.add(observer); Session().also(sessions::add)
        }, authenticationFactory) { owned }
        val events = mutableListOf<String>()
        val attachment = runtime.attach(events::add)
        fun begin(selected: SpotifyJamPlaybackRuntime.Attachment = attachment, account: String = AppAccount, expiry: Long = InitialExpiry): CompletableFuture<String> = runtime.startFollowing(selected, Identifier, configuration(account, expiry))
        fun start(): String { val pending = begin(); sessions.single().startup.complete(Unit); return pending.get() }
    }
    @Test fun acknowledgedReconnectChangesOnlyGenerationAndPreservesTheNativeSession() {
        val fixture = Fixture(); fixture.start()
        val account = fixture.configurations.single().account
        fixture.runtime.connectionUnavailable(account.handle, account.generation)
        fixture.runtime.reconnect(account.handle, account.generation + SingleCount.toLong(), account.spotifyAccountIdentifier)
        assertEquals(SingleCount, fixture.sessions.single().interruptions)
        assertEquals(listOf(account.generation + SingleCount.toLong()), fixture.sessions.single().generations)
        val snapshot = JSONObject(fixture.runtime.getSnapshot(fixture.attachment))
        assertEquals(account.generation + SingleCount.toLong(), snapshot.getLong(SpotifyJamPlaybackProtocol.GenerationField))
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun oldAndForeignRegistrationsAndStopsCannotAffectCurrentFollowing() {
        val fixture = Fixture(); fixture.start()
        val account = fixture.configurations.single().account
        fixture.runtime.reconnect(account.handle, account.generation, account.spotifyAccountIdentifier)
        fixture.runtime.reconnect(account.handle, account.generation + SingleCount.toLong(), OtherAppAccount)
        fixture.runtime.connectionStopped(account.handle + SingleCount.toLong(), account.generation)
        fixture.runtime.connectionStopped(account.handle, account.generation - SingleCount.toLong())
        assertTrue(fixture.sessions.single().generations.isEmpty())
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun unacknowledgedStartupCannotAdoptAnotherNativeGeneration() {
        val fixture = Fixture(); fixture.begin()
        val account = fixture.configurations.single().account
        fixture.runtime.reconnect(account.handle, account.generation + SingleCount.toLong(), account.spotifyAccountIdentifier)
        assertTrue(fixture.sessions.single().generations.isEmpty())
    }
    private fun failure(code: String, operation: () -> Any?) {
        try { operation(); throw AssertionError(MissingFailure) }
        catch (failure: ExecutionException) { assertEquals(code, (failure.cause as SpotifyConnectFailure).code) }
        catch (failure: SpotifyConnectFailure) { assertEquals(code, failure.code) }
    }
    @Test fun startupAcknowledgementWaitsForSessionOwnedLeaseAndSnapshotNeverExposesToken() {
        val fixture = Fixture(); val pending = fixture.begin()
        assertFalse(pending.isDone)
        assertFalse(JSONObject(fixture.runtime.getSnapshot(fixture.attachment)).getBoolean(NativeHandoffField))
        fixture.sessions.single().startup.complete(Unit)
        val snapshot = JSONObject(pending.get())
        assertTrue(snapshot.getBoolean(NativeHandoffField))
        assertEquals(BaseAddress, snapshot.getString(SpotifyJamPlaybackProtocol.BaseAddressField))
        assertFalse(snapshot.has(SpotifyJamPlaybackProtocol.AccessTokenField))
    }
    @Test fun detachRetainsFollowingAndReplacementAttachmentAdoptsWithoutAnotherSession() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.detach(fixture.attachment)
        val replacement = fixture.runtime.attach {}
        assertTrue(JSONObject(fixture.begin(replacement).get()).getBoolean(NativeHandoffField))
        assertEquals(SingleCount, fixture.sessions.size)
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun oldControlAttachmentCannotStopUpdateReadOrStartNewerFollowing() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.attach {}
        failure(Canceled) { fixture.runtime.stopFollowing(fixture.attachment) }
        failure(Canceled) { fixture.runtime.getSnapshot(fixture.attachment) }
        failure(Canceled) { fixture.runtime.updateApplicationAccount(fixture.attachment, null, null) }
        failure(Canceled) { fixture.begin() }
        assertEquals(EmptyCount, fixture.sessions.single().stops)
    }
    @Test fun exactPendingRecordingJobCanCompleteAfterReactAttachmentReplacement() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.attach {}
        assertEquals(RequestIdentifier, fixture.runtime.claimRecording(RequestIdentifier))
        assertTrue(fixture.runtime.isRecordingPending(RequestIdentifier))
        fixture.runtime.completeRecording(RequestIdentifier, SerializedResult)
        assertFalse(fixture.runtime.isRecordingPending(RequestIdentifier))
        assertEquals(listOf(RequestIdentifier), fixture.sessions.single().completedJobs)
    }
    @Test fun failedCredentialUpdateCanRetryTheSameExpiryAfterTheActualNativeWriteFails() {
        val fixture = Fixture(); fixture.start(); val session = fixture.sessions.single()
        session.tokenCompletion = CompletableFuture()
        val update = fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, token(AppAccount, NewerExpiry))
        session.tokenCompletion?.completeExceptionally(SpotifyConnectFailure(Unauthorized))
        failure(Unauthorized) { update.get() }
        session.tokenCompletion = null
        fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, token(AppAccount, NewerExpiry)).get()
        assertEquals(DoubleCount, session.tokens.size)
    }
    @Test fun serializedCredentialsCannotApplyAnOlderTokenAfterANewerPendingWrite() {
        val fixture = Fixture(); fixture.start(); val session = fixture.sessions.single()
        session.tokenCompletion = CompletableFuture()
        val newest = token(AppAccount, NewerExpiry)
        val update = fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, newest)
        val older = fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, token(AppAccount, InitialExpiry))
        assertFalse(older.isDone)
        session.tokenCompletion?.complete(Unit); update.get(); older.get()
        assertEquals(listOf(newest), session.tokens)
    }
    @Test fun authenticationFailureStopsNativeOwnershipAndLateFailureCannotStopAReplacement() {
        var reject: () -> Unit = {}
        val factory = SpotifyJamAuthenticationRenewalFactory { configuration, failed ->
            reject = failed
            SpotifyJamAuthenticationRenewal({ _, _ -> SpotifyNativeFollowerCancellation {} }, object : SpotifyBackgroundRecordingRunner {
                override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation = SpotifyNativeFollowerCancellation {}
            }, { RequestIdentifier }, { OlderExpiry }, configuration.account.baseAddress, { true },
                { _, _ -> CompletableFuture.completedFuture(Unit) }, Runnable::run, failed)
        }
        val fixture = Fixture(factory); val startup = fixture.begin()
        val identity = SpotifyNativeFollowerIdentity(AppAccount, SpotifyAccount, SessionIdentifier, Host, Handle, Generation,
            SpotifyPlayerIdentity(EngineEpoch, AuthenticationEpoch))
        fixture.observers.single()(SpotifyNativeFollowerSnapshot(SpotifyNativeFollowerStatus.Following, identity, Occurrence, Recording, null, null))
        fixture.sessions.single().startup.complete(Unit); startup.get()
        val oldFailure = reject; reject()
        assertEquals(SingleCount, fixture.sessions.single().stops)
        assertFalse(fixture.runtime.isCurrent(identity))
        assertEquals(SpotifyNativeFollowerStatus.Failed.name, JSONObject(fixture.runtime.getSnapshot(fixture.attachment)).getString(StatusField))
        fixture.runtime.stopFollowing(fixture.attachment).get()
        val replacement = fixture.begin(); fixture.sessions.last().startup.complete(Unit); replacement.get(); oldFailure()
        assertEquals(EmptyCount, fixture.sessions.last().stops)
    }
    @Test fun olderAndEqualExpiryUpdatesNeverReplaceNativeCredential() {
        val fixture = Fixture(); fixture.start()
        fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, token(AppAccount, OlderExpiry)).get()
        fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, token(AppAccount, InitialExpiry, OtherSignature)).get()
        assertTrue(fixture.sessions.single().tokens.isEmpty())
        val newest = token(AppAccount, NewerExpiry)
        fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, newest).get()
        assertEquals(listOf(newest), fixture.sessions.single().tokens)
    }
    @Test fun logoutAndAccountChangeWaitForNativeCleanupAndInvalidateJobs() {
        val fixture = Fixture(); fixture.start(); val session = fixture.sessions.single(); session.cleanup = CompletableFuture()
        val logout = fixture.runtime.updateApplicationAccount(fixture.attachment, null, null)
        assertFalse(logout.isDone)
        assertNull(fixture.runtime.claimRecording(RequestIdentifier))
        session.cleanup.complete(Unit); logout.get()
        failure(Superseded) { fixture.begin() }
    }
    @Test fun replacingJamWaitsForPreviousSessionCleanupBeforeCreatingNewBinding() {
        val fixture = Fixture(); fixture.start(); val previous = fixture.sessions.single(); previous.cleanup = CompletableFuture()
        val configuration = JSONObject(configuration()).put(SpotifyJamPlaybackProtocol.SessionField, OtherSession).toString()
        val pending = fixture.runtime.startFollowing(fixture.attachment, Identifier, configuration)
        assertEquals(SingleCount, fixture.sessions.size)
        previous.cleanup.complete(Unit)
        assertEquals(DoubleCount, fixture.sessions.size)
        fixture.sessions.last().startup.complete(Unit); pending.get()
    }
    @Test fun repeatedRetirementReturnsCachedFailedCleanupInsteadOfFalseSuccess() {
        val fixture = Fixture(); fixture.start(); val session = fixture.sessions.single(); session.cleanup = CompletableFuture()
        val first = fixture.runtime.retireFollowing()
        session.cleanup.completeExceptionally(SpotifyConnectFailure(Network))
        val second = fixture.runtime.retireFollowing()
        assertSame(first, second)
        failure(Network) { second.get() }
        assertEquals(SingleCount, session.stops)
    }
    @Test fun suspendedStateRevokesHandoffAndAdoptionDoesNotResumeIt() {
        val fixture = Fixture(); fixture.start()
        fixture.observers.single()(SpotifyNativeFollowerSnapshot(SpotifyNativeFollowerStatus.Suspended, null, Occurrence, Recording, null, SpotifyNativeFollowerFailureReason.LocalSuspended))
        val replacement = fixture.runtime.attach {}
        val snapshot = JSONObject(fixture.begin(replacement).get())
        assertFalse(snapshot.getBoolean(NativeHandoffField))
        assertEquals(SpotifyNativeFollowerStatus.Suspended.name, snapshot.getString(StatusField))
        assertEquals(SingleCount, fixture.sessions.size)
    }
    @Test fun foreignNativeConnectionAndForeignTokenSubjectCannotStartOrRefresh() {
        val fixture = Fixture(); fixture.owned = false
        failure(Superseded) { fixture.begin() }
        fixture.owned = true; fixture.start()
        failure(Unauthorized) { fixture.runtime.updateApplicationAccount(fixture.attachment, AppAccount, token(OtherAppAccount, NewerExpiry)) }
        assertTrue(fixture.sessions.single().tokens.isEmpty())
    }
    @Test fun replacementWithIdenticalAccountsCannotReuseRetiredFactoryAuthorization() {
        val fixture = Fixture(); fixture.start(); val originalConfiguration = fixture.configurations.single()
        val identity = SpotifyNativeFollowerIdentity(AppAccount, SpotifyAccount, SessionIdentifier, Host, Handle, Generation, SpotifyPlayerIdentity(EngineEpoch, AuthenticationEpoch))
        assertTrue(fixture.runtime.isCurrentConfiguration(originalConfiguration, identity))
        fixture.runtime.stopFollowing(fixture.attachment).get()
        val pending = fixture.begin(); fixture.sessions.last().startup.complete(Unit); pending.get()
        assertFalse(fixture.runtime.isCurrentConfiguration(originalConfiguration, identity))
        failure(Superseded) { fixture.runtime.synchronizeAuthentication(originalConfiguration, identity, token(AppAccount, NewerExpiry)).get() }
    }
    @Test fun stoppedStartupNeverPublishesLateNativeHandoff() {
        val fixture = Fixture(); val pending = fixture.begin(); val session = fixture.sessions.single()
        fixture.runtime.stopFollowing(fixture.attachment).get(); session.startup.complete(Unit)
        failure(Canceled) { pending.get() }
        assertFalse(JSONObject(fixture.runtime.getSnapshot(fixture.attachment)).getBoolean(NativeHandoffField))
    }
    @Test fun configurationRejectsInsecureAddressUnexpectedFieldsAndMalformedToken() {
        val fixture = Fixture()
        val insecure = JSONObject(configuration()).put(SpotifyJamPlaybackProtocol.BaseAddressField, InsecureAddress)
        failure(InvalidInput) { fixture.protocol.configuration(insecure.toString()) }
        val extra = JSONObject(configuration()).put(UnexpectedField, true)
        failure(InvalidInput) { fixture.protocol.configuration(extra.toString()) }
        failure(InvalidInput) { fixture.protocol.tokenExpiry(AppAccount, InvalidToken) }
    }
    @Test fun snapshotRetainsActualPlayerEpochsWithoutExportingCredentials() {
        val fixture = Fixture()
        val account = fixture.protocol.configuration(configuration()).account
        val identity = SpotifyNativeFollowerIdentity(AppAccount, SpotifyAccount, SessionIdentifier, Host, Handle, Generation,
            SpotifyPlayerIdentity(EngineEpoch, AuthenticationEpoch))
        val follower = SpotifyNativeFollowerSnapshot(SpotifyNativeFollowerStatus.Following, identity, Occurrence, Recording, null, null)
        val snapshot = JSONObject(fixture.protocol.snapshot(Identifier, account, follower, true))
        assertEquals(EngineEpoch, snapshot.getString(PlayerEngineEpochField))
        assertEquals(AuthenticationEpoch, snapshot.getString(PlayerAuthenticationEpochField))
        assertFalse(snapshot.has(SpotifyJamPlaybackProtocol.AccessTokenField))
    }
    @Test fun partialUpcomingDiagnosticsDoNotReplaceTheCurrentPlaybackFailure() {
        val fixture = Fixture()
        val account = fixture.protocol.configuration(configuration()).account
        val follower = SpotifyNativeFollowerSnapshot(SpotifyNativeFollowerStatus.Following, null, Occurrence, Recording, null, null,
            false, SingleCount, SpotifyNativeFollowerFailureReason.SourceUnavailable)
        val snapshot = JSONObject(fixture.protocol.snapshot(Identifier, account, follower, true))
        assertTrue(snapshot.isNull(FailureField))
        assertFalse(snapshot.getBoolean(UpcomingQueuePendingField))
        assertEquals(SingleCount, snapshot.getInt(UnavailableUpcomingCountField))
        assertEquals(SpotifyNativeFollowerFailureReason.SourceUnavailable.name, snapshot.getString(UpcomingQueueFailureField))
    }
    companion object {
        private const val FailureField = "failure"
        private const val UpcomingQueuePendingField = "upcomingQueuePending"
        private const val UnavailableUpcomingCountField = "unavailableUpcomingCount"
        private const val UpcomingQueueFailureField = "upcomingQueueFailure"
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val DoubleCount = 2
        private const val InitialExpiry = 2000L
        private const val OlderExpiry = 1000L
        private const val NewerExpiry = 3000L
        private const val Handle = 1L
        private const val Generation = 2L
        private const val EngineEpoch = "engine"
        private const val AuthenticationEpoch = "authentication"
        private const val AppAccount = "app-account"
        private const val OtherAppAccount = "other-app-account"
        private const val SpotifyAccount = "spotify-account"
        private const val SessionIdentifier = "jam-session"
        private const val OtherSession = "other-jam-session"
        private const val Host = "host"
        private const val Market = "RO"
        private const val Identifier = "following"
        private const val RequestIdentifier = "recording-request"
        private const val SerializedResult = "result"
        private const val BaseAddress = "https://media.example.test/"
        private const val InsecureAddress = "http://media.example.test/"
        private const val Header = "header"
        private const val Signature = "signature"
        private const val OtherSignature = "other-signature"
        private const val Separator = "."
        private const val SubjectField = "sub"
        private const val ExpiryField = "exp"
        private const val NativeHandoffField = "nativeHandoff"
        private const val PlayerEngineEpochField = "playerEngineEpoch"
        private const val PlayerAuthenticationEpochField = "playerAuthenticationEpoch"
        private const val StatusField = "status"
        private const val Occurrence = "occurrence"
        private const val Recording = "recording"
        private const val UnexpectedField = "unexpected"
        private const val InvalidToken = "invalid"
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
        private const val Unauthorized = "unauthorized"
        private const val InvalidInput = "invalid-input"
        private const val Network = "network"
        private const val MissingFailure = "Expected failure"
        private fun token(account: String, expiry: Long, signature: String = Signature): String = Header + Separator + Base64.getUrlEncoder().withoutPadding()
            .encodeToString(JSONObject().put(SubjectField, account).put(ExpiryField, expiry).toString().toByteArray(Charsets.UTF_8)) + Separator + signature
        private fun configuration(account: String = AppAccount, expiry: Long = InitialExpiry): String = JSONObject()
            .put(SpotifyJamPlaybackProtocol.AppAccountField, account).put(SpotifyJamPlaybackProtocol.BaseAddressField, BaseAddress)
            .put(SpotifyJamPlaybackProtocol.AccessTokenField, token(account, expiry)).put(SpotifyJamPlaybackProtocol.SpotifyAccountField, SpotifyAccount)
            .put(SpotifyJamPlaybackProtocol.SessionField, SessionIdentifier).put(SpotifyJamPlaybackProtocol.HostField, Host)
            .put(SpotifyJamPlaybackProtocol.HandleField, Handle).put(SpotifyJamPlaybackProtocol.GenerationField, Generation)
            .put(SpotifyJamPlaybackProtocol.MarketField, Market).toString()
    }
}

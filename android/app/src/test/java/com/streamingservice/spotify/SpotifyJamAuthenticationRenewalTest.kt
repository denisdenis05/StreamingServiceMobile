package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture

class SpotifyJamAuthenticationRenewalTest {
    private class Scheduled(val delayMilliseconds: Long, val action: () -> Unit, var cancelled: Boolean = false)
    private class Fixture {
        var current = true
        var currentEpochSeconds = InitialEpochSeconds
        var failures = EmptyCount
        var taskCancellations = EmptyCount
        var scheduleFailure = false
        var runnerFailure = false
        val scheduled = mutableListOf<Scheduled>()
        val tasks = mutableListOf<String>()
        val callbacks = mutableListOf<(Throwable) -> Unit>()
        val tokens = mutableListOf<String>()
        val submitted = CompletableFuture<Unit>()
        val identity = SpotifyNativeFollowerIdentity(Account, SpotifyAccount, Session, Host, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        val renewal = SpotifyJamAuthenticationRenewal({ delay, action ->
            if (scheduleFailure) throw IllegalStateException(Failure)
            val selected = Scheduled(delay, action); scheduled.add(selected)
            SpotifyNativeFollowerCancellation { selected.cancelled = true }
        }, object : SpotifyBackgroundRecordingRunner {
            override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation {
                if (runnerFailure) throw IllegalStateException(Failure)
                tasks.add(requestIdentifier); callbacks.add(failed)
                return SpotifyNativeFollowerCancellation { taskCancellations += SingleCount }
            }
        }, { Request }, { currentEpochSeconds }, BaseAddress, { current }, { _, token -> tokens.add(token); submitted }, Runnable::run, { failures += SingleCount })
        fun start() { renewal.update(identity, InitialExpiryEpochSeconds); scheduled.first().action() }
        fun claim(): String = requireNotNull(renewal.claim(Request))
    }
    @Test fun schedulesBeforeExpiryWithoutDependingOnRecordingResolution() {
        val fixture = Fixture(); fixture.renewal.update(fixture.identity, InitialExpiryEpochSeconds)
        assertEquals(RenewalDelayMilliseconds, fixture.scheduled.single().delayMilliseconds)
        assertTrue(fixture.tasks.isEmpty())
        fixture.scheduled.single().action()
        assertEquals(listOf(Request), fixture.tasks)
        assertEquals(SpotifyBackgroundRecordingProtocol.TimeoutMilliseconds, fixture.scheduled.last().delayMilliseconds)
    }
    @Test fun authenticationClaimCapturesBothAccountsAndNativeScopeWithoutCredentials() {
        val fixture = Fixture(); fixture.start(); val value = JSONObject(fixture.claim())
        assertEquals(Account, value.getString(AccountField)); assertEquals(Generation, value.getLong(GenerationField))
        assertEquals(BaseAddress, value.getString(BaseAddressField))
        assertFalse(value.toString().contains(Token)); assertNull(fixture.renewal.claim(Request))
    }
    @Test fun completionWaitsForNativeAuthenticationAndRequiresActualExpiryAdvance() {
        val fixture = Fixture(); fixture.start(); fixture.claim()
        val completed = fixture.renewal.complete(Request, Account, Token)
        assertFalse(completed.isDone)
        fixture.renewal.update(fixture.identity, RenewedExpiryEpochSeconds); fixture.submitted.complete(Unit); completed.get()
        assertFalse(fixture.renewal.isPending(Request)); assertTrue(fixture.renewal.isHealthy())
        assertEquals(EmptyCount, fixture.failures)
        fixture.callbacks.single()(IllegalStateException(Failure))
        assertEquals(EmptyCount, fixture.failures)
    }
    @Test fun staleTokenCompletionFailsClosedWithoutAnImmediateRenewalLoop() {
        val fixture = Fixture(); fixture.start(); fixture.claim()
        val completed = fixture.renewal.complete(Request, Account, Token); fixture.submitted.complete(Unit)
        assertTrue(completed.isCompletedExceptionally); assertFalse(fixture.renewal.isHealthy())
        assertEquals(SingleCount, fixture.failures); assertEquals(SingleCount, fixture.tasks.size)
    }
    @Test fun foreignAccountAndDuplicateSubmissionsCannotUpdateNativeCredentials() {
        val fixture = Fixture(); fixture.start(); fixture.claim()
        assertTrue(fixture.renewal.complete(Request, OtherAccount, Token).isCompletedExceptionally)
        assertTrue(fixture.tokens.isEmpty())
        fixture.renewal.complete(Request, Account, Token)
        assertTrue(fixture.renewal.complete(Request, Account, Token).isCompletedExceptionally)
        assertEquals(listOf(Token), fixture.tokens)
    }
    @Test fun unclaimedAndRetiredRequestsCannotRefreshThePlayer() {
        val fixture = Fixture(); fixture.start()
        assertTrue(fixture.renewal.complete(Request, Account, Token).isCompletedExceptionally)
        fixture.renewal.stop(); assertNull(fixture.renewal.claim(Request))
        assertTrue(fixture.renewal.complete(Request, Account, Token).isCompletedExceptionally)
        assertTrue(fixture.tokens.isEmpty()); assertEquals(SingleCount, fixture.taskCancellations)
    }
    @Test fun accountReplacementFencesClaimAndPendingWork() {
        val fixture = Fixture(); fixture.start(); fixture.current = false
        assertNull(fixture.renewal.claim(Request)); assertFalse(fixture.renewal.isPending(Request))
        assertTrue(fixture.renewal.complete(Request, Account, Token).isCompletedExceptionally)
    }
    @Test fun reconnectRetiresOldJobAndSchedulesTheActualNewGeneration() {
        val fixture = Fixture(); fixture.start(); fixture.claim()
        fixture.renewal.update(fixture.identity.copy(generation = ReconnectedGeneration), InitialExpiryEpochSeconds)
        assertEquals(SingleCount, fixture.taskCancellations)
        fixture.callbacks.single()(IllegalStateException(Failure))
        assertEquals(EmptyCount, fixture.failures)
        fixture.scheduled.last().action()
        assertEquals(ReconnectedGeneration, JSONObject(fixture.claim()).getLong(GenerationField))
    }
    @Test fun lateCompletionAfterRetirementCannotFailANewerGeneration() {
        val fixture = Fixture(); fixture.start(); fixture.claim()
        val completed = fixture.renewal.complete(Request, Account, Token)
        fixture.renewal.update(fixture.identity.copy(generation = ReconnectedGeneration), InitialExpiryEpochSeconds)
        fixture.submitted.complete(Unit)
        assertTrue(completed.isCompletedExceptionally); assertEquals(EmptyCount, fixture.failures)
    }
    @Test fun deadlineAndTaskFailureRetireTheTaskAndNotifyOnlyOnce() {
        val fixture = Fixture(); fixture.start(); fixture.claim(); fixture.scheduled.last().action()
        fixture.callbacks.single()(IllegalStateException(Failure)); fixture.renewal.fail(Request)
        assertEquals(SingleCount, fixture.failures); assertFalse(fixture.renewal.isHealthy())
        assertEquals(SingleCount, fixture.taskCancellations)
    }
    @Test fun schedulerAndRunnerFailureCannotLeaveRenewalMarkedHealthy() {
        val scheduler = Fixture(); scheduler.scheduleFailure = true; scheduler.renewal.update(scheduler.identity, InitialExpiryEpochSeconds)
        assertFalse(scheduler.renewal.isHealthy()); assertEquals(SingleCount, scheduler.failures)
        val runner = Fixture(); runner.runnerFailure = true; runner.start()
        assertFalse(runner.renewal.isHealthy()); assertEquals(SingleCount, runner.failures)
    }
    @Test fun repeatedSnapshotsAndOlderTokensCannotScheduleDuplicateTasks() {
        val fixture = Fixture(); fixture.renewal.update(fixture.identity, InitialExpiryEpochSeconds)
        fixture.renewal.update(fixture.identity, InitialExpiryEpochSeconds); fixture.renewal.update(fixture.identity, InitialEpochSeconds)
        assertEquals(SingleCount, fixture.scheduled.size)
        fixture.renewal.stop(); fixture.scheduled.single().action()
        assertTrue(fixture.tasks.isEmpty())
    }
    companion object {
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val InitialEpochSeconds = 10000L
        private const val InitialExpiryEpochSeconds = 10120L
        private const val RenewedExpiryEpochSeconds = 10240L
        private const val RenewalDelayMilliseconds = 60000L
        private const val Handle = 7L
        private const val Generation = 3L
        private const val ReconnectedGeneration = 4L
        private const val Account = "synthetic-app-account"
        private const val OtherAccount = "synthetic-other-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Session = "synthetic-jam"
        private const val Host = "synthetic-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Request = "synthetic-renewal-request"
        private const val Token = "synthetic-private-token"
        private const val BaseAddress = "https://media.example.test/api/"
        private const val Failure = "synthetic-failure"
        private const val AccountField = "streamingServiceAccountIdentifier"
        private const val GenerationField = "generation"
        private const val BaseAddressField = "baseAddress"
    }
}

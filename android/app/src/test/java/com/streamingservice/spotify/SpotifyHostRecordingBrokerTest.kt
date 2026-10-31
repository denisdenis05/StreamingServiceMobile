package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture

class SpotifyHostRecordingBrokerTest {
    private class Fixture {
        var current = true
        var sequence = EmptyCount
        var searches = EmptyCount
        var cancellations = EmptyCount
        val timers = mutableListOf<() -> Unit>()
        val work = ArrayDeque<Runnable>()
        val requests = mutableListOf<String>()
        val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        val configuration = SpotifyHostConfiguration(SpotifyJamPlaybackConfiguration(SpotifyJamPlaybackAccount(Account, Address, SpotifyAccount, Jam, Device,
            Handle, Generation, Market), Token, ExpirySeconds), identity, PreviousHost, SpotifyHostPlayerCursor(Queue, Revision, Revision, Revision), emptyList())
        val broker = SpotifyHostRecordingBroker(configuration, object : SpotifyBackgroundRecordingRunner {
            override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation {
                requests.add(requestIdentifier); return SpotifyNativeFollowerCancellation { cancellations += SingleCount }
            }
        }, { _, action -> timers.add(action); SpotifyNativeFollowerCancellation {} }, { Prefix + ++sequence }, { operation -> work.addLast(operation) },
            { handle, generation, _serialized -> assertEquals(Handle, handle); assertEquals(Generation, generation); searches += SingleCount; Response }, { current })
        fun resolve() = broker.resolve(identity, Recording)
        fun drain() { while (work.isNotEmpty()) work.removeFirst().run() }
    }
    @Test fun actualMatchRequiresAOneUseScopedClaimAndCompletion() {
        val fixture = Fixture(); val result = fixture.resolve(); assertFalse(result.result.isDone)
        val request = fixture.requests.single(); val job = JSONObject(fixture.broker.claim(request)!!)
        assertEquals(Recording, job.getString(RecordingField)); assertEquals(Account, job.getString(AccountField)); assertNull(fixture.broker.claim(request))
        fixture.broker.complete(request, Track); assertEquals(Track, result.result.get()); assertFalse(fixture.broker.isPending(request))
    }
    @Test fun confirmedPreparationIsReusedWithoutAnotherHeadlessJobAndCannotEscapeItsScope() {
        val fixture = Fixture(); val first = fixture.resolve(); val request = fixture.requests.single()
        fixture.broker.claim(request); fixture.broker.complete(request, Track)
        assertEquals(Track, first.result.get()); assertEquals(Track, fixture.broker.cached(fixture.identity, Recording))
        assertEquals(Track, fixture.resolve().result.get()); assertEquals(SingleCount, fixture.requests.size)
        fixture.current = false
        assertNull(fixture.broker.cached(fixture.identity, Recording)); assertTrue(fixture.resolve().result.isCompletedExceptionally)
    }
    @Test fun canceledAndRejectedPreparationNeverPopulateTheCache() {
        val fixture = Fixture(); val operation = fixture.resolve(); operation.cancel()
        assertTrue(operation.result.isCompletedExceptionally); assertNull(fixture.broker.cached(fixture.identity, Recording))
        fixture.resolve(); val request = fixture.requests.last(); fixture.broker.claim(request); fixture.broker.fail(request)
        assertNull(fixture.broker.cached(fixture.identity, Recording))
    }
    @Test fun retirementAndDeadlineCancelTasksAndPreventLateCompletion() {
        val retired = Fixture(); val result = retired.resolve(); retired.broker.retire()
        assertTrue(result.result.isCompletedExceptionally); assertEquals(SingleCount, retired.cancellations); assertNull(retired.broker.claim(retired.requests.single()))
        val timed = Fixture(); val expired = timed.resolve(); timed.timers.single()(); assertTrue(expired.result.isCompletedExceptionally)
    }
    @Test fun queuedSearchCannotRunAfterTheCapturedAccountIsReplaced() {
        val fixture = Fixture(); fixture.resolve(); val request = fixture.requests.single(); fixture.broker.claim(request)
        val search = fixture.broker.search(request, Query); fixture.current = false; fixture.drain()
        assertTrue(search.isCompletedExceptionally); assertEquals(EmptyCount, fixture.searches)
    }
    @Test fun nativeSearchIsBoundToTheClaimAndCannotRetryWithinTheSameJob() {
        val fixture = Fixture(); fixture.resolve(); val request = fixture.requests.single()
        assertTrue(fixture.broker.search(request, Query).isCompletedExceptionally)
        fixture.broker.claim(request); val search = fixture.broker.search(request, Query); fixture.drain(); assertEquals(Response, search.get())
        assertTrue(fixture.broker.search(request, Query).isCompletedExceptionally); assertEquals(SingleCount, fixture.searches)
    }
    @Test fun malformedMatchedTrackCannotCompleteAJobSuccessfully() {
        val fixture = Fixture(); val result = fixture.resolve(); val request = fixture.requests.single(); fixture.broker.claim(request)
        try { fixture.broker.complete(request, Recording); throw AssertionError() } catch (_failure: SpotifyConnectFailure) { Unit }
        assertTrue(result.result.isCompletedExceptionally)
    }
    @Test fun preparationBatchHasOneOverallDeadlineAndCancelsTheActiveHeadlessJob() {
        val fixture = Fixture()
        val prepared = fixture.broker.prepare(fixture.identity, listOf(Recording, OtherRecording)) { true }
        assertEquals(SingleCount, fixture.requests.size)
        fixture.timers.first()()
        assertTrue(prepared.isCompletedExceptionally)
        assertEquals(SingleCount, fixture.cancellations)
        assertEquals(SingleCount, fixture.requests.size)
        assertNull(fixture.broker.claim(fixture.requests.single()))
    }
    @Test fun preparationBatchRetiresBeforeStartingAnotherRecordingWhenTheIntentChanges() {
        val fixture = Fixture(); var wanted = true
        val prepared = fixture.broker.prepare(fixture.identity, listOf(Recording, OtherRecording)) { wanted }
        val request = fixture.requests.single(); fixture.broker.claim(request)
        wanted = false; fixture.broker.complete(request, Track)
        assertTrue(prepared.isCompletedExceptionally); assertEquals(SingleCount, fixture.requests.size)
    }
    companion object {
        private const val Account = "synthetic-account"
        private const val SpotifyAccount = "synthetic-spotify"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val PreviousHost = "synthetic-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Recording = "synthetic-recording"
        private const val OtherRecording = "synthetic-other-recording"
        private const val Queue = "synthetic-queue"
        private const val Prefix = "synthetic-job-"
        private const val Address = "https://synthetic.example/"
        private const val Token = "synthetic-token"
        private const val Market = "GB"
        private const val Track = "4uLU6hMCjMI75M1A2tKUQC"
        private const val Handle = 3L
        private const val Generation = 7L
        private const val Revision = 1L
        private const val ExpirySeconds = 2000000000L
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val Query = "{}"
        private const val Response = "synthetic-safe-response"
        private const val RecordingField = "recordingIdentifier"
        private const val AccountField = "streamingServiceAccountIdentifier"
    }
}

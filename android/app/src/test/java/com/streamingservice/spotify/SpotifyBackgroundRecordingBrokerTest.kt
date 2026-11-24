package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SpotifyBackgroundRecordingBrokerTest {
    private class Fixture : SpotifyFollowerMetadataSource, SpotifyBackgroundRecordingRunner, SpotifyNativeFollowerScheduler {
        data class Timer(val action: () -> Unit, var cancelled: Boolean = false)
        val identity = SpotifyNativeFollowerIdentity(APP_ACCOUNT, SPOTIFY_ACCOUNT, SESSION, HOST, HANDLE, GENERATION, SpotifyPlayerIdentity(ENGINE, AUTHENTICATION))
        val metadataRequests = mutableListOf<Pair<SpotifyNativeFollowerIdentity, String>>()
        val metadataResponses = mutableListOf<CompletableFuture<String>>()
        val started = mutableListOf<String>()
        val cancelled = mutableListOf<String>()
        val timers = mutableListOf<Timer>()
        val authenticated = mutableListOf<Pair<SpotifyNativeFollowerIdentity, String>>()
        var metadataAutomatic = true
        var current = true
        var sequence = EMPTY_COUNT
        var metadataFailure: Throwable? = null
        var runnerFailure: Throwable? = null
        var authentication = CompletableFuture.completedFuture(Unit)
        val broker = SpotifyBackgroundRecordingBroker(this, this, this, { REQUEST_PREFIX + ++sequence }, { MARKET }, { current }, { identity, token ->
            authenticated.add(identity to token); authentication
        })
        override fun read(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<String> {
            metadataRequests.add(identity to spotifyTrackIdentifier)
            val result = CompletableFuture<String>(); metadataResponses.add(result)
            if (metadataAutomatic) { if (metadataFailure == null) result.complete(metadata()) else result.completeExceptionally(requireNotNull(metadataFailure)) }
            return SpotifyFollowerOperation(result) { cancelled.add(METADATA_CANCELLATION) }
        }
        override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation {
            started.add(requestIdentifier); runnerFailure?.let(failed)
            return SpotifyNativeFollowerCancellation { cancelled.add(requestIdentifier) }
        }
        override fun schedule(delayMilliseconds: Long, action: () -> Unit): SpotifyNativeFollowerCancellation {
            assertEquals(TIMEOUT_MILLISECONDS, delayMilliseconds)
            val timer = Timer(action); timers.add(timer)
            return SpotifyNativeFollowerCancellation { timer.cancelled = true }
        }
        fun resolve(): SpotifyFollowerOperation<SpotifyFollowerRecordingResolution> = broker.resolve(identity, TRACK)
    }
    private fun requireFailure(code: String, result: CompletableFuture<*>) {
        try { result.get(); fail(EXPECTED_FAILURE) }
        catch (failure: ExecutionException) { assertEquals(code, (failure.cause as SpotifyConnectFailure).code) }
    }

    @Test fun nativeJobsCaptureExactSourceAndExposeOneCredentialFreeClaimAfterMetadataArrives() {
        val fixture = Fixture(); val operation = fixture.resolve()
        assertFalse(operation.result.isDone)
        assertEquals(listOf(fixture.identity to TRACK), fixture.metadataRequests)
        assertEquals(listOf(FIRST_REQUEST), fixture.started)
        val job = JSONObject(requireNotNull(fixture.broker.claim(FIRST_REQUEST)))
        assertEquals(APP_ACCOUNT, job.getString(APP_ACCOUNT_FIELD)); assertEquals(SPOTIFY_ACCOUNT, job.getString(SPOTIFY_ACCOUNT_FIELD))
        assertEquals(SESSION, job.getString(SESSION_FIELD)); assertEquals(HOST, job.getString(HOST_FIELD))
        assertEquals(HANDLE, job.getLong(HANDLE_FIELD)); assertEquals(GENERATION, job.getLong(GENERATION_FIELD))
        assertEquals(TRACK, job.getString(TRACK_FIELD)); assertEquals(MARKET, job.getString(MARKET_FIELD))
        assertFalse(job.toString().contains(TOKEN)); assertNull(fixture.broker.claim(FIRST_REQUEST))
    }
    @Test fun matchedAndAmbiguousOrUnavailableResultsSettleOnlyTheClaimedNativeRequest() {
        for (status in listOf(MATCHED, AMBIGUOUS, UNAVAILABLE)) {
            val fixture = Fixture(); val operation = fixture.resolve(); fixture.broker.claim(FIRST_REQUEST)
            val response = JSONObject().put(STATUS_FIELD, status)
            if (status == MATCHED) response.put(RECORDING_FIELD, RECORDING).put(TITLE_FIELD, TITLE).put(ARTIST_FIELD, ARTIST)
            assertTrue(fixture.broker.complete(FIRST_REQUEST, response.toString()))
            when (val selected = operation.result.get()) {
                is SpotifyFollowerRecordingResolution.Matched -> { assertEquals(MATCHED, status); assertEquals(RECORDING, selected.recording.recordingIdentifier) }
                SpotifyFollowerRecordingResolution.Ambiguous -> assertEquals(AMBIGUOUS, status)
                SpotifyFollowerRecordingResolution.Unavailable -> assertEquals(UNAVAILABLE, status)
            }
            assertFalse(fixture.broker.isPending(FIRST_REQUEST)); assertFalse(fixture.broker.complete(FIRST_REQUEST, response.toString()))
            assertTrue(fixture.timers.first().cancelled)
        }
    }
    @Test fun cancellationDuringMetadataPreventsTaskLaunchAndIgnoresLateNativeMetadata() {
        val fixture = Fixture(); fixture.metadataAutomatic = false; val operation = fixture.resolve()
        assertNull(fixture.broker.claim(FIRST_REQUEST)); operation.cancel()
        requireFailure(CANCELED, operation.result)
        fixture.metadataResponses.first().complete(metadata())
        assertTrue(fixture.started.isEmpty()); assertTrue(fixture.cancelled.contains(METADATA_CANCELLATION))
    }
    @Test fun nativeDeadlineRetiresAnUncooperativeTaskAndRejectsItsLateResult() {
        val fixture = Fixture(); val operation = fixture.resolve(); fixture.broker.claim(FIRST_REQUEST)
        fixture.timers.first().action(); requireFailure(DEADLINE, operation.result)
        assertTrue(fixture.cancelled.contains(FIRST_REQUEST)); assertFalse(fixture.broker.complete(FIRST_REQUEST, JSONObject().put(STATUS_FIELD, UNAVAILABLE).toString()))
    }
    @Test fun accountOrJamRetirementCancelsTheOldTaskAndCannotClaimOrCompleteItsReplacement() {
        val fixture = Fixture(); val old = fixture.resolve(); fixture.current = false
        assertFalse(fixture.broker.isPending(FIRST_REQUEST)); requireFailure(SUPERSEDED, old.result)
        fixture.current = true; val replacement = fixture.resolve()
        assertNull(fixture.broker.claim(FIRST_REQUEST)); assertNotNull(fixture.broker.claim(SECOND_REQUEST))
        assertFalse(replacement.result.isDone); assertFalse(fixture.broker.fail(FIRST_REQUEST, NETWORK))
    }
    @Test fun pendingCapacityIsBoundedAndAnExplicitRetirementCancelsEveryOutstandingOperation() {
        val fixture = Fixture(); val first = fixture.resolve(); val second = fixture.resolve(); val overflow = fixture.resolve()
        requireFailure(BACKPRESSURE, overflow.result); assertEquals(MAXIMUM_PENDING, fixture.metadataRequests.size)
        fixture.broker.retire(); requireFailure(CANCELED, first.result); requireFailure(CANCELED, second.result)
        assertTrue(fixture.timers.all { timer -> timer.cancelled })
    }
    @Test fun metadataAndRunnerFailuresUseSafeCodesWithoutStartingAnotherAuthenticationFlow() {
        val metadata = Fixture(); metadata.metadataFailure = SpotifyConnectFailure(UNAUTHORIZED)
        requireFailure(UNAUTHORIZED, metadata.resolve().result); assertTrue(metadata.started.isEmpty())
        val runner = Fixture(); runner.runnerFailure = IllegalStateException(PRIVATE_DIAGNOSTIC)
        requireFailure(NETWORK, runner.resolve().result); assertTrue(runner.cancelled.contains(FIRST_REQUEST))
    }
    @Test fun aMalformedMatchedResultCannotBecomeAnAutomaticPlayableRecording() {
        val fixture = Fixture(); val operation = fixture.resolve(); fixture.broker.claim(FIRST_REQUEST)
        try { fixture.broker.complete(FIRST_REQUEST, JSONObject().put(STATUS_FIELD, MATCHED).toString()); fail(EXPECTED_FAILURE) }
        catch (failure: SpotifyConnectFailure) { assertEquals(INVALID_INPUT, failure.code) }
        requireFailure(INVALID_RESPONSE, operation.result)
    }
    @Test fun unclaimedRequestsCannotCompleteOrUpdatePlayerAuthentication() {
        val fixture = Fixture(); val operation = fixture.resolve()
        requireFailure(INVALID_INPUT, fixture.broker.synchronizePlayerAuthentication(FIRST_REQUEST, APP_ACCOUNT, TOKEN))
        assertTrue(fixture.authenticated.isEmpty())
        try { fixture.broker.complete(FIRST_REQUEST, JSONObject().put(STATUS_FIELD, UNAVAILABLE).toString()); fail(EXPECTED_FAILURE) }
        catch (failure: SpotifyConnectFailure) { assertEquals(INVALID_INPUT, failure.code) }
        assertFalse(operation.result.isDone)
    }
    @Test fun playerAuthenticationUpdatesAreBoundToTheClaimedAppAccountAndRetiredCompletionIsRejected() {
        val fixture = Fixture(); fixture.resolve(); fixture.broker.claim(FIRST_REQUEST)
        requireFailure(INVALID_INPUT, fixture.broker.synchronizePlayerAuthentication(FIRST_REQUEST, OTHER_ACCOUNT, TOKEN))
        assertTrue(fixture.authenticated.isEmpty())
        fixture.authentication = CompletableFuture()
        val synchronized = fixture.broker.synchronizePlayerAuthentication(FIRST_REQUEST, APP_ACCOUNT, TOKEN)
        assertEquals(listOf(fixture.identity to TOKEN), fixture.authenticated)
        fixture.broker.retire(); fixture.authentication.complete(Unit)
        requireFailure(SUPERSEDED, synchronized)
    }
    @Test fun aReportedPrivateFailureIsReducedToAKnownNativeCode() {
        val fixture = Fixture(); val operation = fixture.resolve(); fixture.broker.claim(FIRST_REQUEST)
        assertTrue(fixture.broker.fail(FIRST_REQUEST, PRIVATE_DIAGNOSTIC)); requireFailure(NETWORK, operation.result)
    }
    @Test fun duplicateRequestIdentifiersCannotOverwriteTheOriginalNativeFuture() {
        val fixture = Fixture()
        val broker = SpotifyBackgroundRecordingBroker(fixture, fixture, fixture, { FIRST_REQUEST }, { MARKET }, { true }, { _, _ -> CompletableFuture.completedFuture(Unit) })
        val first = broker.resolve(fixture.identity, TRACK); val duplicate = broker.resolve(fixture.identity, TRACK)
        requireFailure(BACKPRESSURE, duplicate.result); assertFalse(first.result.isDone)
        broker.retire(); requireFailure(CANCELED, first.result)
    }

    companion object {
        private fun metadata(): String = JSONObject().put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, GENERATION).put(TRACKS_FIELD,
            JSONArray().put(JSONObject().put(TRACK_FIELD, TRACK).put(TITLE_FIELD, TITLE).put(ARTISTS_FIELD, JSONArray().put(ARTIST))
                .put(DURATION_FIELD, DURATION).put(CODES_FIELD, JSONArray()))).toString()
        private const val APP_ACCOUNT = "synthetic-app-account"
        private const val OTHER_ACCOUNT = "synthetic-other-account"
        private const val SPOTIFY_ACCOUNT = "synthetic-spotify-account"
        private const val SESSION = "synthetic-session"
        private const val HOST = "synthetic-host"
        private const val HANDLE = 7L
        private const val GENERATION = 3L
        private const val ENGINE = "synthetic-engine"
        private const val AUTHENTICATION = "synthetic-authentication"
        private const val TRACK = "0000000000000000000001"
        private const val MARKET = "RO"
        private const val RECORDING = "synthetic-recording"
        private const val TITLE = "Synthetic Song"
        private const val ARTIST = "Synthetic Artist"
        private const val DURATION = 180000L
        private const val TOKEN = "synthetic-private-token"
        private const val PRIVATE_DIAGNOSTIC = "synthetic-private-diagnostic"
        private const val REQUEST_PREFIX = "synthetic-request-"
        private const val FIRST_REQUEST = "synthetic-request-1"
        private const val SECOND_REQUEST = "synthetic-request-2"
        private const val EMPTY_COUNT = 0
        private const val MAXIMUM_PENDING = 2
        private const val TIMEOUT_MILLISECONDS = 30000L
        private const val METADATA_CANCELLATION = "metadata-cancelled"
        private const val EXPECTED_FAILURE = "Expected a bounded native recording failure"
        private const val APP_ACCOUNT_FIELD = "streamingServiceAccountIdentifier"
        private const val SPOTIFY_ACCOUNT_FIELD = "spotifyAccountIdentifier"
        private const val SESSION_FIELD = "jamSessionIdentifier"
        private const val HOST_FIELD = "hostDeviceIdentifier"
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val TRACK_FIELD = "spotifyTrackIdentifier"
        private const val TRACKS_FIELD = "tracks"
        private const val MARKET_FIELD = "market"
        private const val STATUS_FIELD = "status"
        private const val RECORDING_FIELD = "recordingIdentifier"
        private const val TITLE_FIELD = "title"
        private const val ARTIST_FIELD = "artist"
        private const val ARTISTS_FIELD = "artistNames"
        private const val DURATION_FIELD = "durationMilliseconds"
        private const val CODES_FIELD = "recordingCodes"
        private const val MATCHED = "matched"
        private const val AMBIGUOUS = "ambiguous"
        private const val UNAVAILABLE = "unavailable"
        private const val CANCELED = "canceled"
        private const val DEADLINE = "deadline"
        private const val SUPERSEDED = "superseded"
        private const val BACKPRESSURE = "backpressure"
        private const val INVALID_INPUT = "invalid-input"
        private const val INVALID_RESPONSE = "invalid-response"
        private const val UNAUTHORIZED = "unauthorized"
        private const val NETWORK = "network"
    }
}

package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SpotifyConnectObservationDecoderTest {
    private val decoder = SpotifyConnectObservationDecoder()
    private fun boundary() = SpotifyConnectObservationBoundary(HANDLE, GENERATION, HOST, SENT, RECEIVED)
    private fun response(): JSONObject = JSONObject().put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, GENERATION).put(SAMPLED_FIELD, NATIVE_END)
        .put(READING_FIELD, JSONObject().put(STARTED_FIELD, NATIVE_START).put(COMPLETED_FIELD, NATIVE_END)
            .put(CLUSTER_FIELD, JSONObject().put(HOST_FIELD, HOST).put(SERVER_TIME_FIELD, SERVER_TIME)
                .put(PLAYBACK_FIELD, JSONObject().put(STATE_TIME_FIELD, SERVER_TIME - SOURCE_ELAPSED).put(POSITION_FIELD, POSITION)
                    .put(DURATION_FIELD, DURATION).put(PLAYING_FIELD, true).put(PAUSED_FIELD, false).put(BUFFERING_FIELD, false)
                    .put(SPEED_FIELD, NORMAL_SPEED).put(REVISION_FIELD, REVISION)
                    .put(TRACK_FIELD, JSONObject().put(URI_FIELD, TRACK_URI).put(OCCURRENCE_FIELD, OCCURRENCE)))))
    private fun playback(response: JSONObject) = response.getJSONObject(READING_FIELD).getJSONObject(CLUSTER_FIELD).getJSONObject(PLAYBACK_FIELD)
    private fun cluster(response: JSONObject) = response.getJSONObject(READING_FIELD).getJSONObject(CLUSTER_FIELD)
    private fun requireFailure(code: String, operation: () -> Unit) {
        try { operation(); fail(EXPECTED_FAILURE_MESSAGE) } catch (failure: SpotifyConnectFailure) { assertEquals(code, failure.code) }
    }

    @Test
    fun freshNativeReadMapsPositionUsingServerTimeAndAnchorsOnlyInElapsedRealtime() {
        val sample = decoder.decode(response().toString(), boundary())
        assertEquals(POSITION + SOURCE_ELAPSED, sample.positionMilliseconds)
        assertEquals(EXPECTED_ANCHOR, sample.anchorElapsedRealtimeMilliseconds, EXACT_TOLERANCE)
        assertEquals(EXPECTED_UNCERTAINTY, sample.uncertaintyMilliseconds, EXACT_TOLERANCE)
        assertEquals(RECEIVED, sample.observedElapsedRealtimeMilliseconds)
        assertEquals(SERVER_TIME, sample.serverAtMilliseconds)
        assertEquals(TRACK_IDENTIFIER, sample.spotifyTrackIdentifier)
        assertEquals(OCCURRENCE, sample.occurrenceIdentifier)
        assertEquals(REVISION, sample.queueRevision)
        assertTrue(sample.progressing)
    }

    @Test
    fun pausedAndBufferingReadingsNeverAdvanceEvenWhenThePlayingFlagRemainsTrue() {
        for (field in listOf(PAUSED_FIELD, BUFFERING_FIELD)) {
            val response = response(); playback(response).put(field, true).put(SPEED_FIELD, STOPPED_SPEED)
            val sample = decoder.decode(response.toString(), boundary())
            assertFalse(sample.progressing); assertEquals(POSITION, sample.positionMilliseconds)
            assertEquals(field == BUFFERING_FIELD, sample.buffering)
        }
    }

    @Test
    fun activeZeroSpeedAndVariableSpeedCannotAdvertiseSupportedProgression() {
        for (speed in listOf(STOPPED_SPEED, VARIABLE_SPEED)) {
            val response = response(); playback(response).put(SPEED_FIELD, speed)
            requireFailure(UNSUPPORTED) { decoder.decode(response.toString(), boundary()) }
        }
    }

    @Test
    fun foreignHandleGenerationAndHostCannotCrossTheObservationBoundary() {
        for (field in listOf(HANDLE_FIELD, GENERATION_FIELD)) {
            val response = response().put(field, OTHER_IDENTIFIER)
            requireFailure(SUPERSEDED) { decoder.decode(response.toString(), boundary()) }
        }
        val response = response(); cluster(response).put(HOST_FIELD, OTHER_HOST)
        requireFailure(SUPERSEDED) { decoder.decode(response.toString(), boundary()) }
    }

    @Test
    fun nativeIntervalsAndSamplingMustFitInsideTheActualAndroidRequestBracket() {
        val reversed = response(); reversed.getJSONObject(READING_FIELD).put(COMPLETED_FIELD, NATIVE_START - ONE_MILLISECOND)
        requireFailure(INVALID_RESPONSE) { decoder.decode(reversed.toString(), boundary()) }
        val future = response(); future.put(SAMPLED_FIELD, NATIVE_END - ONE_MILLISECOND)
        requireFailure(INVALID_RESPONSE) { decoder.decode(future.toString(), boundary()) }
        val excessive = response(); excessive.getJSONObject(READING_FIELD).put(COMPLETED_FIELD, NATIVE_END + LONG_DELAY)
        excessive.put(SAMPLED_FIELD, NATIVE_END + LONG_DELAY)
        requireFailure(INVALID_RESPONSE) { decoder.decode(excessive.toString(), boundary()) }
    }

    @Test
    fun sleepOrInvalidCallerClocksCannotCreateAFreshSourceSample() {
        for (selected in listOf(boundary().copy(receivedElapsedRealtimeMilliseconds = SENT + LONG_DELAY),
            boundary().copy(receivedElapsedRealtimeMilliseconds = SENT - ONE_MILLISECOND),
            boundary().copy(sentElapsedRealtimeMilliseconds = Long.MAX_VALUE, receivedElapsedRealtimeMilliseconds = Long.MIN_VALUE))) {
            requireFailure(DEADLINE) { decoder.decode(response().toString(), selected) }
        }
    }

    @Test
    fun coercedBooleanNumericAndMissingOccurrenceFieldsAreRejected() {
        val boolean = response(); playback(boolean).put(PAUSED_FIELD, TRUE_TEXT)
        requireFailure(INVALID_RESPONSE) { decoder.decode(boolean.toString(), boundary()) }
        val numeric = response(); playback(numeric).put(POSITION_FIELD, POSITION.toString())
        requireFailure(INVALID_RESPONSE) { decoder.decode(numeric.toString(), boundary()) }
        val occurrence = response(); playback(occurrence).getJSONObject(TRACK_FIELD).put(OCCURRENCE_FIELD, JSONObject.NULL)
        requireFailure(INVALID_RESPONSE) { decoder.decode(occurrence.toString(), boundary()) }
    }

    @Test
    fun structuralAndEpisodeUrisCannotBeUsedAsTheCurrentPlayableSong() {
        for (uri in listOf(DELIMITER_URI, EPISODE_URI)) {
            val response = response(); playback(response).getJSONObject(TRACK_FIELD).put(URI_FIELD, uri)
            requireFailure(UNSUPPORTED) { decoder.decode(response.toString(), boundary()) }
        }
    }

    @Test
    fun impossibleServerAnchorsAndPositionsAreRejectedWhileARealEndPositionIsClamped() {
        val backwards = response(); cluster(backwards).put(SERVER_TIME_FIELD, SERVER_TIME - LONG_DELAY)
        requireFailure(INVALID_RESPONSE) { decoder.decode(backwards.toString(), boundary()) }
        for ((field, value) in listOf(DURATION_FIELD to ZERO_MILLISECONDS, POSITION_FIELD to DURATION + ONE_MILLISECOND)) {
            val response = response(); playback(response).put(field, value)
            requireFailure(INVALID_RESPONSE) { decoder.decode(response.toString(), boundary()) }
        }
        val ending = response(); playback(ending).put(POSITION_FIELD, DURATION - ONE_MILLISECOND)
        assertEquals(DURATION, decoder.decode(ending.toString(), boundary()).positionMilliseconds)
    }

    @Test
    fun knownFailuresArePreservedAndPrivateFailureTextIsNeverExported() {
        requireFailure(FORBIDDEN) { decoder.decode(JSONObject().put(FAILURE_FIELD, FORBIDDEN).toString(), boundary()) }
        requireFailure(NETWORK) { decoder.decode(JSONObject().put(FAILURE_FIELD, PRIVATE_DIAGNOSTIC).toString(), boundary()) }
        requireFailure(INVALID_RESPONSE) { decoder.decode(PRIVATE_DIAGNOSTIC, boundary()) }
    }

    companion object {
        private const val HANDLE = 7L
        private const val GENERATION = 3L
        private const val OTHER_IDENTIFIER = 9L
        private const val HOST = "synthetic-host"
        private const val OTHER_HOST = "synthetic-other-host"
        private const val SENT = 2000000L
        private const val RECEIVED = 2000200L
        private const val EXPECTED_ANCHOR = 2000100.0
        private const val EXPECTED_UNCERTAINTY = 101.0
        private const val EXACT_TOLERANCE = 0.0
        private const val NATIVE_START = 5000000L
        private const val NATIVE_END = 5000100L
        private const val SERVER_TIME = 1700000000000L
        private const val SOURCE_ELAPSED = 500L
        private const val POSITION = 10000L
        private const val DURATION = 180000L
        private const val LONG_DELAY = 2000L
        private const val ONE_MILLISECOND = 1L
        private const val ZERO_MILLISECONDS = 0L
        private const val NORMAL_SPEED = 1.0
        private const val STOPPED_SPEED = 0.0
        private const val VARIABLE_SPEED = 1.5
        private const val TRACK_IDENTIFIER = "0000000000000000000001"
        private const val TRACK_URI = "spotify:track:0000000000000000000001"
        private const val EPISODE_URI = "spotify:episode:0000000000000000000001"
        private const val DELIMITER_URI = "spotify:delimiter"
        private const val OCCURRENCE = "synthetic-actual-occurrence"
        private const val REVISION = "synthetic-actual-revision"
        private const val TRUE_TEXT = "true"
        private const val EXPECTED_FAILURE_MESSAGE = "Expected an observation failure"
        private const val PRIVATE_DIAGNOSTIC = "synthetic-private-diagnostic"
        private const val INVALID_RESPONSE = "invalid-response"
        private const val DEADLINE = "deadline"
        private const val SUPERSEDED = "superseded"
        private const val UNSUPPORTED = "unsupported"
        private const val FORBIDDEN = "forbidden"
        private const val NETWORK = "network"
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val SAMPLED_FIELD = "sampledNativeMonotonicMilliseconds"
        private const val READING_FIELD = "reading"
        private const val STARTED_FIELD = "requestStartedNativeMonotonicMilliseconds"
        private const val COMPLETED_FIELD = "requestCompletedNativeMonotonicMilliseconds"
        private const val CLUSTER_FIELD = "cluster"
        private const val HOST_FIELD = "activeDeviceIdentifier"
        private const val SERVER_TIME_FIELD = "serverAtMilliseconds"
        private const val PLAYBACK_FIELD = "playback"
        private const val STATE_TIME_FIELD = "timestampMilliseconds"
        private const val POSITION_FIELD = "positionAsOfTimestampMilliseconds"
        private const val DURATION_FIELD = "durationMilliseconds"
        private const val PLAYING_FIELD = "playing"
        private const val PAUSED_FIELD = "paused"
        private const val BUFFERING_FIELD = "buffering"
        private const val SPEED_FIELD = "playbackSpeed"
        private const val REVISION_FIELD = "queueRevision"
        private const val TRACK_FIELD = "track"
        private const val URI_FIELD = "uri"
        private const val OCCURRENCE_FIELD = "occurrenceIdentifier"
        private const val FAILURE_FIELD = "failure"
    }
}

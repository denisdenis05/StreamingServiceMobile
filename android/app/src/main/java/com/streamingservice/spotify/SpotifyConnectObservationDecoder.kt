package com.streamingservice.spotify

import org.json.JSONObject

data class SpotifyConnectObservationBoundary(
    val handle: Long,
    val generation: Long,
    val hostDeviceIdentifier: String,
    val sentElapsedRealtimeMilliseconds: Long,
    val receivedElapsedRealtimeMilliseconds: Long
)

data class SpotifyConnectPlaybackObservation(
    val handle: Long,
    val generation: Long,
    val hostDeviceIdentifier: String,
    val queueRevision: String,
    val spotifyTrackIdentifier: String,
    val occurrenceIdentifier: String,
    val positionMilliseconds: Long,
    val durationMilliseconds: Long,
    val progressing: Boolean,
    val buffering: Boolean,
    val anchorElapsedRealtimeMilliseconds: Double,
    val observedElapsedRealtimeMilliseconds: Long,
    val uncertaintyMilliseconds: Double,
    val serverAtMilliseconds: Long,
    val stateChangedAtServerMilliseconds: Long
)

class SpotifyConnectObservationDecoder {
    fun decode(serialized: String, boundary: SpotifyConnectObservationBoundary): SpotifyConnectPlaybackObservation {
        if (boundary.sentElapsedRealtimeMilliseconds !in MINIMUM_TIME_MILLISECONDS..MAXIMUM_SAFE_INTEGER
            || boundary.receivedElapsedRealtimeMilliseconds !in MINIMUM_TIME_MILLISECONDS..MAXIMUM_SAFE_INTEGER) fail(DEADLINE_FAILURE)
        val roundTrip = boundary.receivedElapsedRealtimeMilliseconds - boundary.sentElapsedRealtimeMilliseconds
        if (boundary.sentElapsedRealtimeMilliseconds < MINIMUM_TIME_MILLISECONDS || roundTrip < MINIMUM_TIME_MILLISECONDS
            || roundTrip > MAXIMUM_ROUND_TRIP_MILLISECONDS) fail(DEADLINE_FAILURE)
        if (boundary.handle !in FIRST_IDENTIFIER..MAXIMUM_SAFE_INTEGER || boundary.generation !in FIRST_IDENTIFIER..MAXIMUM_SAFE_INTEGER
            || boundary.hostDeviceIdentifier.isBlank()) fail(INVALID_INPUT_FAILURE)
        if (serialized.length > MAXIMUM_RESPONSE_CHARACTERS) fail(INVALID_RESPONSE_FAILURE)
        try {
            val response = JSONObject(serialized)
            if (response.has(FAILURE_FIELD) && !response.isNull(FAILURE_FIELD)) {
                val code = response.get(FAILURE_FIELD) as? String
                fail(code?.takeIf { selected -> selected in FAILURE_CODES } ?: NETWORK_FAILURE)
            }
            if (integer(response, HANDLE_FIELD) != boundary.handle || integer(response, GENERATION_FIELD) != boundary.generation) fail(SUPERSEDED_FAILURE)
            val reading = response.getJSONObject(READING_FIELD)
            val nativeStart = integer(reading, STARTED_FIELD)
            val nativeEnd = integer(reading, COMPLETED_FIELD)
            if (nativeEnd < nativeStart || integer(response, SAMPLED_FIELD) < nativeEnd
                || nativeEnd - nativeStart > roundTrip + NATIVE_PRECISION_MILLISECONDS) fail(INVALID_RESPONSE_FAILURE)
            val cluster = reading.getJSONObject(CLUSTER_FIELD)
            if (text(cluster, HOST_FIELD) != boundary.hostDeviceIdentifier) fail(SUPERSEDED_FAILURE)
            val playback = cluster.getJSONObject(PLAYBACK_FIELD)
            val track = playback.getJSONObject(TRACK_FIELD)
            val matchedTrack = TRACK_PATTERN.matchEntire(text(track, URI_FIELD)) ?: fail(UNSUPPORTED_FAILURE)
            val occurrence = text(track, OCCURRENCE_FIELD)
            val serverTime = integer(cluster, SERVER_TIME_FIELD)
            val stateTime = integer(playback, STATE_TIME_FIELD)
            val position = integer(playback, POSITION_FIELD)
            val duration = integer(playback, DURATION_FIELD)
            if (serverTime < stateTime || serverTime == MINIMUM_TIME_MILLISECONDS || duration == MINIMUM_TIME_MILLISECONDS || position > duration) fail(INVALID_RESPONSE_FAILURE)
            val playing = boolean(playback, PLAYING_FIELD)
            val paused = boolean(playback, PAUSED_FIELD)
            val buffering = boolean(playback, BUFFERING_FIELD)
            val progressing = playing && !paused && !buffering
            val speed = (playback.get(SPEED_FIELD) as? Number)?.toDouble() ?: fail(INVALID_RESPONSE_FAILURE)
            if (speed != NORMAL_PLAYBACK_SPEED && (speed != STOPPED_PLAYBACK_SPEED || progressing)) fail(UNSUPPORTED_FAILURE)
            val advance = if (progressing) serverTime - stateTime else MINIMUM_TIME_MILLISECONDS
            val estimatedPosition = position + advance
            if (estimatedPosition > MAXIMUM_SAFE_INTEGER) fail(INVALID_RESPONSE_FAILURE)
            return SpotifyConnectPlaybackObservation(boundary.handle, boundary.generation, boundary.hostDeviceIdentifier,
                text(playback, REVISION_FIELD), matchedTrack.groupValues[TRACK_IDENTIFIER_POSITION], occurrence,
                minOf(duration, estimatedPosition), duration, progressing, buffering,
                boundary.sentElapsedRealtimeMilliseconds + roundTrip.toDouble() / MIDPOINT_DIVISOR,
                boundary.receivedElapsedRealtimeMilliseconds, roundTrip.toDouble() / MIDPOINT_DIVISOR + NATIVE_PRECISION_MILLISECONDS,
                serverTime, stateTime)
        } catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail(INVALID_RESPONSE_FAILURE) }
    }

    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail(INVALID_RESPONSE_FAILURE)
        val decimal = number.toDouble()
        if (!decimal.isFinite() || decimal < MINIMUM_TIME_MILLISECONDS || decimal > MAXIMUM_SAFE_INTEGER || decimal != number.toLong().toDouble()) fail(INVALID_RESPONSE_FAILURE)
        return number.toLong()
    }

    private fun text(value: JSONObject, field: String): String {
        val selected = value.get(field) as? String ?: fail(INVALID_RESPONSE_FAILURE)
        if (selected.isEmpty() || selected.length > MAXIMUM_IDENTIFIER_CHARACTERS || selected.any { character -> character.isISOControl() }) fail(INVALID_RESPONSE_FAILURE)
        return selected
    }

    private fun boolean(value: JSONObject, field: String): Boolean = value.get(field) as? Boolean ?: fail(INVALID_RESPONSE_FAILURE)
    private fun fail(code: String): Nothing = throw SpotifyConnectFailure(code)

    companion object {
        private const val MINIMUM_TIME_MILLISECONDS = 0L
        private const val FIRST_IDENTIFIER = 1L
        private const val MAXIMUM_ROUND_TRIP_MILLISECONDS = 1500L
        private const val NATIVE_PRECISION_MILLISECONDS = 1L
        private const val MAXIMUM_SAFE_INTEGER = 9007199254740991L
        private const val MIDPOINT_DIVISOR = 2.0
        private const val NORMAL_PLAYBACK_SPEED = 1.0
        private const val STOPPED_PLAYBACK_SPEED = 0.0
        private const val MAXIMUM_IDENTIFIER_CHARACTERS = 2048
        private const val MAXIMUM_RESPONSE_CHARACTERS = 2097152
        private const val TRACK_IDENTIFIER_POSITION = 1
        private const val FAILURE_FIELD = "failure"
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val READING_FIELD = "reading"
        private const val STARTED_FIELD = "requestStartedNativeMonotonicMilliseconds"
        private const val COMPLETED_FIELD = "requestCompletedNativeMonotonicMilliseconds"
        private const val SAMPLED_FIELD = "sampledNativeMonotonicMilliseconds"
        private const val CLUSTER_FIELD = "cluster"
        private const val HOST_FIELD = "activeDeviceIdentifier"
        private const val PLAYBACK_FIELD = "playback"
        private const val TRACK_FIELD = "track"
        private const val URI_FIELD = "uri"
        private const val OCCURRENCE_FIELD = "occurrenceIdentifier"
        private const val SERVER_TIME_FIELD = "serverAtMilliseconds"
        private const val STATE_TIME_FIELD = "timestampMilliseconds"
        private const val POSITION_FIELD = "positionAsOfTimestampMilliseconds"
        private const val DURATION_FIELD = "durationMilliseconds"
        private const val PLAYING_FIELD = "playing"
        private const val PAUSED_FIELD = "paused"
        private const val BUFFERING_FIELD = "buffering"
        private const val SPEED_FIELD = "playbackSpeed"
        private const val REVISION_FIELD = "queueRevision"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val DEADLINE_FAILURE = "deadline"
        private const val SUPERSEDED_FAILURE = "superseded"
        private const val UNSUPPORTED_FAILURE = "unsupported"
        private const val NETWORK_FAILURE = "network"
        private val TRACK_PATTERN = Regex("spotify:track:([A-Za-z0-9]{22})")
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

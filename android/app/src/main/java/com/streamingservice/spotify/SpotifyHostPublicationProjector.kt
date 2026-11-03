package com.streamingservice.spotify

import com.streamingservice.player.queue.RepeatMode
import org.json.JSONArray
import org.json.JSONObject

data class SpotifyHostPublicationIdentity(val deviceIdentifier: String, val sessionIdentifier: String)
data class SpotifyHostRecordingMapping(val occurrenceIdentifier: String, val recordingIdentifier: String, val spotifyTrackIdentifier: String)
data class SpotifyHostClockAnchor(
    val identity: SpotifyHostIdentity,
    val nativeReadStartedMilliseconds: Long,
    val nativeReadCompletedMilliseconds: Long,
    val receivedElapsedMilliseconds: Long,
    val serverAtMilliseconds: Long,
    val uncertaintyMilliseconds: Long,
    val previousHostDeviceIdentifier: String
)

class SpotifyHostPublicationProjector(private val clock: SpotifyNativeFollowerClock) {
    fun project(queue: SpotifyHostPlayerQueue, mappings: List<SpotifyHostRecordingMapping>, nativeIdentity: SpotifyHostPublicationIdentity,
        anchor: SpotifyHostClockAnchor, sequence: Long, activeSinceServerMilliseconds: Long?, accepted: SpotifyHostCommandRequest? = null): JSONObject {
        val snapshot = queue.snapshot
        val duration = snapshot.durationMilliseconds ?: unavailable()
        val now = clock.nowElapsedRealtimeMilliseconds()
        if (!snapshot.externalAuthorityAbsent || snapshot.identity != anchor.identity || snapshot.identity.deviceIdentifier != nativeIdentity.deviceIdentifier
            || !identifier(nativeIdentity.deviceIdentifier) || !identifier(nativeIdentity.sessionIdentifier)
            || sequence !in FirstSequence..MaximumSafeInteger || queue.entries.isEmpty() || queue.entries.size > MaximumQueueTracks
            || queue.entries.map { entry -> entry.occurrenceIdentifier }.toSet().size != queue.entries.size
            || queue.shuffled || queue.repeatMode != RepeatMode.Off.protocolValue || queue.playbackRate != NormalPlaybackRate
            || duration !in MinimumDurationMilliseconds..MaximumSafeInteger || snapshot.positionMilliseconds !in MinimumMilliseconds..MaximumSafeInteger
            || !snapshot.ready && !snapshot.buffering) unavailable()
        validateClock(anchor, snapshot.sampledAtElapsedMilliseconds, now)
        val elapsedFromAnchor = snapshot.sampledAtElapsedMilliseconds - anchor.receivedElapsedMilliseconds
        val sampledNativeMilliseconds = checkedAdd(anchor.nativeReadCompletedMilliseconds, elapsedFromAnchor)
        val sampledServerMilliseconds = checkedAdd(anchor.serverAtMilliseconds, elapsedFromAnchor)
        val activeSince = activeSinceServerMilliseconds ?: sampledServerMilliseconds
        if (activeSince !in MinimumServerMilliseconds..sampledServerMilliseconds) unavailable()
        val currentPosition = queue.entries.indexOfFirst { entry -> entry.occurrenceIdentifier == snapshot.occurrenceIdentifier }
        if (currentPosition < FirstIndex) unavailable()
        val current = track(queue.entries[currentPosition], mappings) ?: unavailable()
        val previous = queue.entries.take(currentPosition).mapNotNull { entry -> track(entry, mappings) }
        val upcoming = queue.entries.drop(currentPosition + PositionIncrement).mapNotNull { entry -> track(entry, mappings) }
        val playback = when {
            snapshot.paused && snapshot.buffering -> PausedBuffering
            snapshot.buffering -> Buffering
            snapshot.paused -> Paused
            else -> Playing
        }
        val result = JSONObject().put(DeviceField, nativeIdentity.deviceIdentifier).put(SessionField, nativeIdentity.sessionIdentifier)
            .put(SequenceField, sequence).put(PlaybackField, requireNotNull(snapshot.occurrenceIdentifier))
            .put(RevisionField, snapshot.cursor.queueIdentifier + RevisionSeparator + snapshot.cursor.contentRevision)
            .put(TrackField, current).put(PreviousTracksField, JSONArray(previous))
            .put(NextTracksField, JSONArray(upcoming))
            .put(PositionField, minOf(snapshot.positionMilliseconds, duration)).put(DurationField, duration)
            .put(SampledServerField, sampledServerMilliseconds).put(SampledNativeField, sampledNativeMilliseconds)
            .put(UncertaintyField, anchor.uncertaintyMilliseconds).put(ActiveSinceField, activeSince).put(StateField, playback)
        if (accepted != null) {
            if (accepted.messageIdentifier !in MinimumMessageIdentifier..MaximumMessageIdentifier || !identifier(accepted.senderDeviceIdentifier)
                || accepted.sessionCommandIdentifier?.let { selected -> !identifier(selected) } == true) unavailable()
            result.put(AcceptedCommandField, JSONObject().put(MessageField, accepted.messageIdentifier)
                .put(SenderField, accepted.senderDeviceIdentifier).put(CommandField, accepted.sessionCommandIdentifier ?: JSONObject.NULL))
        } else result.put(AcceptedCommandField, JSONObject.NULL)
        return result
    }

    fun activation(requestIdentifier: String, anchor: SpotifyHostClockAnchor): JSONObject {
        if (!identifier(requestIdentifier) || anchor.previousHostDeviceIdentifier.isNotEmpty() && !identifier(anchor.previousHostDeviceIdentifier)) unavailable()
        return JSONObject().put(RequestField, requestIdentifier).put(GenerationField, anchor.identity.generation)
            .put(PreviousHostField, anchor.previousHostDeviceIdentifier)
            .put(ReadStartedField, anchor.nativeReadStartedMilliseconds).put(ReadCompletedField, anchor.nativeReadCompletedMilliseconds)
            .put(RequestedField, anchor.nativeReadStartedMilliseconds)
    }

    private fun validateClock(anchor: SpotifyHostClockAnchor, sampledElapsedMilliseconds: Long, nowElapsedMilliseconds: Long) {
        if (anchor.nativeReadStartedMilliseconds !in MinimumMilliseconds..MaximumSafeInteger
            || anchor.nativeReadCompletedMilliseconds !in anchor.nativeReadStartedMilliseconds..MaximumSafeInteger
            || anchor.receivedElapsedMilliseconds !in MinimumMilliseconds..MaximumSafeInteger
            || anchor.serverAtMilliseconds !in MinimumServerMilliseconds..MaximumSafeInteger
            || anchor.uncertaintyMilliseconds !in MinimumMilliseconds..MaximumUncertaintyMilliseconds
            || anchor.nativeReadCompletedMilliseconds - anchor.nativeReadStartedMilliseconds > anchor.uncertaintyMilliseconds
            || sampledElapsedMilliseconds < anchor.receivedElapsedMilliseconds || sampledElapsedMilliseconds > nowElapsedMilliseconds
            || nowElapsedMilliseconds - sampledElapsedMilliseconds > MaximumPlayerSampleAgeMilliseconds
            || nowElapsedMilliseconds - anchor.receivedElapsedMilliseconds > MaximumAnchorAgeMilliseconds) unavailable()
    }
    private fun checkedAdd(first: Long, second: Long): Long {
        val sum = try { Math.addExact(first, second) } catch (_failure: ArithmeticException) { unavailable() }
        if (sum !in MinimumMilliseconds..MaximumSafeInteger) unavailable()
        return sum
    }
    private fun track(entry: SpotifyHostQueueEntry, mappings: List<SpotifyHostRecordingMapping>): JSONObject? {
        if (!identifier(entry.occurrenceIdentifier) || !identifier(entry.recordingIdentifier)) unavailable()
        val selected = SpotifyHostRecordingMappings.select(entry, mappings) ?: return null
        if (!TrackPattern.matches(selected)) unavailable()
        return JSONObject().put(SpotifyTrackField, selected).put(OccurrenceField, entry.occurrenceIdentifier)
    }
    private fun identifier(value: String): Boolean = value.isNotBlank() && value.length <= MaximumIdentifierCharacters
        && value.none { character -> character.isWhitespace() || character.isISOControl() }
    private fun unavailable(): Nothing = throw SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable)

    companion object {
        const val MaximumQueueTracks = SpotifyHostingPolicy.MaximumQueueTracks
        private const val FirstIndex = 0
        private const val PositionIncrement = 1
        private const val FirstSequence = 1L
        private const val MinimumMilliseconds = 0L
        private const val MinimumDurationMilliseconds = 1L
        private const val MinimumServerMilliseconds = 1L
        private const val MaximumSafeInteger = SpotifyHostingPolicy.MaximumSafeInteger
        private const val MaximumUncertaintyMilliseconds = SpotifyHostingPolicy.MaximumClockUncertaintyMilliseconds
        private const val MaximumPlayerSampleAgeMilliseconds = 1500L
        private const val MaximumAnchorAgeMilliseconds = 15000L
        private const val MinimumMessageIdentifier = 0L
        private const val MaximumMessageIdentifier = 4294967295L
        private const val MaximumIdentifierCharacters = SpotifyHostingPolicy.MaximumIdentifierCharacters
        private const val NormalPlaybackRate = 1.0
        private val TrackPattern = Regex("[A-Za-z0-9]{22}")
        private const val DeviceField = "deviceIdentifier"
        private const val SessionField = "sessionIdentifier"
        private const val SequenceField = "sequence"
        private const val PlaybackField = "playbackIdentifier"
        private const val RevisionField = "queueRevision"
        private const val RevisionSeparator = ":"
        private const val TrackField = "track"
        private const val PreviousTracksField = "previousTracks"
        private const val NextTracksField = "nextTracks"
        private const val PositionField = "positionMilliseconds"
        private const val DurationField = "durationMilliseconds"
        private const val SampledServerField = "sampledServerTimestampMilliseconds"
        private const val SampledNativeField = "sampledNativeMonotonicMilliseconds"
        private const val UncertaintyField = "clockUncertaintyMilliseconds"
        private const val ActiveSinceField = "activeSinceServerTimestampMilliseconds"
        private const val StateField = "playback"
        private const val AcceptedCommandField = "acceptedCommand"
        private const val MessageField = "messageIdentifier"
        private const val SenderField = "senderDeviceIdentifier"
        private const val CommandField = "sessionCommandIdentifier"
        private const val RequestField = "requestIdentifier"
        private const val GenerationField = "generation"
        private const val PreviousHostField = "expectedPreviousHostDeviceIdentifier"
        private const val ReadStartedField = "observationStartedNativeMonotonicMilliseconds"
        private const val ReadCompletedField = "observationCompletedNativeMonotonicMilliseconds"
        private const val RequestedField = "requestedNativeMonotonicMilliseconds"
        private const val SpotifyTrackField = "spotifyTrackIdentifier"
        private const val OccurrenceField = "occurrenceIdentifier"
        private const val Playing = "playing"
        private const val Paused = "paused"
        private const val Buffering = "buffering"
        private const val PausedBuffering = "pausedBuffering"
    }
}

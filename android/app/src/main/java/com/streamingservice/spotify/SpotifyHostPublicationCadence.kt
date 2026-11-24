package com.streamingservice.spotify

class SpotifyHostPublicationCadence {
    private var previousQueue: SpotifyHostPlayerQueue? = null
    private var previousMappings = emptySet<SpotifyHostRecordingMapping>()
    private var publishedAtElapsedMilliseconds: Long? = null

    fun published(queue: SpotifyHostPlayerQueue, mappings: List<SpotifyHostRecordingMapping>, elapsedMilliseconds: Long) {
        previousQueue = queue.copy(entries = queue.entries.toList())
        previousMappings = relevantMappings(queue, mappings)
        publishedAtElapsedMilliseconds = elapsedMilliseconds
    }

    fun shouldPublish(queue: SpotifyHostPlayerQueue, mappings: List<SpotifyHostRecordingMapping>, acceptedCommandPending: Boolean,
        elapsedMilliseconds: Long): Boolean {
        val previous = previousQueue ?: return true
        val publishedAt = publishedAtElapsedMilliseconds ?: return true
        if (acceptedCommandPending || elapsedMilliseconds < publishedAt
            || elapsedMilliseconds - publishedAt >= SpotifyHostingPolicy.HostPublicationHeartbeatMilliseconds) return true
        if (semanticQueue(previous) != semanticQueue(queue) || previousMappings != relevantMappings(queue, mappings)) return true
        val previousSnapshot = previous.snapshot
        val snapshot = queue.snapshot
        if (snapshot.sampledAtElapsedMilliseconds < previousSnapshot.sampledAtElapsedMilliseconds) return true
        val advance = if (previousSnapshot.paused || previousSnapshot.buffering) NoPositionAdvanceMilliseconds
            else snapshot.sampledAtElapsedMilliseconds - previousSnapshot.sampledAtElapsedMilliseconds
        val duration = previousSnapshot.durationMilliseconds ?: return true
        val previousPosition = minOf(previousSnapshot.positionMilliseconds, duration)
        val boundedPosition = previousPosition + minOf(advance, duration - previousPosition)
        val difference = if (snapshot.positionMilliseconds >= boundedPosition) snapshot.positionMilliseconds - boundedPosition
            else boundedPosition - snapshot.positionMilliseconds
        return difference > SpotifyHostingPolicy.HostPositionDiscontinuityToleranceMilliseconds
    }

    private fun semanticQueue(queue: SpotifyHostPlayerQueue): SpotifyHostPlayerQueue = queue.copy(snapshot = queue.snapshot.copy(
        positionMilliseconds = NoPositionAdvanceMilliseconds, sampledAtElapsedMilliseconds = NoPositionAdvanceMilliseconds))

    private fun relevantMappings(queue: SpotifyHostPlayerQueue, mappings: List<SpotifyHostRecordingMapping>): Set<SpotifyHostRecordingMapping> {
        val recordings = queue.entries.map { entry -> entry.recordingIdentifier }.toSet()
        return mappings.filter { mapping -> mapping.recordingIdentifier in recordings }.toSet()
    }

    companion object {
        private const val NoPositionAdvanceMilliseconds = 0L
    }
}

package com.streamingservice.spotify

object SpotifyHostRecordingMappings {
    fun select(entry: SpotifyHostQueueEntry, mappings: List<SpotifyHostRecordingMapping>): String? {
        val exact = mappings.filter { mapping -> mapping.occurrenceIdentifier == entry.occurrenceIdentifier
            && mapping.recordingIdentifier == entry.recordingIdentifier }
        val selected = exact.ifEmpty { mappings.filter { mapping -> mapping.recordingIdentifier == entry.recordingIdentifier } }
        return selected.map { mapping -> mapping.spotifyTrackIdentifier }.distinct().singleOrNull()
    }
}

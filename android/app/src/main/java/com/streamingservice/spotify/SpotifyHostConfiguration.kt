package com.streamingservice.spotify

import org.json.JSONObject

data class SpotifyHostConfiguration(
    val playback: SpotifyJamPlaybackConfiguration,
    val identity: SpotifyHostIdentity,
    val previousHostDeviceIdentifier: String,
    val expectedCursor: SpotifyHostPlayerCursor,
    val mappings: List<SpotifyHostRecordingMapping>
)

class SpotifyHostConfigurationProtocol(private val playback: SpotifyJamPlaybackProtocol) {
    fun configuration(serialized: String): SpotifyHostConfiguration {
        try {
            if (serialized.length > MaximumConfigurationCharacters) fail()
            val value = JSONObject(serialized)
            val engine = identifier(value, EngineField)
            val authentication = identifier(value, AuthenticationField)
            val previousHost = value.get(PreviousHostField) as? String ?: fail()
            if (previousHost.isNotEmpty() && !validIdentifier(previousHost)) fail()
            val cursor = value.getJSONObject(CursorField)
            if (fields(cursor) != CursorFields) fail()
            val expected = SpotifyHostPlayerCursor(identifier(cursor, QueueField), integer(cursor, QueueRevisionField),
                integer(cursor, ContentRevisionField), integer(cursor, ControlRevisionField))
            val entries = value.getJSONArray(MappingsField)
            if (entries.length() > SpotifyHostingPolicy.MaximumQueueTracks) fail()
            val mappings = (FirstIndex until entries.length()).map { position ->
                val entry = entries.getJSONObject(position)
                if (fields(entry) != MappingFields) fail()
                val track = identifier(entry, TrackField)
                if (!TrackPattern.matches(track)) fail()
                SpotifyHostRecordingMapping(identifier(entry, OccurrenceField), identifier(entry, RecordingField), track)
            }
            if (mappings.map { mapping -> mapping.occurrenceIdentifier }.toSet().size != mappings.size) fail()
            HostingFields.forEach { field -> value.remove(field) }
            val configuration = playback.configuration(value.toString())
            val account = configuration.account
            val identity = SpotifyHostIdentity(account.streamingServiceAccountIdentifier, account.spotifyAccountIdentifier, account.jamSessionIdentifier,
                account.hostDeviceIdentifier, account.handle, account.generation, SpotifyPlayerIdentity(engine, authentication))
            if (listOf(identity.streamingServiceAccountIdentifier, identity.spotifyAccountIdentifier, identity.jamSessionIdentifier,
                identity.deviceIdentifier).any { selected -> !validIdentifier(selected) }) fail()
            return SpotifyHostConfiguration(configuration, identity, previousHost, expected, mappings)
        } catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail() }
    }
    private fun fields(value: JSONObject): Set<String> = value.keys().asSequence().toSet()
    private fun identifier(value: JSONObject, field: String): String = (value.get(field) as? String ?: fail()).also { selected -> if (!validIdentifier(selected)) fail() }
    private fun validIdentifier(value: String): Boolean = value.isNotBlank() && value.length <= SpotifyHostingPolicy.MaximumIdentifierCharacters
        && value.none { character -> character.isWhitespace() || character.isISOControl() }
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail()
        if (!number.toDouble().isFinite() || number.toDouble() != number.toLong().toDouble()
            || number.toLong() !in MinimumRevision..SpotifyHostingPolicy.MaximumSafeInteger) fail()
        return number.toLong()
    }
    private fun fail(): Nothing = throw SpotifyConnectFailure(InvalidInput)
    companion object {
        const val EngineField = "playerEngineEpoch"
        const val AuthenticationField = "playerAuthenticationEpoch"
        const val PreviousHostField = "previousHostDeviceIdentifier"
        const val CursorField = "expectedCursor"
        const val MappingsField = "mappings"
        const val QueueField = "queueIdentifier"
        const val QueueRevisionField = "queueRevision"
        const val ContentRevisionField = "contentRevision"
        const val ControlRevisionField = "controlRevision"
        const val OccurrenceField = "occurrenceIdentifier"
        const val RecordingField = "recordingIdentifier"
        const val TrackField = "spotifyTrackIdentifier"
        private const val FirstIndex = 0
        private const val MinimumRevision = 0L
        private const val MaximumConfigurationCharacters = 131072
        private const val InvalidInput = "invalid-input"
        private val HostingFields = setOf(EngineField, AuthenticationField, PreviousHostField, CursorField, MappingsField)
        private val CursorFields = setOf(QueueField, QueueRevisionField, ContentRevisionField, ControlRevisionField)
        private val MappingFields = setOf(OccurrenceField, RecordingField, TrackField)
        private val TrackPattern = Regex("[A-Za-z0-9]{22}")
    }
}

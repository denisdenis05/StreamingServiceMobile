package com.streamingservice.spotify

import org.json.JSONObject

sealed class SpotifyHostCommand {
    object Resume : SpotifyHostCommand()
    object Pause : SpotifyHostCommand()
    object Next : SpotifyHostCommand()
    object Previous : SpotifyHostCommand()
    data class Seek(val positionMilliseconds: Long) : SpotifyHostCommand()
    data class AddToQueue(val track: SpotifyHostTrack) : SpotifyHostCommand()
    data class Play(val tracks: List<SpotifyHostTrack>, val initiallyPaused: Boolean) : SpotifyHostCommand()
}

data class SpotifyHostTrack(val spotifyTrackIdentifier: String, val occurrenceIdentifier: String?)
data class SpotifyHostCommandRequest(
    val key: String,
    val messageIdentifier: Long,
    val senderDeviceIdentifier: String,
    val sessionCommandIdentifier: String?,
    val command: SpotifyHostCommand
)

class SpotifyHostCommandDecoder {
    fun decode(key: String, serialized: String): SpotifyHostCommandRequest {
        try {
            requireIdentifier(key)
            if (serialized.length > MaximumCommandCharacters) fail()
            val request = JSONObject(serialized)
            val command = request.getJSONObject(CommandField)
            val logging = if (command.has(LoggingField) && !command.isNull(LoggingField)) command.getJSONObject(LoggingField) else null
            val sessionCommandIdentifier = if (logging?.has(SessionCommandField) == true) text(logging, SessionCommandField) else null
            val action = when (command.get(EndpointField)) {
                ResumeEndpoint -> SpotifyHostCommand.Resume
                PauseEndpoint -> SpotifyHostCommand.Pause
                NextEndpoint -> {
                    if (command.has(TrackField) && !command.isNull(TrackField)) unsupported()
                    SpotifyHostCommand.Next
                }
                PreviousEndpoint -> SpotifyHostCommand.Previous
                SeekEndpoint -> SpotifyHostCommand.Seek(integer(command, ValueField, MaximumPositionMilliseconds))
                QueueEndpoint -> SpotifyHostCommand.AddToQueue(track(command.getJSONObject(TrackField)))
                PlayEndpoint -> play(command)
                else -> unsupported()
            }
            return SpotifyHostCommandRequest(key, integer(request, MessageIdentifierField, MaximumMessageIdentifier), text(request, SenderDeviceField), sessionCommandIdentifier, action)
        } catch (failure: SpotifyPlayerFailure) { throw failure }
        catch (_failure: Throwable) { fail() }
    }

    private fun play(command: JSONObject): SpotifyHostCommand.Play {
        val context = command.getJSONObject(ContextField)
        if (context.has(ContextAddressField) && !context.isNull(ContextAddressField)) unsupported()
        val pages = context.getJSONArray(PagesField)
        if (pages.length() != SinglePage) unsupported()
        val page = pages.getJSONObject(FirstIndex)
        if (page.has(NextPageAddressField) && !page.isNull(NextPageAddressField)) unsupported()
        val tracks = page.getJSONArray(TracksField)
        if (tracks.length() < MinimumTrackCount || tracks.length() > MaximumQueueTracks) fail()
        val selected = (FirstIndex until tracks.length()).map { position -> track(tracks.getJSONObject(position)) }
        if (selected.mapNotNull { track -> track.occurrenceIdentifier }.let { identifiers -> identifiers.toSet().size != identifiers.size }) fail()
        val options = if (command.has(OptionsField) && !command.isNull(OptionsField)) command.getJSONObject(OptionsField) else JSONObject()
        if (options.keys().asSequence().any { name -> name != InitiallyPausedField && !options.isNull(name) }) unsupported()
        val paused = if (options.has(InitiallyPausedField) && !options.isNull(InitiallyPausedField)) options.get(InitiallyPausedField) as? Boolean ?: fail() else false
        return SpotifyHostCommand.Play(selected, paused)
    }

    private fun track(value: JSONObject): SpotifyHostTrack {
        val address = text(value, TrackAddressField)
        if (!address.startsWith(TrackAddressPrefix)) fail()
        val identifier = address.removePrefix(TrackAddressPrefix)
        if (!TrackIdentifierPattern.matches(identifier)) fail()
        return SpotifyHostTrack(identifier, if (value.has(OccurrenceField) && !value.isNull(OccurrenceField)) text(value, OccurrenceField) else null)
    }
    private fun text(value: JSONObject, field: String): String = (value.get(field) as? String ?: fail()).also(::requireIdentifier)
    private fun requireIdentifier(value: String) { if (value.isBlank() || value.length > MaximumIdentifierCharacters || value.any { character -> character.isWhitespace() || character.isISOControl() }) fail() }
    private fun integer(value: JSONObject, field: String, maximum: Long): Long {
        val number = value.get(field) as? Number ?: fail()
        if (!number.toDouble().isFinite() || number.toDouble() != number.toLong().toDouble() || number.toLong() < MinimumPositionMilliseconds || number.toLong() > maximum) fail()
        return number.toLong()
    }
    private fun fail(): Nothing = throw SpotifyPlayerFailure(SpotifyPlayerFailureReason.InvalidInput)
    private fun unsupported(): Nothing = throw SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable)

    companion object {
        private const val MaximumCommandCharacters = 131072
        private const val MaximumIdentifierCharacters = 512
        private const val MaximumQueueTracks = 80
        private const val MinimumTrackCount = 1
        private const val SinglePage = 1
        private const val FirstIndex = 0
        private const val MinimumPositionMilliseconds = 0L
        private const val MaximumPositionMilliseconds = 4294967295L
        private const val MaximumMessageIdentifier = 4294967295L
        private const val CommandField = "command"
        private const val LoggingField = "logging_params"
        private const val SessionCommandField = "command_id"
        private const val EndpointField = "endpoint"
        private const val MessageIdentifierField = "message_id"
        private const val SenderDeviceField = "sent_by_device_id"
        private const val TrackField = "track"
        private const val ValueField = "value"
        private const val ContextField = "context"
        private const val ContextAddressField = "url"
        private const val PagesField = "pages"
        private const val TracksField = "tracks"
        private const val NextPageAddressField = "next_page_url"
        private const val OptionsField = "options"
        private const val InitiallyPausedField = "initially_paused"
        private const val TrackAddressField = "uri"
        private const val OccurrenceField = "uid"
        private const val TrackAddressPrefix = "spotify:track:"
        private const val ResumeEndpoint = "resume"
        private const val PauseEndpoint = "pause"
        private const val NextEndpoint = "skip_next"
        private const val PreviousEndpoint = "skip_prev"
        private const val SeekEndpoint = "seek_to"
        private const val QueueEndpoint = "add_to_queue"
        private const val PlayEndpoint = "play"
        private val TrackIdentifierPattern = Regex("[A-Za-z0-9]{22}")
    }
}

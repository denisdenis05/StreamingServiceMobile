package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyHostCommandTest {
    private val decoder = SpotifyHostCommandDecoder()
    private fun request(endpoint: String): JSONObject = JSONObject().put(MessageField, MessageIdentifier).put(SenderField, Sender)
        .put(CommandField, JSONObject().put(EndpointField, endpoint))
    private fun command(value: JSONObject): JSONObject = value.getJSONObject(CommandField)
    private fun decode(value: JSONObject): SpotifyHostCommandRequest = decoder.decode(Key, value.toString())
    private fun rejected(value: JSONObject) { try { decode(value); throw AssertionError(ExpectedFailure) } catch (_failure: SpotifyPlayerFailure) { Unit } }

    @Test fun realControlEndpointsRetainIncomingProvenance() {
        val actions = mapOf(Resume to SpotifyHostCommand.Resume, Pause to SpotifyHostCommand.Pause, Next to SpotifyHostCommand.Next, Previous to SpotifyHostCommand.Previous)
        actions.forEach { (endpoint, action) ->
            val value = request(endpoint); command(value).put(LoggingField, JSONObject().put(CommandIdentifierField, CommandIdentifier))
            val decoded = decode(value)
            assertEquals(action, decoded.command); assertEquals(Key, decoded.key); assertEquals(Sender, decoded.senderDeviceIdentifier)
            assertEquals(MessageIdentifier, decoded.messageIdentifier); assertEquals(CommandIdentifier, decoded.sessionCommandIdentifier)
        }
    }
    @Test fun seekRequiresARealBoundedNumericPosition() {
        val value = request(Seek); command(value).put(ValueField, PositionMilliseconds)
        assertEquals(SpotifyHostCommand.Seek(PositionMilliseconds), decode(value).command)
        command(value).put(ValueField, PositionMilliseconds.toString()); rejected(value)
        command(value).put(ValueField, NegativePositionMilliseconds); rejected(value)
    }
    @Test fun queueTracksMayOmitOccurrenceUntilTheActualPlayerAssignsItsEntryIdentifier() {
        val value = request(Queue); command(value).put(TrackField, JSONObject().put(AddressField, TrackAddress))
        val decoded = decode(value).command as SpotifyHostCommand.AddToQueue
        assertEquals(TrackIdentifier, decoded.track.spotifyTrackIdentifier); assertNull(decoded.track.occurrenceIdentifier)
    }
    @Test fun inlinePlayPreservesRepeatedTracksAndDistinctSuppliedOccurrences() {
        val value = request(Play)
        val tracks = JSONArray().put(JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, FirstOccurrence))
            .put(JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, SecondOccurrence))
        command(value).put(ContextField, JSONObject().put(PagesField, JSONArray().put(JSONObject().put(TracksField, tracks))))
            .put(OptionsField, JSONObject().put(InitiallyPausedField, true))
        val decoded = decode(value).command as SpotifyHostCommand.Play
        assertEquals(TrackCount, decoded.tracks.size); assertTrue(decoded.initiallyPaused)
        assertEquals(FirstOccurrence, decoded.tracks.first().occurrenceIdentifier)
        assertEquals(SecondOccurrence, decoded.tracks.last().occurrenceIdentifier)
    }
    @Test fun unresolvedContextsAndUnsupportedEndpointsAreRejected() {
        val unresolved = request(Play); command(unresolved).put(ContextField, JSONObject().put(AddressField, PlaylistAddress)); rejected(unresolved)
        listOf(Transfer, SetOptions, SetQueue).forEach { endpoint -> rejected(request(endpoint)) }
    }
    @Test fun malformedProvenanceAndNonTrackUrisNeverBecomeHostActions() {
        val value = request(Queue); command(value).put(TrackField, JSONObject().put(AddressField, PlaylistAddress)); rejected(value)
        val malformed = request(Pause); malformed.put(MessageField, MessageIdentifier.toString()); rejected(malformed)
    }
    @Test fun officialDirectedSkipRetainsItsProvidedTrackAndOccurrence() {
        val value = request(Next); command(value).put(TrackField, JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, SecondOccurrence))
        assertEquals(SpotifyHostCommand.Select(SpotifyHostTrack(TrackIdentifier, SecondOccurrence)), decode(value).command)
    }
    @Test fun officialSetQueueRetainsPreviousAndNextOccurrencesAndThePreviousRevision() {
        val value = request(SetQueue); command(value).put(QueueRevisionField, QueueRevision)
            .put(PreviousTracksField, JSONArray().put(JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, FirstOccurrence)))
            .put(NextTracksField, JSONArray().put(JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, SecondOccurrence)))
        assertEquals(SpotifyHostCommand.SetQueue(listOf(SpotifyHostTrack(TrackIdentifier, FirstOccurrence)),
            listOf(SpotifyHostTrack(TrackIdentifier, SecondOccurrence)), QueueRevision), decode(value).command)
    }
    @Test fun queueReplacementRejectsDuplicatedOccurrenceIdentitiesAcrossPreviousAndNextTracks() {
        val value = request(SetQueue); val track = JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, FirstOccurrence)
        command(value).put(QueueRevisionField, QueueRevision).put(PreviousTracksField, JSONArray().put(track)).put(NextTracksField, JSONArray().put(track))
        rejected(value)
    }
    @Test fun providedTrackDefaultEmptyUidIsTreatedAsAnUnspecifiedOccurrence() {
        val value = request(Next); command(value).put(TrackField, JSONObject().put(AddressField, TrackAddress).put(OccurrenceField, EmptyText))
        assertEquals(SpotifyHostCommand.Select(SpotifyHostTrack(TrackIdentifier, null)), decode(value).command)
    }
    companion object {
        private const val EmptyText = ""
        private const val QueueRevisionField = "queue_revision"
        private const val QueueRevision = "synthetic-previous-queue-revision"
        private const val PreviousTracksField = "prev_tracks"
        private const val NextTracksField = "next_tracks"
        private const val Key = "synthetic-host-request"
        private const val Sender = "synthetic-command-device"
        private const val CommandIdentifier = "synthetic-session-command"
        private const val MessageIdentifier = 42L
        private const val PositionMilliseconds = 1200L
        private const val NegativePositionMilliseconds = -1L
        private const val TrackCount = 2
        private const val TrackIdentifier = "4uLU6hMCjMI75M1A2tKUQC"
        private const val TrackAddress = "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
        private const val PlaylistAddress = "spotify:playlist:synthetic"
        private const val FirstOccurrence = "synthetic-first-entry"
        private const val SecondOccurrence = "synthetic-second-entry"
        private const val MessageField = "message_id"
        private const val SenderField = "sent_by_device_id"
        private const val CommandField = "command"
        private const val EndpointField = "endpoint"
        private const val LoggingField = "logging_params"
        private const val CommandIdentifierField = "command_id"
        private const val ValueField = "value"
        private const val TrackField = "track"
        private const val AddressField = "uri"
        private const val OccurrenceField = "uid"
        private const val ContextField = "context"
        private const val PagesField = "pages"
        private const val TracksField = "tracks"
        private const val OptionsField = "options"
        private const val InitiallyPausedField = "initially_paused"
        private const val Resume = "resume"
        private const val Pause = "pause"
        private const val Next = "skip_next"
        private const val Previous = "skip_prev"
        private const val Seek = "seek_to"
        private const val Queue = "add_to_queue"
        private const val Play = "play"
        private const val Transfer = "transfer"
        private const val SetOptions = "set_options"
        private const val SetQueue = "set_queue"
        private const val ExpectedFailure = "Expected a rejected host command"
    }
}

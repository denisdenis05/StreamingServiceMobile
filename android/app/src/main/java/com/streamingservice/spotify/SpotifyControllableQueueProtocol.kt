package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject

data class SpotifyControllableQueueEntry(val occurrenceIdentifier: String, val recordingIdentifier: String?, val spotifyIdentifier: String?)
data class SpotifyControllableQueueChange(val expectedScopeIdentifier: String, val expectedRevision: String,
    val operationIdentifier: String, val entries: List<SpotifyControllableQueueEntry>, val currentOccurrenceIdentifier: String?)

object SpotifyControllableQueueProtocol {
    const val LocalSide = "local"
    const val SpotifySide = "spotify"
    fun scope(identity: SpotifyHostIdentity): String = JSONArray(listOf(identity.streamingServiceAccountIdentifier,
        identity.spotifyAccountIdentifier, identity.jamSessionIdentifier, identity.deviceIdentifier,
        identity.handle.toString(), identity.generation.toString(), identity.playerIdentity.engineEpoch,
        identity.playerIdentity.authenticationEpoch)).toString()
    fun revision(queue: SpotifyHostPlayerQueue): String = JSONArray(listOf(queue.snapshot.cursor.queueIdentifier,
        queue.snapshot.cursor.queueRevision, queue.snapshot.cursor.contentRevision, queue.snapshot.cursor.controlRevision,
        queue.snapshot.occurrenceIdentifier ?: JSONObject.NULL)).toString()
    fun encode(queue: SpotifyHostPlayerQueue, mappings: List<SpotifyHostRecordingMapping>, operationIdentifier: String?, publishedOnly: Boolean = false): String {
        val entries = JSONArray()
        var complete = true
        queue.entries.forEach { entry ->
            val track = SpotifyHostRecordingMappings.select(entry, mappings)
            if (track == null) {
                if (publishedOnly) { complete = false; return@forEach }
            }
            entries.put(JSONObject().put(OccurrenceField, entry.occurrenceIdentifier).put(RecordingField, entry.recordingIdentifier)
                .put(SpotifyField, track ?: JSONObject.NULL))
        }
        return JSONObject().put(ScopeField, scope(queue.snapshot.identity)).put(RevisionField, revision(queue))
            .put(CurrentField, queue.snapshot.occurrenceIdentifier ?: JSONObject.NULL).put(EntriesField, entries)
            .put(LastOperationField, operationIdentifier ?: JSONObject.NULL).put(CompleteField, complete).toString()
    }
    fun decode(serialized: String): SpotifyControllableQueueChange {
        try {
            if (serialized.length > MaximumCharacters) fail()
            val value = JSONObject(serialized)
            if (value.keys().asSequence().toSet() != ChangeFields) fail()
            val entries = value.getJSONArray(EntriesField)
            if (entries.length() > SpotifyHostingPolicy.MaximumQueueTracks) fail()
            val captured = (FirstPosition until entries.length()).map { position ->
                val entry = entries.getJSONObject(position)
                if (entry.keys().asSequence().toSet() != EntryFields) fail()
                SpotifyControllableQueueEntry(text(entry, OccurrenceField), nullableText(entry, RecordingField), nullableText(entry, SpotifyField)).also { selected ->
                    if (selected.recordingIdentifier == null && selected.spotifyIdentifier == null
                        || selected.spotifyIdentifier?.let { identifier -> !TrackPattern.matches(identifier) } == true) fail()
                }
            }
            val current = nullableText(value, CurrentField)
            if (captured.map { entry -> entry.occurrenceIdentifier }.toSet().size != captured.size
                || captured.isEmpty() != (current == null) || current != null && captured.none { entry -> entry.occurrenceIdentifier == current }) fail()
            return SpotifyControllableQueueChange(text(value, ExpectedScopeField), text(value, ExpectedRevisionField), text(value, OperationField), captured, current)
        } catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail() }
    }
    fun requireExpected(change: SpotifyControllableQueueChange, queue: SpotifyHostPlayerQueue) {
        if (change.expectedScopeIdentifier != scope(queue.snapshot.identity) || change.expectedRevision != revision(queue)) throw SpotifyConnectFailure(Superseded)
    }
    fun requireSide(side: String) { if (side != LocalSide && side != SpotifySide) fail() }
    private fun nullableText(value: JSONObject, field: String): String? = if (value.isNull(field)) null else text(value, field)
    private fun text(value: JSONObject, field: String): String = (value.get(field) as? String ?: fail()).also { selected ->
        if (selected.isBlank() || selected.length > MaximumCharacters || selected.any { character -> character.isISOControl() }) fail()
    }
    private fun fail(): Nothing = throw SpotifyConnectFailure(InvalidInput)
    private const val MaximumCharacters = 131072
    private const val FirstPosition = 0
    private const val InvalidInput = "invalid-input"
    private const val Superseded = "superseded"
    private const val ScopeField = "scopeIdentifier"
    private const val RevisionField = "revision"
    private const val CurrentField = "currentOccurrenceIdentifier"
    private const val EntriesField = "entries"
    private const val OccurrenceField = "occurrenceIdentifier"
    private const val RecordingField = "recordingIdentifier"
    private const val SpotifyField = "spotifyIdentifier"
    private const val LastOperationField = "lastOperationIdentifier"
    private const val CompleteField = "complete"
    private const val ExpectedScopeField = "expectedScopeIdentifier"
    private const val ExpectedRevisionField = "expectedRevision"
    private const val OperationField = "operationIdentifier"
    private val ChangeFields = setOf(ExpectedScopeField, ExpectedRevisionField, OperationField, EntriesField, CurrentField)
    private val EntryFields = setOf(OccurrenceField, RecordingField, SpotifyField)
    private val TrackPattern = Regex("[A-Za-z0-9]{22}")
}

package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyControllableQueueProtocolTest {
    private val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
    private val cursor = SpotifyHostPlayerCursor(Queue, Revision, Revision, Revision)
    private fun queue() = SpotifyHostPlayerQueue(SpotifyHostPlayerSnapshot(identity, cursor, Current, Position, Duration, Sampled,
        true, false, false, true), listOf(SpotifyHostQueueEntry(Current, Recording), SpotifyHostQueueEntry(Upcoming, OtherRecording)), false, Repeat, Rate)
    private fun mappings() = listOf(SpotifyHostRecordingMapping(Current, Recording, Track))
    private fun change(): JSONObject = JSONObject().put(ExpectedScope, SpotifyControllableQueueProtocol.scope(identity))
        .put(ExpectedRevision, SpotifyControllableQueueProtocol.revision(queue())).put(Operation, Request)
        .put(CurrentField, Current).put(Entries, JSONObject(SpotifyControllableQueueProtocol.encode(queue(), mappings(), null)).getJSONArray(Entries))

    @Test fun localReadDescribesTheCompleteActualQueueDespiteUnmappedFutureTracks() {
        val snapshot = JSONObject(SpotifyControllableQueueProtocol.encode(queue(), mappings(), null))
        assertEquals(TwoEntries, snapshot.getJSONArray(Entries).length())
        assertTrue(snapshot.getJSONArray(Entries).getJSONObject(SecondPosition).isNull(SpotifyField))
        assertTrue(snapshot.getBoolean(Complete))
        assertEquals(Current, snapshot.getString(CurrentField))
    }
    @Test fun spotifyReadContainsOnlyActualPublishedMappedOccurrences() {
        val snapshot = JSONObject(SpotifyControllableQueueProtocol.encode(queue(), mappings(), Request, true))
        assertEquals(OneEntry, snapshot.getJSONArray(Entries).length())
        assertEquals(Track, snapshot.getJSONArray(Entries).getJSONObject(FirstPosition).getString(SpotifyField))
        assertEquals(Request, snapshot.getString(LastOperation))
    }
    @Test fun revisionTracksQueueControlsAndCurrentOccurrenceButNotSamplePosition() {
        val original = queue()
        assertNotEquals(SpotifyControllableQueueProtocol.revision(original), SpotifyControllableQueueProtocol.revision(original.copy(snapshot = original.snapshot.copy(cursor = cursor.copy(controlRevision = NextRevision)))))
        assertNotEquals(SpotifyControllableQueueProtocol.revision(original), SpotifyControllableQueueProtocol.revision(original.copy(snapshot = original.snapshot.copy(occurrenceIdentifier = Upcoming))))
        assertEquals(SpotifyControllableQueueProtocol.revision(original), SpotifyControllableQueueProtocol.revision(original.copy(snapshot = original.snapshot.copy(positionMilliseconds = LaterPosition))))
    }
    @Test fun accountAndConnectionGenerationArePartOfTheQueueScope() {
        assertNotEquals(SpotifyControllableQueueProtocol.scope(identity), SpotifyControllableQueueProtocol.scope(identity.copy(generation = NextGeneration)))
        assertNotEquals(SpotifyControllableQueueProtocol.scope(identity), SpotifyControllableQueueProtocol.scope(identity.copy(streamingServiceAccountIdentifier = OtherAccount)))
    }
    @Test fun actualCasChangeRoundTripsWithoutFabricatingIdentifiers() {
        val decoded = SpotifyControllableQueueProtocol.decode(change().toString())
        SpotifyControllableQueueProtocol.requireExpected(decoded, queue())
        assertEquals(Current, decoded.currentOccurrenceIdentifier)
        assertEquals(Recording, decoded.entries.first().recordingIdentifier)
        assertEquals(null, decoded.entries[SecondPosition].spotifyIdentifier)
    }
    @Test fun duplicateOccurrencesAndForeignCurrentAreRejected() {
        val duplicate = change()
        duplicate.getJSONArray(Entries).getJSONObject(SecondPosition).put(Occurrence, Current)
        rejected(duplicate)
        rejected(change().put(CurrentField, ForeignCurrent))
    }
    @Test fun unknownFieldsAndInvalidTrackIdentifiersCannotEnterNativeQueueWrites() {
        rejected(change().put(ForeignField, Request))
        val invalid = change()
        invalid.getJSONArray(Entries).getJSONObject(FirstPosition).put(SpotifyField, InvalidTrack)
        rejected(invalid)
    }
    @Test fun exactOccurrenceMappingWinsOverAnotherSpotifyReleaseForTheSameRecording() {
        val otherTrack = "bbbbbbbbbbbbbbbbbbbbbb"
        val alternatives = mappings() + SpotifyHostRecordingMapping(Upcoming, Recording, otherTrack)
        val snapshot = JSONObject(SpotifyControllableQueueProtocol.encode(queue(), alternatives, null))
        assertEquals(Track, snapshot.getJSONArray(Entries).getJSONObject(FirstPosition).getString(SpotifyField))
        assertEquals(otherTrack, SpotifyHostRecordingMappings.select(SpotifyHostQueueEntry(Upcoming, Recording), alternatives))
    }
    @Test fun conflictingReleaseMappingsCannotBeGuessedForANewOccurrence() {
        val otherTrack = "bbbbbbbbbbbbbbbbbbbbbb"
        val newOccurrence = "new-occurrence"
        val alternatives = mappings() + SpotifyHostRecordingMapping(Upcoming, Recording, otherTrack)
        assertEquals(null, SpotifyHostRecordingMappings.select(SpotifyHostQueueEntry(newOccurrence, Recording), alternatives))
    }
    @Test fun unambiguousRecordingMappingCanBeReusedForANewOccurrence() {
        val newOccurrence = "new-occurrence"
        assertEquals(Track, SpotifyHostRecordingMappings.select(SpotifyHostQueueEntry(newOccurrence, Recording), mappings()))
    }
    @Test fun staleControlRevisionCannotAuthorizeAQueueChange() {
        val captured = SpotifyControllableQueueProtocol.decode(change().toString())
        val original = queue()
        try {
            SpotifyControllableQueueProtocol.requireExpected(captured, original.copy(snapshot = original.snapshot.copy(cursor = cursor.copy(controlRevision = NextRevision))))
            throw AssertionError(ExpectedRejection)
        } catch (failure: SpotifyConnectFailure) { assertEquals(Superseded, failure.code) }
    }
    private fun rejected(value: JSONObject) {
        try { SpotifyControllableQueueProtocol.decode(value.toString()); throw AssertionError(ExpectedRejection) }
        catch (failure: SpotifyConnectFailure) { assertEquals(InvalidInput, failure.code) }
    }
    companion object {
        private const val Account = "local-account"
        private const val OtherAccount = "other-account"
        private const val SpotifyAccount = "spotify-account"
        private const val Jam = "jam"
        private const val Device = "device"
        private const val Handle = 1L
        private const val Generation = 1L
        private const val NextGeneration = 2L
        private const val Engine = "engine"
        private const val Authentication = "authentication"
        private const val Queue = "queue"
        private const val Revision = 1L
        private const val NextRevision = 2L
        private const val Current = "current"
        private const val Upcoming = "upcoming"
        private const val ForeignCurrent = "foreign"
        private const val Recording = "recording"
        private const val OtherRecording = "other-recording"
        private const val Track = "aaaaaaaaaaaaaaaaaaaaaa"
        private const val InvalidTrack = "invalid"
        private const val Position = 0L
        private const val LaterPosition = 1000L
        private const val Duration = 200000L
        private const val Sampled = 1000L
        private const val Repeat = "off"
        private const val Rate = 1.0
        private const val Request = "operation"
        private const val ExpectedScope = "expectedScopeIdentifier"
        private const val ExpectedRevision = "expectedRevision"
        private const val Operation = "operationIdentifier"
        private const val CurrentField = "currentOccurrenceIdentifier"
        private const val Occurrence = "occurrenceIdentifier"
        private const val Entries = "entries"
        private const val SpotifyField = "spotifyIdentifier"
        private const val LastOperation = "lastOperationIdentifier"
        private const val Complete = "complete"
        private const val ForeignField = "foreignField"
        private const val FirstPosition = 0
        private const val SecondPosition = 1
        private const val OneEntry = 1
        private const val TwoEntries = 2
        private const val Superseded = "superseded"
        private const val InvalidInput = "invalid-input"
        private const val ExpectedRejection = "expected-rejection"
    }
}

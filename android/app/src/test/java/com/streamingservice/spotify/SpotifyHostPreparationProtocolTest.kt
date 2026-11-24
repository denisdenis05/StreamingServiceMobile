package com.streamingservice.spotify

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SpotifyHostPreparationProtocolTest {
    @Test fun preparationAcceptsBoundedRealRecordingIdentifiersAndDeduplicatesThem() {
        assertEquals(listOf(Recording), SpotifyHostPreparationProtocol.decode(JSONArray(listOf(Recording, Recording)).toString()))
        assertEquals(emptyList<String>(), SpotifyHostPreparationProtocol.decode(JSONArray().toString()))
    }
    @Test fun malformedCoercedOversizedAndInvalidIdentifiersCannotStartPreparation() {
        listOf(Malformed, JSONArray(listOf(true)).toString(), JSONArray(listOf(Blank)).toString(),
            JSONArray(listOf(Whitespace)).toString(), JSONArray(List(ExcessiveRecordings) { Recording }).toString(),
            JSONArray(listOf(Recording.repeat(SpotifyHostingPolicy.MaximumIdentifierCharacters))).toString()).forEach { serialized ->
            assertThrows(SpotifyConnectFailure::class.java) { SpotifyHostPreparationProtocol.decode(serialized) }
        }
    }
    companion object {
        private const val Recording = "synthetic-recording"
        private const val Malformed = "{}"
        private const val Blank = ""
        private const val Whitespace = "synthetic recording"
        private const val BoundaryIncrement = 1
        private const val ExcessiveRecordings = SpotifyHostingPolicy.MaximumQueueTracks + BoundaryIncrement
    }
}

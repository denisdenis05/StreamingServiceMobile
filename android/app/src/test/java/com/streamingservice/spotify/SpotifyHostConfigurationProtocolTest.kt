package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SpotifyHostConfigurationProtocolTest {
    private val protocol = SpotifyHostConfigurationProtocol(SpotifyJamPlaybackProtocol(object : SpotifyJamPlaybackTokenDecoder {
        override fun payload(serialized: String): String = JSONObject().put(SubjectField, Account).put(ExpiryField, ExpirySeconds).toString()
    }))
    @Test fun exactConfigurationRetainsTheActualEpochsCursorAndMappings() {
        val result = protocol.configuration(value().toString())
        assertEquals(Engine, result.identity.playerIdentity.engineEpoch); assertEquals(Authentication, result.identity.playerIdentity.authenticationEpoch)
        assertEquals(Revision, result.expectedCursor.controlRevision); assertEquals(Device, result.identity.deviceIdentifier)
        assertEquals(Track, result.mappings.single().spotifyTrackIdentifier); assertEquals(PreviousHost, result.previousHostDeviceIdentifier)
    }
    @Test fun initialHostingMayHaveNoPreviousActiveHost() {
        assertEquals(EmptyHost, protocol.configuration(value().put(SpotifyHostConfigurationProtocol.PreviousHostField, EmptyHost).toString()).previousHostDeviceIdentifier)
    }
    @Test fun unexpectedTopLevelAndNestedFieldsAreRejected() {
        rejected(value().put(Unexpected, true))
        val cursor = value(); cursor.getJSONObject(SpotifyHostConfigurationProtocol.CursorField).put(Unexpected, true); rejected(cursor)
        val mapping = value(); mapping.getJSONArray(SpotifyHostConfigurationProtocol.MappingsField).getJSONObject(FirstIndex).put(Unexpected, true); rejected(mapping)
    }
    @Test fun duplicateOccurrencesAndMalformedSpotifyIdentifiersAreRejected() {
        val duplicate = value(); val entries = duplicate.getJSONArray(SpotifyHostConfigurationProtocol.MappingsField); entries.put(entries.getJSONObject(FirstIndex)); rejected(duplicate)
        val malformed = value(); malformed.getJSONArray(SpotifyHostConfigurationProtocol.MappingsField).getJSONObject(FirstIndex)
            .put(SpotifyHostConfigurationProtocol.TrackField, InvalidTrack); rejected(malformed)
    }
    @Test fun numericCoercionNegativeRevisionAndMissingEpochAreRejected() {
        val coerced = value(); coerced.getJSONObject(SpotifyHostConfigurationProtocol.CursorField).put(SpotifyHostConfigurationProtocol.ControlRevisionField, Revision.toString()); rejected(coerced)
        val negative = value(); negative.getJSONObject(SpotifyHostConfigurationProtocol.CursorField).put(SpotifyHostConfigurationProtocol.ControlRevisionField, NegativeRevision); rejected(negative)
        val missing = value(); missing.remove(SpotifyHostConfigurationProtocol.EngineField); rejected(missing)
    }
    @Test fun insecureServerAddressAndExtraCredentialsRemainRejected() {
        rejected(value().put(SpotifyJamPlaybackProtocol.BaseAddressField, InsecureAddress))
        rejected(value().put(UnexpectedCredentialField, Token))
    }
    private fun rejected(value: JSONObject) {
        try { protocol.configuration(value.toString()); throw AssertionError() }
        catch (failure: SpotifyConnectFailure) { assertEquals(InvalidInput, failure.code) }
    }
    private fun value(): JSONObject = JSONObject().put(SpotifyJamPlaybackProtocol.AppAccountField, Account)
        .put(SpotifyJamPlaybackProtocol.BaseAddressField, Address).put(SpotifyJamPlaybackProtocol.AccessTokenField, Token)
        .put(SpotifyJamPlaybackProtocol.SpotifyAccountField, SpotifyAccount).put(SpotifyJamPlaybackProtocol.SessionField, Jam)
        .put(SpotifyJamPlaybackProtocol.HostField, Device).put(SpotifyJamPlaybackProtocol.HandleField, Handle)
        .put(SpotifyJamPlaybackProtocol.GenerationField, Generation).put(SpotifyJamPlaybackProtocol.MarketField, Market)
        .put(SpotifyHostConfigurationProtocol.EngineField, Engine).put(SpotifyHostConfigurationProtocol.AuthenticationField, Authentication)
        .put(SpotifyHostConfigurationProtocol.PreviousHostField, PreviousHost).put(SpotifyHostConfigurationProtocol.CursorField,
            JSONObject().put(SpotifyHostConfigurationProtocol.QueueField, Queue).put(SpotifyHostConfigurationProtocol.QueueRevisionField, Revision)
                .put(SpotifyHostConfigurationProtocol.ContentRevisionField, Revision).put(SpotifyHostConfigurationProtocol.ControlRevisionField, Revision))
        .put(SpotifyHostConfigurationProtocol.MappingsField, JSONArray().put(JSONObject().put(SpotifyHostConfigurationProtocol.OccurrenceField, Occurrence)
            .put(SpotifyHostConfigurationProtocol.RecordingField, Recording).put(SpotifyHostConfigurationProtocol.TrackField, Track)))
    companion object {
        private const val Account = "synthetic-account"
        private const val Address = "https://synthetic.example/"
        private const val InsecureAddress = "http://synthetic.example/"
        private const val Token = "header.payload.signature"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val PreviousHost = "synthetic-previous-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Market = "GB"
        private const val Queue = "synthetic-queue"
        private const val Occurrence = "synthetic-occurrence"
        private const val Recording = "synthetic-recording"
        private const val Track = "4uLU6hMCjMI75M1A2tKUQC"
        private const val InvalidTrack = "not-a-track"
        private const val Handle = 3L
        private const val Generation = 7L
        private const val Revision = 0L
        private const val NegativeRevision = -1L
        private const val ExpirySeconds = 2000000000L
        private const val FirstIndex = 0
        private const val EmptyHost = ""
        private const val SubjectField = "sub"
        private const val ExpiryField = "exp"
        private const val Unexpected = "unexpected"
        private const val UnexpectedCredentialField = "spotifyCredential"
        private const val InvalidInput = "invalid-input"
    }
}

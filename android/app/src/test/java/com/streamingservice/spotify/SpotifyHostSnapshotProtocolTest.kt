package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyHostSnapshotProtocolTest {
    @Test fun snapshotsCarryActualScopeAndStatusWithoutCredentialsOrSongDetails() {
        val identity = SpotifyHostIdentity(Account, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        val value = JSONObject(SpotifyHostSnapshotProtocol.encode(SpotifyHostSnapshot(identity, SpotifyHostStatus.Hosting)))
        assertEquals(SpotifyHostStatus.Hosting.name, value.getString(StatusField))
        assertEquals(Device, value.getJSONObject(IdentityField).getString(DeviceField))
        assertEquals(Generation, value.getJSONObject(IdentityField).getLong(GenerationField))
        assertFalse(value.toString().contains(TokenField)); assertFalse(value.toString().contains(TitleField))
    }
    @Test fun detachedSnapshotHasNoInventedIdentity() {
        val value = JSONObject(SpotifyHostSnapshotProtocol.encode(null))
        assertEquals(SpotifyHostStatus.Stopped.name, value.getString(StatusField)); assertTrue(value.isNull(IdentityField))
    }
    companion object {
        private const val Account = "synthetic-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Handle = 3L
        private const val Generation = 7L
        private const val StatusField = "status"
        private const val IdentityField = "identity"
        private const val DeviceField = "deviceIdentifier"
        private const val GenerationField = "generation"
        private const val TokenField = "accessToken"
        private const val TitleField = "title"
    }
}

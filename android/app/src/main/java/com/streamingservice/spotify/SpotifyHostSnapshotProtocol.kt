package com.streamingservice.spotify

import org.json.JSONObject

object SpotifyHostSnapshotProtocol {
    fun encode(snapshot: SpotifyHostSnapshot?): String {
        val identity = snapshot?.identity
        val value = if (identity == null) JSONObject.NULL else JSONObject()
            .put(AccountField, identity.streamingServiceAccountIdentifier).put(SpotifyAccountField, identity.spotifyAccountIdentifier)
            .put(JamField, identity.jamSessionIdentifier).put(DeviceField, identity.deviceIdentifier)
            .put(HandleField, identity.handle).put(GenerationField, identity.generation)
            .put(EngineField, identity.playerIdentity.engineEpoch).put(AuthenticationField, identity.playerIdentity.authenticationEpoch)
        return JSONObject().put(StatusField, snapshot?.status?.name ?: SpotifyHostStatus.Stopped.name)
            .put(IdentityField, value).put(FailureField, snapshot?.failure ?: JSONObject.NULL)
            .put(FailureStageField, snapshot?.failureStage?.name ?: JSONObject.NULL).toString()
    }
    private const val StatusField = "status"
    private const val IdentityField = "identity"
    private const val FailureStageField = "failureStage"
    private const val FailureField = "failure"
    private const val AccountField = "streamingServiceAccountIdentifier"
    private const val SpotifyAccountField = "spotifyAccountIdentifier"
    private const val JamField = "jamSessionIdentifier"
    private const val DeviceField = "deviceIdentifier"
    private const val HandleField = "handle"
    private const val GenerationField = "generation"
    private const val EngineField = "playerEngineEpoch"
    private const val AuthenticationField = "playerAuthenticationEpoch"
}

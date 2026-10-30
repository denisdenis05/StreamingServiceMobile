package com.streamingservice.spotify

import org.json.JSONObject
import java.net.URI

interface SpotifyJamPlaybackTokenDecoder {
    fun payload(serialized: String): String
}

data class SpotifyJamPlaybackAccount(
    val streamingServiceAccountIdentifier: String,
    val baseAddress: String,
    val spotifyAccountIdentifier: String,
    val jamSessionIdentifier: String,
    val hostDeviceIdentifier: String,
    val handle: Long,
    val generation: Long,
    val market: String
)
data class SpotifyJamPlaybackConfiguration(val account: SpotifyJamPlaybackAccount, val accessToken: String, val tokenExpiresAtSeconds: Long)

class SpotifyJamPlaybackProtocol(private val tokens: SpotifyJamPlaybackTokenDecoder) {
    fun configuration(serialized: String): SpotifyJamPlaybackConfiguration {
        try {
            if (serialized.length > MaximumConfigurationCharacters) fail()
            val value = JSONObject(serialized)
            if (value.keys().asSequence().toSet() != ConfigurationFields) fail()
            val account = SpotifyJamPlaybackAccount(text(value, AppAccountField), text(value, BaseAddressField), text(value, SpotifyAccountField),
                text(value, SessionField), text(value, HostField), integer(value, HandleField), integer(value, GenerationField), text(value, MarketField))
            val address = URI(account.baseAddress)
            if (address.scheme != SecureScheme || address.host.isNullOrBlank() || address.userInfo != null || address.query != null || address.fragment != null
                || !MarketPattern.matches(account.market)) fail()
            val token = value.get(AccessTokenField) as? String ?: fail()
            return SpotifyJamPlaybackConfiguration(account, token, tokenExpiry(account.streamingServiceAccountIdentifier, token))
        } catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail() }
    }

    fun tokenExpiry(accountIdentifier: String, token: String): Long {
        try {
            if (token.isBlank() || token.length > MaximumTokenCharacters || token.any { character -> character.isWhitespace() || character.isISOControl() }) fail()
            val segments = token.split(SegmentSeparator)
            if (segments.size != SegmentCount || segments.any { segment -> !TokenSegmentPattern.matches(segment) }) fail()
            val payload = JSONObject(tokens.payload(segments[PayloadSegmentIndex]))
            if (payload.get(SubjectField) != accountIdentifier) throw SpotifyConnectFailure(UnauthorizedFailure)
            return integer(payload, ExpiryField)
        } catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail() }
    }

    fun snapshot(identifier: String?, account: SpotifyJamPlaybackAccount?, follower: SpotifyNativeFollowerSnapshot?, nativeHandoff: Boolean = false): String = JSONObject()
        .put(NativeHandoffField, nativeHandoff).put(IdentifierField, identifier ?: JSONObject.NULL).put(StatusField, follower?.status?.name ?: SpotifyNativeFollowerStatus.Detached.name)
        .put(AppAccountField, account?.streamingServiceAccountIdentifier ?: JSONObject.NULL)
        .put(BaseAddressField, account?.baseAddress ?: JSONObject.NULL).put(MarketField, account?.market ?: JSONObject.NULL)
        .put(SpotifyAccountField, account?.spotifyAccountIdentifier ?: JSONObject.NULL).put(SessionField, account?.jamSessionIdentifier ?: JSONObject.NULL)
        .put(HostField, account?.hostDeviceIdentifier ?: JSONObject.NULL).put(HandleField, account?.handle ?: JSONObject.NULL)
        .put(GenerationField, account?.generation ?: JSONObject.NULL).put(OccurrenceField, follower?.occurrenceIdentifier ?: JSONObject.NULL)
        .put(PlayerEngineEpochField, follower?.identity?.playerIdentity?.engineEpoch ?: JSONObject.NULL)
        .put(PlayerAuthenticationEpochField, follower?.identity?.playerIdentity?.authenticationEpoch ?: JSONObject.NULL)
        .put(RecordingField, follower?.recordingIdentifier ?: JSONObject.NULL).put(DriftField, follower?.driftMilliseconds ?: JSONObject.NULL)
        .put(FailureField, follower?.failure?.name ?: JSONObject.NULL).toString()

    fun validateIdentifier(identifier: String) { if (identifier.isBlank() || identifier.length > MaximumIdentifierCharacters || identifier.any { character -> character.isWhitespace() || character.isISOControl() }) fail() }
    private fun text(value: JSONObject, field: String): String {
        val selected = value.get(field) as? String ?: fail()
        if (selected.isBlank() || selected.length > MaximumTextCharacters || selected.any { character -> character.isISOControl() }) fail()
        return selected
    }
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail()
        val decimal = number.toDouble()
        if (!decimal.isFinite() || decimal < FirstIdentifier || decimal > MaximumSafeInteger || decimal != number.toLong().toDouble()) fail()
        return number.toLong()
    }
    private fun fail(): Nothing = throw SpotifyConnectFailure(InvalidInputFailure)

    companion object {
        const val AppAccountField = "streamingServiceAccountIdentifier"
        const val BaseAddressField = "baseAddress"
        const val AccessTokenField = "accessToken"
        const val SpotifyAccountField = "spotifyAccountIdentifier"
        const val SessionField = "jamSessionIdentifier"
        const val HostField = "hostDeviceIdentifier"
        const val HandleField = "handle"
        const val GenerationField = "generation"
        const val MarketField = "market"
        private const val NativeHandoffField = "nativeHandoff"
        private const val PlayerEngineEpochField = "playerEngineEpoch"
        private const val PlayerAuthenticationEpochField = "playerAuthenticationEpoch"
        private const val IdentifierField = "identifier"
        private const val StatusField = "status"
        private const val OccurrenceField = "occurrenceIdentifier"
        private const val RecordingField = "recordingIdentifier"
        private const val DriftField = "driftMilliseconds"
        private const val FailureField = "failure"
        private const val SubjectField = "sub"
        private const val ExpiryField = "exp"
        private const val SecureScheme = "https"
        private const val SegmentSeparator = '.'
        private const val SegmentCount = 3
        private const val PayloadSegmentIndex = 1
        private const val MaximumConfigurationCharacters = 131072
        private const val MaximumTokenCharacters = 65536
        private const val MaximumTextCharacters = 2048
        private const val MaximumIdentifierCharacters = 128
        private const val FirstIdentifier = 1L
        private const val MaximumSafeInteger = 9007199254740991L
        private const val InvalidInputFailure = "invalid-input"
        private const val UnauthorizedFailure = "unauthorized"
        private val MarketPattern = Regex("[A-Z]{2}")
        private val TokenSegmentPattern = Regex("[A-Za-z0-9_-]+")
        private val ConfigurationFields = setOf(AppAccountField, BaseAddressField, AccessTokenField, SpotifyAccountField, SessionField, HostField, HandleField, GenerationField, MarketField)
    }
}

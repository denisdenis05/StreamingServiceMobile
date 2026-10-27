package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

interface SpotifyFollowerNativeReads {
    fun membership(handle: Long, generation: Long): String
    fun playback(handle: Long, generation: Long): String
}

internal object PlatformSpotifyFollowerNativeReads : SpotifyFollowerNativeReads {
    override fun membership(handle: Long, generation: Long): String = SpotifyLibrespotNative.connectMembership(handle, generation)
    override fun playback(handle: Long, generation: Long): String = SpotifyLibrespotNative.connectRead(handle, generation)
}

class SpotifyConnectVerifiedFollowerSource(
    private val native: SpotifyFollowerNativeReads,
    private val executor: Executor,
    private val clock: SpotifyNativeFollowerClock,
    private val isCurrentAccount: (SpotifyNativeFollowerIdentity) -> Boolean,
    private val decoder: SpotifyConnectObservationDecoder = SpotifyConnectObservationDecoder()
) : SpotifyNativeFollowerObservationSource {
    override fun read(identity: SpotifyNativeFollowerIdentity): SpotifyFollowerOperation<SpotifyConnectPlaybackObservation> {
        val completion = CompletableFuture<SpotifyConnectPlaybackObservation>()
        val cancelled = AtomicBoolean(false)
        try {
            SpotifyNativeFollowerTiming.validateIdentity(identity)
            executor.execute {
                try {
                    requireCurrent(identity, cancelled)
                    verifyMembership(native.membership(identity.handle, identity.generation), identity)
                    requireCurrent(identity, cancelled)
                    val before = clock.nowElapsedRealtimeMilliseconds()
                    val serialized = native.playback(identity.handle, identity.generation)
                    val after = clock.nowElapsedRealtimeMilliseconds()
                    requireCurrent(identity, cancelled)
                    val observation = decoder.decode(serialized, SpotifyConnectObservationBoundary(identity.handle, identity.generation,
                        identity.hostDeviceIdentifier, before, after))
                    verifyMembership(native.membership(identity.handle, identity.generation), identity)
                    requireCurrent(identity, cancelled)
                    completion.complete(observation)
                } catch (failure: Throwable) {
                    completion.completeExceptionally(if (failure is SpotifyConnectFailure || failure is SpotifyNativeFollowerFailure) failure else SpotifyConnectFailure(NETWORK_FAILURE))
                }
            }
        } catch (failure: SpotifyNativeFollowerFailure) { completion.completeExceptionally(failure) }
        catch (_failure: Throwable) { completion.completeExceptionally(SpotifyConnectFailure(BACKPRESSURE_FAILURE)) }
        return SpotifyFollowerOperation(completion) {
            cancelled.set(true)
            completion.completeExceptionally(SpotifyConnectFailure(CANCELED_FAILURE))
        }
    }

    private fun requireCurrent(identity: SpotifyNativeFollowerIdentity, cancelled: AtomicBoolean) {
        if (cancelled.get()) fail(CANCELED_FAILURE)
        if (!isCurrentAccount(identity)) fail(SUPERSEDED_FAILURE)
    }

    private fun verifyMembership(serialized: String, identity: SpotifyNativeFollowerIdentity) {
        if (serialized.length > MAXIMUM_RESPONSE_CHARACTERS) fail(INVALID_RESPONSE_FAILURE)
        try { verifyMembership(JSONObject(serialized), identity) }
        catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail(INVALID_RESPONSE_FAILURE) }
    }

    private fun verifyMembership(response: JSONObject, identity: SpotifyNativeFollowerIdentity) {
        if (response.has(FAILURE_FIELD) && !response.isNull(FAILURE_FIELD)) {
            val code = response.get(FAILURE_FIELD) as? String
            fail(code?.takeIf { selected -> selected in FAILURE_CODES } ?: NETWORK_FAILURE)
        }
        if (integer(response, HANDLE_FIELD) != identity.handle || integer(response, GENERATION_FIELD) != identity.generation) fail(SUPERSEDED_FAILURE)
        val reading = response.getJSONObject(READING_FIELD)
        if (reading.get(ACCOUNT_FIELD) != identity.spotifyAccountIdentifier) fail(UNAUTHORIZED_FAILURE)
        if (!reading.has(MEMBERSHIP_FIELD)) fail(INVALID_RESPONSE_FAILURE)
        if (reading.isNull(MEMBERSHIP_FIELD)) fail(SUPERSEDED_FAILURE)
        val membership = reading.getJSONObject(MEMBERSHIP_FIELD)
        if (membership.get(SESSION_FIELD) != identity.jamSessionIdentifier || membership.opt(HOST_FIELD) != identity.hostDeviceIdentifier) fail(SUPERSEDED_FAILURE)
        val active = membership.get(ACTIVE_FIELD) as? Boolean ?: fail(INVALID_RESPONSE_FAILURE)
        val owned = membership.get(OWNER_FIELD) as? Boolean ?: fail(INVALID_RESPONSE_FAILURE)
        if (!active) fail(SUPERSEDED_FAILURE)
        val participants = membership.getJSONArray(PARTICIPANTS_FIELD)
        if (participants.length() > MAXIMUM_PARTICIPANTS) fail(INVALID_RESPONSE_FAILURE)
        val identifiers = HashSet<String>()
        for (position in FIRST_POSITION until participants.length()) {
            val participant = participants.get(position) as? String ?: fail(INVALID_RESPONSE_FAILURE)
            if (participant.isBlank() || participant.length > MAXIMUM_IDENTIFIER_CHARACTERS
                || participant.any { character -> character.isWhitespace() || character.isISOControl() } || !identifiers.add(participant)) fail(INVALID_RESPONSE_FAILURE)
        }
        if (!owned && !identifiers.contains(identity.spotifyAccountIdentifier)) fail(FORBIDDEN_FAILURE)
    }

    private fun integer(value: JSONObject, field: String): Long {
        val selected = value.get(field) as? Number ?: fail(INVALID_RESPONSE_FAILURE)
        val decimal = selected.toDouble()
        if (!decimal.isFinite() || decimal < FIRST_IDENTIFIER || decimal > MAXIMUM_SAFE_INTEGER || decimal != selected.toLong().toDouble()) fail(INVALID_RESPONSE_FAILURE)
        return selected.toLong()
    }

    private fun fail(code: String): Nothing = throw SpotifyConnectFailure(code)

    companion object {
        private const val FIRST_POSITION = 0
        private const val FIRST_IDENTIFIER = 1L
        private const val MAXIMUM_SAFE_INTEGER = 9007199254740991L
        private const val MAXIMUM_RESPONSE_CHARACTERS = 2097152
        private const val MAXIMUM_IDENTIFIER_CHARACTERS = 512
        private const val MAXIMUM_PARTICIPANTS = 256
        private const val FAILURE_FIELD = "failure"
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val READING_FIELD = "reading"
        private const val ACCOUNT_FIELD = "accountIdentifier"
        private const val MEMBERSHIP_FIELD = "membership"
        private const val SESSION_FIELD = "sessionIdentifier"
        private const val HOST_FIELD = "hostDeviceIdentifier"
        private const val ACTIVE_FIELD = "active"
        private const val OWNER_FIELD = "ownedByCurrentAccount"
        private const val PARTICIPANTS_FIELD = "participantIdentifiers"
        private const val NETWORK_FAILURE = "network"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val CANCELED_FAILURE = "canceled"
        private const val SUPERSEDED_FAILURE = "superseded"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val UNAUTHORIZED_FAILURE = "unauthorized"
        private const val FORBIDDEN_FAILURE = "forbidden"
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

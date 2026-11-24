package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

class SpotifyConnectFollowerMetadataSource(
    private val executor: Executor,
    private val isCurrent: (SpotifyNativeFollowerIdentity) -> Boolean,
    private val nativeMetadata: (Long, Long, String) -> String = { handle, generation, identifiers -> SpotifyLibrespotNative.connectMetadata(handle, generation, identifiers) }
) : SpotifyFollowerMetadataSource {
    override fun read(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<String> {
        val completion = CompletableFuture<String>()
        val cancelled = AtomicBoolean(false)
        try {
            SpotifyNativeFollowerTiming.validateIdentity(identity)
            if (!SpotifyNativeFollowerPolicy.TrackIdentifierPattern.matches(spotifyTrackIdentifier)) fail(INVALID_INPUT)
            executor.execute {
                try {
                    requireCurrent(identity, cancelled)
                    val serialized = try { nativeMetadata(identity.handle, identity.generation, JSONArray().put(spotifyTrackIdentifier).toString()) }
                        catch (_failure: Throwable) { fail(NETWORK) }
                    requireCurrent(identity, cancelled)
                    if (serialized.length > MAXIMUM_RESPONSE_CHARACTERS) fail(INVALID_RESPONSE)
                    val response = try { JSONObject(serialized) } catch (_failure: Throwable) { fail(INVALID_RESPONSE) }
                    if (response.has(FAILURE_FIELD) && !response.isNull(FAILURE_FIELD)) {
                        val code = response.get(FAILURE_FIELD) as? String
                        fail(code?.takeIf { selected -> selected in FAILURE_CODES } ?: NETWORK)
                    }
                    if (integer(response, HANDLE_FIELD) != identity.handle || integer(response, GENERATION_FIELD) != identity.generation) fail(SUPERSEDED)
                    completion.complete(serialized)
                } catch (failure: Throwable) { completion.completeExceptionally(if (failure is SpotifyConnectFailure) failure else SpotifyConnectFailure(NETWORK)) }
            }
        } catch (_failure: SpotifyNativeFollowerFailure) { completion.completeExceptionally(SpotifyConnectFailure(INVALID_INPUT)) }
        catch (failure: SpotifyConnectFailure) { completion.completeExceptionally(failure) }
        catch (_failure: Throwable) { completion.completeExceptionally(SpotifyConnectFailure(BACKPRESSURE)) }
        return SpotifyFollowerOperation(completion) {
            cancelled.set(true)
            completion.completeExceptionally(SpotifyConnectFailure(CANCELED))
        }
    }

    private fun requireCurrent(identity: SpotifyNativeFollowerIdentity, cancelled: AtomicBoolean) {
        if (cancelled.get()) fail(CANCELED)
        if (!isCurrent(identity)) fail(SUPERSEDED)
    }
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.opt(field) as? Number ?: fail(INVALID_RESPONSE)
        val decimal = number.toDouble()
        if (!decimal.isFinite() || decimal < FIRST_IDENTIFIER || decimal > MAXIMUM_SAFE_INTEGER || decimal != number.toLong().toDouble()) fail(INVALID_RESPONSE)
        return number.toLong()
    }
    private fun fail(code: String): Nothing = throw SpotifyConnectFailure(code)

    companion object {
        private const val FIRST_IDENTIFIER = 1L
        private const val MAXIMUM_SAFE_INTEGER = 9007199254740991L
        private const val MAXIMUM_RESPONSE_CHARACTERS = 2097152
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val FAILURE_FIELD = "failure"
        private const val INVALID_INPUT = "invalid-input"
        private const val INVALID_RESPONSE = "invalid-response"
        private const val SUPERSEDED = "superseded"
        private const val CANCELED = "canceled"
        private const val NETWORK = "network"
        private const val BACKPRESSURE = "backpressure"
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

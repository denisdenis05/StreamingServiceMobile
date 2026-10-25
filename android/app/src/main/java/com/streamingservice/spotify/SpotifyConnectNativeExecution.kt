package com.streamingservice.spotify

import org.json.JSONObject

interface SpotifyConnectNativeCalls {
    fun start(serialized: String): String
    fun poll(handle: Long): String
    fun execute(handle: Long, serialized: String): String
    fun cancel(handle: Long): String
    fun finish(handle: Long): String
}

private object PlatformSpotifyConnectNativeCalls : SpotifyConnectNativeCalls {
    override fun start(serialized: String): String = SpotifyLibrespotNative.connectStart(serialized)
    override fun poll(handle: Long): String = SpotifyLibrespotNative.connectPoll(handle)
    override fun execute(handle: Long, serialized: String): String = SpotifyLibrespotNative.connectExecute(handle, serialized)
    override fun cancel(handle: Long): String = SpotifyLibrespotNative.connectCancel(handle)
    override fun finish(handle: Long): String = SpotifyLibrespotNative.connectFinish(handle)
}

class SpotifyConnectNativeExecution(private val native: SpotifyConnectNativeCalls = PlatformSpotifyConnectNativeCalls) : SpotifyConnectExecution {
    override fun start(serialized: String): Long = decode(native.start(serialized)) { response -> handle(response) }

    override fun poll(handle: Long): SpotifyConnectBatch {
        val serialized = native.poll(handle)
        return decode(serialized) { response ->
            if (handle(response) != handle) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            val finished = response.get(FINISHED_FIELD) as? Boolean ?: throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            val eventCount = response.getJSONArray(EVENTS_FIELD).length()
            if (eventCount > MAXIMUM_BATCH_EVENTS) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            SpotifyConnectBatch(serialized, finished, eventCount > EMPTY_EVENT_COUNT)
        }
    }

    override fun refresh(handle: Long, generation: Long) {
        val control = JSONObject().put(OPERATION_FIELD, REFRESH_OPERATION).put(GENERATION_FIELD, generation)
        receipt(native.execute(handle, control.toString()))
    }

    override fun cancel(handle: Long) { receipt(native.cancel(handle)) }
    override fun finish(handle: Long) { receipt(native.finish(handle)) }

    private fun handle(response: JSONObject): Long {
        val value = response.get(HANDLE_FIELD) as? Number ?: throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
        val decimal = value.toDouble()
        if (!decimal.isFinite() || decimal < MINIMUM_HANDLE || decimal > MAXIMUM_HANDLE || decimal != value.toLong().toDouble()) {
            throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
        }
        return value.toLong()
    }

    private fun receipt(serialized: String) {
        decode(serialized) { response -> if (!response.has(FAILURE_FIELD) || !response.isNull(FAILURE_FIELD)) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE) }
    }

    private fun <Response> decode(serialized: String, project: (JSONObject) -> Response): Response {
        try { return project(response(serialized)) }
        catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE) }
    }

    private fun response(serialized: String): JSONObject {
        if (serialized.length > MAXIMUM_RESPONSE_CHARACTERS) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
        val response = try { JSONObject(serialized) } catch (_failure: Throwable) { throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE) }
        if (response.has(FAILURE_FIELD) && !response.isNull(FAILURE_FIELD)) {
            val code = response.getString(FAILURE_FIELD)
            throw SpotifyConnectFailure(if (SpotifyConnectFailureCode.entries.any { failure -> failure.wireValue == code }) code else NETWORK_FAILURE)
        }
        return response
    }

    companion object {
        private const val HANDLE_FIELD = "handle"
        private const val FINISHED_FIELD = "finished"
        private const val EVENTS_FIELD = "events"
        private const val EMPTY_EVENT_COUNT = 0
        private const val MAXIMUM_BATCH_EVENTS = 4
        private const val MINIMUM_HANDLE = 1.0
        private const val MAXIMUM_HANDLE = 9007199254740991.0
        private const val FAILURE_FIELD = "failure"
        private const val OPERATION_FIELD = "operation"
        private const val GENERATION_FIELD = "generation"
        private const val REFRESH_OPERATION = "refresh"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val NETWORK_FAILURE = "network"
        private const val MAXIMUM_RESPONSE_CHARACTERS = 2097152
    }
}

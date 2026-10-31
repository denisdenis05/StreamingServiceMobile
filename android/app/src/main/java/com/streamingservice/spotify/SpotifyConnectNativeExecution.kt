package com.streamingservice.spotify

import org.json.JSONObject

interface SpotifyConnectNativeCalls {
    fun start(serialized: String): String
    fun search(handle: Long, generation: Long, serialized: String): String
    fun metadata(handle: Long, generation: Long, serialized: String): String
    fun membership(handle: Long, generation: Long): String = throw SpotifyConnectFailure(SpotifyConnectFailureCode.Unsupported.wireValue)
    fun read(handle: Long, generation: Long): String
    fun poll(handle: Long): String
    fun execute(handle: Long, serialized: String): String
    fun beginCommand(handle: Long, requestIdentifier: String): String
    fun cancelCommand(handle: Long, requestIdentifier: String): String
    fun finishCommand(handle: Long, requestIdentifier: String): String
    fun cancel(handle: Long): String
    fun finish(handle: Long): String
}

private object PlatformSpotifyConnectNativeCalls : SpotifyConnectNativeCalls {
    override fun start(serialized: String): String = SpotifyLibrespotNative.connectStart(serialized)
    override fun search(handle: Long, generation: Long, serialized: String): String = SpotifyLibrespotNative.connectSearch(handle, generation, serialized)
    override fun metadata(handle: Long, generation: Long, serialized: String): String = SpotifyLibrespotNative.connectMetadata(handle, generation, serialized)
    override fun membership(handle: Long, generation: Long): String = SpotifyLibrespotNative.connectMembership(handle, generation)
    override fun read(handle: Long, generation: Long): String = SpotifyLibrespotNative.connectRead(handle, generation)
    override fun poll(handle: Long): String = SpotifyLibrespotNative.connectPoll(handle)
    override fun execute(handle: Long, serialized: String): String = SpotifyLibrespotNative.connectExecute(handle, serialized)
    override fun beginCommand(handle: Long, requestIdentifier: String): String = SpotifyLibrespotNative.connectBeginCommand(handle, requestIdentifier)
    override fun cancelCommand(handle: Long, requestIdentifier: String): String = SpotifyLibrespotNative.connectCancelCommand(handle, requestIdentifier)
    override fun finishCommand(handle: Long, requestIdentifier: String): String = SpotifyLibrespotNative.connectFinishCommand(handle, requestIdentifier)
    override fun cancel(handle: Long): String = SpotifyLibrespotNative.connectCancel(handle)
    override fun finish(handle: Long): String = SpotifyLibrespotNative.connectFinish(handle)
}

private class SpotifyConnectNativeFailureReceipt(code: String) : SpotifyConnectFailure(code)

class SpotifyConnectNativeExecution(private val native: SpotifyConnectNativeCalls = PlatformSpotifyConnectNativeCalls,
    private val pollClock: SpotifyNativeFollowerClock? = null) : SpotifyConnectExecution {
    override fun start(serialized: String): Long = decode(native.start(serialized)) { response -> handle(response) }

    override fun poll(handle: Long): SpotifyConnectBatch {
        val startedElapsedMilliseconds = pollClock?.nowElapsedRealtimeMilliseconds()
        val serialized = native.poll(handle)
        val completedElapsedMilliseconds = pollClock?.nowElapsedRealtimeMilliseconds()
        return decode(serialized) { response ->
            if (handle(response) != handle) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            val finished = response.get(FINISHED_FIELD) as? Boolean ?: throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            val eventCount = response.getJSONArray(EVENTS_FIELD).length()
            if (eventCount > MAXIMUM_BATCH_EVENTS) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            SpotifyConnectBatch(serialized, finished, eventCount > EMPTY_EVENT_COUNT, startedElapsedMilliseconds, completedElapsedMilliseconds)
        }
    }

    override fun search(handle: Long, generation: Long, serialized: String): String = boundResponse(handle, generation, native.search(handle, generation, serialized))
    override fun metadata(handle: Long, generation: Long, serialized: String): String = boundResponse(handle, generation, native.metadata(handle, generation, serialized))
    override fun membership(handle: Long, generation: Long): String = boundResponse(handle, generation, native.membership(handle, generation))
    override fun read(handle: Long, generation: Long): String = boundResponse(handle, generation, native.read(handle, generation))

    private fun boundResponse(handle: Long, generation: Long, serialized: String): String {
        return decode(serialized) { response ->
            if (handle(response) != handle || response.get(GENERATION_FIELD) !is Number
                || response.getDouble(GENERATION_FIELD) != generation.toDouble()) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            serialized
        }
    }

    override fun refresh(handle: Long, generation: Long) {
        val control = JSONObject().put(OPERATION_FIELD, REFRESH_OPERATION).put(GENERATION_FIELD, generation)
        receipt(native.execute(handle, control.toString()))
    }

    override fun beginCommand(handle: Long, requestIdentifier: String) { receipt(native.beginCommand(handle, requestIdentifier)) }
    override fun cancelCommand(handle: Long, requestIdentifier: String) { receipt(native.cancelCommand(handle, requestIdentifier)) }
    override fun finishCommand(handle: Long, requestIdentifier: String) { receipt(native.finishCommand(handle, requestIdentifier)) }
    override fun command(handle: Long, requestIdentifier: String, serialized: String) {
        val control = try { JSONObject(serialized) } catch (_failure: Throwable) { throw SpotifyConnectFailure(INVALID_INPUT_FAILURE) }
        if (control.opt(OPERATION_FIELD) != COMMAND_OPERATION || control.opt(REQUEST_IDENTIFIER_FIELD) != requestIdentifier) {
            throw SpotifyConnectFailure(INVALID_INPUT_FAILURE)
        }
        val reply = try { native.execute(handle, serialized) } catch (_failure: Throwable) { throw SpotifyConnectFailure(UNKNOWN_OUTCOME_FAILURE) }
        try {
            decode(reply) { response ->
                val acknowledgement = response.optJSONObject(ACKNOWLEDGEMENT_FIELD)
                val acknowledgementIdentifier = acknowledgement?.opt(ACKNOWLEDGEMENT_IDENTIFIER_FIELD) as? String
                if (!response.has(FAILURE_FIELD) || !response.isNull(FAILURE_FIELD)
                    || acknowledgement?.opt(DELIVERY_OBSERVED_FIELD) != true || acknowledgementIdentifier.isNullOrBlank()
                    || acknowledgementIdentifier.length > MAXIMUM_ACKNOWLEDGEMENT_CHARACTERS) throw SpotifyConnectFailure(UNKNOWN_OUTCOME_FAILURE)
            }
        } catch (failure: SpotifyConnectNativeFailureReceipt) { throw failure }
        catch (_failure: Throwable) { throw SpotifyConnectFailure(UNKNOWN_OUTCOME_FAILURE) }
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
            if (SpotifyConnectFailureCode.entries.any { failure -> failure.wireValue == code }) throw SpotifyConnectNativeFailureReceipt(code)
            throw SpotifyConnectFailure(NETWORK_FAILURE)
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
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val UNKNOWN_OUTCOME_FAILURE = "unknown-outcome"
        private const val ACKNOWLEDGEMENT_FIELD = "acknowledgement"
        private const val ACKNOWLEDGEMENT_IDENTIFIER_FIELD = "acknowledgementIdentifier"
        private const val DELIVERY_OBSERVED_FIELD = "deliveryObserved"
        private const val MAXIMUM_ACKNOWLEDGEMENT_CHARACTERS = 2048
        private const val COMMAND_OPERATION = "command"
        private const val REQUEST_IDENTIFIER_FIELD = "requestIdentifier"
        private const val REFRESH_OPERATION = "refresh"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val NETWORK_FAILURE = "network"
        private const val MAXIMUM_RESPONSE_CHARACTERS = 2097152
    }
}

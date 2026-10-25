package com.streamingservice.spotify

interface SpotifyLibrespotExecution {
    fun begin(identifier: String): String
    fun execute(identifier: String, operation: String, username: String, password: String, credential: String): String
    fun cancel(identifier: String)
    fun finish(identifier: String)
}

class SpotifyLibrespotRequestRunner(
    private val execution: SpotifyLibrespotExecution,
    private val dispatch: (() -> Unit) -> Unit
) {
    private class PendingRequest(val failed: (String) -> Unit) {
        var canceled = false
    }

    private val pending = mutableMapOf<String, PendingRequest>()
    private var closed = false

    @Synchronized
    fun start(identifier: String, operation: String, username: String, password: String, credential: String,
              completed: (String) -> Unit, failed: (String) -> Unit) {
        if (closed) {
            failed(CANCELED_FAILURE)
            return
        }
        if (identifier.isBlank() || identifier.length > MAXIMUM_REQUEST_CHARACTERS) {
            failed(INVALID_INPUT_FAILURE)
            return
        }
        if (pending.containsKey(identifier)) {
            failed(BACKPRESSURE_FAILURE)
            return
        }
        val failure = try { execution.begin(identifier) } catch (_failure: Throwable) { UNSUPPORTED_FAILURE }
        if (failure.isNotEmpty()) {
            failed(failure)
            return
        }
        val request = PendingRequest(failed)
        pending[identifier] = request
        try {
            dispatch {
                val result = try { execution.execute(identifier, operation, username, password, credential) }
                    catch (_failure: Throwable) { null }
                val active = synchronized(this) { pending.remove(identifier) === request && !closed }
                if (active) {
                    if (request.canceled) failed(CANCELED_FAILURE)
                    else if (result == null) failed(NETWORK_FAILURE)
                    else completed(result)
                }
            }
        } catch (_failure: Throwable) {
            pending.remove(identifier)
            safeCancel(identifier)
            try { execution.finish(identifier) } catch (_failure: Throwable) {}
            failed(NETWORK_FAILURE)
        }
    }

    @Synchronized
    fun cancel(identifier: String) {
        val request = pending[identifier] ?: return
        request.canceled = true
        safeCancel(identifier)
    }

    fun close() {
        val retiring = synchronized(this) {
            if (closed) return
            closed = true
            val requests = pending.toMap()
            pending.clear()
            requests
        }
        for ((identifier, request) in retiring) {
            safeCancel(identifier)
            try { request.failed(CANCELED_FAILURE) } catch (_failure: Throwable) {}
        }
    }

    private fun safeCancel(identifier: String) {
        try { execution.cancel(identifier) } catch (_failure: Throwable) {}
    }

    companion object {
        private const val MAXIMUM_REQUEST_CHARACTERS = 128
        private const val CANCELED_FAILURE = "canceled"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val NETWORK_FAILURE = "network"
        private const val UNSUPPORTED_FAILURE = "unsupported"
    }
}

package com.streamingservice.spotify

interface SpotifyConnectExecution {
    fun start(serialized: String): Long
    fun poll(handle: Long): SpotifyConnectBatch
    fun refresh(handle: Long, generation: Long)
    fun cancel(handle: Long)
    fun finish(handle: Long)
}

data class SpotifyConnectBatch(val serialized: String, val finished: Boolean, val hasEvents: Boolean = true)
class SpotifyConnectFailure(val code: String) : RuntimeException()

class SpotifyConnectOwner(
    private val execution: SpotifyConnectExecution,
    private val publish: (String, SpotifyConnectBatch) -> Unit
) {
    private class Connection(val identifier: String, val handle: Long) {
        var retiring = false
        var cancellationSent = false
        val completions = mutableListOf<() -> Unit>()
    }
    private var active: Connection? = null
    private var disposed = false

    @Synchronized
    fun start(identifier: String, serialized: String): Long {
        if (disposed) throw SpotifyConnectFailure(CANCELED_FAILURE)
        if (identifier.isBlank() || identifier.length > MAXIMUM_IDENTIFIER_CHARACTERS
            || identifier.any { character -> character.isWhitespace() || character.isISOControl() }) throw SpotifyConnectFailure(INVALID_INPUT_FAILURE)
        if (active != null) throw SpotifyConnectFailure(BACKPRESSURE_FAILURE)
        val handle = execution.start(serialized)
        if (handle < MINIMUM_HANDLE) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
        active = Connection(identifier, handle)
        return handle
    }

    fun refresh(identifier: String, generation: Long) {
        val connection = synchronized(this) {
            active?.takeIf { connection -> connection.identifier == identifier && !connection.retiring && !disposed }
                ?: throw SpotifyConnectFailure(CANCELED_FAILURE)
        }
        if (generation < MINIMUM_HANDLE) throw SpotifyConnectFailure(INVALID_INPUT_FAILURE)
        execution.refresh(connection.handle, generation)
        synchronized(this) {
            if (active !== connection || connection.retiring || disposed) throw SpotifyConnectFailure(CANCELED_FAILURE)
        }
    }

    @Synchronized
    fun close(identifier: String, completed: () -> Unit) {
        val connection = active
        if (connection == null || connection.identifier != identifier) { completed(); return }
        connection.completions.add(completed)
        if (connection.retiring) return
        connection.retiring = true
        try { cancel(connection) } catch (failure: Throwable) { connection.completions.remove(completed); throw failure }
    }

    @Synchronized
    fun pump() {
        val connection = active ?: return
        if (connection.retiring) cancel(connection)
        val batch = execution.poll(connection.handle)
        if (!connection.retiring && !disposed && (batch.hasEvents || batch.finished)) {
            try { publish(connection.identifier, batch) } catch (_failure: Throwable) {}
        }
        if (!batch.finished) return
        execution.finish(connection.handle)
        active = null
        for (completed in connection.completions) {
            try { completed() } catch (_failure: Throwable) {}
        }
    }

    @Synchronized
    fun dispose() {
        disposed = true
        val connection = active ?: return
        if (connection.retiring) return
        connection.retiring = true
        cancel(connection)
    }

    @Synchronized
    fun hasConnection(): Boolean = active != null

    @Synchronized
    fun currentIdentifier(): String? = active?.identifier

    private fun cancel(connection: Connection) {
        if (connection.cancellationSent) return
        execution.cancel(connection.handle)
        connection.cancellationSent = true
    }

    companion object {
        private const val MAXIMUM_IDENTIFIER_CHARACTERS = 128
        private const val MINIMUM_HANDLE = 1L
        private const val CANCELED_FAILURE = "canceled"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val BACKPRESSURE_FAILURE = "backpressure"
    }
}

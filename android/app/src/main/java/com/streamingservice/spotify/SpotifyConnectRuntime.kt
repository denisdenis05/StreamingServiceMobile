package com.streamingservice.spotify

interface SpotifyConnectRuntimeProtocol {
    fun identity(serialized: String): SpotifyConnectRuntimeIdentity
    fun bootstrap(batch: SpotifyConnectBatch, identity: SpotifyConnectRuntimeIdentity, previous: SpotifyConnectBatch?): SpotifyConnectBatch?
}

data class SpotifyConnectRuntimeIdentity(val accountIdentifier: String, val deviceIdentifier: String, val clientIdentifier: String,
    val deviceName: String, val playbackReady: Boolean)

data class SpotifyConnectRuntimeEvent(val identifier: String, val batch: SpotifyConnectBatch? = null, val failure: String? = null)

interface SpotifyConnectRuntimePolling {
    fun start(operation: () -> Unit)
    fun stop()
}

class SpotifyConnectRuntime(
    execution: SpotifyConnectExecution,
    private val protocol: SpotifyConnectRuntimeProtocol,
    private val polling: SpotifyConnectRuntimePolling
) {
    class Attachment internal constructor(internal var listener: ((SpotifyConnectRuntimeEvent) -> Unit)?) {
        internal var identifier: String? = null
        internal val commands = mutableSetOf<SpotifyConnectOwner.CommandReservation>()
    }

    private class ConnectionLifetime

    private class PendingStart(val attachment: Attachment, var canceled: Boolean = false)

    private var pendingStart: PendingStart? = null
    private var attachment: Attachment? = null
    private var identity: SpotifyConnectRuntimeIdentity? = null
    private var bootstrap: SpotifyConnectBatch? = null
    private var handle: Long? = null
    private var connectionLifetime: ConnectionLifetime? = null
    private var failurePublished = false
    private val owner = SpotifyConnectOwner(execution) { _, batch -> receive(batch) }

    @Synchronized
    fun attach(listener: (SpotifyConnectRuntimeEvent) -> Unit): Attachment {
        attachment?.let { previous -> detach(previous) }
        return Attachment(listener).also { selected -> attachment = selected }
    }

    @Synchronized
    fun detach(selected: Attachment) {
        if (selected.listener == null) return
        pendingStart?.takeIf { pending -> pending.attachment === selected }?.canceled = true
        selected.listener = null
        selected.identifier = null
        if (attachment === selected) attachment = null
        for (reservation in selected.commands) {
            try { owner.cancelCommand(NATIVE_OWNER_IDENTIFIER, reservation.requestIdentifier) } catch (_failure: Throwable) {}
        }
    }

    @Synchronized
    fun startOrReplace(selected: Attachment, identifier: String, serialized: String, started: (Long) -> Unit, failed: (Throwable) -> Unit) {
        requireAttachment(selected)
        validateIdentifier(identifier)
        val requestedIdentity = protocol.identity(serialized)
        if (pendingStart != null || selected.identifier != null && selected.identifier != identifier) throw SpotifyConnectFailure(BACKPRESSURE_FAILURE)
        if (!owner.hasConnection() || identity == requestedIdentity) {
            started(start(selected, identifier, serialized))
            return
        }
        val pending = PendingStart(selected)
        val retiringLifetime = connectionLifetime
        pendingStart = pending
        selected.identifier = identifier
        try {
            owner.close(NATIVE_OWNER_IDENTIFIER) {
                pendingStart = null
                try {
                    if (connectionLifetime !== retiringLifetime) throw SpotifyConnectFailure(CANCELED_FAILURE)
                    identity = null
                    bootstrap = null
                    handle = null
                    connectionLifetime = null
                    if (pending.canceled) throw SpotifyConnectFailure(CANCELED_FAILURE)
                    requireBinding(selected, identifier)
                    started(start(selected, identifier, serialized))
                } catch (failure: Throwable) { failed(failure) }
            }
        } catch (failure: Throwable) {
            pendingStart = null
            selected.identifier = null
            throw failure
        }
    }

    @Synchronized
    fun start(selected: Attachment, identifier: String, serialized: String): Long {
        requireAttachment(selected)
        validateIdentifier(identifier)
        val requestedIdentity = protocol.identity(serialized)
        if (selected.identifier != null && selected.identifier != identifier) throw SpotifyConnectFailure(BACKPRESSURE_FAILURE)
        if (owner.hasConnection()) {
            if (identity != requestedIdentity) throw SpotifyConnectFailure(UNAUTHORIZED_FAILURE)
            if (handle == null) throw SpotifyConnectFailure(BACKPRESSURE_FAILURE)
            owner.requireAvailable(NATIVE_OWNER_IDENTIFIER)
        } else {
            bootstrap = null
            identity = null
            failurePublished = false
            handle = owner.start(NATIVE_OWNER_IDENTIFIER, serialized)
            connectionLifetime = ConnectionLifetime()
            identity = requestedIdentity
            polling.start { pump() }
        }
        selected.identifier = identifier
        bootstrap?.let { batch -> publish(selected, SpotifyConnectRuntimeEvent(identifier, batch)) }
        return checkNotNull(handle)
    }

    fun read(selected: Attachment, identifier: String, generation: Long): String = observe(selected, identifier) { owner.read(NATIVE_OWNER_IDENTIFIER, generation) }
    fun metadata(selected: Attachment, identifier: String, generation: Long, serialized: String): String =
        observe(selected, identifier) { owner.metadata(NATIVE_OWNER_IDENTIFIER, generation, serialized) }
    fun refresh(selected: Attachment, identifier: String, generation: Long) {
        observe(selected, identifier) { owner.refresh(NATIVE_OWNER_IDENTIFIER, generation) }
    }

    private fun <Result> observe(selected: Attachment, identifier: String, operation: () -> Result): Result {
        val capturedLifetime = synchronized(this) { requireBinding(selected, identifier); connectionLifetime }
        val result = operation()
        synchronized(this) {
            requireBinding(selected, identifier)
            if (connectionLifetime !== capturedLifetime) throw SpotifyConnectFailure(CANCELED_FAILURE)
        }
        return result
    }

    @Synchronized
    fun prepareCommand(selected: Attachment, identifier: String, requestIdentifier: String): SpotifyConnectOwner.CommandReservation {
        requireBinding(selected, identifier)
        return owner.prepareCommand(NATIVE_OWNER_IDENTIFIER, requestIdentifier).also { reservation -> selected.commands.add(reservation) }
    }

    fun executeCommand(selected: Attachment, reservation: SpotifyConnectOwner.CommandReservation, serialized: String) {
        synchronized(this) { requireReservation(selected, reservation) }
        owner.executeCommand(reservation, serialized)
        synchronized(this) {
            if (attachment !== selected || selected.identifier == null) throw SpotifyConnectFailure(UNKNOWN_OUTCOME_FAILURE)
        }
    }

    @Synchronized
    fun cancelCommand(selected: Attachment, identifier: String, requestIdentifier: String) {
        requireBinding(selected, identifier)
        if (selected.commands.any { reservation -> reservation.requestIdentifier == requestIdentifier }) owner.cancelCommand(NATIVE_OWNER_IDENTIFIER, requestIdentifier)
    }

    @Synchronized
    fun finishCommand(selected: Attachment, reservation: SpotifyConnectOwner.CommandReservation) {
        if (!selected.commands.remove(reservation)) return
        owner.finishCommand(reservation)
    }

    @Synchronized
    fun close(selected: Attachment, identifier: String, completed: () -> Unit) {
        requireAttachment(selected)
        if (selected.identifier != identifier) { completed(); return }
        pendingStart?.takeIf { pending -> pending.attachment === selected }?.canceled = true
        val retiringLifetime = connectionLifetime
        owner.close(NATIVE_OWNER_IDENTIFIER) {
            if (attachment === selected && connectionLifetime === retiringLifetime && selected.identifier == identifier) selected.identifier = null
            completed()
        }
    }

    @Synchronized
    fun shutdown(selected: Attachment, completed: () -> Unit) {
        requireAttachment(selected)
        pendingStart?.canceled = true
        val retiringLifetime = connectionLifetime
        owner.close(NATIVE_OWNER_IDENTIFIER) {
            if (attachment === selected && connectionLifetime === retiringLifetime) selected.identifier = null
            completed()
        }
    }

    @Synchronized
    private fun pump() {
        try { owner.pump() } catch (failure: Throwable) { failAndRetire(failure) }
        if (!owner.hasConnection()) {
            handle = null
            connectionLifetime = null
            identity = null
            bootstrap = null
            attachment?.identifier = null
            polling.stop()
        }
    }

    private fun receive(batch: SpotifyConnectBatch) {
        val currentIdentity = identity ?: return
        try { bootstrap = protocol.bootstrap(batch, currentIdentity, bootstrap) }
        catch (failure: Throwable) { bootstrap = null; failAndRetire(failure); return }
        val selected = attachment ?: return
        val identifier = selected.identifier ?: return
        publish(selected, SpotifyConnectRuntimeEvent(identifier, batch))
    }

    private fun failAndRetire(failure: Throwable) {
        if (failurePublished) return
        failurePublished = true
        val selected = attachment
        val identifier = selected?.identifier
        try { owner.close(NATIVE_OWNER_IDENTIFIER) {} } catch (_failure: Throwable) {}
        if (selected != null && identifier != null) publish(selected, SpotifyConnectRuntimeEvent(identifier, failure = safeCode(failure)))
    }

    private fun publish(selected: Attachment, event: SpotifyConnectRuntimeEvent) {
        if (attachment !== selected) return
        try { selected.listener?.invoke(event) } catch (_failure: Throwable) {}
    }

    private fun requireAttachment(selected: Attachment) {
        if (attachment !== selected || selected.listener == null) throw SpotifyConnectFailure(CANCELED_FAILURE)
    }

    private fun requireBinding(selected: Attachment, identifier: String) {
        requireAttachment(selected)
        if (selected.identifier != identifier) throw SpotifyConnectFailure(CANCELED_FAILURE)
    }

    private fun requireReservation(selected: Attachment, reservation: SpotifyConnectOwner.CommandReservation) {
        requireAttachment(selected)
        if (selected.identifier == null || !selected.commands.contains(reservation)) throw SpotifyConnectFailure(CANCELED_FAILURE)
    }

    private fun validateIdentifier(identifier: String) {
        if (identifier.isBlank() || identifier.length > MAXIMUM_IDENTIFIER_CHARACTERS
            || identifier.any { character -> character.isWhitespace() || character.isISOControl() }) throw SpotifyConnectFailure(INVALID_INPUT_FAILURE)
    }

    private fun safeCode(failure: Throwable): String = (failure as? SpotifyConnectFailure)?.code?.takeIf { code -> code in FAILURE_CODES } ?: NETWORK_FAILURE

    companion object {
        private const val NATIVE_OWNER_IDENTIFIER = "application-connect-runtime"
        private const val MAXIMUM_IDENTIFIER_CHARACTERS = 128
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val UNAUTHORIZED_FAILURE = "unauthorized"
        private const val UNKNOWN_OUTCOME_FAILURE = "unknown-outcome"
        private const val CANCELED_FAILURE = "canceled"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val NETWORK_FAILURE = "network"
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

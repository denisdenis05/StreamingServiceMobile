package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture

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
    private val polling: SpotifyConnectRuntimePolling,
    private val retireHosting: () -> CompletableFuture<Unit> = { CompletableFuture.completedFuture(Unit) },
    private val releaseHostingAfterClose: () -> CompletableFuture<Unit> = { CompletableFuture.completedFuture(Unit) },
    private val retireFollowing: () -> CompletableFuture<Unit> = { CompletableFuture.completedFuture(Unit) }
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
    private var retiringConnection = false
    private var retirementBarrier: CompletableFuture<Unit>? = null
    @Volatile private var nativeBinding: Pair<String, Long>? = null
    private val nativeListeners = linkedSetOf<(SpotifyConnectBatch) -> Unit>()
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
            retireTogether({ complete ->
                owner.close(NATIVE_OWNER_IDENTIFIER) {
                    if (connectionLifetime === retiringLifetime) {
                        identity = null; bootstrap = null; handle = null; connectionLifetime = null
                    }
                    complete()
                }
            }, {
                synchronized(this) {
                    if (pendingStart !== pending) { failed(SpotifyConnectFailure(CANCELED_FAILURE)); return@synchronized }
                    pendingStart = null
                    try {
                        if (pending.canceled) throw SpotifyConnectFailure(CANCELED_FAILURE)
                        requireBinding(selected, identifier)
                        started(start(selected, identifier, serialized))
                    } catch (failure: Throwable) { failed(failure) }
                }
            }, { failure -> synchronized(this) { if (pendingStart === pending) pendingStart = null; failed(failure) } })
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
            retirementBarrier?.let { retirement ->
                if (!retirement.isDone) throw SpotifyConnectFailure(BACKPRESSURE_FAILURE)
                if (retirement.isCompletedExceptionally) throw SpotifyConnectFailure(NETWORK_FAILURE)
            }
            bootstrap = null
            identity = null
            failurePublished = false
            retiringConnection = false
            handle = owner.start(NATIVE_OWNER_IDENTIFIER, serialized)
            connectionLifetime = ConnectionLifetime()
            identity = requestedIdentity
            nativeBinding = requestedIdentity.accountIdentifier to checkNotNull(handle)
            polling.start { pump() }
        }
        selected.identifier = identifier
        bootstrap?.let { batch -> publish(selected, SpotifyConnectRuntimeEvent(identifier, batch)) }
        return checkNotNull(handle)
    }

    fun read(selected: Attachment, identifier: String, generation: Long): String = observe(selected, identifier) { owner.read(NATIVE_OWNER_IDENTIFIER, generation) }
    fun search(selected: Attachment, identifier: String, generation: Long, serialized: String): String =
        observe(selected, identifier) { owner.search(NATIVE_OWNER_IDENTIFIER, generation, serialized) }
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

    fun close(selected: Attachment, identifier: String, completed: () -> Unit) = close(selected, identifier, completed) { failure -> throw failure }

    @Synchronized
    fun close(selected: Attachment, identifier: String, completed: () -> Unit, failed: (Throwable) -> Unit) {
        requireAttachment(selected)
        if (selected.identifier != identifier) { completed(); return }
        pendingStart?.takeIf { pending -> pending.attachment === selected }?.canceled = true
        val retiringLifetime = connectionLifetime
        retireTogether({ complete -> owner.close(NATIVE_OWNER_IDENTIFIER) { complete() } }, {
            synchronized(this) {
                if (attachment === selected && (connectionLifetime === retiringLifetime || connectionLifetime == null) && selected.identifier == identifier) selected.identifier = null
                completed()
            }
        }, failed)
    }

    fun shutdown(selected: Attachment, completed: () -> Unit) = shutdown(selected, completed) { failure -> throw failure }

    @Synchronized
    fun shutdown(selected: Attachment, completed: () -> Unit, failed: (Throwable) -> Unit) {
        requireAttachment(selected)
        pendingStart?.canceled = true
        val retiringLifetime = connectionLifetime
        retireTogether({ complete -> owner.close(NATIVE_OWNER_IDENTIFIER) { complete() } }, {
            synchronized(this) {
                if (attachment === selected && (connectionLifetime === retiringLifetime || connectionLifetime == null)) selected.identifier = null
                completed()
            }
        }, failed)
    }

    @Synchronized
    private fun pump() {
        try { owner.pump() } catch (failure: Throwable) { failAndRetire(failure) }
        if (!owner.hasConnection()) {
            nativeBinding = null
            handle = null
            connectionLifetime = null
            identity = null
            bootstrap = null
            if (pendingStart == null) attachment?.identifier = null
            polling.stop()
            try {
                val following = retireFollowing()
                if (!retiringConnection) {
                    retiringConnection = true
                    val hosting = retireHosting().handle { _, _ -> Unit }
                    retirementBarrier = CompletableFuture.allOf(following, hosting).thenCompose { releaseHostingAfterClose() }
                } else if (retirementBarrier?.isDone != false && (!following.isDone || following.isCompletedExceptionally)) retirementBarrier = following
            } catch (failure: Throwable) {
                retirementBarrier = CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(failure) }
            }
        }
    }

    private fun receive(batch: SpotifyConnectBatch) {
        val currentIdentity = identity ?: return
        try { bootstrap = protocol.bootstrap(batch, currentIdentity, bootstrap) }
        catch (failure: Throwable) { bootstrap = null; failAndRetire(failure); return }
        nativeListeners.toList().forEach { listener -> try { listener(batch) } catch (_failure: Throwable) { Unit } }
        val selected = attachment ?: return
        val identifier = selected.identifier ?: return
        publish(selected, SpotifyConnectRuntimeEvent(identifier, batch))
    }

    private fun failAndRetire(failure: Throwable) {
        if (failurePublished) return
        failurePublished = true
        val selected = attachment
        val identifier = selected?.identifier
        try { retireTogether({ complete -> owner.close(NATIVE_OWNER_IDENTIFIER) { complete() } }, {}, {}) } catch (_failure: Throwable) { Unit }
        if (selected != null && identifier != null) publish(selected, SpotifyConnectRuntimeEvent(identifier, failure = safeCode(failure)))
    }

    fun ownsNativeConnection(accountIdentifier: String, expectedHandle: Long): Boolean {
        val binding = nativeBinding ?: return false
        return binding.first == accountIdentifier && binding.second == expectedHandle
    }

    @Synchronized
    fun observeNativeConnection(listener: (SpotifyConnectBatch) -> Unit): SpotifyNativeFollowerCancellation {
        nativeListeners.add(listener)
        return SpotifyNativeFollowerCancellation { synchronized(this) { nativeListeners.remove(listener) } }
    }

    private fun retireTogether(closeNative: (() -> Unit) -> Unit, completed: () -> Unit, failed: (Throwable) -> Unit) {
        retirementBarrier?.takeIf { retirement -> !retirement.isDone }?.let { retirement ->
            retirement.whenComplete { _, failure ->
                if (failure == null) completed() else failed(failure)
            }
            return
        }
        retiringConnection = true
        val retirement = CompletableFuture<Unit>()
        retirementBarrier = retirement
        val hosting = try { retireHosting() } catch (failure: Throwable) { CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(failure) } }
        hosting.whenComplete { _, _ -> synchronized(this) {
            nativeBinding = null
            val following = try { retireFollowing() } catch (failure: Throwable) {
                CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(failure) }
            }
            val native = CompletableFuture<Unit>()
            try { closeNative { native.complete(Unit) } } catch (failure: Throwable) { native.completeExceptionally(failure) }
            CompletableFuture.allOf(following, native).thenCompose { releaseHostingAfterClose() }.whenComplete { _, failure ->
                if (failure == null) retirement.complete(Unit) else retirement.completeExceptionally(failure)
            }
        } }
        retirement.whenComplete { _, failure -> if (failure == null) completed() else failed(failure) }
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

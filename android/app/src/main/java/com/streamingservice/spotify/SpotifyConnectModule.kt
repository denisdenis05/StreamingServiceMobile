package com.streamingservice.spotify

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

class SpotifyConnectModule(private val applicationContext: ReactApplicationContext) : ReactContextBaseJavaModule(applicationContext) {
    private val disposed = AtomicBoolean(false)
    private val pollingStarted = AtomicBoolean(false)
    private val workers = executor(WORKER_COUNT)
    private val lifecycle = executor(LIFECYCLE_WORKER_COUNT)
    private val polling = Executors.newSingleThreadScheduledExecutor()
    private var lastFailedIdentifier: String? = null
    private val owner = SpotifyConnectOwner(SpotifyConnectNativeExecution()) { identifier, batch ->
        val event = Arguments.createMap()
        event.putString(IDENTIFIER_FIELD, identifier)
        event.putString(BATCH_FIELD, batch.serialized)
        emit(event)
    }

    private fun ensurePolling() {
        if (!pollingStarted.compareAndSet(false, true)) return
        polling.scheduleWithFixedDelay({
            try { owner.pump() } catch (failure: Throwable) {
                val identifier = owner.currentIdentifier()
                if (identifier != null && identifier != lastFailedIdentifier) {
                    lastFailedIdentifier = identifier
                    val event = Arguments.createMap()
                    event.putString(IDENTIFIER_FIELD, identifier)
                    event.putString(FAILURE_FIELD, safeCode(failure))
                    emit(event)
                }
                if (identifier != null) try { owner.close(identifier) {} } catch (_failure: Throwable) {}
            }
            if (disposed.get() && !owner.hasConnection()) { polling.shutdown(); workers.shutdown(); lifecycle.shutdown() }
        }, INITIAL_DELAY_MILLISECONDS, POLL_INTERVAL_MILLISECONDS, TimeUnit.MILLISECONDS)
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun start(identifier: String, serialized: String, promise: Promise) {
        if (disposed.get()) { reject(promise, CANCELED_FAILURE); return }
        if (serialized.length > MAXIMUM_INPUT_CHARACTERS) { reject(promise, INVALID_INPUT_FAILURE); return }
        dispatch(promise, lifecycle) {
            val handle = owner.start(identifier, serialized)
            ensurePolling()
            promise.resolve(handle.toDouble())
        }
    }

    @ReactMethod
    fun refresh(identifier: String, generation: Double, promise: Promise) {
        if (!generation.isFinite() || generation < MINIMUM_GENERATION || generation > MAXIMUM_GENERATION || generation != generation.toLong().toDouble()) {
            reject(promise, INVALID_INPUT_FAILURE); return
        }
        dispatch(promise) { owner.refresh(identifier, generation.toLong()); promise.resolve(null) }
    }

    @ReactMethod
    fun read(identifier: String, generation: Double, promise: Promise) {
        if (!generation.isFinite() || generation < MINIMUM_GENERATION || generation > MAXIMUM_GENERATION || generation != generation.toLong().toDouble()) {
            reject(promise, INVALID_INPUT_FAILURE); return
        }
        dispatch(promise) { promise.resolve(owner.read(identifier, generation.toLong())) }
    }

    @ReactMethod
    fun executeCommand(identifier: String, requestIdentifier: String, serialized: String, promise: Promise) {
        if (serialized.length > MAXIMUM_INPUT_CHARACTERS) { reject(promise, INVALID_INPUT_FAILURE); return }
        val reservation = try { owner.prepareCommand(identifier, requestIdentifier) }
        catch (failure: Throwable) { reject(promise, safeCode(failure)); return }
        try {
            workers.execute {
                try {
                    if (disposed.get()) throw SpotifyConnectFailure(CANCELED_FAILURE)
                    owner.executeCommand(reservation, serialized)
                    promise.resolve(null)
                } catch (failure: Throwable) { reject(promise, safeCode(failure)) }
                finally { try { owner.finishCommand(reservation) } catch (_failure: Throwable) {} }
            }
        } catch (_failure: Throwable) {
            try { owner.finishCommand(reservation) } catch (_cleanupFailure: Throwable) {}
            reject(promise, if (disposed.get()) CANCELED_FAILURE else BACKPRESSURE_FAILURE)
        }
    }

    @ReactMethod
    fun cancelCommand(identifier: String, requestIdentifier: String, promise: Promise) {
        try { owner.cancelCommand(identifier, requestIdentifier); promise.resolve(null) }
        catch (failure: Throwable) { reject(promise, safeCode(failure)) }
    }

    @ReactMethod
    fun close(identifier: String, promise: Promise) {
        dispatch(promise, lifecycle) { owner.close(identifier) { promise.resolve(null) } }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}

    override fun invalidate() {
        disposed.set(true)
        try { owner.dispose() } catch (_failure: Throwable) {}
        if (!owner.hasConnection()) { polling.shutdown(); workers.shutdown(); lifecycle.shutdown() }
        super.invalidate()
    }

    private fun dispatch(promise: Promise, executor: java.util.concurrent.Executor = workers, operation: () -> Unit) {
        try {
            executor.execute {
                if (disposed.get()) { reject(promise, CANCELED_FAILURE); return@execute }
                try { operation() } catch (failure: Throwable) { reject(promise, safeCode(failure)) }
            }
        } catch (_failure: RejectedExecutionException) { reject(promise, if (disposed.get()) CANCELED_FAILURE else BACKPRESSURE_FAILURE) }
        catch (_failure: Throwable) { reject(promise, NETWORK_FAILURE) }
    }

    private fun emit(event: com.facebook.react.bridge.WritableMap) {
        if (disposed.get() || !applicationContext.hasActiveReactInstance()) return
        try { applicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_NAME, event) }
        catch (_failure: Throwable) {}
    }

    private fun safeCode(failure: Throwable): String {
        val code = (failure as? SpotifyConnectFailure)?.code
        return if (code in FAILURE_CODES) checkNotNull(code) else NETWORK_FAILURE
    }

    private fun reject(promise: Promise, code: String) { promise.reject(code, FAILURE_MESSAGE) }

    private fun executor(workerCount: Int): ThreadPoolExecutor = ThreadPoolExecutor(workerCount, workerCount,
        WORKER_KEEP_ALIVE_MILLISECONDS, TimeUnit.MILLISECONDS, ArrayBlockingQueue(MAXIMUM_QUEUED_OPERATIONS))

    companion object {
        private const val MODULE_NAME = "SpotifyConnectSession"
        private const val EVENT_NAME = "SpotifyConnectSessionEvent"
        private const val IDENTIFIER_FIELD = "identifier"
        private const val BATCH_FIELD = "batch"
        private const val FAILURE_FIELD = "failure"
        private const val WORKER_COUNT = 2
        private const val LIFECYCLE_WORKER_COUNT = 1
        private const val MAXIMUM_QUEUED_OPERATIONS = 8
        private const val WORKER_KEEP_ALIVE_MILLISECONDS = 0L
        private const val INITIAL_DELAY_MILLISECONDS = 0L
        private const val POLL_INTERVAL_MILLISECONDS = 100L
        private const val MAXIMUM_INPUT_CHARACTERS = 131072
        private const val MINIMUM_GENERATION = 1.0
        private const val MAXIMUM_GENERATION = 9007199254740991.0
        private const val NETWORK_FAILURE = "network"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val CANCELED_FAILURE = "canceled"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val FAILURE_MESSAGE = "Spotify connection failed."
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

enum class SpotifyConnectFailureCode(val wireValue: String) {
    Network("network"), InvalidInput("invalid-input"), Canceled("canceled"), InvalidResponse("invalid-response"),
    Deadline("deadline"), Unauthorized("unauthorized"), Forbidden("forbidden"), NotFound("not-found"),
    Backpressure("backpressure"), Unsupported("unsupported"), UnknownOutcome("unknown-outcome"), Superseded("superseded")
}

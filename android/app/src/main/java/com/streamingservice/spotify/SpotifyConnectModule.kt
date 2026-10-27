package com.streamingservice.spotify

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

class SpotifyConnectModule(private val applicationContext: ReactApplicationContext) : ReactContextBaseJavaModule(applicationContext) {
    private val disposed = AtomicBoolean(false)
    private val workers = SpotifyConnectApplicationRuntime.workers
    private val lifecycle = SpotifyConnectApplicationRuntime.lifecycle
    private val runtime = SpotifyConnectApplicationRuntime.runtime
    private val attachment = runtime.attach { notification ->
        val event = Arguments.createMap()
        event.putString(IDENTIFIER_FIELD, notification.identifier)
        notification.batch?.let { batch -> event.putString(BATCH_FIELD, batch.serialized) }
        notification.failure?.let { failure -> event.putString(FAILURE_FIELD, failure) }
        emit(event)
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun start(identifier: String, serialized: String, promise: Promise) {
        if (disposed.get()) { reject(promise, CANCELED_FAILURE); return }
        if (serialized.length > MAXIMUM_INPUT_CHARACTERS) { reject(promise, INVALID_INPUT_FAILURE); return }
        dispatch(promise, lifecycle) {
            runtime.startOrReplace(attachment, identifier, serialized,
                { handle -> promise.resolve(handle.toDouble()) }, { failure -> reject(promise, safeCode(failure)) })
        }
    }

    @ReactMethod
    fun refresh(identifier: String, generation: Double, promise: Promise) {
        if (!generation.isFinite() || generation < MINIMUM_GENERATION || generation > MAXIMUM_GENERATION || generation != generation.toLong().toDouble()) {
            reject(promise, INVALID_INPUT_FAILURE); return
        }
        dispatch(promise) { runtime.refresh(attachment, identifier, generation.toLong()); promise.resolve(null) }
    }

    @ReactMethod
    fun read(identifier: String, generation: Double, promise: Promise) {
        if (!generation.isFinite() || generation < MINIMUM_GENERATION || generation > MAXIMUM_GENERATION || generation != generation.toLong().toDouble()) {
            reject(promise, INVALID_INPUT_FAILURE); return
        }
        dispatch(promise) { promise.resolve(runtime.read(attachment, identifier, generation.toLong())) }
    }

    @ReactMethod
    fun metadata(identifier: String, generation: Double, serialized: String, promise: Promise) {
        if (serialized.length > MAXIMUM_INPUT_CHARACTERS || !generation.isFinite() || generation < MINIMUM_GENERATION
            || generation > MAXIMUM_GENERATION || generation != generation.toLong().toDouble()) {
            reject(promise, INVALID_INPUT_FAILURE); return
        }
        dispatch(promise) { promise.resolve(runtime.metadata(attachment, identifier, generation.toLong(), serialized)) }
    }

    @ReactMethod
    fun executeCommand(identifier: String, requestIdentifier: String, serialized: String, promise: Promise) {
        if (serialized.length > MAXIMUM_INPUT_CHARACTERS) { reject(promise, INVALID_INPUT_FAILURE); return }
        val reservation = try { runtime.prepareCommand(attachment, identifier, requestIdentifier) }
        catch (failure: Throwable) { reject(promise, safeCode(failure)); return }
        try {
            workers.execute {
                try {
                    if (disposed.get()) throw SpotifyConnectFailure(CANCELED_FAILURE)
                    runtime.executeCommand(attachment, reservation, serialized)
                    promise.resolve(null)
                } catch (failure: Throwable) { reject(promise, safeCode(failure)) }
                finally { try { runtime.finishCommand(attachment, reservation) } catch (_failure: Throwable) {} }
            }
        } catch (_failure: Throwable) {
            try { runtime.finishCommand(attachment, reservation) } catch (_cleanupFailure: Throwable) {}
            reject(promise, if (disposed.get()) CANCELED_FAILURE else BACKPRESSURE_FAILURE)
        }
    }

    @ReactMethod
    fun cancelCommand(identifier: String, requestIdentifier: String, promise: Promise) {
        try { runtime.cancelCommand(attachment, identifier, requestIdentifier); promise.resolve(null) }
        catch (failure: Throwable) { reject(promise, safeCode(failure)) }
    }

    @ReactMethod
    fun close(identifier: String, promise: Promise) {
        dispatch(promise, lifecycle) { runtime.close(attachment, identifier) { promise.resolve(null) } }
    }

    @ReactMethod
    fun shutdown(promise: Promise) {
        dispatch(promise, lifecycle) { runtime.shutdown(attachment) { promise.resolve(null) } }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}

    override fun invalidate() {
        disposed.set(true)
        runtime.detach(attachment)
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

    companion object {
        private const val MODULE_NAME = "SpotifyConnectSession"
        private const val EVENT_NAME = "SpotifyConnectSessionEvent"
        private const val IDENTIFIER_FIELD = "identifier"
        private const val BATCH_FIELD = "batch"
        private const val FAILURE_FIELD = "failure"
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

package com.streamingservice.spotify

import android.app.Application
import androidx.media3.common.util.UnstableApi
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean

@UnstableApi
class SpotifyJamPlaybackModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val disposed = AtomicBoolean(false)
    private val runtime = SpotifyJamPlaybackApplicationRuntime.get(context.applicationContext as Application)
    private val attachment = runtime.attach { serialized ->
        if (!disposed.get() && context.hasActiveReactInstance()) {
            try { context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EventName, serialized) }
            catch (_failure: Throwable) { Unit }
        }
    }
    override fun getName(): String = ModuleName

    @ReactMethod fun startFollowing(identifier: String, serialized: String, promise: Promise) = settle(promise) { runtime.startFollowing(attachment, identifier, serialized) }
    @ReactMethod fun stopFollowing(promise: Promise) = settle(promise) { runtime.stopFollowing(attachment) }
    @ReactMethod fun getSnapshot(promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.getSnapshot(attachment)) }
    @ReactMethod fun updateApplicationAccount(accountIdentifier: String?, accessToken: String?, promise: Promise) = settle(promise) { runtime.updateApplicationAccount(attachment, accountIdentifier, accessToken) }
    @ReactMethod fun claimAuthentication(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.claimAuthentication(requestIdentifier)) }
    @ReactMethod fun isAuthenticationPending(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.isAuthenticationPending(requestIdentifier)) }
    @ReactMethod fun completeAuthentication(requestIdentifier: String, accountIdentifier: String, token: String, promise: Promise) = settle(promise) { runtime.completeAuthentication(requestIdentifier, accountIdentifier, token) }
    @ReactMethod fun failAuthentication(requestIdentifier: String, promise: Promise) = settle(promise) { runtime.failAuthentication(requestIdentifier); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun claimRecording(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.claimRecording(requestIdentifier)) }
    @ReactMethod fun isRecordingPending(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.isRecordingPending(requestIdentifier)) }
    @ReactMethod fun completeRecording(requestIdentifier: String, serialized: String, promise: Promise) = settle(promise) { runtime.completeRecording(requestIdentifier, serialized); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun failRecording(requestIdentifier: String, code: String, promise: Promise) = settle(promise) { runtime.failRecording(requestIdentifier, code); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun synchronizePlayerAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String, promise: Promise) = settle(promise) { runtime.synchronizeRecordingAuthentication(requestIdentifier, accountIdentifier, accessToken) }
    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit

    override fun invalidate() { disposed.set(true); runtime.detach(attachment); super.invalidate() }
    private fun <Response> settle(promise: Promise, operation: () -> CompletableFuture<Response>) {
        if (disposed.get()) { promise.reject(Canceled, Canceled); return }
        try {
            operation().whenComplete { response, failure ->
                if (failure != null) reject(promise, failure)
                else promise.resolve(if (response is Unit) null else response)
            }
        } catch (failure: Throwable) { reject(promise, failure) }
    }
    private fun reject(promise: Promise, failure: Throwable) {
        val cause = unwrap(failure)
        val code = (cause as? SpotifyConnectFailure)?.code?.takeIf { selected -> selected in FailureCodes } ?: Network
        promise.reject(code, code)
    }
    private fun unwrap(failure: Throwable): Throwable = if ((failure is CompletionException || failure is ExecutionException) && failure.cause != null) unwrap(requireNotNull(failure.cause)) else failure
    companion object {
        private const val ModuleName = "SpotifyJamPlayback"
        private const val EventName = "SpotifyJamPlaybackChanged"
        private const val Canceled = "canceled"
        private const val Network = "network"
        private val FailureCodes = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

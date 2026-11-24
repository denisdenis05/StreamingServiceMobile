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
    private val hosting = SpotifyHostApplicationRuntime.get(context.applicationContext as Application)
    private val hostAttachment = hosting.attach { snapshot ->
        if (!disposed.get() && context.hasActiveReactInstance()) {
            try { context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(HostEventName, SpotifyHostSnapshotProtocol.encode(snapshot)) }
            catch (_failure: Throwable) { Unit }
        }
    }
    override fun getName(): String = ModuleName

    @ReactMethod fun startFollowing(identifier: String, serialized: String, promise: Promise) = settle(promise) { hosting.retireHosting().thenCompose { runtime.startFollowing(attachment, identifier, serialized) } }
    @ReactMethod fun startHosting(serialized: String, promise: Promise) = settle(promise) { hosting.start(hostAttachment, serialized).thenApply(SpotifyHostSnapshotProtocol::encode) }
    @ReactMethod fun prepareHostingRecordings(serialized: String, promise: Promise) = settle(promise) { hosting.prepareRecordings(hostAttachment, serialized) }
    @ReactMethod fun getHostingQueue(side: String, promise: Promise) = settle(promise) { hosting.readQueue(hostAttachment, side) }
    @ReactMethod fun applyHostingQueue(side: String, serialized: String, promise: Promise) = settle(promise) { hosting.applyQueue(hostAttachment, side, serialized) }
    @ReactMethod fun publishHostingChanges(promise: Promise) = settle(promise) { hosting.publishLocalChanges(hostAttachment) }
    @ReactMethod fun stopHosting(promise: Promise) = settle(promise) { hosting.stop(hostAttachment) }
    @ReactMethod fun getHostingSnapshot(promise: Promise) = settle(promise) { CompletableFuture.completedFuture(SpotifyHostSnapshotProtocol.encode(hosting.snapshot(hostAttachment))) }
    @ReactMethod fun claimHostingRecording(identifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(hosting.claimHostingRecording(identifier)) }
    @ReactMethod fun isHostingRecordingPending(identifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(hosting.isHostingRecordingPending(identifier)) }
    @ReactMethod fun completeHostingRecording(identifier: String, track: String, promise: Promise) = settle(promise) { hosting.completeHostingRecording(identifier, track); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun failHostingRecording(identifier: String, code: String, promise: Promise) = settle(promise) { hosting.failHostingRecording(identifier, code); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun searchHostingRecording(identifier: String, serialized: String, promise: Promise) = settle(promise) { hosting.searchHostingRecording(identifier, serialized) }
    @ReactMethod fun stopFollowing(promise: Promise) = settle(promise) { runtime.stopFollowing(attachment) }
    @ReactMethod fun getSnapshot(promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.getSnapshot(attachment)) }
    @ReactMethod fun updateApplicationAccount(accountIdentifier: String?, accessToken: String?, promise: Promise) = settle(promise) { CompletableFuture.allOf(runtime.updateApplicationAccount(attachment, accountIdentifier, accessToken), hosting.updateAccount(hostAttachment, accountIdentifier, accessToken)).thenApply { Unit } }
    @ReactMethod fun claimAuthentication(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.claimAuthentication(requestIdentifier) ?: hosting.claimAuthentication(requestIdentifier)) }
    @ReactMethod fun isAuthenticationPending(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.isAuthenticationPending(requestIdentifier) || hosting.isAuthenticationPending(requestIdentifier)) }
    @ReactMethod fun completeAuthentication(requestIdentifier: String, accountIdentifier: String, token: String, promise: Promise) = settle(promise) { if (hosting.isAuthenticationPending(requestIdentifier)) hosting.completeAuthentication(requestIdentifier, accountIdentifier, token) else runtime.completeAuthentication(requestIdentifier, accountIdentifier, token) }
    @ReactMethod fun failAuthentication(requestIdentifier: String, promise: Promise) = settle(promise) { if (hosting.isAuthenticationPending(requestIdentifier)) hosting.failAuthentication(requestIdentifier) else runtime.failAuthentication(requestIdentifier); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun claimRecording(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.claimRecording(requestIdentifier) ?: hosting.claimRecording(requestIdentifier)) }
    @ReactMethod fun isRecordingPending(requestIdentifier: String, promise: Promise) = settle(promise) { CompletableFuture.completedFuture(runtime.isRecordingPending(requestIdentifier) || hosting.isRecordingPending(requestIdentifier)) }
    @ReactMethod fun completeRecording(requestIdentifier: String, serialized: String, promise: Promise) = settle(promise) { if (hosting.isRecordingPending(requestIdentifier)) hosting.completeRecording(requestIdentifier, serialized) else runtime.completeRecording(requestIdentifier, serialized); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun failRecording(requestIdentifier: String, code: String, promise: Promise) = settle(promise) { if (hosting.isRecordingPending(requestIdentifier)) hosting.failRecording(requestIdentifier, code) else runtime.failRecording(requestIdentifier, code); CompletableFuture.completedFuture(Unit) }
    @ReactMethod fun synchronizePlayerAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String, promise: Promise) = settle(promise) { if (hosting.isRecordingPending(requestIdentifier)) hosting.synchronizeRecordingAuthentication(requestIdentifier, accountIdentifier, accessToken) else runtime.synchronizeRecordingAuthentication(requestIdentifier, accountIdentifier, accessToken) }
    @ReactMethod fun addListener(eventName: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit

    override fun invalidate() { disposed.set(true); runtime.detach(attachment); hosting.detach(hostAttachment); super.invalidate() }
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
        private const val HostEventName = "SpotifyJamHostingChanged"
        private const val EventName = "SpotifyJamPlaybackChanged"
        private const val Canceled = "canceled"
        private const val Network = "network"
        private val FailureCodes = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

package com.streamingservice.spotify

import android.app.Application
import android.content.Context
import android.os.PowerManager
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.atomic.AtomicBoolean

class SpotifyAndroidHeadlessRecordingDispatch(private val application: Application) : SpotifyHeadlessRecordingDispatch {
    override fun dispatch(requestIdentifier: String, timeoutMilliseconds: Long, finished: (Throwable?) -> Unit): SpotifyNativeFollowerCancellation {
        UiThreadUtil.assertOnUiThread()
        val host = (application as? ReactApplication)?.reactHost ?: throw SpotifyConnectFailure(Unsupported)
        val powerManager = application.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: throw SpotifyConnectFailure(Network)
        val wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WakeLockTag)
        val retired = AtomicBoolean(false)
        var initialization: ReactInstanceEventListener? = null
        var tasks: HeadlessJsTaskContext? = null
        var listener: HeadlessJsTaskEventListener? = null
        var selectedTaskIdentifier: Int? = null

        fun attempt(action: () -> Unit) { try { action() } catch (_failure: Throwable) { Unit } }
        fun cleanup(cancelTask: Boolean) {
            attempt { initialization?.let(host::removeReactInstanceEventListener) }
            initialization = null
            attempt { listener?.let { selected -> tasks?.removeTaskEventListener(selected) } }
            listener = null
            if (cancelTask) attempt { selectedTaskIdentifier?.let { identifier -> tasks?.finishTask(identifier) } }
            selectedTaskIdentifier = null
            attempt { if (wakeLock.isHeld) wakeLock.release() }
        }
        fun settle(failure: Throwable?) {
            if (!retired.compareAndSet(false, true)) return
            cleanup(false)
            finished(failure)
        }
        fun begin(context: ReactContext) {
            if (retired.get()) return
            initialization?.let(host::removeReactInstanceEventListener)
            initialization = null
            try {
                val selected = HeadlessJsTaskContext.getInstance(context)
                tasks = selected
                val events = object : HeadlessJsTaskEventListener {
                    override fun onHeadlessJsTaskStart(taskIdentifier: Int) = Unit
                    override fun onHeadlessJsTaskFinish(taskIdentifier: Int) { if (selectedTaskIdentifier == taskIdentifier) settle(null) }
                }
                listener = events
                selected.addTaskEventListener(events)
                val data = Arguments.createMap().apply { putString(SpotifyBackgroundRecordingProtocol.RequestIdentifierField, requestIdentifier) }
                selectedTaskIdentifier = selected.startTask(HeadlessJsTaskConfig(SpotifyBackgroundRecordingProtocol.TaskName, data, timeoutMilliseconds, AllowForeground))
            } catch (_failure: Throwable) { settle(SpotifyConnectFailure(Network)) }
        }
        try {
            wakeLock.setReferenceCounted(false)
            wakeLock.acquire(timeoutMilliseconds)
            val context = host.currentReactContext
            if (context != null) begin(context)
            else {
                val created = object : ReactInstanceEventListener {
                    override fun onReactContextInitialized(context: ReactContext) { UiThreadUtil.runOnUiThread { begin(context) } }
                }
                initialization = created
                host.addReactInstanceEventListener(created)
                val initialized = host.currentReactContext
                if (initialized != null) begin(initialized) else host.start()
            }
        } catch (_failure: Throwable) { settle(SpotifyConnectFailure(Network)) }
        return SpotifyNativeFollowerCancellation {
            if (retired.compareAndSet(false, true)) UiThreadUtil.runOnUiThread { cleanup(true) }
        }
    }

    companion object {
        private const val AllowForeground = true
        private const val WakeLockTag = "StreamingService:SpotifyRecording"
        private const val Unsupported = "unsupported"
        private const val Network = "network"
    }
}

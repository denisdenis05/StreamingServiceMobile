package com.streamingservice.spotify

import android.util.Base64
import android.os.SystemClock
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executor
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

object SpotifyConnectApplicationRuntime {
    val workers: Executor = executor(WORKER_COUNT)
    val lifecycle: Executor = executor(LIFECYCLE_WORKER_COUNT)
    val runtime = SpotifyConnectRuntime(SpotifyConnectNativeExecution(pollClock = SpotifyNativeFollowerClock { SystemClock.elapsedRealtime() }), SpotifyConnectJsonRuntimeProtocol { serialized ->
        val decoded = Base64.decode(serialized, Base64.NO_WRAP)
        decoded.isNotEmpty() && Base64.encodeToString(decoded, Base64.NO_WRAP) == serialized
    }, Polling(), SpotifyHostApplicationRuntime::retireHosting, SpotifyHostApplicationRuntime::releaseRetiredConnections, SpotifyJamPlaybackApplicationRuntime::retireFollowing)

    private class Polling : SpotifyConnectRuntimePolling {
        private val executor = ScheduledThreadPoolExecutor(POLLING_WORKER_COUNT).apply {
            setKeepAliveTime(IDLE_WORKER_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            allowCoreThreadTimeOut(true)
            removeOnCancelPolicy = true
        }
        private var pending: ScheduledFuture<*>? = null

        @Synchronized
        override fun start(operation: () -> Unit) {
            if (pending != null) return
            pending = executor.scheduleWithFixedDelay(operation, INITIAL_DELAY_MILLISECONDS, POLL_INTERVAL_MILLISECONDS, TimeUnit.MILLISECONDS)
        }

        @Synchronized
        override fun stop() {
            pending?.cancel(false)
            pending = null
        }
    }

    private fun executor(workerCount: Int): ThreadPoolExecutor = ThreadPoolExecutor(workerCount, workerCount,
        IDLE_WORKER_TIMEOUT_SECONDS, TimeUnit.SECONDS, ArrayBlockingQueue(MAXIMUM_QUEUED_OPERATIONS)).apply { allowCoreThreadTimeOut(true) }

    private const val WORKER_COUNT = 2
    private const val LIFECYCLE_WORKER_COUNT = 1
    private const val POLLING_WORKER_COUNT = 1
    private const val MAXIMUM_QUEUED_OPERATIONS = 8
    private const val IDLE_WORKER_TIMEOUT_SECONDS = 30L
    private const val INITIAL_DELAY_MILLISECONDS = 0L
    private const val POLL_INTERVAL_MILLISECONDS = 100L
}

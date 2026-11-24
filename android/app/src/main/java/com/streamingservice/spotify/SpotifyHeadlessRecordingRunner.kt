package com.streamingservice.spotify

import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

object SpotifyBackgroundRecordingProtocol {
    const val TaskName = "StreamingServiceSpotifyRecording"
    const val RequestIdentifierField = "requestIdentifier"
    const val TimeoutMilliseconds = 30000L
}

interface SpotifyHeadlessRecordingDispatch {
    fun dispatch(requestIdentifier: String, timeoutMilliseconds: Long, finished: (Throwable?) -> Unit): SpotifyNativeFollowerCancellation
}

class SpotifyHeadlessRecordingRunner(
    private val mainExecutor: Executor,
    private val dispatch: SpotifyHeadlessRecordingDispatch
) : SpotifyBackgroundRecordingRunner {
    override fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation {
        val retired = AtomicBoolean(false)
        val running = AtomicReference<SpotifyNativeFollowerCancellation?>(null)
        fun report(failure: Throwable?) {
            if (!retired.compareAndSet(false, true)) return
            val code = (failure as? SpotifyConnectFailure)?.code?.takeIf { selected -> selected in FailureCodes }
                ?: if (failure == null) InvalidResponse else Network
            try { failed(SpotifyConnectFailure(code)) } catch (_failure: Throwable) { Unit }
        }
        try {
            mainExecutor.execute {
                if (retired.get()) return@execute
                try {
                    val selected = dispatch.dispatch(requestIdentifier, SpotifyBackgroundRecordingProtocol.TimeoutMilliseconds, ::report)
                    running.set(selected)
                    if (retired.get()) selected.cancel()
                } catch (failure: Throwable) { report(failure) }
            }
        } catch (failure: Throwable) { report(failure) }
        return SpotifyNativeFollowerCancellation {
            if (retired.compareAndSet(false, true)) {
                try { running.get()?.cancel() } catch (_failure: Throwable) { Unit }
            }
        }
    }

    companion object {
        private const val InvalidResponse = "invalid-response"
        private const val Network = "network"
        private val FailureCodes = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

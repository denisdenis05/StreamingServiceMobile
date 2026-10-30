package com.streamingservice.spotify

import java.util.ArrayDeque
import java.util.concurrent.Executor
import org.junit.Assert.*
import org.junit.Test

class SpotifyHeadlessRecordingRunnerTest {
    private class MainQueue : Executor {
        val pending = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { pending.addLast(command) }
        fun drain() { while (pending.isNotEmpty()) pending.removeFirst().run() }
    }
    private class Dispatch : SpotifyHeadlessRecordingDispatch {
        var starts = EMPTY_COUNT
        var cancelled = EMPTY_COUNT
        var completion: ((Throwable?) -> Unit)? = null
        var immediateFailure: Throwable? = null
        var thrownFailure: Throwable? = null
        override fun dispatch(requestIdentifier: String, timeoutMilliseconds: Long, finished: (Throwable?) -> Unit): SpotifyNativeFollowerCancellation {
            assertEquals(REQUEST, requestIdentifier)
            assertEquals(TIMEOUT_MILLISECONDS, timeoutMilliseconds)
            starts += SINGLE_COUNT
            thrownFailure?.let { failure -> throw failure }
            completion = finished
            immediateFailure?.let(finished)
            return SpotifyNativeFollowerCancellation { cancelled += SINGLE_COUNT }
        }
    }
    @Test fun taskDispatchWaitsForTheMainExecutorAndPassesOnlyTheBoundedRequestIdentity() {
        val queue = MainQueue(); val dispatch = Dispatch(); val failures = mutableListOf<Throwable>()
        SpotifyHeadlessRecordingRunner(queue, dispatch).start(REQUEST, failures::add)
        assertEquals(EMPTY_COUNT, dispatch.starts); queue.drain(); assertEquals(SINGLE_COUNT, dispatch.starts); assertTrue(failures.isEmpty())
    }
    @Test fun cancellingBeforeMainDispatchPreventsReactInitialization() {
        val queue = MainQueue(); val dispatch = Dispatch(); val failures = mutableListOf<Throwable>()
        val task = SpotifyHeadlessRecordingRunner(queue, dispatch).start(REQUEST, failures::add)
        task.cancel(); queue.drain(); assertEquals(EMPTY_COUNT, dispatch.starts); assertTrue(failures.isEmpty())
    }
    @Test fun cancellationRetiresTheActualDispatchOnceAndSuppressesLateFinish() {
        val queue = MainQueue(); val dispatch = Dispatch(); val failures = mutableListOf<Throwable>()
        val task = SpotifyHeadlessRecordingRunner(queue, dispatch).start(REQUEST, failures::add); queue.drain()
        task.cancel(); task.cancel(); dispatch.completion?.invoke(null)
        assertEquals(SINGLE_COUNT, dispatch.cancelled); assertTrue(failures.isEmpty())
    }
    @Test fun aTaskThatFinishesWithoutANativeResultReportsOnlyOneSafeFailure() {
        val queue = MainQueue(); val dispatch = Dispatch(); val failures = mutableListOf<Throwable>()
        SpotifyHeadlessRecordingRunner(queue, dispatch).start(REQUEST, failures::add); queue.drain()
        dispatch.completion?.invoke(null); dispatch.completion?.invoke(IllegalStateException(PRIVATE_DIAGNOSTIC))
        assertEquals(SINGLE_COUNT, failures.size); assertEquals(INVALID_RESPONSE, (failures.single() as SpotifyConnectFailure).code)
    }
    @Test fun synchronousDispatchFailureRetiresTheReturnedHandleAndCannotExposePrivateDiagnostics() {
        val queue = MainQueue(); val dispatch = Dispatch(); dispatch.immediateFailure = IllegalStateException(PRIVATE_DIAGNOSTIC)
        val failures = mutableListOf<Throwable>(); SpotifyHeadlessRecordingRunner(queue, dispatch).start(REQUEST, failures::add); queue.drain()
        assertEquals(SINGLE_COUNT, dispatch.cancelled); assertEquals(NETWORK, (failures.single() as SpotifyConnectFailure).code)
    }
    @Test fun executorAndPlatformExceptionsAreReducedToKnownFailureCodes() {
        val failures = mutableListOf<Throwable>()
        SpotifyHeadlessRecordingRunner(Executor { throw IllegalStateException(PRIVATE_DIAGNOSTIC) }, Dispatch()).start(REQUEST, failures::add)
        assertEquals(NETWORK, (failures.single() as SpotifyConnectFailure).code)
        val queue = MainQueue(); val dispatch = Dispatch(); dispatch.thrownFailure = SpotifyConnectFailure(UNSUPPORTED)
        failures.clear(); SpotifyHeadlessRecordingRunner(queue, dispatch).start(REQUEST, failures::add); queue.drain()
        assertEquals(UNSUPPORTED, (failures.single() as SpotifyConnectFailure).code)
    }
    companion object {
        private const val EMPTY_COUNT = 0
        private const val SINGLE_COUNT = 1
        private const val REQUEST = "synthetic-background-request"
        private const val TIMEOUT_MILLISECONDS = 30000L
        private const val PRIVATE_DIAGNOSTIC = "synthetic-private-diagnostic"
        private const val INVALID_RESPONSE = "invalid-response"
        private const val NETWORK = "network"
        private const val UNSUPPORTED = "unsupported"
    }
}

package com.streamingservice.spotify

import org.junit.Assert.assertEquals
import org.junit.Test

class SpotifyLibrespotRequestRunnerTest {
    private class Execution : SpotifyLibrespotExecution {
        val active = mutableSetOf<String>()
        val canceled = mutableListOf<String>()
        val finished = mutableListOf<String>()
        val executed = mutableListOf<List<String>>()
        var rejectBegin = false
        override fun begin(identifier: String): String {
            if (rejectBegin) throw IllegalStateException(PRIVATE_FAILURE)
            active.add(identifier)
            return EMPTY_TEXT
        }
        override fun execute(identifier: String, operation: String, username: String, password: String, storedCredential: String): String {
            executed.add(listOf(identifier, operation, username, password, storedCredential))
            active.remove(identifier)
            return SUCCESS_RESULT
        }
        override fun cancel(identifier: String) { canceled.add(identifier) }
        override fun finish(identifier: String) { active.remove(identifier); finished.add(identifier) }
    }
    private class Fixture {
        val execution = Execution()
        val queued = mutableListOf<() -> Unit>()
        val completed = mutableListOf<String>()
        val failures = mutableListOf<String>()
        val runner = SpotifyLibrespotRequestRunner(execution) { queued.add(it) }
        fun start(identifier: String = REQUEST) {
            runner.start(identifier, LOGIN_OPERATION, USERNAME, PASSWORD, EMPTY_TEXT, { completed.add(it) }, { failures.add(it) })
        }
    }
    @Test
    fun requestRegistersBeforeQueuedDispatchAndForwardsOnlyTheAcceptedInputs() {
        val fixture = Fixture(); fixture.start()
        assertEquals(setOf(REQUEST), fixture.execution.active)
        assertEquals(emptyList<String>(), fixture.completed)
        fixture.queued.single().invoke()
        assertEquals(listOf(SUCCESS_RESULT), fixture.completed)
        assertEquals(listOf(listOf(REQUEST, LOGIN_OPERATION, USERNAME, PASSWORD, EMPTY_TEXT)), fixture.execution.executed)
    }
    @Test
    fun duplicateRequestCannotScheduleAnotherNativeOperation() {
        val fixture = Fixture(); fixture.start(); fixture.start()
        assertEquals(SINGLE_COUNT, fixture.queued.size)
        assertEquals(listOf(BACKPRESSURE_FAILURE), fixture.failures)
    }
    @Test
    fun cancelBeforeQueuedExecutionRetiresOnlyItsOwnRequest() {
        val fixture = Fixture(); fixture.start(); fixture.start(OTHER_REQUEST)
        fixture.runner.cancel(REQUEST)
        assertEquals(listOf(REQUEST), fixture.execution.canceled)
        fixture.queued.forEach { operation -> operation() }
        assertEquals(listOf(CANCELED_FAILURE), fixture.failures)
        assertEquals(listOf(SUCCESS_RESULT), fixture.completed)
    }
    @Test
    fun rejectedDispatchReleasesTheNativeSlotAndSanitizesTheError() {
        val execution = Execution(); val failures = mutableListOf<String>()
        val runner = SpotifyLibrespotRequestRunner(execution) { throw IllegalStateException(PRIVATE_FAILURE) }
        runner.start(REQUEST, LOGIN_OPERATION, USERNAME, PASSWORD, EMPTY_TEXT, {}, { failures.add(it) })
        assertEquals(listOf(NETWORK_FAILURE), failures)
        assertEquals(listOf(REQUEST), execution.finished)
        assertEquals(emptySet<String>(), execution.active)
    }
    @Test
    fun unavailableNativeLibraryNeverQueuesWorkOrExposesItsException() {
        val fixture = Fixture(); fixture.execution.rejectBegin = true; fixture.start()
        assertEquals(listOf(UNSUPPORTED_FAILURE), fixture.failures)
        assertEquals(EMPTY_COUNT, fixture.queued.size)
    }
    @Test
    fun closingRejectsEachOwnedRequestOnceAndIgnoresLateResults() {
        val fixture = Fixture(); fixture.start(); fixture.start(OTHER_REQUEST)
        fixture.runner.close(); fixture.runner.close()
        assertEquals(listOf(CANCELED_FAILURE, CANCELED_FAILURE), fixture.failures)
        fixture.queued.forEach { operation -> operation() }
        assertEquals(emptyList<String>(), fixture.completed)
        assertEquals(listOf(CANCELED_FAILURE, CANCELED_FAILURE), fixture.failures)
    }
    @Test
    fun closedRunnerRejectsNewRequestsWithoutNativeWork() {
        val fixture = Fixture(); fixture.runner.close(); fixture.start()
        assertEquals(listOf(CANCELED_FAILURE), fixture.failures)
        assertEquals(emptySet<String>(), fixture.execution.active)
    }
    @Test
    fun invalidRequestIdentifierCannotReachTheNativeRegistry() {
        val fixture = Fixture(); fixture.start(EMPTY_TEXT)
        assertEquals(listOf(INVALID_INPUT_FAILURE), fixture.failures)
        assertEquals(emptySet<String>(), fixture.execution.active)
    }
    companion object {
        private const val REQUEST = "synthetic-request"
        private const val OTHER_REQUEST = "other-request"
        private const val USERNAME = "synthetic-account"
        private const val PASSWORD = "synthetic-password"
        private const val LOGIN_OPERATION = "login"
        private const val EMPTY_TEXT = ""
        private const val SUCCESS_RESULT = "synthetic-success"
        private const val PRIVATE_FAILURE = "Sensitive native exception"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val CANCELED_FAILURE = "canceled"
        private const val NETWORK_FAILURE = "network"
        private const val UNSUPPORTED_FAILURE = "unsupported"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val SINGLE_COUNT = 1
        private const val EMPTY_COUNT = 0
    }
}

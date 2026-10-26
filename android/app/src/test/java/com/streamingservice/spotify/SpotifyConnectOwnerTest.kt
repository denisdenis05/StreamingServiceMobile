package com.streamingservice.spotify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyConnectOwnerTest {
    private class Execution : SpotifyConnectExecution {
        val canceled = mutableListOf<Long>()
        val finished = mutableListOf<Long>()
        val refreshed = mutableListOf<Pair<Long, Long>>()
        val begunCommands = mutableListOf<Pair<Long, String>>()
        val canceledCommands = mutableListOf<Pair<Long, String>>()
        val finishedCommands = mutableListOf<Pair<Long, String>>()
        val commands = mutableListOf<Pair<Long, String>>()
        var onCommand: () -> Unit = {}
        override fun beginCommand(handle: Long, requestIdentifier: String) { begunCommands.add(handle to requestIdentifier) }
        override fun command(handle: Long, requestIdentifier: String, serialized: String) { commands.add(handle to serialized); onCommand() }
        override fun cancelCommand(handle: Long, requestIdentifier: String) { canceledCommands.add(handle to requestIdentifier) }
        override fun finishCommand(handle: Long, requestIdentifier: String) { finishedCommands.add(handle to requestIdentifier) }
        var cancelFails = false
        var batch = SpotifyConnectBatch(PAYLOAD, false)
        var onRefresh: () -> Unit = {}
        override fun start(serialized: String): Long { assertEquals(CREDENTIAL, serialized); return HANDLE }
        override fun poll(handle: Long): SpotifyConnectBatch { assertEquals(HANDLE, handle); return batch }
        override fun refresh(handle: Long, generation: Long) { refreshed.add(handle to generation); onRefresh() }
        override fun cancel(handle: Long) { if (cancelFails) throw SpotifyConnectFailure(NETWORK_FAILURE); canceled.add(handle) }
        override fun finish(handle: Long) { finished.add(handle) }
    }
    private class Fixture {
        val execution = Execution()
        val events = mutableListOf<Pair<String, SpotifyConnectBatch>>()
        var completions = EMPTY_COUNT
        val owner = SpotifyConnectOwner(execution) { identifier, batch -> events.add(identifier to batch) }
        fun start() { owner.start(IDENTIFIER, CREDENTIAL) }
        fun close() { owner.close(IDENTIFIER) { completions += SINGLE_COUNT } }
    }
    private fun requireFailure(code: String, operation: () -> Unit) {
        try { operation(); throw AssertionError(MISSING_FAILURE) } catch (failure: SpotifyConnectFailure) { assertEquals(code, failure.code) }
    }
    @Test
    fun nativeBatchesArePublishedOnlyToTheirOwningIdentifier() {
        val fixture = Fixture(); fixture.start(); fixture.owner.pump()
        assertEquals(listOf(IDENTIFIER to fixture.execution.batch), fixture.events)
        assertEquals(IDENTIFIER, fixture.owner.currentIdentifier())
    }
    @Test
    fun replacementWaitsForCleanupAndFinalNativeDrain() {
        val fixture = Fixture(); fixture.start(); fixture.close()
        requireFailure(BACKPRESSURE_FAILURE) { fixture.owner.start(OTHER_IDENTIFIER, CREDENTIAL) }
        fixture.owner.pump(); assertEquals(EMPTY_COUNT, fixture.completions)
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.owner.pump()
        assertEquals(listOf(HANDLE), fixture.execution.finished); assertEquals(SINGLE_COUNT, fixture.completions)
        assertTrue(fixture.events.isEmpty()); assertFalse(fixture.owner.hasConnection())
        fixture.owner.start(OTHER_IDENTIFIER, CREDENTIAL)
    }
    @Test
    fun repeatedCloseCancelsOnceAndCompletesEveryWaiterAfterCleanup() {
        val fixture = Fixture(); fixture.start(); fixture.close(); fixture.close()
        assertEquals(listOf(HANDLE), fixture.execution.canceled)
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.owner.pump()
        assertEquals(TWO_COMPLETIONS, fixture.completions)
    }
    @Test
    fun staleCloseAndRefreshCannotTouchTheCurrentConnection() {
        val fixture = Fixture(); fixture.start()
        fixture.owner.close(OTHER_IDENTIFIER) { fixture.completions += SINGLE_COUNT }
        assertEquals(SINGLE_COUNT, fixture.completions); assertTrue(fixture.execution.canceled.isEmpty())
        requireFailure(CANCELED_FAILURE) { fixture.owner.refresh(OTHER_IDENTIFIER, GENERATION) }
        assertTrue(fixture.execution.refreshed.isEmpty())
    }
    @Test
    fun refreshKeepsTheNativeHandleAndFencesResultsAfterConcurrentRetirement() {
        val fixture = Fixture(); fixture.start(); fixture.owner.refresh(IDENTIFIER, GENERATION)
        assertEquals(listOf(HANDLE to GENERATION), fixture.execution.refreshed)
        fixture.execution.onRefresh = { fixture.close() }
        requireFailure(CANCELED_FAILURE) { fixture.owner.refresh(IDENTIFIER, GENERATION) }
    }
    @Test
    fun disposeCancelsAndDrainsWithoutPublishingLateBatchesOrStartingAgain() {
        val fixture = Fixture(); fixture.start(); fixture.owner.dispose(); fixture.owner.dispose()
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.owner.pump()
        assertTrue(fixture.events.isEmpty()); assertEquals(listOf(HANDLE), fixture.execution.canceled)
        assertFalse(fixture.owner.hasConnection())
        requireFailure(CANCELED_FAILURE) { fixture.start() }
    }
    @Test
    fun failedCancellationIsRetriedDuringTheNativePumpWithoutCompletingTwice() {
        val fixture = Fixture(); fixture.start(); fixture.execution.cancelFails = true
        requireFailure(NETWORK_FAILURE) { fixture.close() }
        fixture.execution.cancelFails = false; fixture.owner.pump()
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.owner.pump()
        assertEquals(listOf(HANDLE), fixture.execution.canceled); assertEquals(EMPTY_COUNT, fixture.completions)
    }
    @Test
    fun invalidOwnerIdentifiersAndGenerationCannotReachNativeExecution() {
        val fixture = Fixture()
        requireFailure(INVALID_INPUT_FAILURE) { fixture.owner.start(EMPTY_TEXT, CREDENTIAL) }
        fixture.start(); requireFailure(INVALID_INPUT_FAILURE) { fixture.owner.refresh(IDENTIFIER, INVALID_GENERATION) }
        assertTrue(fixture.execution.refreshed.isEmpty())
    }
    @Test
    fun spontaneousNativeTerminationPublishesItsFinalBatchThenReleasesOwnership() {
        val fixture = Fixture(); fixture.start(); fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true)
        fixture.owner.pump(); fixture.owner.pump()
        assertEquals(SINGLE_COUNT, fixture.events.size); assertEquals(listOf(HANDLE), fixture.execution.finished)
        assertFalse(fixture.owner.hasConnection())
    }
    @Test
    fun emptyNativeBatchesDoNotFloodTheJavaScriptEventQueue() {
        val fixture = Fixture(); fixture.start(); fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, false, false)
        fixture.owner.pump(); assertTrue(fixture.events.isEmpty())
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true, false); fixture.owner.pump()
        assertEquals(SINGLE_COUNT, fixture.events.size); assertFalse(fixture.owner.hasConnection())
    }
    @Test
    fun commandReservationExistsBeforeWorkerDispatchAndCanceledQueuedWorkNeverExecutes() {
        val fixture = Fixture(); fixture.start()
        val reservation = fixture.owner.prepareCommand(IDENTIFIER, REQUEST_IDENTIFIER)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), fixture.execution.begunCommands)
        fixture.owner.cancelCommand(IDENTIFIER, REQUEST_IDENTIFIER)
        requireFailure(CANCELED_FAILURE) { fixture.owner.executeCommand(reservation, PAYLOAD) }
        assertTrue(fixture.execution.commands.isEmpty())
        requireFailure(BACKPRESSURE_FAILURE) { fixture.owner.prepareCommand(IDENTIFIER, REQUEST_IDENTIFIER) }
        fixture.owner.finishCommand(reservation); fixture.owner.finishCommand(reservation)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), fixture.execution.finishedCommands)
    }
    @Test
    fun retiredCommandReservationCannotExecuteOrFinishAReplacementWithTheSameRequestIdentifier() {
        val fixture = Fixture(); fixture.start()
        val retiredReservation = fixture.owner.prepareCommand(IDENTIFIER, REQUEST_IDENTIFIER)
        fixture.close(); fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.owner.pump()
        fixture.start(); val currentReservation = fixture.owner.prepareCommand(IDENTIFIER, REQUEST_IDENTIFIER)
        requireFailure(CANCELED_FAILURE) { fixture.owner.executeCommand(retiredReservation, PAYLOAD) }
        fixture.owner.finishCommand(retiredReservation)
        assertTrue(fixture.execution.finishedCommands.isEmpty())
        fixture.owner.executeCommand(currentReservation, PAYLOAD); fixture.owner.finishCommand(currentReservation)
        assertEquals(listOf(HANDLE to PAYLOAD), fixture.execution.commands)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), fixture.execution.finishedCommands)
    }
    @Test
    fun cancellationAfterNativeDispatchReportsUnknownOutcomeAndRetiresExactlyOnce() {
        val fixture = Fixture(); fixture.start()
        val reservation = fixture.owner.prepareCommand(IDENTIFIER, REQUEST_IDENTIFIER)
        fixture.execution.onCommand = { fixture.owner.cancelCommand(IDENTIFIER, REQUEST_IDENTIFIER) }
        requireFailure(UNKNOWN_OUTCOME_FAILURE) { fixture.owner.executeCommand(reservation, PAYLOAD) }
        fixture.owner.finishCommand(reservation)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), fixture.execution.canceledCommands)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), fixture.execution.finishedCommands)
    }
    @Test
    fun staleOwnersAndMalformedCommandIdentifiersCannotReserveNativeWork() {
        val fixture = Fixture(); fixture.start()
        requireFailure(CANCELED_FAILURE) { fixture.owner.prepareCommand(OTHER_IDENTIFIER, REQUEST_IDENTIFIER) }
        requireFailure(INVALID_INPUT_FAILURE) { fixture.owner.prepareCommand(IDENTIFIER, EMPTY_TEXT) }
        assertTrue(fixture.execution.begunCommands.isEmpty())
    }
    companion object {
        private const val REQUEST_IDENTIFIER = "synthetic-native-command"
        private const val UNKNOWN_OUTCOME_FAILURE = "unknown-outcome"
        private const val IDENTIFIER = "synthetic-connection-owner"
        private const val OTHER_IDENTIFIER = "replacement-connection-owner"
        private const val CREDENTIAL = "synthetic-private-credential"
        private const val PAYLOAD = "synthetic-private-native-batch"
        private const val HANDLE = 4L
        private const val GENERATION = 2L
        private const val INVALID_GENERATION = 0L
        private const val EMPTY_COUNT = 0
        private const val SINGLE_COUNT = 1
        private const val TWO_COMPLETIONS = 2
        private const val EMPTY_TEXT = ""
        private const val NETWORK_FAILURE = "network"
        private const val CANCELED_FAILURE = "canceled"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val MISSING_FAILURE = "Expected a connection failure"
    }
}

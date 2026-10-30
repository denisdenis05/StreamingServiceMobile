package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyConnectNativeExecutionTest {
    @Test fun pollingRetainsItsActualLocalClockBracket() {
        val native = Native()
        val samples = ArrayDeque(listOf(PollStartedElapsedMilliseconds, PollCompletedElapsedMilliseconds))
        val execution = SpotifyConnectNativeExecution(native, SpotifyNativeFollowerClock { samples.removeFirst() })
        val batch = execution.poll(HANDLE)
        assertEquals(PollStartedElapsedMilliseconds, batch.requestStartedElapsedMilliseconds)
        assertEquals(PollCompletedElapsedMilliseconds, batch.requestCompletedElapsedMilliseconds)
        assertTrue(samples.isEmpty())
    }
    @Test fun searchRequiresTheExactHandleAndGenerationAndPreservesSafeFailures() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        assertEquals(native.reading, execution.search(HANDLE, GENERATION, CREDENTIAL))
        native.reading = JSONObject().put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, NEXT_GENERATION).toString()
        try { execution.search(HANDLE, GENERATION, CREDENTIAL); throw AssertionError(INVALID_RESPONSE_FAILURE) }
        catch (failure: SpotifyConnectFailure) { assertEquals(INVALID_RESPONSE_FAILURE, failure.code) }
    }
    private class Native : SpotifyConnectNativeCalls {
        var opened = JSONObject().put(HANDLE_FIELD, HANDLE).toString()
        var polled = JSONObject().put(HANDLE_FIELD, HANDLE).put(FINISHED_FIELD, false).put(EVENTS_FIELD, JSONArray()).toString()
        var receipt = SUCCESS_RECEIPT
        var executionFailure: Throwable? = null
        val commands = mutableListOf<Pair<Long, String>>()
        val begunCommands = mutableListOf<Pair<Long, String>>()
        val canceledCommands = mutableListOf<Pair<Long, String>>()
        val finishedCommands = mutableListOf<Pair<Long, String>>()
        override fun beginCommand(handle: Long, requestIdentifier: String): String { begunCommands.add(handle to requestIdentifier); return receipt }
        override fun cancelCommand(handle: Long, requestIdentifier: String): String { canceledCommands.add(handle to requestIdentifier); return receipt }
        override fun finishCommand(handle: Long, requestIdentifier: String): String { finishedCommands.add(handle to requestIdentifier); return receipt }
        val canceled = mutableListOf<Long>()
        val finished = mutableListOf<Long>()
        override fun start(serialized: String): String { assertEquals(CREDENTIAL, serialized); return opened }
        var reading = JSONObject().put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, GENERATION).toString()
        override fun search(handle: Long, generation: Long, serialized: String): String { assertEquals(HANDLE, handle); assertEquals(GENERATION, generation); assertEquals(CREDENTIAL, serialized); return reading }
        override fun metadata(handle: Long, generation: Long, serialized: String): String { assertEquals(HANDLE, handle); assertEquals(GENERATION, generation); assertEquals(CREDENTIAL, serialized); return reading }
        override fun read(handle: Long, generation: Long): String { assertEquals(HANDLE, handle); assertEquals(GENERATION, generation); return reading }
        override fun poll(handle: Long): String { assertEquals(HANDLE, handle); return polled }
        override fun execute(handle: Long, serialized: String): String { commands.add(handle to serialized); executionFailure?.let { failure -> throw failure }; return receipt }
        override fun cancel(handle: Long): String { canceled.add(handle); return receipt }
        override fun finish(handle: Long): String { finished.add(handle); return receipt }
    }
    private fun requireFailure(code: String, operation: () -> Unit) {
        try { operation(); throw AssertionError(MISSING_FAILURE) } catch (failure: SpotifyConnectFailure) {
            assertEquals(code, failure.code); assertFalse(failure.toString().contains(PRIVATE_VALUE))
        }
    }
    @Test
    fun openedHandleMustBeAnExactPositiveSafeInteger() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        assertEquals(HANDLE, execution.start(CREDENTIAL))
        for (handle in listOf(INVALID_HANDLE, FRACTIONAL_HANDLE, UNSAFE_HANDLE, PRIVATE_VALUE)) {
            native.opened = JSONObject().put(HANDLE_FIELD, handle).toString()
            requireFailure(INVALID_RESPONSE_FAILURE) { execution.start(CREDENTIAL) }
        }
    }
    @Test
    fun pollingKeepsTheExpectedHandleAndClassifiesEmptyAndFinalBatches() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        val empty = execution.poll(HANDLE); assertFalse(empty.hasEvents); assertFalse(empty.finished)
        native.polled = JSONObject().put(HANDLE_FIELD, HANDLE).put(FINISHED_FIELD, true)
            .put(EVENTS_FIELD, JSONArray().put(JSONObject())).toString()
        val final = execution.poll(HANDLE); assertTrue(final.hasEvents); assertTrue(final.finished); assertEquals(native.polled, final.serialized)
    }
    @Test
    fun pollingRejectsForeignHandlesCoercedBooleansAndExcessiveBatches() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        val valid = JSONObject(native.polled)
        val excessive = JSONArray(); repeat(EXCESSIVE_EVENTS) { excessive.put(JSONObject()) }
        for (response in listOf(JSONObject(valid.toString()).put(HANDLE_FIELD, OTHER_HANDLE),
            JSONObject(valid.toString()).put(FINISHED_FIELD, TRUE_TEXT), JSONObject(valid.toString()).put(EVENTS_FIELD, excessive))) {
            native.polled = response.toString(); requireFailure(INVALID_RESPONSE_FAILURE) { execution.poll(HANDLE) }
        }
    }
    @Test
    fun refreshAndCleanupUseTheirExactNativeHandleAndRequireExplicitReceipts() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        execution.refresh(HANDLE, GENERATION); execution.cancel(HANDLE); execution.finish(HANDLE)
        assertEquals(listOf(HANDLE), native.canceled); assertEquals(listOf(HANDLE), native.finished)
        val command = JSONObject(native.commands.single().second)
        assertEquals(HANDLE, native.commands.single().first); assertEquals(REFRESH_OPERATION, command.getString(OPERATION_FIELD))
        assertEquals(GENERATION, command.getLong(GENERATION_FIELD))
        native.receipt = JSONObject().toString(); requireFailure(INVALID_RESPONSE_FAILURE) { execution.cancel(HANDLE) }
    }
    @Test
    fun nativeFailureCodesArePreservedOnlyWhenTheyBelongToTheKnownProtocol() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        native.opened = JSONObject().put(FAILURE_FIELD, FORBIDDEN_FAILURE).toString()
        requireFailure(FORBIDDEN_FAILURE) { execution.start(CREDENTIAL) }
        native.opened = JSONObject().put(FAILURE_FIELD, PRIVATE_VALUE).toString()
        requireFailure(NETWORK_FAILURE) { execution.start(CREDENTIAL) }
    }
    @Test
    fun malformedAndOversizedResponsesCannotExposePrivateNativeText() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        for (response in listOf(PRIVATE_VALUE, PRIVATE_VALUE.padEnd(EXCESSIVE_RESPONSE_CHARACTERS, PADDING_CHARACTER))) {
            native.opened = response; requireFailure(INVALID_RESPONSE_FAILURE) { execution.start(CREDENTIAL) }
        }
    }
    @Test
    fun commandLifecycleKeepsTheReservedHandleAndRequestIdentifier() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        execution.beginCommand(HANDLE, REQUEST_IDENTIFIER)
        val serialized = JSONObject().put(OPERATION_FIELD, COMMAND_OPERATION).put(REQUEST_IDENTIFIER_FIELD, REQUEST_IDENTIFIER).toString()
        native.receipt = JSONObject().put(FAILURE_FIELD, JSONObject.NULL).put(ACKNOWLEDGEMENT_FIELD,
            JSONObject().put(ACKNOWLEDGEMENT_IDENTIFIER_FIELD, REQUEST_IDENTIFIER).put(DELIVERY_OBSERVED_FIELD, true)).toString()
        execution.command(HANDLE, REQUEST_IDENTIFIER, serialized)
        execution.cancelCommand(HANDLE, REQUEST_IDENTIFIER); execution.finishCommand(HANDLE, REQUEST_IDENTIFIER)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), native.begunCommands)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), native.canceledCommands)
        assertEquals(listOf(HANDLE to REQUEST_IDENTIFIER), native.finishedCommands)
        assertEquals(listOf(HANDLE to serialized), native.commands)
    }
    @Test
    fun commandsCannotExecuteWithAnotherRequestsReservationOrAsUnreservedRefreshes() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        for (serialized in listOf(PRIVATE_VALUE, JSONObject().put(OPERATION_FIELD, REFRESH_OPERATION).put(REQUEST_IDENTIFIER_FIELD, REQUEST_IDENTIFIER).toString(),
            JSONObject().put(OPERATION_FIELD, COMMAND_OPERATION).put(REQUEST_IDENTIFIER_FIELD, PRIVATE_VALUE).toString())) {
            requireFailure(INVALID_INPUT_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, serialized) }
        }
        assertTrue(native.commands.isEmpty())
    }
    @Test
    fun nativeReadRejectsForeignHandlesAndCoercedGenerations() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        assertEquals(native.reading, execution.read(HANDLE, GENERATION))
        for (reading in listOf(JSONObject().put(HANDLE_FIELD, OTHER_HANDLE).put(GENERATION_FIELD, GENERATION),
            JSONObject().put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, GENERATION.toString()))) {
            native.reading = reading.toString(); requireFailure(INVALID_RESPONSE_FAILURE) { execution.read(HANDLE, GENERATION) }
        }
    }
    @Test
    fun metadataEnvelopesMustKeepTheExpectedNativeHandleAndGeneration() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        assertEquals(native.reading, execution.metadata(HANDLE, GENERATION, CREDENTIAL))
        native.reading = JSONObject().put(HANDLE_FIELD, OTHER_HANDLE).put(GENERATION_FIELD, GENERATION).toString()
        requireFailure(INVALID_RESPONSE_FAILURE) { execution.metadata(HANDLE, GENERATION, CREDENTIAL) }
    }
    @Test
    fun httpAcceptanceWithoutObservedDealerDeliveryCannotCompleteAnAndroidCommand() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        val control = JSONObject().put(OPERATION_FIELD, COMMAND_OPERATION).put(REQUEST_IDENTIFIER_FIELD, REQUEST_IDENTIFIER).toString()
        requireFailure(UNKNOWN_OUTCOME_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, control) }
        for (observed in listOf(false, TRUE_TEXT)) {
            native.receipt = JSONObject().put(FAILURE_FIELD, JSONObject.NULL).put(ACKNOWLEDGEMENT_FIELD,
                JSONObject().put(ACKNOWLEDGEMENT_IDENTIFIER_FIELD, REQUEST_IDENTIFIER).put(DELIVERY_OBSERVED_FIELD, observed)).toString()
            requireFailure(UNKNOWN_OUTCOME_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, control) }
        }
        native.receipt = JSONObject().put(FAILURE_FIELD, FORBIDDEN_FAILURE).toString()
        requireFailure(FORBIDDEN_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, control) }
    }
    @Test
    fun malformedReceiptsAndThrownNativeExecutionRemainUncertainWhileExplicitPreflightFailuresArePreserved() {
        val native = Native(); val execution = SpotifyConnectNativeExecution(native)
        val control = JSONObject().put(OPERATION_FIELD, COMMAND_OPERATION).put(REQUEST_IDENTIFIER_FIELD, REQUEST_IDENTIFIER).toString()
        native.receipt = PRIVATE_VALUE
        requireFailure(UNKNOWN_OUTCOME_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, control) }
        native.executionFailure = IllegalStateException(PRIVATE_VALUE)
        requireFailure(UNKNOWN_OUTCOME_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, control) }
        native.executionFailure = null; native.receipt = JSONObject().put(FAILURE_FIELD, INVALID_RESPONSE_FAILURE).toString()
        requireFailure(INVALID_RESPONSE_FAILURE) { execution.command(HANDLE, REQUEST_IDENTIFIER, control) }
    }
    companion object {
        private const val PollStartedElapsedMilliseconds = 5000L
        private const val PollCompletedElapsedMilliseconds = 5020L
        private const val UNKNOWN_OUTCOME_FAILURE = "unknown-outcome"
        private const val ACKNOWLEDGEMENT_FIELD = "acknowledgement"
        private const val ACKNOWLEDGEMENT_IDENTIFIER_FIELD = "acknowledgementIdentifier"
        private const val DELIVERY_OBSERVED_FIELD = "deliveryObserved"
        private const val COMMAND_OPERATION = "command"
        private const val REQUEST_IDENTIFIER_FIELD = "requestIdentifier"
        private const val REQUEST_IDENTIFIER = "synthetic-native-command"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val HANDLE = 4L
        private const val OTHER_HANDLE = 5L
        private const val GENERATION = 2L
        private const val NEXT_GENERATION = 3L
        private const val INVALID_HANDLE = 0L
        private const val FRACTIONAL_HANDLE = 4.5
        private const val UNSAFE_HANDLE = 9007199254740992L
        private const val EXCESSIVE_EVENTS = 5
        private const val EXCESSIVE_RESPONSE_CHARACTERS = 2097153
        private const val CREDENTIAL = "synthetic-private-credential"
        private const val PRIVATE_VALUE = "private native diagnostics"
        private const val PADDING_CHARACTER = 'x'
        private const val HANDLE_FIELD = "handle"
        private const val FINISHED_FIELD = "finished"
        private const val EVENTS_FIELD = "events"
        private const val FAILURE_FIELD = "failure"
        private const val OPERATION_FIELD = "operation"
        private const val GENERATION_FIELD = "generation"
        private const val REFRESH_OPERATION = "refresh"
        private const val TRUE_TEXT = "true"
        private const val SUCCESS_RECEIPT = "{\"failure\":null}"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val NETWORK_FAILURE = "network"
        private const val FORBIDDEN_FAILURE = "forbidden"
        private const val MISSING_FAILURE = "Expected a native connection failure"
    }
}

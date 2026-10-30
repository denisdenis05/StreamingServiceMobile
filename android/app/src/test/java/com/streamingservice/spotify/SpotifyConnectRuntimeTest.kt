package com.streamingservice.spotify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CompletableFuture

class SpotifyConnectRuntimeTest {
    private class Execution : SpotifyConnectExecution {
        var starts = EMPTY_COUNT
        var cancellations = EMPTY_COUNT
        var finished = EMPTY_COUNT
        var commands = EMPTY_COUNT
        var canceledCommands = EMPTY_COUNT
        var finishedCommands = EMPTY_COUNT
        var onRead: () -> Unit = {}
        var onCommand: () -> Unit = {}
        var pollFailure = false
        var batch = SpotifyConnectBatch(PAYLOAD, false)
        override fun start(serialized: String): Long { starts += SINGLE_COUNT; return HANDLE }
        override fun poll(handle: Long): SpotifyConnectBatch { if (pollFailure) throw SpotifyConnectFailure(NETWORK_FAILURE); return batch }
        override fun read(handle: Long, generation: Long): String { onRead(); return PAYLOAD }
        override fun search(handle: Long, generation: Long, serialized: String): String { onRead(); return PAYLOAD }
        override fun metadata(handle: Long, generation: Long, serialized: String): String { onRead(); return PAYLOAD }
        override fun refresh(handle: Long, generation: Long) { onRead() }
        override fun beginCommand(handle: Long, requestIdentifier: String) {}
        override fun command(handle: Long, requestIdentifier: String, serialized: String) { commands += SINGLE_COUNT; onCommand() }
        override fun cancelCommand(handle: Long, requestIdentifier: String) { canceledCommands += SINGLE_COUNT }
        override fun finishCommand(handle: Long, requestIdentifier: String) { finishedCommands += SINGLE_COUNT }
        override fun cancel(handle: Long) { cancellations += SINGLE_COUNT }
        override fun finish(handle: Long) { finished += SINGLE_COUNT }
    }
    private class Polling : SpotifyConnectRuntimePolling {
        var operation: (() -> Unit)? = null
        var starts = EMPTY_COUNT
        var stops = EMPTY_COUNT
        override fun start(operation: () -> Unit) { starts += SINGLE_COUNT; this.operation = operation }
        override fun stop() { stops += SINGLE_COUNT; operation = null }
        fun pump() { checkNotNull(operation).invoke() }
    }
    private class Protocol : SpotifyConnectRuntimeProtocol {
        var requestedIdentity = IDENTITY
        var invalidBootstrap = false
        override fun identity(serialized: String): SpotifyConnectRuntimeIdentity = requestedIdentity
        override fun bootstrap(batch: SpotifyConnectBatch, identity: SpotifyConnectRuntimeIdentity, previous: SpotifyConnectBatch?): SpotifyConnectBatch? {
            if (invalidBootstrap) throw SpotifyConnectFailure(INVALID_RESPONSE_FAILURE)
            return if (batch.finished) null else batch
        }
    }
    private class Fixture(val following: CompletableFuture<Unit> = CompletableFuture.completedFuture(Unit)) {
        var followingRetirements = EMPTY_COUNT
        val execution = Execution()
        val protocol = Protocol()
        val polling = Polling()
        val runtime = SpotifyConnectRuntime(execution, protocol, polling) { followingRetirements += SINGLE_COUNT; following }
        val events = mutableListOf<SpotifyConnectRuntimeEvent>()
        val attachment = runtime.attach { event -> events.add(event) }
        fun start(): Long = runtime.start(attachment, IDENTIFIER, CREDENTIAL)
        fun replacement(events: MutableList<SpotifyConnectRuntimeEvent> = mutableListOf()): SpotifyConnectRuntime.Attachment = runtime.attach { event -> events.add(event) }
    }

    private fun requireFailure(code: String, operation: () -> Unit) {
        try { operation(); throw AssertionError(MISSING_FAILURE) }
        catch (failure: SpotifyConnectFailure) { assertEquals(code, failure.code) }
    }

    @Test
    fun explicitShutdownWaitsForNativeAndFollowerCleanupAndDetachDoesNotRetireFollowing() {
        val following = CompletableFuture<Unit>(); val fixture = Fixture(following); fixture.start()
        fixture.runtime.detach(fixture.attachment)
        assertEquals(EMPTY_COUNT, fixture.followingRetirements)
        val replacement = fixture.replacement(); fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL)
        var completed = false
        fixture.runtime.shutdown(replacement) { completed = true }
        assertFalse(fixture.runtime.ownsNativeConnection(IDENTITY.accountIdentifier, HANDLE))
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertFalse(completed)
        following.complete(Unit)
        assertTrue(completed)
    }
    @Test
    fun replacementAccountWaitsForFollowerCleanupAfterNativeDrain() {
        val following = CompletableFuture<Unit>(); val fixture = Fixture(following); fixture.start()
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        var replacementHandle: Long? = null
        fixture.runtime.startOrReplace(fixture.attachment, IDENTIFIER, CREDENTIAL, { handle -> replacementHandle = handle }, { failure -> throw failure })
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertEquals(SINGLE_COUNT, fixture.execution.starts)
        following.complete(Unit)
        assertEquals(HANDLE, replacementHandle)
        assertEquals(TWO_COUNT, fixture.execution.starts)
    }
    @Test
    fun failedFollowerCleanupRejectsShutdownAfterNativeDrain() {
        val following = CompletableFuture<Unit>(); val fixture = Fixture(following); fixture.start()
        var completed = false; var failed = false
        fixture.runtime.shutdown(fixture.attachment, { completed = true }, { failed = true })
        following.completeExceptionally(SpotifyConnectFailure(NETWORK_FAILURE))
        assertFalse(failed)
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertTrue(failed); assertFalse(completed)
    }
    @Test
    fun failedFollowerRetirementCannotBeBypassedByAnotherNativeStartAfterAccessPointDrain() {
        val following = CompletableFuture<Unit>(); val fixture = Fixture(following); fixture.start()
        fixture.runtime.shutdown(fixture.attachment, {}, {})
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        requireFailure(BACKPRESSURE_FAILURE) { fixture.runtime.start(fixture.attachment, IDENTIFIER, CREDENTIAL) }
        following.completeExceptionally(SpotifyConnectFailure(NETWORK_FAILURE))
        requireFailure(NETWORK_FAILURE) { fixture.runtime.start(fixture.attachment, IDENTIFIER, CREDENTIAL) }
        assertEquals(SINGLE_COUNT, fixture.execution.starts)
    }
    @Test
    fun nativeApplicationObservationSurvivesReactDetachAndCanDetachIndependently() {
        val fixture = Fixture(); fixture.start(); var observed = EMPTY_COUNT
        val observation = fixture.runtime.observeNativeConnection { observed += SINGLE_COUNT }
        fixture.runtime.detach(fixture.attachment); fixture.polling.pump()
        assertEquals(SINGLE_COUNT, observed)
        observation.cancel(); fixture.polling.pump()
        assertEquals(SINGLE_COUNT, observed)
    }
    @Test
    fun detachedReactAttachmentRetainsNativeConnectionAndPolling() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.detach(fixture.attachment); fixture.polling.pump()
        assertEquals(EMPTY_COUNT, fixture.execution.cancellations)
        assertTrue(fixture.events.isEmpty()); assertEquals(SINGLE_COUNT, fixture.polling.starts)
    }
    @Test
    fun recreatedReactAttachmentAdoptsHandleWithItsNewIdentifierAndBootstrap() {
        val fixture = Fixture(); fixture.start(); fixture.polling.pump(); fixture.runtime.detach(fixture.attachment)
        val replacementEvents = mutableListOf<SpotifyConnectRuntimeEvent>(); val replacement = fixture.replacement(replacementEvents)
        assertEquals(HANDLE, fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL))
        assertEquals(SINGLE_COUNT, fixture.execution.starts); assertEquals(SINGLE_COUNT, fixture.polling.starts)
        assertEquals(listOf(SpotifyConnectRuntimeEvent(OTHER_IDENTIFIER, fixture.execution.batch)), replacementEvents)
    }
    @Test
    fun creatingReplacementRevokesPreviousListenerEvenWithoutInvalidate() {
        val fixture = Fixture(); fixture.start(); val replacementEvents = mutableListOf<SpotifyConnectRuntimeEvent>()
        val replacement = fixture.replacement(replacementEvents); fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL); fixture.polling.pump()
        assertTrue(fixture.events.isEmpty()); assertEquals(SINGLE_COUNT, replacementEvents.size)
        fixture.runtime.detach(fixture.attachment); fixture.polling.pump(); assertEquals(TWO_COUNT, replacementEvents.size)
    }
    @Test
    fun retainedConnectionRejectsChangedAccountDeviceClientOrConfiguration() {
        val replacements = listOf(IDENTITY.copy(accountIdentifier = OTHER_IDENTITY), IDENTITY.copy(deviceIdentifier = OTHER_IDENTITY),
            IDENTITY.copy(clientIdentifier = OTHER_IDENTITY), IDENTITY.copy(deviceName = OTHER_IDENTITY), IDENTITY.copy(playbackReady = true))
        for (identity in replacements) {
            val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement(); fixture.protocol.requestedIdentity = identity
            requireFailure(UNAUTHORIZED_FAILURE) { fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL) }
            assertEquals(SINGLE_COUNT, fixture.execution.starts); assertEquals(EMPTY_COUNT, fixture.execution.cancellations)
        }
    }
    @Test
    fun revokedAttachmentCannotStartReadRefreshReadMetadataOrCloseCurrentConnection() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement(); fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL)
        requireFailure(CANCELED_FAILURE) { fixture.start() }
        requireFailure(CANCELED_FAILURE) { fixture.runtime.read(fixture.attachment, IDENTIFIER, GENERATION) }
        requireFailure(CANCELED_FAILURE) { fixture.runtime.refresh(fixture.attachment, IDENTIFIER, GENERATION) }
        requireFailure(CANCELED_FAILURE) { fixture.runtime.metadata(fixture.attachment, IDENTIFIER, GENERATION, PAYLOAD) }
        requireFailure(CANCELED_FAILURE) { fixture.runtime.search(fixture.attachment, IDENTIFIER, GENERATION, PAYLOAD) }
        requireFailure(CANCELED_FAILURE) { fixture.runtime.close(fixture.attachment, IDENTIFIER) {} }
        assertEquals(EMPTY_COUNT, fixture.execution.cancellations)
    }
    @Test
    fun lateReadRefreshAndMetadataResultsAreFencedAfterReactReplacement() {
        for (operation in ReadOperation.entries) {
            val fixture = Fixture(); fixture.start(); fixture.execution.onRead = { fixture.replacement() }
            requireFailure(CANCELED_FAILURE) {
                when (operation) {
                    ReadOperation.Read -> fixture.runtime.read(fixture.attachment, IDENTIFIER, GENERATION)
                    ReadOperation.Search -> fixture.runtime.search(fixture.attachment, IDENTIFIER, GENERATION, PAYLOAD)
                    ReadOperation.Metadata -> fixture.runtime.metadata(fixture.attachment, IDENTIFIER, GENERATION, PAYLOAD)
                    ReadOperation.Refresh -> fixture.runtime.refresh(fixture.attachment, IDENTIFIER, GENERATION)
                }
            }
        }
    }
    @Test
    fun explicitCloseStillWaitsForNativeDrainAndStopsIdlePolling() {
        val fixture = Fixture(); fixture.start(); var completed = false
        fixture.runtime.close(fixture.attachment, IDENTIFIER) { completed = true }
        assertFalse(completed); assertEquals(SINGLE_COUNT, fixture.execution.cancellations)
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertTrue(completed); assertEquals(SINGLE_COUNT, fixture.execution.finished); assertEquals(SINGLE_COUNT, fixture.polling.stops)
    }
    @Test
    fun retiringConnectionCannotBeAdoptedWhileExplicitLogoutDrains() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.close(fixture.attachment, IDENTIFIER) {}
        val replacement = fixture.replacement()
        requireFailure(CANCELED_FAILURE) { fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL) }
        assertEquals(SINGLE_COUNT, fixture.execution.starts)
    }
    @Test
    fun completedClosePermitsAnotherAccountWithoutOldBootstrap() {
        val fixture = Fixture(); fixture.start(); fixture.polling.pump(); fixture.runtime.close(fixture.attachment, IDENTIFIER) {}
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        val replacementEvents = mutableListOf<SpotifyConnectRuntimeEvent>(); val replacement = fixture.replacement(replacementEvents)
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL)
        assertEquals(TWO_COUNT, fixture.execution.starts); assertTrue(replacementEvents.isEmpty())
    }
    @Test
    fun detachCancelsQueuedCommandsAndFinishesTheirReservationExactlyOnce() {
        val fixture = Fixture(); fixture.start(); val reservation = fixture.runtime.prepareCommand(fixture.attachment, IDENTIFIER, REQUEST_IDENTIFIER)
        fixture.runtime.detach(fixture.attachment)
        assertEquals(SINGLE_COUNT, fixture.execution.canceledCommands)
        requireFailure(CANCELED_FAILURE) { fixture.runtime.executeCommand(fixture.attachment, reservation, PAYLOAD) }
        fixture.runtime.finishCommand(fixture.attachment, reservation); fixture.runtime.finishCommand(fixture.attachment, reservation)
        assertEquals(EMPTY_COUNT, fixture.execution.commands); assertEquals(SINGLE_COUNT, fixture.execution.finishedCommands)
    }
    @Test
    fun detachDuringNativeCommandPreservesUnknownOutcome() {
        val fixture = Fixture(); fixture.start(); val reservation = fixture.runtime.prepareCommand(fixture.attachment, IDENTIFIER, REQUEST_IDENTIFIER)
        fixture.execution.onCommand = { fixture.replacement() }
        requireFailure(UNKNOWN_OUTCOME_FAILURE) { fixture.runtime.executeCommand(fixture.attachment, reservation, PAYLOAD) }
        fixture.runtime.finishCommand(fixture.attachment, reservation)
        assertEquals(SINGLE_COUNT, fixture.execution.commands); assertEquals(SINGLE_COUNT, fixture.execution.finishedCommands)
    }
    @Test
    fun revokedCancellationCannotCancelNewAttachmentsCommand() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement(); fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL)
        fixture.runtime.prepareCommand(replacement, OTHER_IDENTIFIER, REQUEST_IDENTIFIER)
        requireFailure(CANCELED_FAILURE) { fixture.runtime.cancelCommand(fixture.attachment, IDENTIFIER, REQUEST_IDENTIFIER) }
        assertEquals(EMPTY_COUNT, fixture.execution.canceledCommands)
    }
    @Test
    fun nativeFailurePublishesSanitizedFailureAndRetiresConnection() {
        val fixture = Fixture(); fixture.start(); fixture.execution.pollFailure = true; fixture.polling.pump()
        assertEquals(listOf(SpotifyConnectRuntimeEvent(IDENTIFIER, failure = NETWORK_FAILURE)), fixture.events)
        assertEquals(SINGLE_COUNT, fixture.execution.cancellations)
        fixture.polling.pump(); assertEquals(SINGLE_COUNT, fixture.events.size)
    }
    @Test
    fun staleIdentifierCloseCannotRetireAdoptedConnection() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement(); fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL)
        var completed = false; fixture.runtime.close(replacement, IDENTIFIER) { completed = true }
        assertTrue(completed); assertEquals(EMPTY_COUNT, fixture.execution.cancellations)
    }
    @Test
    fun invalidAndOverlappingJavascriptIdentifiersDoNotAdoptConnection() {
        val fixture = Fixture(); fixture.start()
        requireFailure(INVALID_INPUT_FAILURE) { fixture.runtime.start(fixture.attachment, EMPTY_TEXT, CREDENTIAL) }
        requireFailure(BACKPRESSURE_FAILURE) { fixture.runtime.start(fixture.attachment, OTHER_IDENTIFIER, CREDENTIAL) }
    }

    @Test
    fun differentAccountAfterReactRecreationWaitsForRetainedConnectionCleanupThenStarts() {
        val fixture = Fixture(); fixture.start(); fixture.polling.pump(); fixture.runtime.detach(fixture.attachment)
        val replacementEvents = mutableListOf<SpotifyConnectRuntimeEvent>(); val replacement = fixture.replacement(replacementEvents)
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        var startedHandle: Long? = null; val failures = mutableListOf<Throwable>()
        fixture.runtime.startOrReplace(replacement, OTHER_IDENTIFIER, CREDENTIAL, { handle -> startedHandle = handle }, { failure -> failures.add(failure) })
        assertEquals(SINGLE_COUNT, fixture.execution.cancellations); assertEquals(SINGLE_COUNT, fixture.execution.starts)
        assertEquals(null, startedHandle); assertTrue(replacementEvents.isEmpty())
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertEquals(HANDLE, startedHandle); assertEquals(TWO_COUNT, fixture.execution.starts)
        assertTrue(failures.isEmpty()); assertTrue(replacementEvents.isEmpty())
    }
    @Test
    fun accountSwitchCannotStartAfterReactAttachmentIsReplacedAgain() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement()
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        var started = false; val failures = mutableListOf<Throwable>()
        fixture.runtime.startOrReplace(replacement, OTHER_IDENTIFIER, CREDENTIAL, { started = true }, { failure -> failures.add(failure) })
        fixture.replacement(); fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertFalse(started); assertEquals(SINGLE_COUNT, fixture.execution.starts)
        assertEquals(CANCELED_FAILURE, (failures.single() as SpotifyConnectFailure).code)
        assertEquals(SINGLE_COUNT, fixture.polling.stops)
    }
    @Test
    fun explicitCloseCancelsPendingAccountSwitchBeforeItsReplacementStarts() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement()
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        var started = false; var closed = false; val failures = mutableListOf<Throwable>()
        fixture.runtime.startOrReplace(replacement, OTHER_IDENTIFIER, CREDENTIAL, { started = true }, { failure -> failures.add(failure) })
        fixture.runtime.close(replacement, OTHER_IDENTIFIER) { closed = true }
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertFalse(started); assertTrue(closed); assertEquals(SINGLE_COUNT, fixture.execution.starts)
        assertEquals(CANCELED_FAILURE, (failures.single() as SpotifyConnectFailure).code)
    }
    @Test
    fun explicitCloseCompletionCanImmediatelyStartWithANewIdentifier() {
        val fixture = Fixture(); fixture.start(); var startedHandle: Long? = null
        fixture.runtime.close(fixture.attachment, IDENTIFIER) { startedHandle = fixture.runtime.start(fixture.attachment, OTHER_IDENTIFIER, CREDENTIAL) }
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertEquals(HANDLE, startedHandle); assertEquals(TWO_COUNT, fixture.execution.starts)
        assertEquals(EMPTY_COUNT, fixture.polling.stops)
    }
    @Test
    fun repeatedReactDetachCancelsEachOutstandingCommandOnlyOnce() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.prepareCommand(fixture.attachment, IDENTIFIER, REQUEST_IDENTIFIER)
        fixture.replacement(); fixture.runtime.detach(fixture.attachment)
        assertEquals(SINGLE_COUNT, fixture.execution.canceledCommands)
    }
    @Test
    fun pendingAccountSwitchHasOnlyOneCredentialBearingContinuation() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement()
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        fixture.runtime.startOrReplace(replacement, OTHER_IDENTIFIER, CREDENTIAL, {}, {})
        requireFailure(BACKPRESSURE_FAILURE) { fixture.runtime.startOrReplace(replacement, OTHER_IDENTIFIER, CREDENTIAL, {}, {}) }
        assertEquals(SINGLE_COUNT, fixture.execution.cancellations)
    }

    @Test
    fun malformedBootstrapPublishesFailureAndRetiresRatherThanBeingSwallowedByOwner() {
        val fixture = Fixture(); fixture.start(); fixture.protocol.invalidBootstrap = true; fixture.polling.pump()
        assertEquals(listOf(SpotifyConnectRuntimeEvent(IDENTIFIER, failure = INVALID_RESPONSE_FAILURE)), fixture.events)
        assertEquals(SINGLE_COUNT, fixture.execution.cancellations)
        fixture.polling.pump(); assertEquals(SINGLE_COUNT, fixture.events.size)
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertEquals(SINGLE_COUNT, fixture.execution.finished); assertEquals(SINGLE_COUNT, fixture.polling.stops)
    }
    @Test
    fun malformedBootstrapWhileReactIsDetachedStillClosesTheRetainedConnection() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.detach(fixture.attachment)
        fixture.protocol.invalidBootstrap = true; fixture.polling.pump()
        assertEquals(SINGLE_COUNT, fixture.execution.cancellations); assertTrue(fixture.events.isEmpty())
    }

    @Test
    fun sameAttachmentReadCannotCompleteAfterItsNativeConnectionIsReplaced() {
        val fixture = Fixture(); fixture.start()
        fixture.execution.onRead = {
            fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
            fixture.runtime.startOrReplace(fixture.attachment, IDENTIFIER, CREDENTIAL, {}, {})
            fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        }
        requireFailure(CANCELED_FAILURE) { fixture.runtime.read(fixture.attachment, IDENTIFIER, GENERATION) }
        assertEquals(TWO_COUNT, fixture.execution.starts)
    }

    @Test
    fun currentReactAttachmentCanExplicitlyShutdownRetainedOwnerBeforeItAttaches() {
        val fixture = Fixture(); fixture.start(); fixture.runtime.detach(fixture.attachment); val replacement = fixture.replacement()
        var completed = false; fixture.runtime.shutdown(replacement) { completed = true }
        assertEquals(SINGLE_COUNT, fixture.execution.cancellations); assertFalse(completed)
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertTrue(completed); assertEquals(SINGLE_COUNT, fixture.polling.stops)
    }
    @Test
    fun detachedReactAttachmentCannotShutdownNewAttachmentsConnection() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement(); fixture.runtime.start(replacement, OTHER_IDENTIFIER, CREDENTIAL)
        requireFailure(CANCELED_FAILURE) { fixture.runtime.shutdown(fixture.attachment) {} }
        assertEquals(EMPTY_COUNT, fixture.execution.cancellations)
    }
    @Test
    fun currentAttachmentShutdownCancelsPendingReplacementBeforeItsNativeStart() {
        val fixture = Fixture(); fixture.start(); val replacement = fixture.replacement()
        fixture.protocol.requestedIdentity = IDENTITY.copy(accountIdentifier = OTHER_IDENTITY)
        var started = false; var completed = false; val failures = mutableListOf<Throwable>()
        fixture.runtime.startOrReplace(replacement, OTHER_IDENTIFIER, CREDENTIAL, { started = true }, { failure -> failures.add(failure) })
        fixture.runtime.shutdown(replacement) { completed = true }; fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertFalse(started); assertTrue(completed); assertEquals(SINGLE_COUNT, fixture.execution.starts)
        assertEquals(CANCELED_FAILURE, (failures.single() as SpotifyConnectFailure).code)
    }

    @Test
    fun oldShutdownCompletionCannotClearBindingRestartedByAnEarlierCloseCompletion() {
        val fixture = Fixture(); fixture.start()
        fixture.runtime.close(fixture.attachment, IDENTIFIER) { fixture.runtime.start(fixture.attachment, OTHER_IDENTIFIER, CREDENTIAL) }
        fixture.runtime.shutdown(fixture.attachment) {}
        fixture.execution.batch = SpotifyConnectBatch(PAYLOAD, true); fixture.polling.pump()
        assertEquals(PAYLOAD, fixture.runtime.read(fixture.attachment, OTHER_IDENTIFIER, GENERATION))
    }

    private enum class ReadOperation { Read, Metadata, Search, Refresh }
    companion object {
        private const val ACCOUNT_IDENTIFIER = "synthetic-account"
        private const val DEVICE_IDENTIFIER = "synthetic-device"
        private const val CLIENT_IDENTIFIER = "synthetic-client"
        private const val DEVICE_NAME = "synthetic-name"
        private val IDENTITY = SpotifyConnectRuntimeIdentity(ACCOUNT_IDENTIFIER, DEVICE_IDENTIFIER, CLIENT_IDENTIFIER, DEVICE_NAME, false)
        private const val IDENTIFIER = "synthetic-owner"
        private const val OTHER_IDENTIFIER = "replacement-owner"
        private const val OTHER_IDENTITY = "replacement-identity"
        private const val REQUEST_IDENTIFIER = "synthetic-command"
        private const val CREDENTIAL = "synthetic-private-credential"
        private const val PAYLOAD = "synthetic-native-batch"
        private const val HANDLE = 7L
        private const val GENERATION = 3L
        private const val EMPTY_COUNT = 0
        private const val SINGLE_COUNT = 1
        private const val TWO_COUNT = 2
        private const val EMPTY_TEXT = ""
        private const val NETWORK_FAILURE = "network"
        private const val CANCELED_FAILURE = "canceled"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private const val UNAUTHORIZED_FAILURE = "unauthorized"
        private const val UNKNOWN_OUTCOME_FAILURE = "unknown-outcome"
        private const val MISSING_FAILURE = "Expected runtime failure"
    }
}

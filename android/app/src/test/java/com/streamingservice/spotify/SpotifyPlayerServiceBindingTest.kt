package com.streamingservice.spotify

import com.streamingservice.player.bridge.ProtocolFields
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor

class SpotifyPlayerServiceBindingTest {
    private class MainQueue : Executor {
        val commands = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { commands.addLast(command) }
        fun drain() { while (commands.isNotEmpty()) commands.removeFirst().run() }
    }
    private class Coordinator : SpotifyPlayerCoordinator {
        var reads = EmptyCount
        override fun configure(baseAddress: String, accessToken: String) = Unit
        override fun clearSession() = Unit
        override fun snapshot(): JSONObject {
            reads += SingleCount
            return JSONObject().put(ProtocolFields.Cursor, JSONObject().put(ProtocolFields.EngineEpoch, EngineEpoch)
                .put(ProtocolFields.AuthenticationEpoch, AuthenticationEpoch))
        }
        override fun execute(payload: String): String = throw AssertionError(UnexpectedMutation)
    }
    private class Connector : SpotifyPlayerServiceConnector {
        val connectedCallbacks = mutableListOf<(SpotifyPlayerCoordinator) -> Unit>()
        val disconnectedCallbacks = mutableListOf<() -> Unit>()
        val unboundConnections = mutableListOf<Int>()
        var accepted = true
        override fun bind(connected: (SpotifyPlayerCoordinator) -> Unit, disconnected: () -> Unit): SpotifyPlayerServiceConnection? {
            connectedCallbacks.add(connected)
            disconnectedCallbacks.add(disconnected)
            val index = connectedCallbacks.lastIndex
            return if (accepted) SpotifyPlayerServiceConnection { unboundConnections.add(index) } else null
        }
    }
    private class Fixture {
        val mainQueue = MainQueue()
        val connector = Connector()
        val coordinator = Coordinator()
        val binding = SpotifyPlayerServiceBinding(connector, { Identifier }, mainQueue)
        fun connect(): SpotifyPlayerServicePort {
            val pending = binding.bind(); mainQueue.drain()
            connector.connectedCallbacks.last()(coordinator); mainQueue.drain()
            return pending.get()
        }
    }
    private fun failure(reason: SpotifyPlayerFailureReason, future: CompletableFuture<*>) {
        try { future.get(); throw AssertionError(MissingFailure) }
        catch (failure: ExecutionException) { assertEquals(reason, (failure.cause as SpotifyPlayerFailure).reason) }
    }
    @Test fun bindingStartsOnlyOnExplicitHandoffAndMainExecutor() {
        val fixture = Fixture()
        assertTrue(fixture.connector.connectedCallbacks.isEmpty())
        val pending = fixture.binding.bind()
        assertTrue(fixture.connector.connectedCallbacks.isEmpty())
        fixture.mainQueue.drain()
        assertFalse(pending.isDone)
        fixture.connector.connectedCallbacks.single()(fixture.coordinator)
        assertFalse(pending.isDone)
        fixture.mainQueue.drain()
        val identity = pending.get().identity(); fixture.mainQueue.drain()
        assertEquals(SpotifyPlayerIdentity(EngineEpoch, AuthenticationEpoch), identity.result.get())
    }
    @Test fun cancellationBeforeDispatchDoesNotBindAndPendingCancellationUnbindsExactConnection() {
        val fixture = Fixture()
        val beforeDispatch = fixture.binding.bind(); beforeDispatch.cancel(false); fixture.mainQueue.drain()
        assertTrue(fixture.connector.connectedCallbacks.isEmpty())
        val pending = fixture.binding.bind(); fixture.mainQueue.drain(); pending.cancel(false); fixture.mainQueue.drain()
        assertEquals(listOf(FirstIndex), fixture.connector.unboundConnections)
        fixture.connector.connectedCallbacks.single()(fixture.coordinator); fixture.mainQueue.drain()
        assertTrue(pending.isCancelled)
        fixture.connect()
    }
    @Test fun rejectedBindingFailsAndCanBeRetried() {
        val fixture = Fixture(); fixture.connector.accepted = false
        val rejected = fixture.binding.bind(); fixture.mainQueue.drain()
        failure(SpotifyPlayerFailureReason.Unavailable, rejected)
        fixture.connector.accepted = true; fixture.connect()
    }
    @Test fun duplicateBindingDoesNotCreateAnotherServiceConnection() {
        val fixture = Fixture(); fixture.connect()
        val duplicate = fixture.binding.bind(); fixture.mainQueue.drain()
        failure(SpotifyPlayerFailureReason.Conflict, duplicate)
        assertEquals(SingleCount, fixture.connector.connectedCallbacks.size)
    }
    @Test fun unbindCancelsPendingHandoffAndIgnoresLateConnection() {
        val fixture = Fixture()
        val pending = fixture.binding.bind(); fixture.mainQueue.drain()
        val completion = fixture.binding.unbind(); fixture.mainQueue.drain()
        failure(SpotifyPlayerFailureReason.Cancelled, pending)
        assertTrue(completion.isDone)
        fixture.connector.connectedCallbacks.single()(fixture.coordinator); fixture.mainQueue.drain()
        assertEquals(EmptyCount, fixture.coordinator.reads)
        assertEquals(listOf(FirstIndex), fixture.connector.unboundConnections)
    }
    @Test fun oldConnectionAndDisconnectCannotReplaceNewPort() {
        val fixture = Fixture(); val oldPort = fixture.connect()
        fixture.binding.unbind(); fixture.mainQueue.drain()
        val currentPort = fixture.connect()
        fixture.connector.connectedCallbacks.first()(Coordinator()); fixture.connector.disconnectedCallbacks.first()(); fixture.mainQueue.drain()
        val currentRead = currentPort.identity(); fixture.mainQueue.drain()
        assertEquals(SpotifyPlayerIdentity(EngineEpoch, AuthenticationEpoch), currentRead.result.get())
        val staleRead = oldPort.identity(); fixture.mainQueue.drain()
        failure(SpotifyPlayerFailureReason.Unavailable, staleRead.result)
        assertEquals(listOf(FirstIndex), fixture.connector.unboundConnections)
    }
    @Test fun disconnectClosesPortAndReleasesOnlyItsConnection() {
        val fixture = Fixture(); val port = fixture.connect()
        fixture.connector.disconnectedCallbacks.single()(); fixture.mainQueue.drain()
        val read = port.identity(); fixture.mainQueue.drain()
        failure(SpotifyPlayerFailureReason.Unavailable, read.result)
        assertEquals(listOf(FirstIndex), fixture.connector.unboundConnections)
    }
    @Test fun repeatedUnbindDoesNotReleaseConnectionTwice() {
        val fixture = Fixture(); fixture.connect()
        fixture.binding.unbind(); fixture.binding.unbind(); fixture.mainQueue.drain()
        assertEquals(listOf(FirstIndex), fixture.connector.unboundConnections)
    }
    companion object {
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val FirstIndex = 0
        private const val EngineEpoch = "engine"
        private const val AuthenticationEpoch = "authentication"
        private const val Identifier = "identifier"
        private const val MissingFailure = "Expected binding failure"
        private const val UnexpectedMutation = "Unexpected player mutation"
    }
}

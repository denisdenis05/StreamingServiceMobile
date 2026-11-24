package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture

interface SpotifyHostSessionCoordinator {
    fun start(previousHostDeviceIdentifier: String, expectedCursor: SpotifyHostPlayerCursor, initialMappings: List<SpotifyHostRecordingMapping>): CompletableFuture<SpotifyHostSnapshot>
    fun stop(): CompletableFuture<Unit>
    fun readQueue(side: String): CompletableFuture<String> = CompletableFuture<String>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(SpotifyConnectFailureCode.Unsupported.wireValue)) }
    fun applyQueue(side: String, serialized: String): CompletableFuture<String> = CompletableFuture<String>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(SpotifyConnectFailureCode.Unsupported.wireValue)) }
    fun publishLocalChanges(): CompletableFuture<Unit> = CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(SpotifyConnectFailureCode.Unsupported.wireValue)) }
    fun snapshot(): SpotifyHostSnapshot
    fun accept(batch: SpotifyConnectBatch)
    fun commandHandlingReady(selected: SpotifyHostIdentity): Boolean
}
fun interface SpotifyHostCoordinatorFactory {
    fun create(player: SpotifyHostPlayer, commandHandlingReady: (SpotifyHostIdentity) -> Boolean): SpotifyHostSessionCoordinator
}
fun interface SpotifyHostConnectionObservation {
    fun attach(listener: (SpotifyConnectBatch) -> Unit): SpotifyNativeFollowerCancellation
}

class SpotifyHostNativeSession(
    private val configuration: SpotifyHostConfiguration,
    private val binding: SpotifyJamPlaybackPlayerBinding,
    private val resolver: SpotifyHostRecordingResolver,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val clock: SpotifyNativeFollowerClock,
    private val connection: SpotifyHostConnectionObservation,
    private val factory: SpotifyHostCoordinatorFactory,
    private val isCurrent: (SpotifyHostIdentity) -> Boolean,
    private val canExecute: (SpotifyHostIdentity) -> Boolean = isCurrent
) : SpotifyHostRuntimeSession {
    private val connectionEvents = SpotifyHostConnectionEvents()
    private val started = CompletableFuture<SpotifyHostSnapshot>()
    private var stopped: CompletableFuture<Unit>? = null
    private var connectionRelease: CompletableFuture<Unit>? = null
    private var bindingRelease: CompletableFuture<Unit>? = null
    private var requested = false
    @Volatile private var retired = false
    private var bindingOperation: CompletableFuture<SpotifyPlayerServicePort>? = null
    private var authentication: SpotifyPlayerOperation<SpotifyPlayerIdentity>? = null
    private var port: SpotifyPlayerServicePort? = null
    @Volatile private var coordinator: SpotifyHostSessionCoordinator? = null
    @Volatile private var observation: SpotifyNativeFollowerCancellation? = null
    private var submittedAccessToken: String? = null
    private var latestAccessToken = configuration.playback.accessToken
    private var startupTimer: SpotifyNativeFollowerCancellation? = null
    @Volatile private var authenticationTail = CompletableFuture.completedFuture(Unit)

    @Synchronized override fun start(): CompletableFuture<SpotifyHostSnapshot> {
        if (retired) return failed(Canceled)
        if (requested) return started
        requested = true
        try {
            startupTimer = scheduler.schedule(StartupTimeoutMilliseconds) { synchronized(this) {
                if (!started.isDone) failStart(SpotifyConnectFailure(Deadline))
            } }
            if (retired) { startupTimer?.cancel(); startupTimer = null; return started }
            val pending = binding.bind()
            bindingOperation = pending
            pending.whenComplete { player, bindingFailure -> synchronized(this) {
                if (retired) return@synchronized
                if (bindingFailure != null || !current()) { failStart(bindingFailure ?: SpotifyConnectFailure(Superseded)); return@synchronized }
                port = player
                try {
                    submittedAccessToken = latestAccessToken
                    val operation = player.configureAuthentication(configuration.identity.playerIdentity,
                        configuration.identity.streamingServiceAccountIdentifier, configuration.playback.account.baseAddress, latestAccessToken, false)
                    authentication = operation
                    operation.result.whenComplete { identity, failure -> configured(player, identity, failure) }
                } catch (failure: Throwable) { failStart(failure) }
            } }
        } catch (failure: Throwable) { failStart(failure) }
        return started
    }
    @Synchronized private fun configured(player: SpotifyPlayerServicePort, identity: SpotifyPlayerIdentity?, failure: Throwable?) {
        authentication = null
        if (retired) return
        if (failure != null || identity != configuration.identity.playerIdentity || !current()) {
            failStart(failure ?: SpotifyConnectFailure(Superseded)); return
        }
        try {
            if (submittedAccessToken != latestAccessToken) {
                submittedAccessToken = latestAccessToken
                val operation = player.configureAuthentication(configuration.identity.playerIdentity, configuration.identity.streamingServiceAccountIdentifier,
                    configuration.playback.account.baseAddress, latestAccessToken, false)
                authentication = operation
                operation.result.whenComplete { actual, authenticationFailure -> configured(player, actual, authenticationFailure) }
                return
            }
            val hostPlayer = player.hosting(resolver, scheduler, clock::nowElapsedRealtimeMilliseconds, ::currentIdentity, canExecute)
            val hosting = factory.create(hostPlayer, ::commandHandlingReady)
            coordinator = hosting
            val attached = connection.attach { batch ->
                if (!retired) when (connectionEvents.inspect(batch, configuration.identity)) {
                    SpotifyHostConnectionDecision.Ignore -> Unit
                    SpotifyHostConnectionDecision.Current -> if (canExecute(configuration.identity)) hosting.accept(batch)
                    SpotifyHostConnectionDecision.Retire -> stop()
                }
            }
            if (retired) { attached.cancel(); return }
            observation = attached
            hosting.start(configuration.previousHostDeviceIdentifier, configuration.expectedCursor, configuration.mappings).whenComplete { snapshot, startupFailure -> synchronized(this) {
                if (retired) return@synchronized
                if (startupFailure != null || snapshot?.status != SpotifyHostStatus.Hosting || snapshot.identity != configuration.identity || !current()) {
                    failStart(startupFailure ?: SpotifyConnectFailure(Superseded))
                } else {
                    startupTimer?.cancel(); startupTimer = null
                    started.complete(snapshot)
                }
            } }
        } catch (creationFailure: Throwable) { failStart(creationFailure) }
    }
    fun commandHandlingReady(identity: SpotifyHostIdentity): Boolean = !retired && observation != null && currentIdentity(identity) && canExecute(identity)
        && coordinator?.commandHandlingReady(identity) == true
    @Synchronized override fun readQueue(side: String): CompletableFuture<String> =
        if (retired || !current()) failed(Superseded) else coordinator?.readQueue(side) ?: failed(Superseded)
    @Synchronized override fun applyQueue(side: String, serialized: String): CompletableFuture<String> =
        if (retired || !current()) failed(Superseded) else coordinator?.applyQueue(side, serialized) ?: failed(Superseded)
    @Synchronized override fun publishLocalChanges(): CompletableFuture<Unit> =
        if (retired || !current()) failed(Superseded) else coordinator?.publishLocalChanges() ?: failed(Superseded)
    @Synchronized fun snapshot(): SpotifyHostSnapshot? = coordinator?.snapshot()

    @Synchronized override fun synchronizeAuthentication(accessToken: String): CompletableFuture<Unit> {
        if (retired || !current()) return failed(Superseded)
        latestAccessToken = accessToken
        val player = port
        if (player == null || coordinator == null) return started.thenApply { Unit }
        val completion = CompletableFuture<Unit>()
        val previous = authenticationTail
        authenticationTail = completion
        previous.handle { _, _ -> Unit }.thenCompose {
            synchronized(this) {
                if (retired || !current()) return@thenCompose failed<Unit>(Superseded)
                player.configureAuthentication(configuration.identity.playerIdentity, configuration.identity.streamingServiceAccountIdentifier,
                    configuration.playback.account.baseAddress, accessToken, false).result.thenApply { actual ->
                    if (actual != configuration.identity.playerIdentity) throw SpotifyConnectFailure(Superseded)
                    Unit
                }
            }
        }.whenComplete { _, failure -> if (failure == null) completion.complete(Unit) else completion.completeExceptionally(failure) }
        return completion
    }

    override fun stop(): CompletableFuture<Unit> {
        val completion: CompletableFuture<Unit>
        val startup: CompletableFuture<Unit>
        val attached: SpotifyNativeFollowerCancellation?
        synchronized(this) {
            stopped?.let { selected -> return selected }
            completion = CompletableFuture(); stopped = completion; retired = true
            attached = observation; observation = null
            startupTimer?.cancel(); startupTimer = null
            val configured = authentication?.result
            authentication?.cancel()
            startup = if (configured != null) configured.handle { _, _ -> Unit }
                else bindingOperation?.handle { _, _ -> Unit } ?: CompletableFuture.completedFuture(Unit)
        }
        attached?.cancel()
        started.completeExceptionally(SpotifyConnectFailure(Canceled))
        startup.thenCompose { authenticationTail.handle { _, _ -> Unit } }
            .thenCompose { coordinator?.stop() ?: CompletableFuture.completedFuture(Unit) }.whenComplete { _, cleanupFailure ->
                if (cleanupFailure != null) completion.completeExceptionally(cleanupFailure)
                else releaseBinding().whenComplete { _, bindingFailure ->
                    if (bindingFailure == null) completion.complete(Unit) else completion.completeExceptionally(bindingFailure)
                }
            }
        return completion
    }
    override fun releaseAfterConnectionRetired(): CompletableFuture<Unit> {
        val completion: CompletableFuture<Unit>
        val pending = synchronized(this) {
            connectionRelease?.let { selected -> return selected }
            completion = CompletableFuture(); connectionRelease = completion
            retired = true
            observation?.cancel(); observation = null
            startupTimer?.cancel(); startupTimer = null
            started.completeExceptionally(SpotifyConnectFailure(Superseded))
            authentication?.cancel()
            authentication?.result?.handle { _, _ -> Unit } ?: bindingOperation?.handle { _, _ -> Unit }
                ?: CompletableFuture.completedFuture(Unit)
        }
        val retirement = try { coordinator?.stop() ?: CompletableFuture.completedFuture(Unit) } catch (_failure: Throwable) { CompletableFuture.completedFuture(Unit) }
        pending.thenCompose { authenticationTail.handle { _, _ -> Unit } }
            .thenCompose { retirement.handle { _, _ -> Unit } }.thenCompose { releaseBinding() }
            .whenComplete { _, failure ->
                if (failure == null) completion.complete(Unit) else completion.completeExceptionally(failure)
            }
        return completion
    }
    private fun releaseBinding(): CompletableFuture<Unit> {
        val completion = synchronized(this) {
            bindingRelease?.let { selected -> return selected }
            CompletableFuture<Unit>().also { selected -> bindingRelease = selected }
        }
        try {
            binding.unbind().whenComplete { _, failure ->
                if (failure == null) completion.complete(Unit) else completion.completeExceptionally(failure)
            }
        } catch (failure: Throwable) { completion.completeExceptionally(failure) }
        return completion
    }
    private fun failStart(failure: Throwable) { started.completeExceptionally(failure); stop() }
    private fun currentIdentity(identity: SpotifyHostIdentity): Boolean = identity == configuration.identity && current()
    private fun current(): Boolean = try { isCurrent(configuration.identity) } catch (_failure: Throwable) { false }
    private fun <Response> failed(code: String) = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }
    companion object {
        private const val StartupTimeoutMilliseconds = 15000L
        private const val Deadline = "deadline"
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
    }
}

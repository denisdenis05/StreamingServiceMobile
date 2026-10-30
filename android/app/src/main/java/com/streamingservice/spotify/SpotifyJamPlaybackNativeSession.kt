package com.streamingservice.spotify

import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

interface SpotifyJamPlaybackPlayerBinding {
    fun bind(): CompletableFuture<SpotifyPlayerServicePort>
    fun unbind(): CompletableFuture<Unit>
}

class SpotifyJamPlaybackNativeSession(
    private val configuration: SpotifyJamPlaybackConfiguration,
    private val binding: SpotifyJamPlaybackPlayerBinding,
    private val source: SpotifyNativeFollowerObservationSource,
    private val broker: SpotifyBackgroundRecordingBroker,
    private val clock: SpotifyNativeFollowerClock,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val executor: Executor,
    private val isCurrent: (SpotifyNativeFollowerIdentity) -> Boolean,
    private val observer: (SpotifyNativeFollowerSnapshot) -> Unit
) : SpotifyJamPlaybackSession {
    private val monitor = Any()
    private val started = CompletableFuture<Unit>()
    private var stopped: CompletableFuture<Unit>? = null
    private var retired = false
    private var latestAccessToken = configuration.accessToken
    private var submittedAccessToken: String? = null
    private var port: SpotifyPlayerServicePort? = null
    private var identity: SpotifyNativeFollowerIdentity? = null
    private var follower: SpotifyNativeFollowerCoordinator? = null
    private var pendingBinding: CompletableFuture<SpotifyPlayerServicePort>? = null
    private var preflight: SpotifyFollowerOperation<SpotifyConnectPlaybackObservation>? = null
    private var configurationOperation: SpotifyPlayerOperation<SpotifyPlayerIdentity>? = null
    private var preflightStartedMilliseconds = SpotifyNativeFollowerPolicy.MinimumMilliseconds
    private var startupTimer: SpotifyNativeFollowerCancellation? = null

    override fun start(): CompletableFuture<Unit> {
        synchronized(monitor) {
            if (retired) return failed(Canceled)
            if (pendingBinding != null || follower != null) return started
            startupTimer = scheduler.schedule(StartupTimeoutMilliseconds) {
                started.completeExceptionally(SpotifyConnectFailure(Deadline))
                stop()
            }
            val operation = binding.bind()
            pendingBinding = operation
            operation.thenCompose { player ->
                synchronized(monitor) {
                    if (retired) throw SpotifyConnectFailure(Canceled)
                    port = player
                    player.identity().result
                }
            }.thenCompose { playerIdentity ->
                synchronized(monitor) {
                    if (retired) throw SpotifyConnectFailure(Canceled)
                    val captured = identity(playerIdentity)
                    if (!isCurrent(captured)) throw SpotifyConnectFailure(Superseded)
                    identity = captured
                    preflightStartedMilliseconds = clock.nowElapsedRealtimeMilliseconds()
                    val read = source.read(captured)
                    preflight = read
                    read.result
                }
            }.thenCompose { observation ->
                synchronized(monitor) {
                    val captured = requireNotNull(identity)
                    if (retired || !isCurrent(captured)) throw SpotifyConnectFailure(Canceled)
                    SpotifyNativeFollowerTiming.validateObservation(captured, observation, preflightStartedMilliseconds, clock.nowElapsedRealtimeMilliseconds())
                    if (!SpotifyNativeFollowerTiming.fresh(observation, clock.nowElapsedRealtimeMilliseconds())) throw SpotifyConnectFailure(Deadline)
                    preflight = null
                    submittedAccessToken = latestAccessToken
                    val configured = requireNotNull(port).configureAuthentication(captured.playerIdentity, configuration.account.streamingServiceAccountIdentifier,
                        configuration.account.baseAddress, latestAccessToken, true)
                    configurationOperation = configured
                    configured.result
                }
            }.whenComplete { playerIdentity, failure ->
                synchronized(monitor) {
                    configurationOperation = null
                    if (failure != null || retired) {
                        started.completeExceptionally(failure ?: SpotifyConnectFailure(Canceled))
                        stop()
                    } else activate(playerIdentity)
                }
            }
        }
        return started
    }

    override fun connectionUnavailable() = synchronized(monitor) {
        if (retired) return@synchronized
        val coordinator = follower
        if (coordinator == null || !started.isDone || started.isCompletedExceptionally) {
            stop()
        } else {
            coordinator.connectionUnavailable()
            broker.retire()
        }
        Unit
    }

    override fun reconnect(generation: Long) = synchronized(monitor) {
        val previous = identity ?: return@synchronized
        if (retired || generation <= previous.generation || !started.isDone || started.isCompletedExceptionally) return@synchronized
        val next = previous.copy(generation = generation)
        if (!isCurrent(next)) return@synchronized
        identity = next
        broker.retire()
        follower?.reconnect(next)
        Unit
    }

    override fun stop(): CompletableFuture<Unit> = synchronized(monitor) {
        stopped?.let { completion -> return@synchronized completion }
        val completion = CompletableFuture<Unit>()
        stopped = completion
        retired = true
        startupTimer?.cancel(); startupTimer = null
        preflight?.cancel(); preflight = null
        configurationOperation?.cancel(); configurationOperation = null
        pendingBinding?.cancel(false)
        broker.retire()
        started.completeExceptionally(SpotifyConnectFailure(Canceled))
        val followerRetirement = follower?.stop() ?: CompletableFuture.completedFuture(Unit)
        followerRetirement.whenComplete { _, followingFailure ->
            binding.unbind().whenComplete { _, bindingFailure ->
                val failure = followingFailure ?: bindingFailure
                if (failure == null) completion.complete(Unit) else completion.completeExceptionally(failure)
            }
        }
        completion
    }

    override fun synchronizeAuthentication(accessToken: String): CompletableFuture<Unit> = synchronized(monitor) {
        if (retired) return@synchronized failed(Superseded)
        latestAccessToken = accessToken
        if (follower == null) return@synchronized CompletableFuture.completedFuture(Unit)
        val captured = identity ?: return@synchronized failed(Superseded)
        if (!isCurrent(captured)) return@synchronized failed(Superseded)
        requireNotNull(port).configureAuthentication(captured.playerIdentity, configuration.account.streamingServiceAccountIdentifier,
            configuration.account.baseAddress, accessToken, false).result.thenApply { Unit }
    }
    override fun claimRecording(requestIdentifier: String): String? = broker.claim(requestIdentifier)?.let { serialized ->
        JSONObject(serialized).put(SpotifyJamPlaybackProtocol.BaseAddressField, configuration.account.baseAddress).toString()
    }
    override fun isRecordingPending(requestIdentifier: String): Boolean = broker.isPending(requestIdentifier)
    override fun completeRecording(requestIdentifier: String, serialized: String) { broker.complete(requestIdentifier, serialized) }
    override fun failRecording(requestIdentifier: String, code: String) { broker.fail(requestIdentifier, code) }
    override fun synchronizeRecordingAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String): CompletableFuture<Unit> =
        broker.synchronizePlayerAuthentication(requestIdentifier, accountIdentifier, accessToken)

    private fun identity(playerIdentity: SpotifyPlayerIdentity): SpotifyNativeFollowerIdentity = configuration.account.let { account ->
        SpotifyNativeFollowerIdentity(account.streamingServiceAccountIdentifier, account.spotifyAccountIdentifier, account.jamSessionIdentifier,
            account.hostDeviceIdentifier, account.handle, account.generation, playerIdentity)
    }
    private fun activate(playerIdentity: SpotifyPlayerIdentity) {
        val captured = identity(playerIdentity)
        identity = captured
        if (retired || !isCurrent(captured)) { started.completeExceptionally(SpotifyConnectFailure(Superseded)); stop(); return }
        if (submittedAccessToken != latestAccessToken) {
            submittedAccessToken = latestAccessToken
            val refresh = requireNotNull(port).configureAuthentication(playerIdentity, configuration.account.streamingServiceAccountIdentifier,
                configuration.account.baseAddress, latestAccessToken, false)
            configurationOperation = refresh
            refresh.result.whenComplete { refreshedIdentity, failure ->
                synchronized(monitor) {
                    configurationOperation = null
                    if (failure != null) { started.completeExceptionally(failure); stop() } else activate(refreshedIdentity)
                }
            }
            return
        }
        val coordinator = SpotifyNativeFollowerCoordinator(requireNotNull(port), source, broker, clock, scheduler, executor) { snapshot -> observed(snapshot) }
        follower = coordinator
        coordinator.start(captured).whenComplete { _, startFailure -> if (startFailure != null) { started.completeExceptionally(startFailure); stop() } }
    }
    private fun observed(snapshot: SpotifyNativeFollowerSnapshot) {
        val outcome = synchronized(monitor) {
            if (retired || snapshot.identity != identity) return
            if (snapshot.status in OwnedStatuses || snapshot.status == SpotifyNativeFollowerStatus.Failed || snapshot.status == SpotifyNativeFollowerStatus.Suspended) {
                startupTimer?.cancel(); startupTimer = null
            }
            snapshot.status
        }
        observer(snapshot)
        if (outcome in OwnedStatuses) started.complete(Unit)
        else if (outcome == SpotifyNativeFollowerStatus.Failed || outcome == SpotifyNativeFollowerStatus.Suspended) {
            started.completeExceptionally(SpotifyConnectFailure(if (outcome == SpotifyNativeFollowerStatus.Suspended) Canceled else Network))
        }
    }
    private fun <Response> failed(code: String): CompletableFuture<Response> = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }
    companion object {
        private const val StartupTimeoutMilliseconds = 30000L
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
        private const val Deadline = "deadline"
        private const val Network = "network"
        private val OwnedStatuses = setOf(SpotifyNativeFollowerStatus.Resolving, SpotifyNativeFollowerStatus.Preparing,
            SpotifyNativeFollowerStatus.Buffering, SpotifyNativeFollowerStatus.Following, SpotifyNativeFollowerStatus.Unavailable)
    }
}

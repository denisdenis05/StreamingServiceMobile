package com.streamingservice.spotify

import android.app.Application
import android.os.SystemClock
import android.util.Base64
import androidx.media3.common.util.UnstableApi
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

object SpotifyHostApplicationRuntime {
    @Volatile private var instance: SpotifyHostRuntime? = null
    @UnstableApi @Synchronized fun get(application: Application): SpotifyHostRuntime {
        instance?.let { runtime -> return runtime }
        val mainExecutor = SpotifyPlayerMainExecutor()
        val identifiers = SpotifyPlayerIdentifierSource { UUID.randomUUID().toString() }
        val clock = SpotifyNativeFollowerClock { SystemClock.elapsedRealtime() }
        val decisionExecutor = executor(DecisionWorkers, DecisionCapacity)
        val networkExecutor = executor(NetworkWorkers, NetworkCapacity)
        val schedulerExecutor = ScheduledThreadPoolExecutor(SchedulerWorkers).apply {
            setKeepAliveTime(IdleTimeoutSeconds, TimeUnit.SECONDS); allowCoreThreadTimeOut(true); removeOnCancelPolicy = true
        }
        val scheduler = SpotifyNativeFollowerScheduler { delayMilliseconds, action ->
            val future = schedulerExecutor.schedule(action, delayMilliseconds, TimeUnit.MILLISECONDS)
            SpotifyNativeFollowerCancellation { future.cancel(false) }
        }
        val tokens = SpotifyJamPlaybackProtocol(object : SpotifyJamPlaybackTokenDecoder {
            override fun payload(serialized: String): String = String(Base64.decode(serialized, Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8)
        })
        lateinit var runtime: SpotifyHostRuntime
        val factory = SpotifyHostRuntimeSessionFactory { configuration, observer ->
            val identity = configuration.identity
            val follower = SpotifyHostRuntime.follower(identity)
            val active: (SpotifyHostIdentity) -> Boolean = { selected -> runtime.isActiveConfiguration(configuration, selected) }
            val owned: (SpotifyHostIdentity) -> Boolean = { selected -> runtime.ownsConfiguration(configuration, selected) }
            val recordingCurrent: (SpotifyNativeFollowerIdentity) -> Boolean = { selected -> selected == follower && active(identity) }
            val runner = SpotifyHeadlessRecordingRunner(mainExecutor, SpotifyAndroidHeadlessRecordingDispatch(application))
            val broker = SpotifyBackgroundRecordingBroker(SpotifyConnectFollowerMetadataSource(networkExecutor, recordingCurrent), runner, scheduler, identifiers,
                { configuration.playback.account.market }, recordingCurrent, { selected, token -> runtime.synchronizeAuthentication(configuration, selected, token) })
            val resolver = object : SpotifyHostRecordingResolver {
                override fun resolve(identity: SpotifyHostIdentity, spotifyTrackIdentifier: String): SpotifyPlayerOperation<SpotifyHostRecordingResolution> {
                    if (!active(identity)) return SpotifyPlayerOperation(CompletableFuture<SpotifyHostRecordingResolution>().also { result ->
                        result.completeExceptionally(SpotifyConnectFailure(Superseded))
                    }) {}
                    val resolution = broker.resolve(follower, spotifyTrackIdentifier)
                    val result = resolution.result.thenApply { matched -> when (matched) {
                        is SpotifyFollowerRecordingResolution.Matched -> SpotifyHostRecordingResolution.Matched(matched.recording.recordingIdentifier, matched.recording.title, matched.recording.artist)
                        SpotifyFollowerRecordingResolution.Ambiguous -> SpotifyHostRecordingResolution.Ambiguous
                        SpotifyFollowerRecordingResolution.Unavailable -> SpotifyHostRecordingResolution.Unavailable
                    } }
                    return SpotifyPlayerOperation(result, resolution::cancel)
                }
            }
            val hostingRunner = SpotifyHeadlessRecordingRunner(mainExecutor, SpotifyAndroidHeadlessRecordingDispatch(application, SpotifyHostRecordingBroker.TaskName))
            val hostingBroker = SpotifyHostRecordingBroker(configuration, hostingRunner, scheduler, identifiers, networkExecutor,
                { handle, generation, serialized -> SpotifyConnectNativeExecution().search(handle, generation, serialized) }, { active(identity) })
            val binding = SpotifyPlayerServiceBinding(application, identifiers)
            val session = SpotifyHostNativeSession(configuration, object : SpotifyJamPlaybackPlayerBinding {
                override fun bind() = binding.bind()
                override fun unbind() = binding.unbind()
            }, resolver, scheduler, clock, { listener -> SpotifyConnectApplicationRuntime.runtime.observeNativeConnection(listener) },
                { player, commandReady -> SpotifyHostCoordinator(identity, player,
                    SpotifyHostNativeTransport(PlatformSpotifyHostingNativeCalls, networkExecutor, clock, owned, commandReady), clock, scheduler,
                    decisionExecutor, identifiers, active, observer, hostingBroker) }, owned, active)
            SpotifyHostSessionResources(session, broker, hostingBroker)
        }
        val authenticationFactory = SpotifyJamAuthenticationRenewalFactory { configuration, failed ->
            val host = runtime.configurationFor(configuration) ?: throw SpotifyConnectFailure(Superseded)
            val runner = SpotifyHeadlessRecordingRunner(mainExecutor, SpotifyAndroidHeadlessRecordingDispatch(application, SpotifyJamAuthenticationRenewal.TaskName))
            SpotifyJamAuthenticationRenewal(scheduler, runner, identifiers,
                { System.currentTimeMillis() / SpotifyJamAuthenticationRenewal.MillisecondsPerSecond }, configuration.account.baseAddress,
                { identity -> identity == SpotifyHostRuntime.follower(host.identity) && runtime.isActiveConfiguration(host, host.identity) },
                { identity, token -> runtime.synchronizeAuthentication(host, identity, token) }, decisionExecutor, failed)
        }
        runtime = SpotifyHostRuntime(SpotifyHostConfigurationProtocol(tokens), tokens, factory, decisionExecutor,
            { identity -> SpotifyConnectApplicationRuntime.runtime.ownsNativeConnection(identity.spotifyAccountIdentifier, identity.handle) },
            SpotifyJamPlaybackApplicationRuntime::retireFollowing, authenticationFactory)
        instance = runtime
        return runtime
    }
    fun retireHosting(): CompletableFuture<Unit> = instance?.retireHosting() ?: CompletableFuture.completedFuture(Unit)
    fun releaseRetiredConnections(): CompletableFuture<Unit> = instance?.releaseRetiredConnections() ?: CompletableFuture.completedFuture(Unit)
    private fun executor(workers: Int, capacity: Int) = ThreadPoolExecutor(workers, workers, IdleTimeoutSeconds, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(capacity))
        .apply { allowCoreThreadTimeOut(true) }
    private const val DecisionWorkers = 1
    private const val DecisionCapacity = 32
    private const val NetworkWorkers = 2
    private const val NetworkCapacity = 8
    private const val SchedulerWorkers = 1
    private const val IdleTimeoutSeconds = 30L
    private const val Superseded = "superseded"
}

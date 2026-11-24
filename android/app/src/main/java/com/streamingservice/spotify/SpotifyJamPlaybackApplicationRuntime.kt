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

object SpotifyJamPlaybackApplicationRuntime {
    private var instance: SpotifyJamPlaybackRuntime? = null

    @UnstableApi
    @Synchronized fun get(application: Application): SpotifyJamPlaybackRuntime {
        instance?.let { runtime -> return runtime }
        val mainExecutor = SpotifyPlayerMainExecutor()
        val identifiers = SpotifyPlayerIdentifierSource { UUID.randomUUID().toString() }
        val clock = SpotifyNativeFollowerClock { SystemClock.elapsedRealtime() }
        val decisionExecutor = executor(DecisionWorkers, MaximumDecisionQueue)
        val networkExecutor = executor(NetworkWorkers, MaximumNetworkQueue)
        val schedulerExecutor = ScheduledThreadPoolExecutor(SchedulerWorkers).apply {
            setKeepAliveTime(IdleTimeoutSeconds, TimeUnit.SECONDS)
            allowCoreThreadTimeOut(true)
            removeOnCancelPolicy = true
        }
        val scheduler = SpotifyNativeFollowerScheduler { delayMilliseconds, action ->
            val scheduled = schedulerExecutor.schedule(action, delayMilliseconds, TimeUnit.MILLISECONDS)
            SpotifyNativeFollowerCancellation { scheduled.cancel(false) }
        }
        val runner = SpotifyHeadlessRecordingRunner(mainExecutor, SpotifyAndroidHeadlessRecordingDispatch(application))
        val protocol = SpotifyJamPlaybackProtocol(object : SpotifyJamPlaybackTokenDecoder {
            override fun payload(serialized: String): String = String(Base64.decode(serialized, Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8)
        })
        lateinit var runtime: SpotifyJamPlaybackRuntime
        val factory = SpotifyJamPlaybackSessionFactory { configuration, observer ->
            val binding = SpotifyPlayerServiceBinding(application, identifiers)
            val isCurrent: (SpotifyNativeFollowerIdentity) -> Boolean = { identity -> runtime.isCurrentConfiguration(configuration, identity) }
            val source = SpotifyConnectVerifiedFollowerSource(PlatformSpotifyFollowerNativeReads, networkExecutor, clock, isCurrent)
            val metadata = SpotifyConnectFollowerMetadataSource(networkExecutor, isCurrent)
            val broker = SpotifyBackgroundRecordingBroker(metadata, runner, scheduler, identifiers, { configuration.account.market }, isCurrent,
                { identity, token -> runtime.synchronizeAuthentication(configuration, identity, token) })
            SpotifyJamPlaybackNativeSession(configuration, object : SpotifyJamPlaybackPlayerBinding {
                override fun bind(): CompletableFuture<SpotifyPlayerServicePort> = binding.bind()
                override fun unbind(): CompletableFuture<Unit> = binding.unbind()
            }, source, broker, clock, scheduler, decisionExecutor, isCurrent, observer)
        }
        val authenticationFactory = SpotifyJamAuthenticationRenewalFactory { configuration, failed ->
            val authenticationRunner = SpotifyHeadlessRecordingRunner(mainExecutor,
                SpotifyAndroidHeadlessRecordingDispatch(application, SpotifyJamAuthenticationRenewal.TaskName))
            SpotifyJamAuthenticationRenewal(scheduler, authenticationRunner, identifiers,
                { System.currentTimeMillis() / SpotifyJamAuthenticationRenewal.MillisecondsPerSecond }, configuration.account.baseAddress,
                { identity -> runtime.isCurrentConfiguration(configuration, identity) },
                { identity, token -> runtime.synchronizeAuthentication(configuration, identity, token) }, decisionExecutor, failed)
        }
        runtime = SpotifyJamPlaybackRuntime(protocol, factory, authenticationFactory) { account ->
            SpotifyConnectApplicationRuntime.runtime.ownsNativeConnection(account.spotifyAccountIdentifier, account.handle)
        }
        val recovery = SpotifyJamConnectionRecovery(decisionExecutor, runtime::connectionUnavailable, runtime::reconnect, runtime::connectionStopped,
            { runtime.retireFollowing(); Unit }, runtime::sourceChanged)
        SpotifyConnectApplicationRuntime.runtime.observeNativeConnection(recovery::accept)
        instance = runtime
        return runtime
    }
    @Synchronized fun retireFollowing(): CompletableFuture<Unit> = instance?.retireFollowing() ?: CompletableFuture.completedFuture(Unit)
    private fun executor(workerCount: Int, capacity: Int): ThreadPoolExecutor = ThreadPoolExecutor(workerCount, workerCount,
        IdleTimeoutSeconds, TimeUnit.SECONDS, ArrayBlockingQueue(capacity)).apply { allowCoreThreadTimeOut(true) }
    private const val DecisionWorkers = 1
    private const val NetworkWorkers = 2
    private const val SchedulerWorkers = 1
    private const val MaximumDecisionQueue = 16
    private const val MaximumNetworkQueue = 8
    private const val IdleTimeoutSeconds = 30L
}

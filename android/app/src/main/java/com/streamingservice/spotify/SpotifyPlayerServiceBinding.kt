package com.streamingservice.spotify

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.media3.common.util.UnstableApi
import com.streamingservice.player.bridge.PlayerProtocol
import com.streamingservice.player.playback.StreamingPlaybackCoordinator
import com.streamingservice.player.playback.StreamingPlaybackService
import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

fun interface SpotifyPlayerServiceConnection {
    fun unbind()
}
interface SpotifyPlayerServiceConnector {
    fun bind(connected: (SpotifyPlayerCoordinator) -> Unit, disconnected: () -> Unit): SpotifyPlayerServiceConnection?
}

class SpotifyPlayerServiceBinding(
    private val connector: SpotifyPlayerServiceConnector,
    private val identifierSource: SpotifyPlayerIdentifierSource,
    private val mainExecutor: Executor
) {
    private var bindingIdentity: Any? = null
    private var connection: SpotifyPlayerServiceConnection? = null
    @Volatile private var port: SpotifyPlayerServicePort? = null
    private var pendingBinding: CompletableFuture<SpotifyPlayerServicePort>? = null

    @UnstableApi
    constructor(context: Context, identifierSource: SpotifyPlayerIdentifierSource) : this(
        AndroidSpotifyPlayerServiceConnector(context.applicationContext), identifierSource, SpotifyPlayerMainExecutor()
    )

    fun bind(): CompletableFuture<SpotifyPlayerServicePort> {
        val completion = CompletableFuture<SpotifyPlayerServicePort>()
        mainExecutor.execute {
            if (completion.isCancelled) return@execute
            if (bindingIdentity != null) {
                completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Conflict))
                return@execute
            }
            val submittedIdentity = Any()
            bindingIdentity = submittedIdentity
            pendingBinding = completion
            completion.whenComplete { _, _ ->
                if (completion.isCancelled) mainExecutor.execute { if (bindingIdentity === submittedIdentity) unbind() }
            }
            val connected: (SpotifyPlayerCoordinator) -> Unit = { coordinator ->
                mainExecutor.execute {
                    if (bindingIdentity === submittedIdentity && pendingBinding === completion) {
                        val connectedPort = SpotifyPlayerServicePort(coordinator, mainExecutor, identifierSource)
                        port = connectedPort
                        pendingBinding = null
                        completion.complete(connectedPort)
                    }
                }
            }
            val disconnected: () -> Unit = {
                mainExecutor.execute { if (bindingIdentity === submittedIdentity) unbind() }
            }
            connection = try { connector.bind(connected, disconnected) } catch (_failure: Throwable) { null }
            if (connection == null) {
                bindingIdentity = null
                pendingBinding = null
                completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable))
            }
        }
        return completion
    }

    fun unbind(): CompletableFuture<Unit> {
        val requestedRetirement = port?.close()?.result
        val completion = CompletableFuture<Unit>()
        mainExecutor.execute {
            val retiredConnection = connection
            val retiredPort = port
            bindingIdentity = null
            connection = null
            port = null
            pendingBinding?.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Cancelled))
            pendingBinding = null
            val retirement = requestedRetirement ?: retiredPort?.close()?.result ?: CompletableFuture.completedFuture(Unit)
            retirement.whenComplete { _, failure ->
                mainExecutor.execute {
                    try {
                        retiredConnection?.unbind()
                        if (failure == null) completion.complete(Unit) else completion.completeExceptionally(failure)
                    } catch (_failure: Throwable) { completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable)) }
                }
            }
        }
        return completion
    }
}

class SpotifyPlayerMainExecutor : Executor {
    private val handler = Handler(Looper.getMainLooper())
    override fun execute(command: Runnable) {
        if (!handler.post(command)) throw SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable)
    }
}

@UnstableApi
private class AndroidSpotifyPlayerServiceConnector(private val applicationContext: Context) : SpotifyPlayerServiceConnector {
    override fun bind(connected: (SpotifyPlayerCoordinator) -> Unit, disconnected: () -> Unit): SpotifyPlayerServiceConnection? {
        val serviceConnection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                try {
                    val coordinator = (binder as StreamingPlaybackService.PlaybackBinder).playbackService().playbackCoordinator()
                    connected(StreamingPlayerCoordinatorAdapter(coordinator))
                } catch (_failure: Throwable) { disconnected() }
            }
            override fun onServiceDisconnected(name: ComponentName) = disconnected()
            override fun onBindingDied(name: ComponentName) = disconnected()
            override fun onNullBinding(name: ComponentName) = disconnected()
        }
        val intent = Intent(applicationContext, StreamingPlaybackService::class.java).setAction(PlayerProtocol.BindAction)
        if (!applicationContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)) return null
        return SpotifyPlayerServiceConnection {
            try { applicationContext.unbindService(serviceConnection) }
            catch (_failure: IllegalArgumentException) { Unit }
        }
    }
}

private class StreamingPlayerCoordinatorAdapter(private val coordinator: StreamingPlaybackCoordinator) : SpotifyPlayerCoordinator {
    override fun configure(baseAddress: String, accessToken: String) = coordinator.configure(baseAddress, accessToken)
    override fun clearSession() = coordinator.clearSession()
    override fun playbackOutputReady(): Boolean = coordinator.playbackOutputReady()
    override fun snapshot(): JSONObject = coordinator.snapshot()
    override fun execute(payload: String): String = coordinator.execute(payload)
}

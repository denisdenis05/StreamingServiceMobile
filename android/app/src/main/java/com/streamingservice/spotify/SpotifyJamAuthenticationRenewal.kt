package com.streamingservice.spotify

import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

fun interface SpotifyJamAuthenticationRenewalFactory {
    fun create(configuration: SpotifyJamPlaybackConfiguration, failed: () -> Unit): SpotifyJamAuthenticationRenewal
}

class SpotifyJamAuthenticationRenewal(
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val runner: SpotifyBackgroundRecordingRunner,
    private val identifiers: SpotifyPlayerIdentifierSource,
    private val epochSeconds: () -> Long,
    private val baseAddress: String,
    private val isCurrent: (SpotifyNativeFollowerIdentity) -> Boolean,
    private val synchronize: (SpotifyNativeFollowerIdentity, String) -> CompletableFuture<Unit>,
    private val executor: Executor,
    private val failed: () -> Unit
) {
    private class Lifetime(val identity: SpotifyNativeFollowerIdentity, var expiresAtEpochSeconds: Long) {
        var timer: SpotifyNativeFollowerCancellation? = null
        var job: Job? = null
    }
    private class Job(val identifier: String, val expiresAtEpochSeconds: Long) {
        var claimed = false
        var submitted = false
        var timer: SpotifyNativeFollowerCancellation? = null
        var task: SpotifyNativeFollowerCancellation? = null
    }
    private var lifetime: Lifetime? = null
    @Volatile private var healthy = true

    fun isHealthy(): Boolean = healthy

    @Synchronized fun update(identity: SpotifyNativeFollowerIdentity, expiresAtEpochSeconds: Long) {
        if (!healthy) return
        var current = lifetime
        if (current?.identity != identity) {
            stop()
            current = Lifetime(identity, expiresAtEpochSeconds)
            lifetime = current
        } else if (expiresAtEpochSeconds <= current.expiresAtEpochSeconds) return
        current.expiresAtEpochSeconds = expiresAtEpochSeconds
        try { schedule(current) } catch (_failure: Throwable) { rejectLifetime(current) }
    }

    @Synchronized fun stop() {
        val retired = lifetime
        lifetime = null
        retired?.timer?.cancel()
        retired?.job?.timer?.cancel()
        retired?.job?.task?.cancel()
    }

    @Synchronized fun claim(requestIdentifier: String): String? {
        val current = lifetime ?: return null
        val job = current.job ?: return null
        if (job.identifier != requestIdentifier || job.claimed || !isCurrent(current.identity)) return null
        job.claimed = true
        val identity = current.identity
        return JSONObject().put(RequestField, job.identifier).put(AccountField, identity.streamingServiceAccountIdentifier)
            .put(SpotifyAccountField, identity.spotifyAccountIdentifier).put(SessionField, identity.jamSessionIdentifier)
            .put(HostField, identity.hostDeviceIdentifier).put(HandleField, identity.handle).put(GenerationField, identity.generation)
            .put(BaseAddressField, baseAddress).toString()
    }

    @Synchronized fun isPending(requestIdentifier: String): Boolean = lifetime?.let { current ->
        current.job?.identifier == requestIdentifier && isCurrent(current.identity)
    } == true

    fun complete(requestIdentifier: String, accountIdentifier: String, token: String): CompletableFuture<Unit> {
        val current: Lifetime
        val job: Job
        synchronized(this) {
            current = lifetime ?: return rejected(Superseded)
            job = current.job ?: return rejected(Superseded)
            if (job.identifier != requestIdentifier || !job.claimed || job.submitted || !isCurrent(current.identity)) return rejected(Superseded)
            if (accountIdentifier != current.identity.streamingServiceAccountIdentifier) return rejected(Unauthorized)
            job.submitted = true
        }
        val result = CompletableFuture<Unit>()
        try {
            synchronize(current.identity, token).whenComplete { _, failure ->
                synchronized(this) {
                    if (lifetime !== current || current.job !== job || !isCurrent(current.identity)) {
                        result.completeExceptionally(SpotifyConnectFailure(Superseded))
                    } else if (failure != null || current.expiresAtEpochSeconds <= job.expiresAtEpochSeconds || current.expiresAtEpochSeconds <= epochSeconds()) {
                        rejectLifetime(current)
                        result.completeExceptionally(failure ?: SpotifyConnectFailure(Unauthorized))
                    } else {
                        current.job = null
                        job.timer?.cancel()
                        result.complete(Unit)
                    }
                }
            }
        } catch (failure: Throwable) {
            synchronized(this) { if (lifetime === current) rejectLifetime(current) }
            result.completeExceptionally(failure)
        }
        return result
    }

    @Synchronized fun fail(requestIdentifier: String) {
        val current = lifetime ?: return
        if (current.job?.identifier == requestIdentifier && current.job?.claimed == true) rejectLifetime(current)
    }

    private fun schedule(current: Lifetime) {
        current.timer?.cancel()
        val delaySeconds = maxOf(MinimumDelaySeconds, current.expiresAtEpochSeconds - epochSeconds() - RenewalLeadSeconds)
        val delayMilliseconds = try { Math.multiplyExact(delaySeconds, MillisecondsPerSecond) }
        catch (_failure: ArithmeticException) { rejectLifetime(current); return }
        current.timer = scheduler.schedule(delayMilliseconds) {
            synchronized(this) {
                if (lifetime !== current || !isCurrent(current.identity)) return@synchronized
                current.timer = null
                begin(current)
            }
        }
    }

    private fun begin(current: Lifetime) {
        if (current.job != null) return
        try {
            val identifier = identifiers.nextIdentifier()
            if (identifier.isBlank() || identifier.length > MaximumIdentifierCharacters
                || identifier.any { character -> character.isWhitespace() || character.isISOControl() }) throw SpotifyConnectFailure(InvalidInput)
            val job = Job(identifier, current.expiresAtEpochSeconds)
            current.job = job
            job.timer = scheduler.schedule(SpotifyBackgroundRecordingProtocol.TimeoutMilliseconds) {
                synchronized(this) { if (lifetime === current && current.job === job) rejectLifetime(current) }
            }
            val task = runner.start(identifier) {
                synchronized(this) { if (lifetime === current && current.job === job) rejectLifetime(current) }
            }
            if (lifetime === current && current.job === job) job.task = task else task.cancel()
        } catch (_failure: Throwable) { rejectLifetime(current) }
    }

    private fun rejectLifetime(current: Lifetime) {
        if (lifetime !== current) return
        healthy = false
        stop()
        try { executor.execute(failed) } catch (_failure: Throwable) { Unit }
    }
    private fun rejected(code: String): CompletableFuture<Unit> = CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }

    companion object {
        const val TaskName = "StreamingServiceSpotifyAuthentication"
        private const val MinimumDelaySeconds = 0L
        private const val RenewalLeadSeconds = 60L
        const val MillisecondsPerSecond = 1000L
        private const val MaximumIdentifierCharacters = 512
        private const val RequestField = "requestIdentifier"
        private const val AccountField = "streamingServiceAccountIdentifier"
        private const val SpotifyAccountField = "spotifyAccountIdentifier"
        private const val SessionField = "jamSessionIdentifier"
        private const val HostField = "hostDeviceIdentifier"
        private const val HandleField = "handle"
        private const val GenerationField = "generation"
        private const val BaseAddressField = "baseAddress"
        private const val Superseded = "superseded"
        private const val Unauthorized = "unauthorized"
        private const val InvalidInput = "invalid-input"
    }
}

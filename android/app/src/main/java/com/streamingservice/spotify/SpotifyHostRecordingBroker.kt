package com.streamingservice.spotify

import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

interface SpotifyHostQueueMappingSource {
    fun resolve(identity: SpotifyHostIdentity, recordingIdentifier: String): SpotifyPlayerOperation<String>
}
class SpotifyHostRecordingBroker(
    private val configuration: SpotifyHostConfiguration,
    private val runner: SpotifyBackgroundRecordingRunner,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val identifiers: SpotifyPlayerIdentifierSource,
    private val network: Executor,
    private val search: (Long, Long, String) -> String,
    private val isCurrent: () -> Boolean
) : SpotifyHostQueueMappingSource {
    private class Job(val identifier: String, val recording: String) {
        val completion = CompletableFuture<String>()
        var claimed = false
        var searches = EmptyCount
        var timer: SpotifyNativeFollowerCancellation? = null
        var task: SpotifyNativeFollowerCancellation? = null
    }
    private val jobs = linkedMapOf<String, Job>()
    override fun resolve(identity: SpotifyHostIdentity, recordingIdentifier: String): SpotifyPlayerOperation<String> {
        val job: Job
        synchronized(this) {
            if (identity != configuration.identity || !current()) return rejected(Superseded)
            if (!identifier(recordingIdentifier) || jobs.size >= MaximumJobs) return rejected(InvalidInput)
            val selected = identifiers.nextIdentifier()
            if (!identifier(selected) || jobs.containsKey(selected)) return rejected(InvalidInput)
            job = Job(selected, recordingIdentifier); jobs[selected] = job
        }
        try {
            val timer = scheduler.schedule(TimeoutMilliseconds) { finish(job, null, Deadline) }
            synchronized(this) { if (jobs[job.identifier] === job) job.timer = timer else timer.cancel() }
            val task = runner.start(job.identifier) { finish(job, null, Network) }
            synchronized(this) { if (jobs[job.identifier] === job) job.task = task else task.cancel() }
        } catch (_failure: Throwable) { finish(job, null, Network) }
        return SpotifyPlayerOperation(job.completion) { finish(job, null, Canceled) }
    }
    @Synchronized fun claim(identifier: String): String? {
        val job = job(identifier) ?: return null
        if (job.claimed) return null
        job.claimed = true
        val identity = configuration.identity
        return JSONObject().put(RequestField, identifier).put(AccountField, identity.streamingServiceAccountIdentifier)
            .put(SpotifyAccountField, identity.spotifyAccountIdentifier).put(JamField, identity.jamSessionIdentifier)
            .put(HostField, identity.deviceIdentifier).put(HandleField, identity.handle).put(GenerationField, identity.generation)
            .put(BaseField, configuration.playback.account.baseAddress).put(MarketField, configuration.playback.account.market)
            .put(RecordingField, job.recording).toString()
    }
    @Synchronized fun isPending(identifier: String): Boolean = job(identifier) != null
    fun complete(identifier: String, track: String) {
        val selected = synchronized(this) { job(identifier)?.takeIf { value -> value.claimed } } ?: throw SpotifyConnectFailure(Superseded)
        if (!TrackPattern.matches(track)) { finish(selected, null, InvalidInput); throw SpotifyConnectFailure(InvalidInput) }
        finish(selected, track, null)
    }
    fun fail(identifier: String) { synchronized(this) { job(identifier) }?.let { selected -> finish(selected, null, Unavailable) } }
    fun search(identifier: String, serialized: String): CompletableFuture<String> {
        val completion = CompletableFuture<String>()
        val selected = synchronized(this) {
            val value = job(identifier)?.takeIf { value -> value.claimed && value.searches < MaximumSearches } ?: return failed(Superseded)
            if (serialized.length > MaximumQueryCharacters) return failed(InvalidInput)
            value.searches += SingleCount; value
        }
        try { network.execute {
            try {
                synchronized(this) { if (job(identifier) !== selected) throw SpotifyConnectFailure(Superseded) }
                val identity = configuration.identity
                val response = search(identity.handle, identity.generation, serialized)
                synchronized(this) { if (job(identifier) !== selected) throw SpotifyConnectFailure(Superseded) }
                completion.complete(response)
            } catch (failure: Throwable) {
                val code = (failure as? SpotifyConnectFailure)?.code?.takeIf { selected -> FailureCodes.contains(selected) } ?: Network
                completion.completeExceptionally(SpotifyConnectFailure(code))
            }
        } } catch (_failure: Throwable) { completion.completeExceptionally(SpotifyConnectFailure(Network)) }
        return completion
    }
    fun retire() { val selected = synchronized(this) { jobs.values.toList() }; selected.forEach { job -> finish(job, null, Canceled) } }
    @Synchronized private fun job(identifier: String): Job? = jobs[identifier]?.takeIf { current() }
    private fun finish(job: Job, track: String?, failure: String?) {
        val removed = synchronized(this) { if (jobs[job.identifier] !== job) false else { jobs.remove(job.identifier); true } }
        if (!removed) return
        job.timer?.cancel(); job.task?.cancel()
        if (failure == null && track != null && current()) job.completion.complete(track)
        else job.completion.completeExceptionally(SpotifyConnectFailure(failure ?: Superseded))
    }
    private fun current(): Boolean = try { isCurrent() } catch (_failure: Throwable) { false }
    private fun identifier(value: String): Boolean = value.isNotBlank() && value.length <= SpotifyHostingPolicy.MaximumIdentifierCharacters
        && value.none { character -> character.isWhitespace() || character.isISOControl() }
    private fun rejected(code: String) = SpotifyPlayerOperation(failed<String>(code)) {}
    private fun <Response> failed(code: String) = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }
    companion object {
        const val TaskName = "StreamingServiceSpotifyHostingRecording"
        const val TimeoutMilliseconds = 30000L
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val MaximumJobs = 16
        private const val MaximumSearches = 1
        private const val MaximumQueryCharacters = 8192
        private const val RequestField = "requestIdentifier"
        private const val AccountField = "streamingServiceAccountIdentifier"
        private const val SpotifyAccountField = "spotifyAccountIdentifier"
        private const val JamField = "jamSessionIdentifier"
        private const val HostField = "hostDeviceIdentifier"
        private const val HandleField = "handle"
        private const val GenerationField = "generation"
        private const val BaseField = "baseAddress"
        private const val MarketField = "market"
        private const val RecordingField = "recordingIdentifier"
        private const val Superseded = "superseded"
        private const val InvalidInput = "invalid-input"
        private const val Deadline = "deadline"
        private const val Network = "network"
        private const val Canceled = "canceled"
        private const val Unavailable = "not-found"
        private val FailureCodes = SpotifyConnectFailureCode.entries.map { selected -> selected.wireValue }.toSet()
        private val TrackPattern = Regex("[A-Za-z0-9]{22}")
    }
}

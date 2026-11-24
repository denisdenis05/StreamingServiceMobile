package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.ExecutionException
import org.json.JSONObject

interface SpotifyFollowerMetadataSource {
    fun read(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<String>
}

interface SpotifyBackgroundRecordingRunner {
    fun start(requestIdentifier: String, failed: (Throwable) -> Unit): SpotifyNativeFollowerCancellation
}

class SpotifyBackgroundRecordingBroker(
    private val metadata: SpotifyFollowerMetadataSource,
    private val runner: SpotifyBackgroundRecordingRunner,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val identifiers: SpotifyPlayerIdentifierSource,
    private val market: (SpotifyNativeFollowerIdentity) -> String,
    private val isCurrent: (SpotifyNativeFollowerIdentity) -> Boolean,
    private val synchronizeAuthentication: (SpotifyNativeFollowerIdentity, String) -> CompletableFuture<Unit>
) : SpotifyNativeFollowerRecordingResolver {
    private val monitor = Any()
    private val jobs = LinkedHashMap<String, Job>()

    override fun resolve(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<SpotifyFollowerRecordingResolution> {
        val completion = CompletableFuture<SpotifyFollowerRecordingResolution>()
        var requested: Job? = null
        try {
            SpotifyNativeFollowerTiming.validateIdentity(identity)
            if (!SpotifyNativeFollowerPolicy.TrackIdentifierPattern.matches(spotifyTrackIdentifier)) fail(INVALID_INPUT)
            if (!isCurrent(identity)) fail(SUPERSEDED)
            val selectedMarket = market(identity)
            val requestIdentifier = identifiers.nextIdentifier()
            if (!validIdentifier(requestIdentifier) || !MARKET_PATTERN.matches(selectedMarket)) fail(INVALID_INPUT)
            val job = Job(requestIdentifier, identity, spotifyTrackIdentifier, selectedMarket, completion)
            synchronized(monitor) {
                if (jobs.size >= MAXIMUM_PENDING_JOBS || jobs.containsKey(requestIdentifier)) fail(BACKPRESSURE)
                jobs[requestIdentifier] = job
            }
            requested = job
            val timer = scheduler.schedule(SpotifyBackgroundRecordingProtocol.TimeoutMilliseconds) { finish(job, null, SpotifyConnectFailure(DEADLINE), true) }
            synchronized(monitor) { if (jobs[requestIdentifier] === job) job.timer = timer else timer.cancel() }
            val operation = metadata.read(identity, spotifyTrackIdentifier)
            synchronized(monitor) { if (jobs[requestIdentifier] === job) job.metadata = operation else operation.cancel() }
            operation.result.whenComplete { serialized, failure ->
                if (failure != null) finish(job, null, safeFailure(failure), true)
                else try {
                    if (serialized.length > MAXIMUM_METADATA_CHARACTERS) fail(INVALID_RESPONSE)
                    val response = JSONObject(serialized)
                    if (response.has(FAILURE_FIELD) && !response.isNull(FAILURE_FIELD)) fail((response.get(FAILURE_FIELD) as? String)?.takeIf { code -> code in FAILURE_CODES } ?: NETWORK)
                    if (integer(response, HANDLE_FIELD) != identity.handle || integer(response, GENERATION_FIELD) != identity.generation) fail(SUPERSEDED)
                    synchronized(monitor) {
                        if (jobs[requestIdentifier] !== job) return@whenComplete
                        if (!isCurrent(identity)) fail(SUPERSEDED)
                        job.serializedMetadata = response.toString()
                    }
                    val task = runner.start(requestIdentifier) { taskFailure -> finish(job, null, safeFailure(taskFailure), true) }
                    synchronized(monitor) { if (jobs[requestIdentifier] === job) job.task = task else task.cancel() }
                } catch (failure: Throwable) { finish(job, null, safeFailure(failure), true) }
            }
        } catch (failure: Throwable) {
            val job = requested
            if (job == null) completion.completeExceptionally(safeFailure(failure))
            else finish(job, null, safeFailure(failure), true)
        }
        return SpotifyFollowerOperation(completion) { requested?.let { job -> finish(job, null, SpotifyConnectFailure(CANCELED), true) } }
    }

    fun claim(requestIdentifier: String): String? {
        val job = currentJob(requestIdentifier) ?: return null
        return synchronized(monitor) {
            if (jobs[requestIdentifier] !== job || job.claimed || job.serializedMetadata == null) return@synchronized null
            job.claimed = true
            JSONObject().put(REQUEST_FIELD, requestIdentifier).put(APP_ACCOUNT_FIELD, job.identity.streamingServiceAccountIdentifier)
                .put(SPOTIFY_ACCOUNT_FIELD, job.identity.spotifyAccountIdentifier).put(SESSION_FIELD, job.identity.jamSessionIdentifier)
                .put(HOST_FIELD, job.identity.hostDeviceIdentifier).put(HANDLE_FIELD, job.identity.handle).put(GENERATION_FIELD, job.identity.generation)
                .put(TRACK_FIELD, job.trackIdentifier).put(MARKET_FIELD, job.market)
                .put(METADATA_FIELD, JSONObject(requireNotNull(job.serializedMetadata))).toString()
        }
    }

    fun isPending(requestIdentifier: String): Boolean = currentJob(requestIdentifier) != null

    fun complete(requestIdentifier: String, serialized: String): Boolean {
        val job = currentJob(requestIdentifier) ?: return false
        if (!job.claimed) fail(INVALID_INPUT)
        try {
            if (serialized.length > MAXIMUM_RESULT_CHARACTERS) fail(INVALID_INPUT)
            val response = JSONObject(serialized)
            val status = response.get(STATUS_FIELD) as? String ?: fail(INVALID_INPUT)
            val result = when (status) {
                MATCHED -> {
                    requireFields(response, MATCHED_FIELDS)
                    SpotifyFollowerRecordingResolution.Matched(SpotifyFollowerRecording(text(response, RECORDING_FIELD), text(response, TITLE_FIELD), text(response, ARTIST_FIELD)))
                }
                AMBIGUOUS -> { requireFields(response, STATUS_FIELDS); SpotifyFollowerRecordingResolution.Ambiguous }
                UNAVAILABLE -> { requireFields(response, STATUS_FIELDS); SpotifyFollowerRecordingResolution.Unavailable }
                else -> fail(INVALID_INPUT)
            }
            return finish(job, result, null, false)
        } catch (_failure: Throwable) {
            finish(job, null, SpotifyConnectFailure(INVALID_RESPONSE), false)
            throw SpotifyConnectFailure(INVALID_INPUT)
        }
    }

    fun fail(requestIdentifier: String, code: String): Boolean {
        val job = currentJob(requestIdentifier) ?: return false
        if (!job.claimed) fail(INVALID_INPUT)
        return finish(job, null, SpotifyConnectFailure(code.takeIf { selected -> selected in FAILURE_CODES } ?: NETWORK), false)
    }

    fun synchronizePlayerAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String): CompletableFuture<Unit> {
        val job = currentJob(requestIdentifier) ?: return failedFuture(SUPERSEDED)
        if (!job.claimed || accountIdentifier != job.identity.streamingServiceAccountIdentifier || accessToken.isBlank()
            || accessToken.length > MAXIMUM_TOKEN_CHARACTERS || accessToken.any { character -> character.isWhitespace() || character.isISOControl() }) return failedFuture(INVALID_INPUT)
        val completion = CompletableFuture<Unit>()
        try {
            synchronizeAuthentication(job.identity, accessToken).whenComplete { _, failure ->
                try {
                    if (failure != null) throw failure
                    if (currentJob(requestIdentifier) !== job) fail(SUPERSEDED)
                    completion.complete(Unit)
                } catch (failure: Throwable) { completion.completeExceptionally(safeFailure(failure)) }
            }
        } catch (failure: Throwable) { completion.completeExceptionally(safeFailure(failure)) }
        return completion
    }

    fun retire() {
        val retired = synchronized(monitor) { jobs.values.toList() }
        retired.forEach { job -> finish(job, null, SpotifyConnectFailure(CANCELED), true) }
    }

    private fun currentJob(requestIdentifier: String): Job? {
        val job = synchronized(monitor) { jobs[requestIdentifier] } ?: return null
        val valid = try { isCurrent(job.identity) } catch (_failure: Throwable) {
            finish(job, null, SpotifyConnectFailure(NETWORK), true); return null
        }
        if (!valid) { finish(job, null, SpotifyConnectFailure(SUPERSEDED), true); return null }
        return job
    }

    private fun finish(job: Job, result: SpotifyFollowerRecordingResolution?, failure: Throwable?, retireTask: Boolean): Boolean {
        synchronized(monitor) {
            if (jobs[job.identifier] !== job) return false
            jobs.remove(job.identifier)
        }
        cancelSafely { job.timer?.cancel() }
        cancelSafely { job.metadata?.cancel() }
        if (retireTask) cancelSafely { job.task?.cancel() }
        val completedFailure = failure ?: try { if (!isCurrent(job.identity)) SpotifyConnectFailure(SUPERSEDED) else null }
            catch (_failure: Throwable) { SpotifyConnectFailure(NETWORK) }
        if (completedFailure != null) job.completion.completeExceptionally(completedFailure)
        else job.completion.complete(requireNotNull(result))
        return true
    }

    private fun cancelSafely(action: () -> Unit) { try { action() } catch (_failure: Throwable) { Unit } }

    private fun safeFailure(failure: Throwable): SpotifyConnectFailure {
        if ((failure is CompletionException || failure is ExecutionException) && failure.cause != null) return safeFailure(requireNotNull(failure.cause))
        return SpotifyConnectFailure((failure as? SpotifyConnectFailure)?.code?.takeIf { code -> code in FAILURE_CODES } ?: NETWORK)
    }
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail(INVALID_RESPONSE)
        val decimal = number.toDouble()
        if (!decimal.isFinite() || decimal < FIRST_IDENTIFIER || decimal > MAXIMUM_SAFE_INTEGER || decimal != number.toLong().toDouble()) fail(INVALID_RESPONSE)
        return number.toLong()
    }
    private fun text(value: JSONObject, field: String): String {
        val selected = value.get(field) as? String ?: fail(INVALID_INPUT)
        if (selected.isBlank() || selected.length > MAXIMUM_TEXT_CHARACTERS || selected.any { character -> character.isISOControl() }) fail(INVALID_INPUT)
        return selected
    }
    private fun validIdentifier(value: String): Boolean = value.isNotBlank() && value.length <= MAXIMUM_IDENTIFIER_CHARACTERS
        && value.none { character -> character.isWhitespace() || character.isISOControl() }
    private fun requireFields(value: JSONObject, expected: Set<String>) { if (value.keys().asSequence().toSet() != expected) fail(INVALID_INPUT) }
    private fun fail(code: String): Nothing = throw SpotifyConnectFailure(code)
    private fun <Response> failedFuture(code: String): CompletableFuture<Response> = CompletableFuture<Response>().also { future -> future.completeExceptionally(SpotifyConnectFailure(code)) }

    private class Job(val identifier: String, val identity: SpotifyNativeFollowerIdentity, val trackIdentifier: String, val market: String,
        val completion: CompletableFuture<SpotifyFollowerRecordingResolution>) {
        @Volatile var metadata: SpotifyFollowerOperation<String>? = null
        @Volatile var task: SpotifyNativeFollowerCancellation? = null
        @Volatile var timer: SpotifyNativeFollowerCancellation? = null
        var serializedMetadata: String? = null
        var claimed = false
    }

    companion object {
        private const val MAXIMUM_PENDING_JOBS = 2
        private const val MAXIMUM_METADATA_CHARACTERS = 2097152
        private const val MAXIMUM_RESULT_CHARACTERS = 16384
        private const val MAXIMUM_TEXT_CHARACTERS = 2048
        private const val MAXIMUM_IDENTIFIER_CHARACTERS = 512
        private const val MAXIMUM_TOKEN_CHARACTERS = 65536
        private const val FIRST_IDENTIFIER = 1L
        private const val MAXIMUM_SAFE_INTEGER = 9007199254740991L
        private const val REQUEST_FIELD = "requestIdentifier"
        private const val APP_ACCOUNT_FIELD = "streamingServiceAccountIdentifier"
        private const val SPOTIFY_ACCOUNT_FIELD = "spotifyAccountIdentifier"
        private const val SESSION_FIELD = "jamSessionIdentifier"
        private const val HOST_FIELD = "hostDeviceIdentifier"
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val TRACK_FIELD = "spotifyTrackIdentifier"
        private const val MARKET_FIELD = "market"
        private const val METADATA_FIELD = "metadata"
        private const val FAILURE_FIELD = "failure"
        private const val STATUS_FIELD = "status"
        private const val RECORDING_FIELD = "recordingIdentifier"
        private const val TITLE_FIELD = "title"
        private const val ARTIST_FIELD = "artist"
        private const val MATCHED = "matched"
        private const val AMBIGUOUS = "ambiguous"
        private const val UNAVAILABLE = "unavailable"
        private const val INVALID_INPUT = "invalid-input"
        private const val INVALID_RESPONSE = "invalid-response"
        private const val SUPERSEDED = "superseded"
        private const val BACKPRESSURE = "backpressure"
        private const val CANCELED = "canceled"
        private const val DEADLINE = "deadline"
        private const val NETWORK = "network"
        private val MARKET_PATTERN = Regex("[A-Z]{2}")
        private val MATCHED_FIELDS = setOf(STATUS_FIELD, RECORDING_FIELD, TITLE_FIELD, ARTIST_FIELD)
        private val STATUS_FIELDS = setOf(STATUS_FIELD)
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

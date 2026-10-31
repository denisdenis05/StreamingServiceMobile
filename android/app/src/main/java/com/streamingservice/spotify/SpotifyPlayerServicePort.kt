package com.streamingservice.spotify

import com.streamingservice.player.bridge.PlayerOperation
import com.streamingservice.player.bridge.PlayerProtocol
import com.streamingservice.player.bridge.ProtocolFields
import com.streamingservice.player.playback.ExternalPlaybackPolicy
import com.streamingservice.player.queue.QueueNumbers
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

interface SpotifyPlayerCoordinator {
    fun configure(baseAddress: String, accessToken: String)
    fun clearSession()
    fun playbackOutputReady(): Boolean? = null
    fun snapshot(): JSONObject
    fun execute(payload: String): String
}

fun interface SpotifyPlayerIdentifierSource {
    fun nextIdentifier(): String
}

data class SpotifyPlayerIdentity(val engineEpoch: String, val authenticationEpoch: String)
data class SpotifyPlayerLease(val identity: SpotifyPlayerIdentity, val accountIdentifier: String, val authorityIdentifier: String)
data class SpotifyPlayerRecording(val occurrenceIdentifier: String, val recordingIdentifier: String, val title: String, val artist: String)
enum class SpotifyPlayerClockDomain { ElapsedRealtime }
data class SpotifyPlayerSample(
    val sampledAtMilliseconds: Long,
    val clockDomain: SpotifyPlayerClockDomain,
    val occurrenceIdentifier: String?,
    val positionMilliseconds: Long,
    val durationMilliseconds: Long?,
    val ready: Boolean?,
    val buffering: Boolean,
    val playing: Boolean,
    val suspended: Boolean,
    val expired: Boolean,
    val seekable: Boolean,
    val interruption: String
)
enum class SpotifyPlayerFailureReason { Unavailable, InvalidInput, InvalidResponse, Conflict, Superseded, Suspended, Expired, Capacity, Cancelled, UnknownOutcome }
class SpotifyPlayerFailure(val reason: SpotifyPlayerFailureReason) : RuntimeException(reason.name)
class SpotifyPlayerOperation<Response> internal constructor(
    val result: CompletableFuture<Response>,
    private val cancellation: () -> Unit
) {
    fun cancel() = cancellation()
}

class SpotifyPlayerServicePort(
    private val coordinator: SpotifyPlayerCoordinator,
    private val mainExecutor: Executor,
    private val identifierSource: SpotifyPlayerIdentifierSource,
    private val maximumPendingOperations: Int = DefaultMaximumPendingOperations
) {
    private val monitor = Any()
    private val pending = ArrayDeque<Work<*>>()
    private var draining = false
    private var generation = InitialGeneration
    private var closed = false
    private var closeCompletion: CompletableFuture<Unit>? = null
    @Volatile private var activeLease: SpotifyPlayerLease? = null
    @Volatile private var retiringLease: SpotifyPlayerLease? = null
    private var runningWork: Work<*>? = null
    private var accountIdentifier: String? = null
    private var baseAddress: String? = null

    init { require(maximumPendingOperations > EmptyCount) }

    fun hosting(resolver: SpotifyHostRecordingResolver, scheduler: SpotifyNativeFollowerScheduler,
        elapsedMilliseconds: () -> Long, isCurrent: (SpotifyHostIdentity) -> Boolean,
        canExecute: (SpotifyHostIdentity) -> Boolean = isCurrent): SpotifyHostPlayerPort =
        SpotifyHostPlayerPort(coordinator, mainExecutor, resolver, scheduler, elapsedMilliseconds, identifierSource,
            { identity -> synchronized(monitor) { !closed && accountIdentifier == identity.streamingServiceAccountIdentifier } && isCurrent(identity) }, canExecute = canExecute)

    fun identity(): SpotifyPlayerOperation<SpotifyPlayerIdentity> = submit { identity(coordinator.snapshot()) }

    fun configureAuthentication(
        expectedIdentity: SpotifyPlayerIdentity,
        accountIdentifier: String,
        baseAddress: String,
        accessToken: String,
        resetAuthentication: Boolean
    ): SpotifyPlayerOperation<SpotifyPlayerIdentity> = submit {
        requireText(accountIdentifier)
        requireText(baseAddress)
        requireText(accessToken)
        val snapshot = coordinator.snapshot()
        requireIdentity(snapshot, expectedIdentity)
        val ownedLease = activeLease
        val existingAuthority = authority(snapshot)
        if (existingAuthority != null || ownedLease != null) {
            if (ownedLease == null || ownedLease.identity != expectedIdentity || ownedLease.authorityIdentifier != existingAuthority
                || ownedLease.accountIdentifier != accountIdentifier || this.baseAddress != baseAddress || resetAuthentication) fail(SpotifyPlayerFailureReason.Conflict)
        }
        val changingAccount = this.accountIdentifier != null && this.accountIdentifier != accountIdentifier
        val changingAddress = this.baseAddress != null && this.baseAddress != baseAddress
        if ((changingAccount || changingAddress) && !resetAuthentication) fail(SpotifyPlayerFailureReason.Conflict)
        markMutationDispatch()
        if (resetAuthentication) coordinator.clearSession()
        coordinator.configure(baseAddress, accessToken)
        this.accountIdentifier = accountIdentifier
        this.baseAddress = baseAddress
        identity(coordinator.snapshot())
    }

    fun acquire(expectedIdentity: SpotifyPlayerIdentity, accountIdentifier: String): SpotifyPlayerOperation<SpotifyPlayerLease> = submit {
        if (this.accountIdentifier != accountIdentifier) fail(SpotifyPlayerFailureReason.Superseded)
        val snapshot = coordinator.snapshot()
        requireIdentity(snapshot, expectedIdentity)
        if (authority(snapshot) != null || activeLease != null) fail(SpotifyPlayerFailureReason.Conflict)
        claim(snapshot, expectedIdentity, accountIdentifier)
    }

    fun recoverExpiredLease(lease: SpotifyPlayerLease): SpotifyPlayerOperation<SpotifyPlayerLease> = submit {
        val snapshot = requireLease(lease, allowExpired = true)
        if (!boolean(snapshot, ProtocolFields.ExternalAuthorityExpired)) fail(SpotifyPlayerFailureReason.Conflict)
        execute(snapshot, lease, PlayerOperation.SetExternalAuthority) { command -> command.put(ProtocolFields.AuthorityIdentifier, JSONObject.NULL) }
        activeLease = null
        val releasedSnapshot = coordinator.snapshot()
        requireIdentity(releasedSnapshot, lease.identity)
        if (authority(releasedSnapshot) != null) fail(SpotifyPlayerFailureReason.Superseded)
        claim(releasedSnapshot, lease.identity, lease.accountIdentifier)
    }

    private fun claim(snapshot: JSONObject, expectedIdentity: SpotifyPlayerIdentity, accountIdentifier: String): SpotifyPlayerLease {
        val authorityIdentifier = identifierSource.nextIdentifier()
        requireText(authorityIdentifier)
        if (authorityIdentifier.length > ExternalPlaybackPolicy.MaximumIdentifierCharacters) fail(SpotifyPlayerFailureReason.InvalidInput)
        val lease = SpotifyPlayerLease(expectedIdentity, accountIdentifier, authorityIdentifier)
        activeLease = lease
        try {
            execute(snapshot, lease, PlayerOperation.SetExternalAuthority, includeAuthority = false) { command ->
                command.put(ProtocolFields.AuthorityIdentifier, authorityIdentifier)
            }
            synchronized(monitor) {
                val work = runningWork ?: fail(SpotifyPlayerFailureReason.Unavailable)
                if (work.completion.isDone || work.submittedGeneration != generation) fail(SpotifyPlayerFailureReason.UnknownOutcome)
            }
        } catch (failure: SpotifyPlayerFailure) {
            if (failure.reason == SpotifyPlayerFailureReason.UnknownOutcome) {
                try { releaseExact(lease, cleanup = true) } catch (_cleanupFailure: Throwable) { Unit }
            } else activeLease = null
            throw failure
        }
        return lease
    }

    fun prepare(lease: SpotifyPlayerLease, recording: SpotifyPlayerRecording): SpotifyPlayerOperation<Unit> =
        prepareQueue(lease, listOf(recording), recording.occurrenceIdentifier)

    fun prepareQueue(lease: SpotifyPlayerLease, recordings: List<SpotifyPlayerRecording>, occurrenceIdentifier: String): SpotifyPlayerOperation<Unit> {
        val captured = recordings.toList()
        return submit {
            if (captured.isEmpty() || captured.size > SpotifyNativeFollowerPolicy.MaximumUpcomingOccurrences + SingleEntryCount
                || captured.count { recording -> recording.occurrenceIdentifier == occurrenceIdentifier } != SingleEntryCount
                || captured.map { recording -> recording.occurrenceIdentifier }.toSet().size != captured.size) fail(SpotifyPlayerFailureReason.InvalidInput)
            val entries = JSONArray()
            captured.forEach { recording ->
                listOf(recording.occurrenceIdentifier, recording.recordingIdentifier, recording.title, recording.artist).forEach(::requireText)
                entries.put(JSONObject().put(ProtocolFields.EntryIdentifier, recording.occurrenceIdentifier)
                    .put(ProtocolFields.RecordingIdentifier, recording.recordingIdentifier)
                    .put(ProtocolFields.Title, recording.title).put(ProtocolFields.Artist, recording.artist))
            }
            val snapshot = requireLease(lease)
            execute(snapshot, lease, PlayerOperation.Replace) { command ->
                command.put(ProtocolFields.Entries, entries).put(ProtocolFields.ActiveEntryIdentifier, occurrenceIdentifier)
                    .put(ProtocolFields.PlayWhenReady, false)
            }
        }
    }

    fun play(lease: SpotifyPlayerLease, occurrenceIdentifier: String): SpotifyPlayerOperation<Unit> = control(lease, occurrenceIdentifier, PlayerOperation.Play)
    fun pause(lease: SpotifyPlayerLease, occurrenceIdentifier: String): SpotifyPlayerOperation<Unit> = control(lease, occurrenceIdentifier, PlayerOperation.Pause)
    fun seek(lease: SpotifyPlayerLease, occurrenceIdentifier: String, positionMilliseconds: Long): SpotifyPlayerOperation<Unit> = submit {
        if (positionMilliseconds < QueueNumbers.MinimumPositionMilliseconds || positionMilliseconds > QueueNumbers.MaximumSafeInteger) fail(SpotifyPlayerFailureReason.InvalidInput)
        val snapshot = requireOccurrence(lease, occurrenceIdentifier)
        if (!boolean(snapshot, ProtocolFields.CanSeek)) fail(SpotifyPlayerFailureReason.InvalidInput)
        execute(snapshot, lease, PlayerOperation.Seek) { command ->
            command.put(ProtocolFields.EntryIdentifier, occurrenceIdentifier).put(ProtocolFields.PositionMilliseconds, positionMilliseconds)
        }
    }

    fun renew(lease: SpotifyPlayerLease): SpotifyPlayerOperation<Unit> = submit {
        execute(requireLease(lease), lease, PlayerOperation.RenewExternalAuthority)
    }

    fun sample(lease: SpotifyPlayerLease): SpotifyPlayerOperation<SpotifyPlayerSample> = submit {
        val snapshot = requireLease(lease, allowSuspended = true, allowExpired = true)
        val state = snapshot.getString(ProtocolFields.State)
        if (state !in KnownStates) fail(SpotifyPlayerFailureReason.InvalidResponse)
        SpotifyPlayerSample(
            integer(snapshot, ProtocolFields.SampledAtMonotonicMilliseconds), SpotifyPlayerClockDomain.ElapsedRealtime,
            snapshot.optJSONObject(ProtocolFields.CurrentEntry)?.getString(ProtocolFields.EntryIdentifier),
            integer(snapshot, ProtocolFields.PositionMilliseconds),
            if (snapshot.isNull(ProtocolFields.DurationMilliseconds)) null else integer(snapshot, ProtocolFields.DurationMilliseconds),
            coordinator.playbackOutputReady(),
            state == PlayerProtocol.BufferingState || state == PlayerProtocol.ResolvingState,
            state == PlayerProtocol.PlayingState, boolean(snapshot, ProtocolFields.ExternalAuthoritySuspended),
            boolean(snapshot, ProtocolFields.ExternalAuthorityExpired), boolean(snapshot, ProtocolFields.CanSeek),
            snapshot.getString(ProtocolFields.Interruption)
        )
    }

    fun release(lease: SpotifyPlayerLease): SpotifyPlayerOperation<Unit> {
        val completion = CompletableFuture<Unit>()
        synchronized(monitor) {
            if (closed) return SpotifyPlayerOperation(CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable)) }) {}
            if (activeLease != lease) return SpotifyPlayerOperation(CompletableFuture.completedFuture(Unit)) {}
            retiringLease = lease
            retirePendingLocked()
            enqueueLocked(Work(generation, completion) { releaseExact(lease) })
        }
        scheduleDrain()
        return SpotifyPlayerOperation(completion) {}
    }

    fun close(): SpotifyPlayerOperation<Unit> {
        val completion = CompletableFuture<Unit>()
        synchronized(monitor) {
            closeCompletion?.let { previous -> return SpotifyPlayerOperation(previous) {} }
            closeCompletion = completion
            closed = true
            retirePendingLocked()
            enqueueLocked(Work(generation, completion) { activeLease?.let { lease -> releaseExact(lease) }; Unit })
        }
        scheduleDrain()
        return SpotifyPlayerOperation(completion) {}
    }

    private fun releaseExact(lease: SpotifyPlayerLease, cleanup: Boolean = false) {
        if (activeLease != lease) return
        val snapshot = coordinator.snapshot()
        if (identity(snapshot) != lease.identity || authority(snapshot) != lease.authorityIdentifier) {
            activeLease = null
            retiringLease = null
            return
        }
        execute(snapshot, lease, PlayerOperation.SetExternalAuthority, cleanup = cleanup) { command -> command.put(ProtocolFields.AuthorityIdentifier, JSONObject.NULL) }
        activeLease = null
        retiringLease = null
    }

    private fun control(lease: SpotifyPlayerLease, occurrenceIdentifier: String, operation: PlayerOperation): SpotifyPlayerOperation<Unit> = submit {
        execute(requireOccurrence(lease, occurrenceIdentifier), lease, operation)
    }

    private fun requireOccurrence(lease: SpotifyPlayerLease, occurrenceIdentifier: String): JSONObject {
        requireText(occurrenceIdentifier)
        val snapshot = requireLease(lease)
        if (snapshot.optJSONObject(ProtocolFields.CurrentEntry)?.opt(ProtocolFields.EntryIdentifier) != occurrenceIdentifier) fail(SpotifyPlayerFailureReason.Superseded)
        return snapshot
    }

    private fun requireLease(lease: SpotifyPlayerLease, allowSuspended: Boolean = false, allowExpired: Boolean = false): JSONObject {
        if (activeLease != lease || retiringLease == lease || accountIdentifier != lease.accountIdentifier) fail(SpotifyPlayerFailureReason.Superseded)
        val snapshot = coordinator.snapshot()
        requireIdentity(snapshot, lease.identity)
        if (authority(snapshot) != lease.authorityIdentifier) fail(SpotifyPlayerFailureReason.Superseded)
        if (!allowSuspended && boolean(snapshot, ProtocolFields.ExternalAuthoritySuspended)) fail(SpotifyPlayerFailureReason.Suspended)
        if (!allowExpired && boolean(snapshot, ProtocolFields.ExternalAuthorityExpired)) fail(SpotifyPlayerFailureReason.Expired)
        return snapshot
    }

    private fun execute(snapshot: JSONObject, lease: SpotifyPlayerLease, operation: PlayerOperation, includeAuthority: Boolean = true, cleanup: Boolean = false, populate: (JSONObject) -> Unit = {}) {
        val cursor = snapshot.getJSONObject(ProtocolFields.Cursor)
        val requestIdentifier = identifierSource.nextIdentifier()
        requireText(requestIdentifier)
        val command = JSONObject().put(ProtocolFields.Operation, operation.protocolValue)
            .put(ProtocolFields.RequestIdentifier, requestIdentifier).put(ProtocolFields.EngineEpoch, lease.identity.engineEpoch)
            .put(ProtocolFields.AuthenticationEpoch, lease.identity.authenticationEpoch)
            .put(ProtocolFields.ExpectedQueueRevision, integer(cursor, ProtocolFields.QueueRevision))
            .put(ProtocolFields.ExpectedQueueIdentifier, cursor.getString(ProtocolFields.QueueIdentifier))
            .put(ProtocolFields.ExpectedPlaybackControlRevision, integer(cursor, ProtocolFields.PlaybackControlRevision))
        if (includeAuthority) command.put(ProtocolFields.ExternalAuthorityIdentifier, lease.authorityIdentifier)
        populate(command)
        if (!cleanup) markMutationDispatch()
        val receipt = try { JSONObject(coordinator.execute(command.toString())) } catch (_failure: Throwable) { fail(SpotifyPlayerFailureReason.UnknownOutcome) }
        try {
            if (receipt.getString(ProtocolFields.RequestIdentifier) != requestIdentifier || identity(receipt) != lease.identity) fail(SpotifyPlayerFailureReason.UnknownOutcome)
            when (receipt.getString(ProtocolFields.Status)) {
                PlayerProtocol.AppliedStatus -> Unit
                PlayerProtocol.ConflictStatus -> fail(SpotifyPlayerFailureReason.Conflict)
                PlayerProtocol.SupersededStatus -> fail(SpotifyPlayerFailureReason.Superseded)
                else -> fail(SpotifyPlayerFailureReason.UnknownOutcome)
            }
        } catch (failure: SpotifyPlayerFailure) { throw failure }
        catch (_failure: Throwable) { fail(SpotifyPlayerFailureReason.UnknownOutcome) }
    }

    private fun identity(snapshot: JSONObject): SpotifyPlayerIdentity {
        val cursor = snapshot.getJSONObject(ProtocolFields.Cursor)
        return SpotifyPlayerIdentity(cursor.getString(ProtocolFields.EngineEpoch), cursor.getString(ProtocolFields.AuthenticationEpoch)).also { identity ->
            requireText(identity.engineEpoch)
            requireText(identity.authenticationEpoch)
        }
    }

    private fun authority(snapshot: JSONObject): String? {
        if (!snapshot.has(ProtocolFields.ExternalAuthorityIdentifier)) fail(SpotifyPlayerFailureReason.InvalidResponse)
        return if (snapshot.isNull(ProtocolFields.ExternalAuthorityIdentifier)) null else snapshot.getString(ProtocolFields.ExternalAuthorityIdentifier)
    }
    private fun requireIdentity(snapshot: JSONObject, expected: SpotifyPlayerIdentity) {
        if (identity(snapshot) != expected) fail(SpotifyPlayerFailureReason.Superseded)
    }
    private fun boolean(value: JSONObject, field: String): Boolean = value.get(field) as? Boolean ?: fail(SpotifyPlayerFailureReason.InvalidResponse)
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail(SpotifyPlayerFailureReason.InvalidResponse)
        val decimal = number.toDouble()
        if (!decimal.isFinite() || decimal < QueueNumbers.MinimumPositionMilliseconds || decimal > QueueNumbers.MaximumSafeInteger || decimal != number.toLong().toDouble()) fail(SpotifyPlayerFailureReason.InvalidResponse)
        return number.toLong()
    }
    private fun requireText(value: String) { if (value.isBlank()) fail(SpotifyPlayerFailureReason.InvalidInput) }
    private fun fail(reason: SpotifyPlayerFailureReason): Nothing = throw SpotifyPlayerFailure(reason)

    private fun <Response> submit(action: () -> Response): SpotifyPlayerOperation<Response> {
        val completion = CompletableFuture<Response>()
        val work: Work<Response>
        synchronized(monitor) {
            work = Work(generation, completion, action)
            if (closed) completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable))
            else if (retiringLease != null) completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Superseded))
            else if (pending.size >= maximumPendingOperations) completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Capacity))
            else enqueueLocked(work)
        }
        scheduleDrain()
        return SpotifyPlayerOperation(completion) {
            synchronized(monitor) {
                pending.remove(work)
                completion.completeExceptionally(SpotifyPlayerFailure(if (work.mutationDispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Cancelled))
            }
        }
    }

    private fun enqueueLocked(work: Work<*>) { pending.addLast(work) }
    private fun retirePendingLocked() {
        generation += GenerationIncrement
        val retiredWork = pending.toList()
        pending.clear()
        retiredWork.forEach { work -> work.completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Cancelled)) }
    }
    private fun scheduleDrain() {
        synchronized(monitor) {
            if (draining || pending.isEmpty()) return
            draining = true
        }
        try { mainExecutor.execute(::drain) }
        catch (_failure: Throwable) {
            synchronized(monitor) {
                draining = false
                val rejectedWork = pending.toList()
                pending.clear()
                rejectedWork.forEach { work -> work.completion.completeExceptionally(SpotifyPlayerFailure(SpotifyPlayerFailureReason.Unavailable)) }
            }
        }
    }
    private fun drain() {
        while (true) {
            val work = synchronized(monitor) {
                if (pending.isEmpty()) { draining = false; return }
                pending.removeFirst()
            }
            runningWork = work
            try { work.run() } finally { runningWork = null }
        }
    }
    private fun markMutationDispatch() {
        synchronized(monitor) {
            val work = runningWork ?: fail(SpotifyPlayerFailureReason.Unavailable)
            if (work.completion.isDone || work.submittedGeneration != generation) fail(SpotifyPlayerFailureReason.Cancelled)
            work.mutationDispatched = true
        }
    }
    private inner class Work<Response>(val submittedGeneration: Long, val completion: CompletableFuture<Response>, val action: () -> Response) {
        var mutationDispatched = false
        fun run() {
            synchronized(monitor) { if (completion.isDone || generation != submittedGeneration) return }
            try {
                val response = action()
                synchronized(monitor) {
                    if (generation != submittedGeneration) completion.completeExceptionally(SpotifyPlayerFailure(if (mutationDispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Cancelled))
                    else completion.complete(response)
                }
            } catch (failure: Throwable) {
                completion.completeExceptionally(if (failure is SpotifyPlayerFailure) failure else SpotifyPlayerFailure(
                    if (mutationDispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.InvalidResponse))
            }
        }
    }

    companion object {
        private const val SingleEntryCount = 1
        private const val DefaultMaximumPendingOperations = 32
        private const val EmptyCount = 0
        private const val InitialGeneration = 0L
        private const val GenerationIncrement = 1L
        private val KnownStates = setOf(PlayerProtocol.IdleState, PlayerProtocol.ResolvingState, PlayerProtocol.BufferingState,
            PlayerProtocol.PlayingState, PlayerProtocol.PausedState, PlayerProtocol.EndedState, PlayerProtocol.FailedState)
    }
}

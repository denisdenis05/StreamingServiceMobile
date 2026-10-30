package com.streamingservice.spotify

import com.streamingservice.player.bridge.PlayerOperation
import com.streamingservice.player.bridge.PlayerProtocol
import com.streamingservice.player.bridge.ProtocolFields
import com.streamingservice.player.queue.QueueNumbers
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

interface SpotifyHostRecordingResolver {
    fun resolve(identity: SpotifyHostIdentity, spotifyTrackIdentifier: String): SpotifyPlayerOperation<SpotifyHostRecordingResolution>
}
sealed class SpotifyHostRecordingResolution {
    data class Matched(val recordingIdentifier: String, val title: String, val artist: String) : SpotifyHostRecordingResolution()
    object Unavailable : SpotifyHostRecordingResolution()
    object Ambiguous : SpotifyHostRecordingResolution()
}
data class SpotifyHostIdentity(
    val streamingServiceAccountIdentifier: String,
    val spotifyAccountIdentifier: String,
    val jamSessionIdentifier: String,
    val deviceIdentifier: String,
    val handle: Long,
    val generation: Long,
    val playerIdentity: SpotifyPlayerIdentity
)
data class SpotifyHostPlayerCursor(val queueIdentifier: String, val queueRevision: Long, val contentRevision: Long, val controlRevision: Long)
data class SpotifyHostPlayerSnapshot(
    val identity: SpotifyHostIdentity,
    val cursor: SpotifyHostPlayerCursor,
    val occurrenceIdentifier: String?,
    val positionMilliseconds: Long,
    val durationMilliseconds: Long?,
    val sampledAtElapsedMilliseconds: Long,
    val ready: Boolean,
    val paused: Boolean,
    val buffering: Boolean
)
data class SpotifyHostPlayerAccepted(val request: SpotifyHostCommandRequest, val snapshot: SpotifyHostPlayerSnapshot, val acceptedTracks: List<SpotifyHostTrack>)

class SpotifyHostPlayerPort(
    private val coordinator: SpotifyPlayerCoordinator,
    private val mainExecutor: Executor,
    private val resolver: SpotifyHostRecordingResolver,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val elapsedMilliseconds: () -> Long,
    private val identifiers: SpotifyPlayerIdentifierSource,
    private val isCurrent: (SpotifyHostIdentity) -> Boolean,
    private val maximumJournalEntries: Int = DefaultMaximumJournalEntries,
    private val maximumPendingCommands: Int = DefaultMaximumPendingCommands
) {
    private val monitor = Any()
    private val journal = LinkedHashMap<String, Job>()
    @Volatile private var retired = false

    init { require(maximumJournalEntries > EmptyCount && maximumPendingCommands > EmptyCount) }

    fun sample(identity: SpotifyHostIdentity): CompletableFuture<SpotifyHostPlayerSnapshot> {
        val completion = CompletableFuture<SpotifyHostPlayerSnapshot>()
        dispatch({ completion.completeExceptionally(it) }) {
            try { completion.complete(snapshot(identity)) } catch (failure: Throwable) { completion.completeExceptionally(safeFailure(failure, false)) }
        }
        return completion
    }

    fun execute(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor, request: SpotifyHostCommandRequest,
        receivedAtElapsedMilliseconds: Long, deadlineElapsedMilliseconds: Long): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> {
        val job: Job
        if (!validIdentity(identity) || !validIdentifier(request.key) || !validIdentifier(request.senderDeviceIdentifier)
            || request.sessionCommandIdentifier?.let { identifier -> !validIdentifier(identifier) } == true
            || request.messageIdentifier < MinimumMessageIdentifier || request.messageIdentifier > MaximumMessageIdentifier) return rejected(SpotifyPlayerFailureReason.InvalidInput)
        synchronized(monitor) {
            val previous = journal[request.key]
            if (previous != null) {
                if (previous.identity != identity || previous.expected != expected || previous.request != request) return rejected(SpotifyPlayerFailureReason.Conflict)
                return operation(previous)
            }
            if (retired || !isCurrent(identity)) return rejected(SpotifyPlayerFailureReason.Superseded)
            if (journal.size >= maximumJournalEntries || journal.values.count { entry -> !entry.completion.isDone } >= maximumPendingCommands) return rejected(SpotifyPlayerFailureReason.Capacity)
            val now = elapsedMilliseconds()
            if (request.key.isBlank() || receivedAtElapsedMilliseconds > now || receivedAtElapsedMilliseconds < MinimumElapsedMilliseconds
                || deadlineElapsedMilliseconds <= now || deadlineElapsedMilliseconds - receivedAtElapsedMilliseconds > MaximumCommandLifetimeMilliseconds) return rejected(SpotifyPlayerFailureReason.InvalidInput)
            job = Job(identity, expected, request, deadlineElapsedMilliseconds)
            journal[request.key] = job
        }
        try {
            val timer = scheduler.schedule(maxOf(MinimumElapsedMilliseconds, deadlineElapsedMilliseconds - elapsedMilliseconds())) { cancel(job) }
            synchronized(monitor) { if (job.completion.isDone) timer.cancel() else job.timer = timer }
            dispatch({ failure -> finish(job, null, safeFailure(failure, job.dispatched)) }) { prepare(job) }
        } catch (failure: Throwable) { finish(job, null, safeFailure(failure, false)) }
        return operation(job)
    }

    fun retire() {
        val jobs = synchronized(monitor) { retired = true; journal.values.filter { job -> !job.completion.isDone } }
        jobs.forEach(::cancel)
    }

    private fun prepare(job: Job) {
        try {
            requireCurrent(job)
            val snapshot = coordinator.snapshot()
            requireCursor(snapshot, job)
            val action = job.request.command
            val requestedTracks = when (action) {
                is SpotifyHostCommand.AddToQueue -> listOf(action.track)
                is SpotifyHostCommand.Play -> action.tracks
                else -> emptyList()
            }
            val tracks = requestedTracks.map { track -> track.copy(occurrenceIdentifier = track.occurrenceIdentifier ?: identifiers.nextIdentifier()) }
            if (tracks.size > MaximumQueueTracks || tracks.map { track -> track.occurrenceIdentifier }.toSet().size != tracks.size) fail(SpotifyPlayerFailureReason.InvalidInput)
            if (tracks.isEmpty()) apply(job, emptyList()) else resolve(job, tracks, EmptyCount, emptyList())
        } catch (failure: Throwable) { finish(job, null, safeFailure(failure, job.dispatched)) }
    }

    private fun resolve(job: Job, tracks: List<SpotifyHostTrack>, position: Int, recordings: List<Pair<SpotifyHostTrack, SpotifyHostRecordingResolution.Matched>>) {
        try {
            requireCurrent(job); requireCursor(coordinator.snapshot(), job)
            val track = tracks[position]
            if (!TrackIdentifierPattern.matches(track.spotifyTrackIdentifier) || track.occurrenceIdentifier?.let(::validIdentifier) != true) fail(SpotifyPlayerFailureReason.InvalidInput)
            val operation = resolver.resolve(job.identity, track.spotifyTrackIdentifier)
            synchronized(monitor) { if (job.completion.isDone) operation.cancel() else job.resolution = operation }
            operation.result.whenComplete { resolution, failure ->
                dispatch({ dispatchFailure -> finish(job, null, safeFailure(dispatchFailure, job.dispatched)) }) {
                    try {
                        requireCurrent(job); requireCursor(coordinator.snapshot(), job)
                        if (failure != null) throw failure
                        val selected = resolution as? SpotifyHostRecordingResolution.Matched ?: fail(SpotifyPlayerFailureReason.Unavailable)
                        if (listOf(selected.recordingIdentifier, selected.title, selected.artist).any { text -> text.isBlank() || text.length > MaximumRecordingTextCharacters }) fail(SpotifyPlayerFailureReason.InvalidResponse)
                        val completed = recordings + (track to selected)
                        val nextPosition = position + PositionIncrement
                        if (nextPosition < tracks.size) resolve(job, tracks, nextPosition, completed) else apply(job, completed)
                    } catch (resolutionFailure: Throwable) { finish(job, null, safeFailure(resolutionFailure, job.dispatched)) }
                }
            }
        } catch (failure: Throwable) { finish(job, null, safeFailure(failure, job.dispatched)) }
    }

    private fun apply(job: Job, recordings: List<Pair<SpotifyHostTrack, SpotifyHostRecordingResolution.Matched>>) {
        requireCurrent(job)
        val before = coordinator.snapshot(); requireCursor(before, job)
        val action = job.request.command
        val current = before.optJSONObject(ProtocolFields.CurrentEntry)?.getString(ProtocolFields.EntryIdentifier)
        val operation = when (action) {
            SpotifyHostCommand.Resume -> PlayerOperation.Play
            SpotifyHostCommand.Pause -> PlayerOperation.Pause
            SpotifyHostCommand.Next -> { if (!boolean(before, ProtocolFields.CanNext)) fail(SpotifyPlayerFailureReason.Conflict); PlayerOperation.Next }
            SpotifyHostCommand.Previous -> { if (!boolean(before, ProtocolFields.CanPrevious)) fail(SpotifyPlayerFailureReason.Conflict); PlayerOperation.Previous }
            is SpotifyHostCommand.Seek -> {
                if (!boolean(before, ProtocolFields.CanSeek) || action.positionMilliseconds < QueueNumbers.MinimumPositionMilliseconds
                    || before.isNull(ProtocolFields.DurationMilliseconds) || action.positionMilliseconds >= integer(before, ProtocolFields.DurationMilliseconds)) fail(SpotifyPlayerFailureReason.InvalidInput)
                PlayerOperation.Seek
            }
            is SpotifyHostCommand.AddToQueue -> PlayerOperation.Append
            is SpotifyHostCommand.Play -> { if (recordings.isEmpty()) fail(SpotifyPlayerFailureReason.InvalidInput); PlayerOperation.Replace }
        }
        if (operation != PlayerOperation.Append && operation != PlayerOperation.Replace && current == null) fail(SpotifyPlayerFailureReason.Conflict)
        val requestIdentifier = identifiers.nextIdentifier()
        if (!validIdentifier(requestIdentifier)) fail(SpotifyPlayerFailureReason.InvalidInput)
        val command = JSONObject().put(ProtocolFields.Operation, operation.protocolValue).put(ProtocolFields.RequestIdentifier, requestIdentifier)
            .put(ProtocolFields.EngineEpoch, job.identity.playerIdentity.engineEpoch).put(ProtocolFields.AuthenticationEpoch, job.identity.playerIdentity.authenticationEpoch)
            .put(ProtocolFields.ExpectedQueueIdentifier, job.expected.queueIdentifier).put(ProtocolFields.ExpectedQueueRevision, job.expected.queueRevision)
            .put(ProtocolFields.ExpectedPlaybackControlRevision, job.expected.controlRevision)
        if (action is SpotifyHostCommand.Seek) command.put(ProtocolFields.EntryIdentifier, current).put(ProtocolFields.PositionMilliseconds, action.positionMilliseconds)
        if (recordings.isNotEmpty()) {
            val entries = JSONArray()
            recordings.forEach { (track, recording) -> entries.put(JSONObject().put(ProtocolFields.EntryIdentifier, track.occurrenceIdentifier)
                .put(ProtocolFields.RecordingIdentifier, recording.recordingIdentifier).put(ProtocolFields.Title, recording.title).put(ProtocolFields.Artist, recording.artist)) }
            command.put(ProtocolFields.Entries, entries)
            if (action is SpotifyHostCommand.Play) command.put(ProtocolFields.ActiveEntryIdentifier, recordings.first().first.occurrenceIdentifier).put(ProtocolFields.PlayWhenReady, !action.initiallyPaused)
        }
        synchronized(monitor) { requireCurrent(job); job.dispatched = true }
        val receipt = JSONObject(coordinator.execute(command.toString()))
        requireCurrent(job)
        if (receipt.get(ProtocolFields.RequestIdentifier) != requestIdentifier) fail(SpotifyPlayerFailureReason.UnknownOutcome)
        val receiptCursor = receipt.getJSONObject(ProtocolFields.Cursor)
        if (receiptCursor.get(ProtocolFields.EngineEpoch) != job.identity.playerIdentity.engineEpoch || receiptCursor.get(ProtocolFields.AuthenticationEpoch) != job.identity.playerIdentity.authenticationEpoch) fail(SpotifyPlayerFailureReason.UnknownOutcome)
        when (receipt.get(ProtocolFields.Status)) {
            PlayerProtocol.AppliedStatus -> finish(job, SpotifyHostPlayerAccepted(job.request, snapshot(job.identity), recordings.map { recording -> recording.first }), null)
            PlayerProtocol.ConflictStatus -> finish(job, null, SpotifyPlayerFailure(SpotifyPlayerFailureReason.Conflict))
            PlayerProtocol.SupersededStatus -> finish(job, null, SpotifyPlayerFailure(SpotifyPlayerFailureReason.Superseded))
            else -> fail(SpotifyPlayerFailureReason.UnknownOutcome)
        }
    }

    private fun snapshot(identity: SpotifyHostIdentity): SpotifyHostPlayerSnapshot {
        if (!validIdentity(identity)) fail(SpotifyPlayerFailureReason.InvalidInput)
        if (retired || !isCurrent(identity)) fail(SpotifyPlayerFailureReason.Superseded)
        val value = coordinator.snapshot(); requireIdentity(value, identity)
        val state = value.getString(ProtocolFields.State)
        val ready = coordinator.playbackOutputReady() == true && state in ReadyStates
        val paused = value.getString(ProtocolFields.PlaybackIntent) == PauseIntent
        return SpotifyHostPlayerSnapshot(identity, cursor(value), value.optJSONObject(ProtocolFields.CurrentEntry)?.getString(ProtocolFields.EntryIdentifier),
            integer(value, ProtocolFields.PositionMilliseconds), if (value.isNull(ProtocolFields.DurationMilliseconds)) null else integer(value, ProtocolFields.DurationMilliseconds),
            integer(value, ProtocolFields.SampledAtMonotonicMilliseconds), ready, paused, state == PlayerProtocol.BufferingState || state == PlayerProtocol.ResolvingState)
    }
    private fun requireCursor(value: JSONObject, job: Job) { requireIdentity(value, job.identity); if (cursor(value) != job.expected) fail(SpotifyPlayerFailureReason.Conflict) }
    private fun requireIdentity(value: JSONObject, identity: SpotifyHostIdentity) {
        val selected = value.getJSONObject(ProtocolFields.Cursor)
        if (selected.get(ProtocolFields.EngineEpoch) != identity.playerIdentity.engineEpoch || selected.get(ProtocolFields.AuthenticationEpoch) != identity.playerIdentity.authenticationEpoch) fail(SpotifyPlayerFailureReason.Superseded)
        if (!value.has(ProtocolFields.ExternalAuthorityIdentifier) || !value.isNull(ProtocolFields.ExternalAuthorityIdentifier)) fail(SpotifyPlayerFailureReason.Conflict)
    }
    private fun cursor(value: JSONObject): SpotifyHostPlayerCursor {
        val selected = value.getJSONObject(ProtocolFields.Cursor)
        return SpotifyHostPlayerCursor(selected.getString(ProtocolFields.QueueIdentifier), integer(selected, ProtocolFields.QueueRevision), integer(selected, ProtocolFields.QueueContentRevision), integer(selected, ProtocolFields.PlaybackControlRevision))
    }
    private fun requireCurrent(job: Job) {
        if (job.completion.isDone) fail(if (job.dispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Cancelled)
        if (retired || !isCurrent(job.identity)) fail(if (job.dispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Superseded)
        if (elapsedMilliseconds() >= job.deadline) fail(if (job.dispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Cancelled)
    }
    private fun cancel(job: Job) { finish(job, null, SpotifyPlayerFailure(if (job.dispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Cancelled)) }
    private fun finish(job: Job, accepted: SpotifyHostPlayerAccepted?, failure: Throwable?) {
        val changed = synchronized(monitor) {
            if (job.completion.isDone) false else {
                if (failure != null) job.completion.completeExceptionally(failure) else job.completion.complete(requireNotNull(accepted))
                true
            }
        }
        if (changed) { job.timer?.cancel(); job.resolution?.cancel() }
    }
    private fun operation(job: Job): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> = SpotifyPlayerOperation(job.completion) { cancel(job) }
    private fun rejected(reason: SpotifyPlayerFailureReason): SpotifyPlayerOperation<SpotifyHostPlayerAccepted> = SpotifyPlayerOperation(CompletableFuture<SpotifyHostPlayerAccepted>().also { result -> result.completeExceptionally(SpotifyPlayerFailure(reason)) }) {}
    private fun dispatch(rejected: (Throwable) -> Unit, action: () -> Unit) { try { mainExecutor.execute(action) } catch (failure: Throwable) { rejected(failure) } }
    private fun safeFailure(failure: Throwable, dispatched: Boolean): SpotifyPlayerFailure = if (failure is SpotifyPlayerFailure) failure else SpotifyPlayerFailure(if (dispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.InvalidResponse)
    private fun boolean(value: JSONObject, field: String): Boolean = value.get(field) as? Boolean ?: fail(SpotifyPlayerFailureReason.InvalidResponse)
    private fun integer(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail(SpotifyPlayerFailureReason.InvalidResponse)
        if (!number.toDouble().isFinite() || number.toDouble() != number.toLong().toDouble() || number.toLong() < QueueNumbers.MinimumPositionMilliseconds || number.toLong() > QueueNumbers.MaximumSafeInteger) fail(SpotifyPlayerFailureReason.InvalidResponse)
        return number.toLong()
    }
    private fun validIdentifier(value: String): Boolean = value.isNotBlank() && value.length <= MaximumIdentifierCharacters && value.none { character -> character.isWhitespace() || character.isISOControl() }
    private fun validIdentity(identity: SpotifyHostIdentity): Boolean = listOf(identity.streamingServiceAccountIdentifier, identity.spotifyAccountIdentifier, identity.jamSessionIdentifier,
        identity.deviceIdentifier, identity.playerIdentity.engineEpoch, identity.playerIdentity.authenticationEpoch).all(::validIdentifier)
        && identity.handle >= FirstNativeIdentifier && identity.handle <= QueueNumbers.MaximumSafeInteger
        && identity.generation >= FirstNativeIdentifier && identity.generation <= QueueNumbers.MaximumSafeInteger
    private fun fail(reason: SpotifyPlayerFailureReason): Nothing = throw SpotifyPlayerFailure(reason)
    private class Job(val identity: SpotifyHostIdentity, val expected: SpotifyHostPlayerCursor, val request: SpotifyHostCommandRequest, val deadline: Long) {
        val completion = CompletableFuture<SpotifyHostPlayerAccepted>()
        @Volatile var dispatched = false
        var resolution: SpotifyPlayerOperation<SpotifyHostRecordingResolution>? = null
        var timer: SpotifyNativeFollowerCancellation? = null
    }
    companion object {
        private const val MaximumIdentifierCharacters = 512
        private const val MaximumRecordingTextCharacters = 2048
        private const val FirstNativeIdentifier = 1L
        private const val MinimumMessageIdentifier = 0L
        private const val MaximumMessageIdentifier = 4294967295L
        private const val DefaultMaximumJournalEntries = 128
        private const val DefaultMaximumPendingCommands = 16
        private const val MaximumQueueTracks = 80
        private const val MaximumCommandLifetimeMilliseconds = 10000L
        private const val MinimumElapsedMilliseconds = 0L
        private const val EmptyCount = 0
        private const val PositionIncrement = 1
        private const val PauseIntent = "pause"
        private val ReadyStates = setOf(PlayerProtocol.PlayingState, PlayerProtocol.PausedState)
        private val TrackIdentifierPattern = Regex("[A-Za-z0-9]{22}")
    }
}

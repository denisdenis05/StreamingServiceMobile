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
    val buffering: Boolean,
    val externalAuthorityAbsent: Boolean
)
data class SpotifyHostQueueEntry(val occurrenceIdentifier: String, val recordingIdentifier: String)
data class SpotifyHostPlayerQueue(val snapshot: SpotifyHostPlayerSnapshot, val entries: List<SpotifyHostQueueEntry>,
    val shuffled: Boolean, val repeatMode: String, val playbackRate: Double)
data class SpotifyHostResolvedTrack(val track: SpotifyHostTrack, val recordingIdentifier: String)
data class SpotifyHostPlayerAccepted(val request: SpotifyHostCommandRequest, val snapshot: SpotifyHostPlayerSnapshot, val acceptedTracks: List<SpotifyHostTrack>, val resolvedTracks: List<SpotifyHostResolvedTrack>)

class SpotifyHostPlayerPort(
    private val coordinator: SpotifyPlayerCoordinator,
    private val mainExecutor: Executor,
    private val resolver: SpotifyHostRecordingResolver,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val elapsedMilliseconds: () -> Long,
    private val identifiers: SpotifyPlayerIdentifierSource,
    private val isCurrent: (SpotifyHostIdentity) -> Boolean,
    private val maximumJournalEntries: Int = DefaultMaximumJournalEntries,
    private val maximumPendingCommands: Int = DefaultMaximumPendingCommands,
    private val canExecute: (SpotifyHostIdentity) -> Boolean = isCurrent
) : SpotifyHostPlayer {
    private val monitor = Any()
    private val journal = LinkedHashMap<String, Job>()
    @Volatile private var retired = false
    private var knownMappings = emptyList<SpotifyHostRecordingMapping>()

    init { require(maximumJournalEntries > EmptyCount && maximumPendingCommands > EmptyCount) }

    override fun rememberMappings(mappings: List<SpotifyHostRecordingMapping>) {
        if (mappings.size > MaximumQueueTracks || mappings.map { mapping -> mapping.occurrenceIdentifier }.toSet().size != mappings.size
            || mappings.any { mapping -> !validIdentifier(mapping.occurrenceIdentifier) || !validIdentifier(mapping.recordingIdentifier)
                || !TrackIdentifierPattern.matches(mapping.spotifyTrackIdentifier) }) fail(SpotifyPlayerFailureReason.InvalidInput)
        synchronized(monitor) { knownMappings = mappings.toList() }
    }

    fun sample(identity: SpotifyHostIdentity): CompletableFuture<SpotifyHostPlayerSnapshot> {
        val completion = CompletableFuture<SpotifyHostPlayerSnapshot>()
        dispatch({ completion.completeExceptionally(it) }) {
            try { completion.complete(snapshot(identity)) } catch (failure: Throwable) { completion.completeExceptionally(safeFailure(failure, false)) }
        }
        return completion
    }

    override fun sampleQueue(identity: SpotifyHostIdentity): CompletableFuture<SpotifyHostPlayerQueue> {
        val completion = CompletableFuture<SpotifyHostPlayerQueue>()
        dispatch({ completion.completeExceptionally(it) }) {
            try {
                val sampled = snapshot(identity)
                val value = coordinator.snapshot()
                requireIdentity(value, identity)
                if (cursor(value) != sampled.cursor) fail(SpotifyPlayerFailureReason.Conflict)
                val length = integer(value, ProtocolFields.QueueLength)
                if (length > MaximumQueueTracks) fail(SpotifyPlayerFailureReason.Unavailable)
                val identifier = identifiers.nextIdentifier()
                if (!validIdentifier(identifier)) fail(SpotifyPlayerFailureReason.InvalidInput)
                val command = JSONObject().put(ProtocolFields.Operation, PlayerOperation.Page.protocolValue)
                    .put(ProtocolFields.RequestIdentifier, identifier).put(ProtocolFields.EngineEpoch, identity.playerIdentity.engineEpoch)
                    .put(ProtocolFields.AuthenticationEpoch, identity.playerIdentity.authenticationEpoch)
                    .put(ProtocolFields.ExpectedQueueRevision, sampled.cursor.queueRevision).put(ProtocolFields.Offset, EmptyCount)
                    .put(ProtocolFields.Limit, MaximumQueueTracks)
                val response = JSONObject(coordinator.execute(command.toString()))
                if (response.get(ProtocolFields.Status) != PlayerProtocol.SuccessPageStatus) fail(SpotifyPlayerFailureReason.Conflict)
                val page = response.getJSONObject(ProtocolFields.Page)
                val entries = page.getJSONArray(ProtocolFields.Entries)
                if (cursor(page) != sampled.cursor) fail(SpotifyPlayerFailureReason.Conflict)
                if (integer(page, ProtocolFields.Offset) != EmptyCount.toLong()
                    || integer(page, ProtocolFields.TotalEntries) != length || entries.length().toLong() != length) fail(SpotifyPlayerFailureReason.InvalidResponse)
                val copied = (EmptyCount until entries.length()).map { position ->
                    val entry = entries.getJSONObject(position)
                    val occurrence = entry.getString(ProtocolFields.EntryIdentifier)
                    val recording = entry.getString(ProtocolFields.RecordingIdentifier)
                    if (!validIdentifier(occurrence) || !validIdentifier(recording)) fail(SpotifyPlayerFailureReason.InvalidResponse)
                    SpotifyHostQueueEntry(occurrence, recording)
                }
                if (copied.map { entry -> entry.occurrenceIdentifier }.toSet().size != copied.size) fail(SpotifyPlayerFailureReason.InvalidResponse)
                if (snapshot(identity).cursor != sampled.cursor) fail(SpotifyPlayerFailureReason.Conflict)
                val playbackRate = value.getDouble(ProtocolFields.PlaybackRate)
                if (!playbackRate.isFinite()) fail(SpotifyPlayerFailureReason.InvalidResponse)
                completion.complete(SpotifyHostPlayerQueue(sampled, copied, boolean(value, ProtocolFields.Shuffled),
                    value.getString(ProtocolFields.RepeatMode), playbackRate))
            } catch (failure: Throwable) { completion.completeExceptionally(safeFailure(failure, false)) }
        }
        return completion
    }

    override fun execute(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor, request: SpotifyHostCommandRequest,
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
            if (retired || !isCurrent(identity) || !canExecute(identity)) return rejected(SpotifyPlayerFailureReason.Superseded)
            if (journal.size >= maximumJournalEntries) journal.entries.firstOrNull { entry -> entry.value.completion.isDone }?.let { entry -> journal.remove(entry.key) }
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

    override fun pause(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor): CompletableFuture<Unit> {
        val completion = CompletableFuture<Unit>()
        dispatch({ completion.completeExceptionally(it) }) {
            var dispatched = false
            try {
                val before = snapshot(identity)
                if (before.cursor != expected) fail(SpotifyPlayerFailureReason.Conflict)
                if (!before.paused) {
                    val requestIdentifier = identifiers.nextIdentifier()
                    if (!validIdentifier(requestIdentifier)) fail(SpotifyPlayerFailureReason.InvalidInput)
                    val command = JSONObject().put(ProtocolFields.Operation, PlayerOperation.Pause.protocolValue)
                        .put(ProtocolFields.RequestIdentifier, requestIdentifier).put(ProtocolFields.EngineEpoch, identity.playerIdentity.engineEpoch)
                        .put(ProtocolFields.AuthenticationEpoch, identity.playerIdentity.authenticationEpoch)
                        .put(ProtocolFields.ExpectedQueueIdentifier, expected.queueIdentifier).put(ProtocolFields.ExpectedQueueRevision, expected.queueRevision)
                        .put(ProtocolFields.ExpectedPlaybackControlRevision, expected.controlRevision)
                    dispatched = true
                    val receipt = JSONObject(coordinator.execute(command.toString()))
                    if (receipt.get(ProtocolFields.RequestIdentifier) != requestIdentifier || receipt.get(ProtocolFields.Status) != PlayerProtocol.AppliedStatus)
                        fail(SpotifyPlayerFailureReason.UnknownOutcome)
                    if (!snapshot(identity).paused) fail(SpotifyPlayerFailureReason.UnknownOutcome)
                }
                completion.complete(Unit)
            } catch (failure: Throwable) { completion.completeExceptionally(safeFailure(failure, dispatched)) }
        }
        return completion
    }

    override fun retire() {
        val jobs = synchronized(monitor) { retired = true; journal.values.filter { job -> !job.completion.isDone } }
        jobs.forEach(::cancel)
    }

    private fun prepare(job: Job) {
        try {
            requireCurrent(job)
            val snapshot = coordinator.snapshot()
            requireCursor(snapshot, job)
            val action = job.request.command
            if (action is SpotifyHostCommand.AddToQueue && integer(snapshot, ProtocolFields.QueueLength) >= MaximumQueueTracks) fail(SpotifyPlayerFailureReason.Capacity)
            if (action is SpotifyHostCommand.SetQueue && action.queueRevision != null
                && action.queueRevision != job.expected.queueIdentifier + QueueRevisionSeparator + job.expected.contentRevision) fail(SpotifyPlayerFailureReason.Conflict)
            if (action is SpotifyHostCommand.Select || action is SpotifyHostCommand.SetQueue || action is SpotifyHostCommand.Play && action.preservePosition || synchronized(monitor) { knownMappings.isNotEmpty() } && (action is SpotifyHostCommand.Play || action is SpotifyHostCommand.AddToQueue)) {
                job.queueEntries = readEntries(job)
            }
            val requestedTracks = when (action) {
                is SpotifyHostCommand.AddToQueue -> listOf(action.track)
                is SpotifyHostCommand.Play -> action.tracks
                is SpotifyHostCommand.SetQueue -> {
                    val current = snapshot.optJSONObject(ProtocolFields.CurrentEntry)?.getString(ProtocolFields.EntryIdentifier) ?: fail(SpotifyPlayerFailureReason.Conflict)
                    val mapping = synchronized(monitor) { knownMappings.find { known -> known.occurrenceIdentifier == current } }
                        ?: fail(SpotifyPlayerFailureReason.Unavailable)
                    action.previousTracks + SpotifyHostTrack(mapping.spotifyTrackIdentifier, current) + action.nextTracks
                }
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
            val known = synchronized(monitor) { knownMappings.filter { mapping -> mapping.spotifyTrackIdentifier == track.spotifyTrackIdentifier } }
            val cached = known.firstNotNullOfOrNull { mapping -> job.queueEntries.find { entry ->
                entry.getString(ProtocolFields.EntryIdentifier) == mapping.occurrenceIdentifier && entry.getString(ProtocolFields.RecordingIdentifier) == mapping.recordingIdentifier
            } }
            val operation = if (cached == null) resolver.resolve(job.identity, track.spotifyTrackIdentifier) else SpotifyPlayerOperation(
                CompletableFuture.completedFuture<SpotifyHostRecordingResolution>(SpotifyHostRecordingResolution.Matched(cached.getString(ProtocolFields.RecordingIdentifier),
                    cached.getString(ProtocolFields.Title), cached.getString(ProtocolFields.Artist)))) {}
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
        if (action is SpotifyHostCommand.SetQueue || action is SpotifyHostCommand.Play && action.preservePosition
            && recordings.any { recording -> recording.first.occurrenceIdentifier == current }) {
            reconcileQueue(job, before, recordings)
            return
        }
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
            is SpotifyHostCommand.Select -> PlayerOperation.Select
            is SpotifyHostCommand.SetQueue -> fail(SpotifyPlayerFailureReason.InvalidInput)
            is SpotifyHostCommand.AddToQueue -> PlayerOperation.Append
            is SpotifyHostCommand.Play -> { if (recordings.isEmpty()) fail(SpotifyPlayerFailureReason.InvalidInput); PlayerOperation.Replace }
        }
        if (operation != PlayerOperation.Append && operation != PlayerOperation.Replace && current == null) fail(SpotifyPlayerFailureReason.Conflict)
        val requestIdentifier = identifiers.nextIdentifier()
        if (!validIdentifier(requestIdentifier)) fail(SpotifyPlayerFailureReason.InvalidInput)
        val command = JSONObject().put(ProtocolFields.Operation, operation.protocolValue).put(ProtocolFields.RequestIdentifier, requestIdentifier)
            .put(ProtocolFields.EngineEpoch, job.identity.playerIdentity.engineEpoch).put(ProtocolFields.AuthenticationEpoch, job.identity.playerIdentity.authenticationEpoch)
            .put(ProtocolFields.ExpectedQueueIdentifier, job.cursor.queueIdentifier).put(ProtocolFields.ExpectedQueueRevision, job.cursor.queueRevision)
            .put(ProtocolFields.ExpectedPlaybackControlRevision, job.cursor.controlRevision)
        if (action is SpotifyHostCommand.Select) {
            val selected = selectedOccurrence(job, action)
            command.put(ProtocolFields.EntryIdentifier, selected).put(ProtocolFields.PlayWhenReady, action.initiallyPaused?.let { paused -> !paused } ?: (before.getString(ProtocolFields.PlaybackIntent) != PauseIntent))
        }
        if (action is SpotifyHostCommand.Seek) command.put(ProtocolFields.EntryIdentifier, current).put(ProtocolFields.PositionMilliseconds, action.positionMilliseconds)
        if (recordings.isNotEmpty()) {
            val entries = JSONArray()
            recordings.forEach { (track, recording) -> entries.put(JSONObject().put(ProtocolFields.EntryIdentifier, track.occurrenceIdentifier)
                .put(ProtocolFields.RecordingIdentifier, recording.recordingIdentifier).put(ProtocolFields.Title, recording.title).put(ProtocolFields.Artist, recording.artist)) }
            command.put(ProtocolFields.Entries, entries)
            if (action is SpotifyHostCommand.Play && action.selectedOccurrenceIdentifier != null
                && recordings.none { recording -> recording.first.occurrenceIdentifier == action.selectedOccurrenceIdentifier }) fail(SpotifyPlayerFailureReason.InvalidInput)
            if (action is SpotifyHostCommand.Play) command.put(ProtocolFields.ActiveEntryIdentifier, (action.selectedOccurrenceIdentifier ?: recordings.getOrNull(action.selectedTrackIndex ?: EmptyCount)?.first?.occurrenceIdentifier ?: fail(SpotifyPlayerFailureReason.InvalidInput))).put(ProtocolFields.PlayWhenReady, !action.initiallyPaused)
        }
        synchronized(monitor) { requireCurrent(job); job.dispatched = true }
        val receipt = JSONObject(coordinator.execute(command.toString()))
        requireCurrent(job)
        if (receipt.get(ProtocolFields.RequestIdentifier) != requestIdentifier) fail(SpotifyPlayerFailureReason.UnknownOutcome)
        val receiptCursor = receipt.getJSONObject(ProtocolFields.Cursor)
        if (receiptCursor.get(ProtocolFields.EngineEpoch) != job.identity.playerIdentity.engineEpoch || receiptCursor.get(ProtocolFields.AuthenticationEpoch) != job.identity.playerIdentity.authenticationEpoch) fail(SpotifyPlayerFailureReason.UnknownOutcome)
        when (receipt.get(ProtocolFields.Status)) {
            PlayerProtocol.AppliedStatus -> finish(job, SpotifyHostPlayerAccepted(job.request, snapshot(job.identity), recordings.map { recording -> recording.first }, recordings.map { recording -> SpotifyHostResolvedTrack(recording.first, recording.second.recordingIdentifier) }), null)
            PlayerProtocol.ConflictStatus -> finish(job, null, SpotifyPlayerFailure(SpotifyPlayerFailureReason.Conflict))
            PlayerProtocol.SupersededStatus -> finish(job, null, SpotifyPlayerFailure(SpotifyPlayerFailureReason.Superseded))
            else -> fail(SpotifyPlayerFailureReason.UnknownOutcome)
        }
    }

    private fun readEntries(job: Job): List<JSONObject> {
        requireCurrent(job)
        val value = coordinator.snapshot()
        requireCursor(value, job)
        if (integer(value, ProtocolFields.QueueLength) > MaximumQueueTracks) fail(SpotifyPlayerFailureReason.Unavailable)
        val requestIdentifier = identifiers.nextIdentifier()
        if (!validIdentifier(requestIdentifier)) fail(SpotifyPlayerFailureReason.InvalidInput)
        val request = JSONObject().put(ProtocolFields.Operation, PlayerOperation.Page.protocolValue)
            .put(ProtocolFields.RequestIdentifier, requestIdentifier).put(ProtocolFields.EngineEpoch, job.identity.playerIdentity.engineEpoch)
            .put(ProtocolFields.AuthenticationEpoch, job.identity.playerIdentity.authenticationEpoch)
            .put(ProtocolFields.ExpectedQueueRevision, job.cursor.queueRevision).put(ProtocolFields.Offset, EmptyCount).put(ProtocolFields.Limit, MaximumQueueTracks)
        val response = JSONObject(coordinator.execute(request.toString()))
        if (response.get(ProtocolFields.Status) != PlayerProtocol.SuccessPageStatus) fail(SpotifyPlayerFailureReason.Conflict)
        val page = response.getJSONObject(ProtocolFields.Page)
        val entries = page.getJSONArray(ProtocolFields.Entries)
        if (cursor(page) != job.cursor || integer(page, ProtocolFields.Offset) != EmptyCount.toLong()
            || integer(page, ProtocolFields.TotalEntries) != entries.length().toLong()) fail(SpotifyPlayerFailureReason.InvalidResponse)
        requireCurrent(job)
        requireCursor(coordinator.snapshot(), job)
        return (EmptyCount until entries.length()).map { position -> JSONObject(entries.getJSONObject(position).toString()) }
    }

    private fun selectedOccurrence(job: Job, action: SpotifyHostCommand.Select): String {
        val track = action.track
        val occurrence = action.occurrenceIdentifier ?: track?.occurrenceIdentifier
        if (track == null) {
            if (occurrence == null || !validIdentifier(occurrence) || job.queueEntries.none { entry -> entry.getString(ProtocolFields.EntryIdentifier) == occurrence }) {
                fail(SpotifyPlayerFailureReason.Unavailable)
            }
            return occurrence
        }
        val matches = synchronized(monitor) { knownMappings.filter { mapping -> mapping.spotifyTrackIdentifier == track.spotifyTrackIdentifier
            && (occurrence == null || mapping.occurrenceIdentifier == occurrence) } }
            .filter { mapping -> job.queueEntries.any { entry -> entry.getString(ProtocolFields.EntryIdentifier) == mapping.occurrenceIdentifier
                && entry.getString(ProtocolFields.RecordingIdentifier) == mapping.recordingIdentifier } }
        if (matches.size != SingleEntry) fail(SpotifyPlayerFailureReason.Unavailable)
        return matches.single().occurrenceIdentifier
    }

    private fun reconcileQueue(job: Job, before: JSONObject, recordings: List<Pair<SpotifyHostTrack, SpotifyHostRecordingResolution.Matched>>) {
        val action = job.request.command
        val current = before.optJSONObject(ProtocolFields.CurrentEntry)?.getString(ProtocolFields.EntryIdentifier) ?: fail(SpotifyPlayerFailureReason.Conflict)
        val selected = if (action is SpotifyHostCommand.Play) action.selectedOccurrenceIdentifier ?: recordings.getOrNull(action.selectedTrackIndex ?: EmptyCount)?.first?.occurrenceIdentifier else current
        val desired = recordings.map { recording -> recording.first.occurrenceIdentifier ?: fail(SpotifyPlayerFailureReason.InvalidInput) }
        if (selected !in desired || current !in desired) fail(SpotifyPlayerFailureReason.InvalidInput)
        val existing = job.queueEntries.associateBy { entry -> entry.getString(ProtocolFields.EntryIdentifier) }
        recordings.forEach { (track, recording) ->
            val original = existing[requireNotNull(track.occurrenceIdentifier)]
            if (original != null && original.getString(ProtocolFields.RecordingIdentifier) != recording.recordingIdentifier) fail(SpotifyPlayerFailureReason.InvalidInput)
        }
        val removed = existing.keys.filter { occurrence -> occurrence !in desired }
        if (removed.isNotEmpty()) executeQueueStep(job, PlayerOperation.Remove) { command -> command.put(ProtocolFields.EntryIdentifiers, JSONArray(removed)) }
        val appended = recordings.filter { recording -> recording.first.occurrenceIdentifier !in existing }
        if (appended.isNotEmpty()) executeQueueStep(job, PlayerOperation.Append) { command ->
            val entries = JSONArray()
            appended.forEach { (track, recording) -> entries.put(JSONObject().put(ProtocolFields.EntryIdentifier, track.occurrenceIdentifier)
                .put(ProtocolFields.RecordingIdentifier, recording.recordingIdentifier).put(ProtocolFields.Title, recording.title).put(ProtocolFields.Artist, recording.artist)) }
            command.put(ProtocolFields.Entries, entries)
        }
        val order = job.queueEntries.map { entry -> entry.getString(ProtocolFields.EntryIdentifier) }.filter { occurrence -> occurrence !in removed }.toMutableList()
        order.addAll(appended.map { recording -> requireNotNull(recording.first.occurrenceIdentifier) })
        var next: String? = null
        desired.asReversed().forEach { occurrence ->
            val actualPosition = order.indexOf(occurrence)
            val expectedPosition = if (next == null) order.lastIndex else order.indexOf(next) - PositionIncrement
            if (actualPosition != expectedPosition) {
                executeQueueStep(job, PlayerOperation.Move) { command -> command.put(ProtocolFields.EntryIdentifier, occurrence)
                    .put(ProtocolFields.BeforeEntryIdentifier, next ?: JSONObject.NULL) }
                order.remove(occurrence)
                val insertionPosition = if (next == null) order.size else order.indexOf(next)
                order.add(insertionPosition, occurrence)
            }
            next = occurrence
        }
        if (selected != current) executeQueueStep(job, PlayerOperation.Select) { command -> command.put(ProtocolFields.EntryIdentifier, selected)
            .put(ProtocolFields.PlayWhenReady, if (action is SpotifyHostCommand.Play) !action.initiallyPaused else before.getString(ProtocolFields.PlaybackIntent) != PauseIntent) }
        else if (action is SpotifyHostCommand.Play && action.initiallyPaused != (before.getString(ProtocolFields.PlaybackIntent) == PauseIntent)) {
            executeQueueStep(job, if (action.initiallyPaused) PlayerOperation.Pause else PlayerOperation.Play) {}
        }
        requireCurrent(job)
        finish(job, SpotifyHostPlayerAccepted(job.request, snapshot(job.identity), recordings.map { recording -> recording.first },
            recordings.map { recording -> SpotifyHostResolvedTrack(recording.first, recording.second.recordingIdentifier) }), null)
    }

    private fun executeQueueStep(job: Job, operation: PlayerOperation, augment: (JSONObject) -> Unit) {
        requireCurrent(job)
        requireCursor(coordinator.snapshot(), job)
        val identifier = identifiers.nextIdentifier()
        if (!validIdentifier(identifier)) fail(SpotifyPlayerFailureReason.InvalidInput)
        val command = JSONObject().put(ProtocolFields.Operation, operation.protocolValue).put(ProtocolFields.RequestIdentifier, identifier)
            .put(ProtocolFields.EngineEpoch, job.identity.playerIdentity.engineEpoch).put(ProtocolFields.AuthenticationEpoch, job.identity.playerIdentity.authenticationEpoch)
            .put(ProtocolFields.ExpectedQueueIdentifier, job.cursor.queueIdentifier).put(ProtocolFields.ExpectedQueueRevision, job.cursor.queueRevision)
            .put(ProtocolFields.ExpectedPlaybackControlRevision, job.cursor.controlRevision)
        augment(command)
        synchronized(monitor) { requireCurrent(job); job.dispatched = true }
        val receipt = JSONObject(coordinator.execute(command.toString()))
        requireCurrent(job)
        if (receipt.get(ProtocolFields.RequestIdentifier) != identifier || receipt.get(ProtocolFields.Status) != PlayerProtocol.AppliedStatus) fail(SpotifyPlayerFailureReason.UnknownOutcome)
        val accepted = snapshot(job.identity)
        if (cursor(receipt) != accepted.cursor) fail(SpotifyPlayerFailureReason.UnknownOutcome)
        job.cursor = accepted.cursor
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
            integer(value, ProtocolFields.SampledAtMonotonicMilliseconds), ready, paused, state == PlayerProtocol.BufferingState || state == PlayerProtocol.ResolvingState, value.isNull(ProtocolFields.ExternalAuthorityIdentifier))
    }
    private fun requireCursor(value: JSONObject, job: Job) { requireIdentity(value, job.identity); if (cursor(value) != job.cursor) fail(SpotifyPlayerFailureReason.Conflict) }
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
        if (retired || !isCurrent(job.identity) || !canExecute(job.identity)) fail(if (job.dispatched) SpotifyPlayerFailureReason.UnknownOutcome else SpotifyPlayerFailureReason.Superseded)
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
        var cursor = expected
        var queueEntries = emptyList<JSONObject>()
        @Volatile var dispatched = false
        var resolution: SpotifyPlayerOperation<SpotifyHostRecordingResolution>? = null
        var timer: SpotifyNativeFollowerCancellation? = null
    }
    companion object {
        private const val MaximumIdentifierCharacters = SpotifyHostingPolicy.MaximumIdentifierCharacters
        private const val MaximumRecordingTextCharacters = 2048
        private const val FirstNativeIdentifier = 1L
        private const val MinimumMessageIdentifier = 0L
        private const val MaximumMessageIdentifier = 4294967295L
        private const val DefaultMaximumJournalEntries = 128
        private const val DefaultMaximumPendingCommands = 16
        private const val MaximumQueueTracks = SpotifyHostingPolicy.MaximumQueueTracks
        private const val MaximumCommandLifetimeMilliseconds = SpotifyHostingPolicy.MaximumIncomingCommandLifetimeMilliseconds
        private const val MinimumElapsedMilliseconds = 0L
        private const val EmptyCount = 0
        private const val SingleEntry = 1
        private const val QueueRevisionSeparator = ":"
        private const val PositionIncrement = 1
        private const val PauseIntent = "pause"
        private val ReadyStates = setOf(PlayerProtocol.PlayingState, PlayerProtocol.PausedState)
        private val TrackIdentifierPattern = Regex("[A-Za-z0-9]{22}")
    }
}

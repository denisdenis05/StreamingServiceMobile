package com.streamingservice.spotify

import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

enum class SpotifyHostStatus { Starting, Resolving, Hosting, Stopping, Stopped, Failed }
enum class SpotifyHostFailureStage { NativeActivation, Publication, CatalogMatching, Cleanup }
data class SpotifyHostSnapshot(val identity: SpotifyHostIdentity, val status: SpotifyHostStatus, val failure: String? = null, val failureStage: SpotifyHostFailureStage? = null)

class SpotifyHostCoordinator(
    private val identity: SpotifyHostIdentity,
    private val player: SpotifyHostPlayer,
    private val transport: SpotifyHostControlTransport,
    private val clock: SpotifyNativeFollowerClock,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val executor: Executor,
    private val identifiers: SpotifyPlayerIdentifierSource,
    private val isCurrent: (SpotifyHostIdentity) -> Boolean,
    private val observer: (SpotifyHostSnapshot) -> Unit = {},
    private val mappingSource: SpotifyHostQueueMappingSource? = null
) : SpotifyHostSessionCoordinator {
    private val projector = SpotifyHostPublicationProjector(clock)
    private val publicationCadence = SpotifyHostPublicationCadence()
    private val started = CompletableFuture<SpotifyHostSnapshot>()
    private val stopped = CompletableFuture<Unit>()
    @Volatile private var requested = false
    @Volatile private var closing = false
    private var waitingForPlayerSinceElapsedMilliseconds: Long? = null
    private var publicationRequested = false
    private var activationAttempted = false
    private var registration: SpotifyHostNativeRegistration? = null
    private var sequence = FirstSequence
    private var activeSinceServerMilliseconds: Long? = null
    private var lastCursor: SpotifyHostPlayerCursor? = null
    private var mappings = emptyList<SpotifyHostRecordingMapping>()
    private var acceptedCommand: SpotifyHostPlayerAccepted? = null
    private var work: CompletableFuture<*>? = null
    private var cancelWork: (() -> Unit)? = null
    private var mutationPending = false
    private var startupTimer: SpotifyNativeFollowerCancellation? = null
    private var timer: SpotifyNativeFollowerCancellation? = null
    @Volatile private var resolving = false
    private var stage = SpotifyHostFailureStage.NativeActivation
    private var failureStage: SpotifyHostFailureStage? = null
    @Volatile private var failure: String? = null
    @Volatile private var currentSnapshot = SpotifyHostSnapshot(identity, SpotifyHostStatus.Stopped)
    private val dispatcher = SpotifyHostCommandDispatcher(identity, player, transport, SpotifyHostCommandEventDecoder(clock), clock, scheduler,
        { selected -> selected == identity && !resolving && current() }, { receipt -> decide { remember(receipt) } }, { decide { terminate(CommandFailed) } })

    override fun snapshot(): SpotifyHostSnapshot = currentSnapshot
    override fun commandHandlingReady(selected: SpotifyHostIdentity): Boolean = selected == identity && !closing && requested && dispatcher.isReady(selected)
    override fun accept(batch: SpotifyConnectBatch) = dispatcher.accept(batch)

    @Synchronized override fun start(previousHostDeviceIdentifier: String, expectedCursor: SpotifyHostPlayerCursor,
        initialMappings: List<SpotifyHostRecordingMapping>): CompletableFuture<SpotifyHostSnapshot> {
        if (requested || closing) return started
        requested = true
        if (initialMappings.size > MaximumMappings || !current()) { terminate(Superseded); return started }
        mappings = initialMappings.toList()
        publish(SpotifyHostStatus.Starting)
        if (closing) return started
        try {
            startupTimer = scheduler.schedule(StartupTimeoutMilliseconds) { decide { if (!started.isDone) terminate(Deadline) } }
            if (closing) { startupTimer?.cancel(); startupTimer = null; return started }
            perform(transport.registration(identity)) { actual ->
                registration = actual; sequence = actual.nextPublicationSequence
                perform(transport.preflight(identity, previousHostDeviceIdentifier)) { anchor ->
                    sample { queue ->
                        if (queue.snapshot.cursor != expectedCursor) throw SpotifyConnectFailure(Superseded)
                        lastCursor = queue.snapshot.cursor
                        val publication = project(queue, anchor)
                        val activation = projector.activation(identifiers.nextIdentifier(), anchor)
                        activeSinceServerMilliseconds = publication.getLong(ActiveSinceField)
                        dispatcher.setAccepting()
                        activationAttempted = true
                        perform(transport.activate(identity, queue, publication, activation), true) {
                            publicationCadence.published(queue, mappings, clock.nowElapsedRealtimeMilliseconds())
                            perform(transport.preflight(identity, identity.deviceIdentifier)) confirmed@{
                                startupTimer?.cancel(); startupTimer = null
                                publish(SpotifyHostStatus.Hosting)
                                if (closing) return@confirmed
                                started.complete(currentSnapshot)
                                schedule()
                            }
                        }
                    }
                }
            }
        } catch (failure: Throwable) { terminate(safeCode(failure)) }
        return started
    }

    @Synchronized override fun stop(): CompletableFuture<Unit> {
        if (closing) return stopped
        closing = true
        timer?.cancel(); timer = null
        startupTimer?.cancel(); startupTimer = null
        dispatcher.retire()
        publish(SpotifyHostStatus.Stopping)
        if (!started.isDone) started.completeExceptionally(SpotifyConnectFailure(failure ?: Canceled))
        val pending = work
        if (!mutationPending) try { cancelWork?.invoke() } catch (_failure: Throwable) { Unit }
        if (pending == null) cleanup() else pending.whenComplete { _, _ -> decide { cleanup() } }
        return stopped
    }

    private fun remember(receipt: SpotifyHostPlayerAccepted) {
        if (closing || !current() || receipt.snapshot.identity != identity) return
        lastCursor = receipt.snapshot.cursor
        acceptedCommand = receipt
        val additions = receipt.resolvedTracks.map { resolved ->
            SpotifyHostRecordingMapping(requireNotNull(resolved.track.occurrenceIdentifier), resolved.recordingIdentifier, resolved.track.spotifyTrackIdentifier)
        }
        val replaced = additions.map { mapping -> mapping.occurrenceIdentifier }.toSet()
        mappings = mappings.filterNot { mapping -> mapping.occurrenceIdentifier in replaced } + additions
        if (mappings.size > MaximumMappings) terminate(Capacity)
    }

    override fun publishLocalChanges(): CompletableFuture<Unit> {
        val completion = CompletableFuture<Unit>()
        decide {
            if (closing || !started.isDone || started.isCompletedExceptionally || !current()) completion.completeExceptionally(SpotifyConnectFailure(Superseded))
            else {
                timer?.cancel(); timer = null
                if (work != null) publicationRequested = true else refresh()
                completion.complete(Unit)
            }
        }
        return completion
    }
    private fun schedule() {
        if (closing) return
        if (publicationRequested) { publicationRequested = false; refresh(); return }
        timer?.cancel()
        try { timer = scheduler.schedule(PublishIntervalMilliseconds) { decide { if (!closing) refresh() } } }
        catch (_failure: Throwable) { terminate(Backpressure) }
    }
    private fun refresh() {
        if (closing || work != null) return
        if (!current()) { terminate(Superseded); return }
        stage = SpotifyHostFailureStage.Publication
        sample { queue ->
            lastCursor = queue.snapshot.cursor
            queue.entries.forEach { entry ->
                if (mappings.none { mapping -> mapping.recordingIdentifier == entry.recordingIdentifier }) {
                    mappingSource?.cached(identity, entry.recordingIdentifier)?.let { track ->
                        mappings = mappings + SpotifyHostRecordingMapping(entry.occurrenceIdentifier, entry.recordingIdentifier, track)
                    }
                }
            }
            val missing = queue.entries.firstOrNull { entry -> mappings.none { mapping -> mapping.recordingIdentifier == entry.recordingIdentifier } }
            if (missing != null && mappingSource != null) {
                resolve(queue, missing); return@sample
            }
            if (queue.snapshot.buffering && queue.snapshot.durationMilliseconds == null && queue.snapshot.externalAuthorityAbsent
                && queue.entries.any { entry -> entry.occurrenceIdentifier == queue.snapshot.occurrenceIdentifier }) {
                val now = clock.nowElapsedRealtimeMilliseconds()
                val waitingSince = waitingForPlayerSinceElapsedMilliseconds ?: now.also { waitingForPlayerSinceElapsedMilliseconds = it }
                if (now < waitingSince || now - waitingSince >= MaximumPlayerPreparationMilliseconds) throw SpotifyConnectFailure(Deadline)
                schedule(); return@sample
            }
            waitingForPlayerSinceElapsedMilliseconds = null
            if (!publicationCadence.shouldPublish(queue, mappings, acceptedCommand != null, clock.nowElapsedRealtimeMilliseconds())) {
                schedule(); return@sample
            }
            perform(transport.preflight(identity, identity.deviceIdentifier)) { anchor ->
                val publication = project(queue, anchor)
                val provenance = acceptedCommand
                val publishedMappings = mappings.toList()
                perform(transport.publish(identity, publication), true) {
                    publicationCadence.published(queue, publishedMappings, clock.nowElapsedRealtimeMilliseconds())
                    if (acceptedCommand === provenance) acceptedCommand = null
                    val recordings = queue.entries.map { entry -> entry.recordingIdentifier }.toSet()
                    mappings = mappings.filter { mapping -> mapping.recordingIdentifier in recordings }
                    schedule()
                }
            }
        }
    }
    private fun resolve(queue: SpotifyHostPlayerQueue, entry: SpotifyHostQueueEntry) {
        stage = SpotifyHostFailureStage.CatalogMatching
        resolving = true
        publish(SpotifyHostStatus.Resolving)
        if (closing) return
        val pause = player.pause(identity, queue.snapshot.cursor)
        performFuture(pause, {}, false) {
            perform(requireNotNull(mappingSource).resolve(identity, entry.recordingIdentifier)) { track ->
                mappings = mappings + SpotifyHostRecordingMapping(entry.occurrenceIdentifier, entry.recordingIdentifier, track)
                resolving = false
                publish(SpotifyHostStatus.Hosting)
                refresh()
            }
        }
    }
    private fun project(queue: SpotifyHostPlayerQueue, anchor: SpotifyHostClockAnchor): JSONObject {
        if (sequence !in FirstSequence..MaximumSafeInteger) throw SpotifyConnectFailure(SequenceExhausted)
        val publication = projector.project(queue, mappings, requireNotNull(registration).identity, anchor, sequence,
            activeSinceServerMilliseconds, acceptedCommand?.takeIf { receipt -> receipt.snapshot.cursor == queue.snapshot.cursor }?.request)
        sequence += SequenceIncrement
        return publication
    }

    private fun cleanup() {
        if (stopped.isDone) return
        work = null; cancelWork = null; mutationPending = false
        val cursor = lastCursor
        val pause = if (cursor == null) CompletableFuture.completedFuture(Unit)
            else try { player.pause(identity, cursor) } catch (failure: Throwable) { failedFuture(failure) }
        pause.whenComplete { _, pauseFailure -> decide {
            if (pauseFailure != null && failure == null && !conflict(pauseFailure)) { failure = PlayerFailed; failureStage = SpotifyHostFailureStage.Cleanup }
            if (!activationAttempted) finishCleanup(null)
            else cleanupOperation(transport.registration(identity)) { actual ->
                cleanupOperation(transport.withdraw(identity, actual)) { finishCleanup(null) }
            }
        } }
    }
    private fun <Response> cleanupOperation(operation: SpotifyPlayerOperation<Response>, complete: (Response) -> Unit) {
        operation.result.whenComplete { response, failure -> decide {
            if (failure != null) finishCleanup(failure)
            else try { complete(response) } catch (failure: Throwable) { finishCleanup(failure) }
        } }
    }
    private fun finishCleanup(cleanupFailure: Throwable?) {
        if (stopped.isDone) return
        player.retire()
        if (cleanupFailure != null) { failure = CleanupFailed; failureStage = SpotifyHostFailureStage.Cleanup }
        publish(if (failure == null) SpotifyHostStatus.Stopped else SpotifyHostStatus.Failed)
        if (cleanupFailure == null) stopped.complete(Unit) else stopped.completeExceptionally(SpotifyConnectFailure(CleanupFailed))
    }
    private fun sample(complete: (SpotifyHostPlayerQueue) -> Unit) {
        try { performFuture(player.sampleQueue(identity), {}, false, complete) } catch (failure: Throwable) { terminate(safeCode(failure)) }
    }
    private fun <Response> perform(operation: SpotifyPlayerOperation<Response>, mutation: Boolean = false, complete: (Response) -> Unit) =
        performFuture(operation.result, operation::cancel, mutation, complete)
    private fun <Response> performFuture(completion: CompletableFuture<Response>, cancel: () -> Unit, mutation: Boolean, complete: (Response) -> Unit) {
        work = completion; cancelWork = cancel; mutationPending = mutation
        completion.whenComplete { response, failure -> decide {
            if (closing || work !== completion) return@decide
            work = null; cancelWork = null; mutationPending = false
            if (failure != null) terminate(safeCode(failure))
            else if (!current()) terminate(Superseded)
            else try { complete(response) } catch (failure: Throwable) { terminate(safeCode(failure)) }
        } }
    }
    private fun terminate(code: String) {
        if (closing) return
        failure = code
        failureStage = stage
        stop()
    }
    private fun publish(status: SpotifyHostStatus) {
        currentSnapshot = SpotifyHostSnapshot(identity, status, failure, failureStage)
        try { observer(currentSnapshot) } catch (_failure: Throwable) { Unit }
    }
    private fun decide(action: () -> Unit) {
        fun run() = synchronized(this) {
            try { action() } catch (failure: Throwable) {
                if (closing) finishCleanup(failure) else terminate(safeCode(failure))
            }
        }
        try { executor.execute { run() } }
        catch (_failure: Throwable) { synchronized(this) {
            if (closing) run() else { failure = Backpressure; failureStage = stage; stop() }
        } }
    }
    private fun current(): Boolean = try { isCurrent(identity) } catch (_failure: Throwable) { false }
    private fun safeCode(failure: Throwable): String {
        var cause = failure
        val visited = mutableSetOf<Throwable>()
        while (visited.add(cause) && (cause is java.util.concurrent.CompletionException || cause is java.util.concurrent.ExecutionException)) {
            cause = cause.cause ?: break
        }
        return (cause as? SpotifyConnectFailure)?.code
            ?.takeIf { code -> SpotifyConnectFailureCode.entries.any { selected -> selected.wireValue == code } } ?: PlayerFailed
    }
    private fun conflict(failure: Throwable): Boolean = (failure as? SpotifyPlayerFailure)?.reason == SpotifyPlayerFailureReason.Conflict
    private fun failedFuture(failure: Throwable) = CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(failure) }
    companion object {
        private const val FirstSequence = 1L
        private const val SequenceIncrement = 1L
        private const val MaximumSafeInteger = SpotifyHostingPolicy.MaximumSafeInteger
        private const val MappingRetentionFactor = 2
        private const val MaximumMappings = SpotifyHostingPolicy.MaximumQueueTracks * MappingRetentionFactor
        private const val StartupTimeoutMilliseconds = 15000L
        private const val Deadline = "deadline"
        private const val PublishIntervalMilliseconds = SpotifyHostingPolicy.HostPlayerSampleIntervalMilliseconds
        private const val MaximumPlayerPreparationMilliseconds = 15000L
        private const val ActiveSinceField = "activeSinceServerTimestampMilliseconds"
        private const val Superseded = "superseded"
        private const val Canceled = "canceled"
        private const val Capacity = "backpressure"
        private const val Backpressure = "backpressure"
        private const val CommandFailed = "host-command-failed"
        private const val PlayerFailed = "host-player-failed"
        private const val CleanupFailed = "host-cleanup-failed"
        private const val SequenceExhausted = "sequence-exhausted"
    }
}

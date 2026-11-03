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
    private var currentResolution: SpotifyPlayerOperation<String>? = null
    private var observedCurrent: Pair<String, String>? = null
    private var failedCurrent: Pair<String, String>? = null
    private var currentMatchingFailure: String? = null
    private var acknowledgedQueue: SpotifyHostPlayerQueue? = null
    private var acknowledgedMappings = emptyList<SpotifyHostRecordingMapping>()
    private var localOperationIdentifier: String? = null
    private var spotifyOperationIdentifier: String? = null
    private val publicationWaiters = mutableListOf<CompletableFuture<Unit>>()
    private var backgroundResolution: SpotifyPlayerOperation<String>? = null
    private var backgroundRecordingIdentifier: String? = null
    private val attemptedBackgroundRecordings = mutableSetOf<String>()
    private var backgroundMatchingAvailable = true
    private var nextBackgroundResolutionElapsedMilliseconds = Long.MAX_VALUE
    private var mutationPending = false
    private var startupTimer: SpotifyNativeFollowerCancellation? = null
    private var timer: SpotifyNativeFollowerCancellation? = null
    @Volatile private var resolving = false
    private var stage = SpotifyHostFailureStage.NativeActivation
    private var failureStage: SpotifyHostFailureStage? = null
    @Volatile private var failure: String? = null
    @Volatile private var currentSnapshot = SpotifyHostSnapshot(identity, SpotifyHostStatus.Stopped)
    private val dispatcher = SpotifyHostCommandDispatcher(identity, player, transport, SpotifyHostCommandEventDecoder(clock), clock, scheduler,
        { selected -> selected == identity && current() }, { receipt -> decide { remember(receipt) } }, { decide { terminate(CommandFailed) } })

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
                            acknowledgedQueue = queue; acknowledgedMappings = mappings.toList()
                            perform(transport.preflight(identity, identity.deviceIdentifier)) confirmed@{
                                startupTimer?.cancel(); startupTimer = null
                                nextBackgroundResolutionElapsedMilliseconds = clock.nowElapsedRealtimeMilliseconds() + BackgroundCatalogMinimumIntervalMilliseconds
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
        val pendingCurrent = currentResolution; currentResolution = null
        try { pendingCurrent?.cancel() } catch (_failure: Throwable) { Unit }
        completePublicationWaiters(SpotifyConnectFailure(failure ?: Canceled))
        val pendingBackground = backgroundResolution
        backgroundResolution = null
        backgroundRecordingIdentifier = null
        try { pendingBackground?.cancel() } catch (_failure: Throwable) { Unit }
        publish(SpotifyHostStatus.Stopping)
        if (!started.isDone) started.completeExceptionally(SpotifyConnectFailure(failure ?: Canceled))
        val pending = work
        if (!mutationPending) try { cancelWork?.invoke() } catch (_failure: Throwable) { Unit }
        if (pending == null) cleanup() else pending.whenComplete { _, _ -> decide { cleanup() } }
        return stopped
    }

    private fun remember(receipt: SpotifyHostPlayerAccepted, acknowledgeRemote: Boolean = true) {
        if (closing || !current() || receipt.snapshot.identity != identity) return
        lastCursor = receipt.snapshot.cursor
        if (acknowledgeRemote) acceptedCommand = receipt
        val additions = receipt.resolvedTracks.map { resolved ->
            SpotifyHostRecordingMapping(requireNotNull(resolved.track.occurrenceIdentifier), resolved.recordingIdentifier, resolved.track.spotifyTrackIdentifier)
        }
        val replaced = additions.map { mapping -> mapping.occurrenceIdentifier }.toSet()
        mappings = mappings.filterNot { mapping -> mapping.occurrenceIdentifier in replaced } + additions
        if (observedCurrent?.let { target ->
                SpotifyHostRecordingMappings.select(SpotifyHostQueueEntry(target.first, target.second), mappings) != null } == true) {
            val previous = currentResolution; currentResolution = null
            try { previous?.cancel() } catch (_failure: Throwable) { Unit }
            failedCurrent = null; currentMatchingFailure = null
        }
        if (mappings.size > MaximumMappings) terminate(Capacity)
    }

    override fun publishLocalChanges(): CompletableFuture<Unit> {
        val completion = CompletableFuture<Unit>()
        decide {
            if (closing || !started.isDone || started.isCompletedExceptionally || !current()) completion.completeExceptionally(SpotifyConnectFailure(Superseded))
            else {
                publicationWaiters.add(completion)
                timer?.cancel(); timer = null
                if (work != null) publicationRequested = true else refresh()
            }
        }
        return completion
    }
    private fun rememberCachedMappings(queue: SpotifyHostPlayerQueue) {
        queue.entries.forEach { entry ->
            if (mappings.none { mapping -> mapping.occurrenceIdentifier == entry.occurrenceIdentifier && mapping.recordingIdentifier == entry.recordingIdentifier }) {
                (mappingSource?.cached(identity, entry.recordingIdentifier) ?: SpotifyHostRecordingMappings.select(entry, mappings))?.let { track ->
                    mappings = mappings + SpotifyHostRecordingMapping(entry.occurrenceIdentifier, entry.recordingIdentifier, track)
                }
            }
        }
    }
    override fun readQueue(side: String): CompletableFuture<String> {
        val completion = CompletableFuture<String>()
        decide {
            try {
                SpotifyControllableQueueProtocol.requireSide(side)
                if (closing || !current()) throw SpotifyConnectFailure(Superseded)
                if (side == SpotifyControllableQueueProtocol.SpotifySide) {
                    val acknowledged = acknowledgedQueue ?: throw SpotifyConnectFailure(Superseded)
                    completion.complete(SpotifyControllableQueueProtocol.encode(acknowledged, acknowledgedMappings, spotifyOperationIdentifier, true))
                } else {
                    player.sampleQueue(identity).whenComplete { queue, samplingFailure -> decide {
                        if (samplingFailure != null || closing || !current()) completion.completeExceptionally(samplingFailure ?: SpotifyConnectFailure(Superseded))
                        else {
                            rememberCachedMappings(queue)
                            completion.complete(SpotifyControllableQueueProtocol.encode(queue, mappings, localOperationIdentifier))
                        }
                    } }
                }
            } catch (failure: Throwable) { completion.completeExceptionally(failure) }
        }
        return completion
    }
    override fun applyQueue(side: String, serialized: String): CompletableFuture<String> {
        val completion = CompletableFuture<String>()
        decide {
            try {
                SpotifyControllableQueueProtocol.requireSide(side)
                val change = SpotifyControllableQueueProtocol.decode(serialized)
                if (closing || !current()) throw SpotifyConnectFailure(Superseded)
                val pending = work
                if (pending != null) {
                    pending.whenComplete { _, _ -> decide {
                        applyQueue(side, serialized).whenComplete { receipt, applyingFailure ->
                            if (applyingFailure != null) completion.completeExceptionally(applyingFailure) else completion.complete(receipt)
                        }
                    } }
                    return@decide
                }
                player.sampleQueue(identity).whenComplete { queue, samplingFailure -> decide applying@{
                    if (samplingFailure != null || closing || !current()) {
                        completion.completeExceptionally(samplingFailure ?: SpotifyConnectFailure(Superseded)); return@applying
                    }
                    try {
                        rememberCachedMappings(queue)
                        val target = if (side == SpotifyControllableQueueProtocol.LocalSide) queue else acknowledgedQueue ?: throw SpotifyConnectFailure(Superseded)
                        SpotifyControllableQueueProtocol.requireExpected(change, target)
                        if (side == SpotifyControllableQueueProtocol.SpotifySide) {
                            if (change.currentOccurrenceIdentifier != queue.snapshot.occurrenceIdentifier
                                || change.entries.any { entry -> queue.entries.none { actual -> actual.occurrenceIdentifier == entry.occurrenceIdentifier
                                    && actual.recordingIdentifier == entry.recordingIdentifier } }) throw SpotifyConnectFailure(Superseded)
                            val requestedOrder = change.entries.map { entry -> entry.occurrenceIdentifier }
                            if (queue.entries.filter { entry -> entry.occurrenceIdentifier in requestedOrder }.map { entry -> entry.occurrenceIdentifier } != requestedOrder) throw SpotifyConnectFailure(Superseded)
                            val additions = change.entries.map { entry -> SpotifyHostRecordingMapping(entry.occurrenceIdentifier,
                                requireNotNull(entry.recordingIdentifier), requireNotNull(entry.spotifyIdentifier)) }
                            val replaced = additions.map { entry -> entry.occurrenceIdentifier }.toSet()
                            mappings = mappings.filterNot { mapping -> mapping.occurrenceIdentifier in replaced } + additions
                            if (mappings.size > MaximumMappings) throw SpotifyConnectFailure(Capacity)
                            publishLocalChanges().whenComplete { _, publishingFailure -> decide {
                                if (publishingFailure != null || closing || !current()) completion.completeExceptionally(publishingFailure ?: SpotifyConnectFailure(Superseded))
                                else {
                                    val published = acknowledgedQueue
                                    if (published == null || published.snapshot.occurrenceIdentifier != change.currentOccurrenceIdentifier
                                        || change.entries.any { entry -> published.entries.none { actual -> actual.occurrenceIdentifier == entry.occurrenceIdentifier
                                            && actual.recordingIdentifier == entry.recordingIdentifier } }) {
                                        completion.completeExceptionally(SpotifyConnectFailure(Superseded))
                                    } else {
                                        spotifyOperationIdentifier = change.operationIdentifier
                                        readQueue(side).whenComplete { receipt, readFailure -> if (readFailure != null) completion.completeExceptionally(readFailure) else completion.complete(receipt) }
                                    }
                                }
                            } }
                        } else {
                            if (change.entries.isEmpty()) throw SpotifyConnectFailure(Unsupported)
                            val tracks = change.entries.map { entry -> SpotifyHostTrack(entry.spotifyIdentifier ?: throw SpotifyConnectFailure(NotFound), entry.occurrenceIdentifier) }
                            val request = SpotifyHostCommandRequest(change.operationIdentifier, BridgeMessageIdentifier, identity.deviceIdentifier, change.operationIdentifier,
                                SpotifyHostCommand.Play(tracks, queue.snapshot.paused, change.currentOccurrenceIdentifier, true))
                            val now = clock.nowElapsedRealtimeMilliseconds()
                            player.rememberMappings(mappings)
                            val operation = player.execute(identity, queue.snapshot.cursor, request, now, now + SpotifyHostingPolicy.MaximumIncomingCommandLifetimeMilliseconds)
                            operation.result.whenComplete { accepted, applyingFailure -> decide {
                                if (applyingFailure != null || closing || !current()) {
                                    if (applyingFailure != null && uncertainPlayerOutcome(applyingFailure) && !closing) terminate(CommandFailed)
                                    completion.completeExceptionally(applyingFailure ?: SpotifyConnectFailure(Superseded))
                                } else {
                                    remember(accepted, false); localOperationIdentifier = change.operationIdentifier
                                    readQueue(side).whenComplete { receipt, readFailure -> if (readFailure != null) completion.completeExceptionally(readFailure) else completion.complete(receipt) }
                                    publishLocalChanges()
                                }
                            } }
                        }
                    } catch (failure: Throwable) { completion.completeExceptionally(failure) }
                } }
            } catch (failure: Throwable) { completion.completeExceptionally(failure) }
        }
        return completion
    }
    private fun completePublicationWaiters(failure: Throwable? = null) {
        val waiting = publicationWaiters.toList(); publicationWaiters.clear()
        waiting.forEach { completion -> if (failure == null) completion.complete(Unit) else completion.completeExceptionally(failure) }
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
            val currentEntry = queue.entries.firstOrNull { entry -> entry.occurrenceIdentifier == queue.snapshot.occurrenceIdentifier }
            val target = currentEntry?.let { entry -> entry.occurrenceIdentifier to entry.recordingIdentifier }
            if (target != observedCurrent) {
                observedCurrent = target; failedCurrent = null; currentMatchingFailure = null
                val previous = currentResolution; currentResolution = null
                try { previous?.cancel() } catch (_failure: Throwable) { Unit }
                waitingForPlayerSinceElapsedMilliseconds = null
            }
            rememberCachedMappings(queue)
            val missingCurrent = queue.entries.firstOrNull { entry -> entry.occurrenceIdentifier == queue.snapshot.occurrenceIdentifier
                && SpotifyHostRecordingMappings.select(entry, mappings) == null }
            if (missingCurrent != null && mappingSource != null) {
                if (currentResolution != null || failedCurrent == target) { schedule(); return@sample }
                resolve(queue, missingCurrent); return@sample
            }
            if (currentEntry != null) {
                failedCurrent = null; currentMatchingFailure = null
                val previous = currentResolution; currentResolution = null
                try { previous?.cancel() } catch (_failure: Throwable) { Unit }
            }
            if (queue.snapshot.buffering && queue.snapshot.durationMilliseconds == null && queue.snapshot.externalAuthorityAbsent
                && queue.entries.any { entry -> entry.occurrenceIdentifier == queue.snapshot.occurrenceIdentifier }) {
                val now = clock.nowElapsedRealtimeMilliseconds()
                val waitingSince = waitingForPlayerSinceElapsedMilliseconds ?: now.also { waitingForPlayerSinceElapsedMilliseconds = it }
                if (now < waitingSince || now - waitingSince >= MaximumPlayerPreparationMilliseconds) throw SpotifyConnectFailure(Deadline)
                schedule(); return@sample
            }
            waitingForPlayerSinceElapsedMilliseconds = null
            if (!resolving && !publicationCadence.shouldPublish(queue, mappings, acceptedCommand != null, clock.nowElapsedRealtimeMilliseconds())) {
                completePublicationWaiters()
                schedule(); resolveUpcoming(queue); return@sample
            }
            perform(transport.preflight(identity, identity.deviceIdentifier)) { anchor ->
                val publication = project(queue, anchor)
                val provenance = acceptedCommand
                val publishedMappings = mappings.toList()
                perform(transport.publish(identity, publication), true) {
                    publicationCadence.published(queue, publishedMappings, clock.nowElapsedRealtimeMilliseconds())
                    acknowledgedQueue = queue; acknowledgedMappings = publishedMappings
                    completePublicationWaiters()
                    if (acceptedCommand === provenance) acceptedCommand = null
                    val recordings = queue.entries.map { entry -> entry.recordingIdentifier }.toSet()
                    mappings = mappings.filter { mapping -> mapping.recordingIdentifier in recordings }
                    if (resolving) { resolving = false; publish(SpotifyHostStatus.Hosting) }
                    schedule()
                    resolveUpcoming(queue)
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
            val pending = backgroundResolution.takeIf { backgroundRecordingIdentifier == entry.recordingIdentifier }
            if (pending != null) { backgroundResolution = null; backgroundRecordingIdentifier = null }
            val operation = pending ?: requireNotNull(mappingSource).resolve(identity, entry.recordingIdentifier)
            currentResolution = operation
            operation.result.whenComplete { track, matchingFailure -> decide {
                completeCurrentResolution(operation, entry, track, matchingFailure)
            } }
            if (currentResolution === operation) schedule()
        }
    }
    private fun completeCurrentResolution(operation: SpotifyPlayerOperation<String>, entry: SpotifyHostQueueEntry, track: String?, matchingFailure: Throwable?) {
        if (closing || currentResolution !== operation) return
        val pending = work
        if (pending != null) {
            pending.whenComplete { _, _ -> decide { completeCurrentResolution(operation, entry, track, matchingFailure) } }
            return
        }
        currentResolution = null
        timer?.cancel(); timer = null
        sample matchingSample@{ actual ->
            val actualEntry = actual.entries.firstOrNull { selected -> selected.occurrenceIdentifier == actual.snapshot.occurrenceIdentifier }
            if (actualEntry != entry) { refresh(); return@matchingSample }
            if (matchingFailure != null || track == null || !TrackPattern.matches(track)) {
                failedCurrent = entry.occurrenceIdentifier to entry.recordingIdentifier
                currentMatchingFailure = matchingFailure?.let(::safeCode) ?: NotFound
                publish(SpotifyHostStatus.Resolving)
                completePublicationWaiters(SpotifyConnectFailure(requireNotNull(currentMatchingFailure)))
                schedule()
            } else {
                if (mappings.none { mapping -> mapping.occurrenceIdentifier == entry.occurrenceIdentifier && mapping.recordingIdentifier == entry.recordingIdentifier }) {
                    mappings = mappings + SpotifyHostRecordingMapping(entry.occurrenceIdentifier, entry.recordingIdentifier, track)
                }
                refresh()
            }
        }
    }
    private fun resolveUpcoming(queue: SpotifyHostPlayerQueue) {
        val source = mappingSource ?: return
        if (closing || backgroundResolution != null || !backgroundMatchingAvailable
            || attemptedBackgroundRecordings.size >= MaximumMappings) return
        val now = clock.nowElapsedRealtimeMilliseconds()
        if (now < nextBackgroundResolutionElapsedMilliseconds) return
        val currentPosition = queue.entries.indexOfFirst { entry -> entry.occurrenceIdentifier == queue.snapshot.occurrenceIdentifier }
        if (currentPosition < FirstIndex) return
        val candidates = queue.entries.drop(currentPosition + PositionIncrement) + queue.entries.take(currentPosition)
        val entry = candidates.firstOrNull { selected -> selected.recordingIdentifier !in attemptedBackgroundRecordings
            && SpotifyHostRecordingMappings.select(selected, mappings) == null } ?: return
        attemptedBackgroundRecordings.add(entry.recordingIdentifier)
        nextBackgroundResolutionElapsedMilliseconds = now + BackgroundCatalogMinimumIntervalMilliseconds
        val operation = try { source.resolve(identity, entry.recordingIdentifier) }
            catch (_failure: Throwable) { backgroundMatchingAvailable = false; return }
        backgroundResolution = operation
        backgroundRecordingIdentifier = entry.recordingIdentifier
        operation.result.whenComplete { track, failure -> decide {
            if (backgroundResolution !== operation) return@decide
            backgroundResolution = null
            backgroundRecordingIdentifier = null
            if (closing || !current()) return@decide
            if (failure != null) {
                if (safeCode(failure) != NotFound) backgroundMatchingAvailable = false
                return@decide
            }
            if (!TrackPattern.matches(track)) { backgroundMatchingAvailable = false; return@decide }
            mappings = mappings + SpotifyHostRecordingMapping(entry.occurrenceIdentifier, entry.recordingIdentifier, track)
            if (work != null) publicationRequested = true
            else { timer?.cancel(); timer = null; refresh() }
        } }
    }
    private fun project(queue: SpotifyHostPlayerQueue, anchor: SpotifyHostClockAnchor): JSONObject {
        if (sequence !in FirstSequence..MaximumSafeInteger) throw SpotifyConnectFailure(SequenceExhausted)
        player.rememberMappings(mappings)
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
        try {
            val sampling = player.sampleQueue(identity)
            work = sampling; cancelWork = null; mutationPending = false
            sampling.whenComplete { queue, samplingFailure -> decide {
                if (closing || work !== sampling) return@decide
                work = null
                if (samplingFailure != null) {
                    if (conflict(samplingFailure) && started.isDone && !started.isCompletedExceptionally) schedule() else terminate(safeCode(samplingFailure))
                } else if (!current()) terminate(Superseded)
                else try { complete(queue) } catch (failure: Throwable) { terminate(safeCode(failure)) }
            } }
        } catch (failure: Throwable) { if (conflict(failure) && started.isDone && !started.isCompletedExceptionally) schedule() else terminate(safeCode(failure)) }
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
        currentSnapshot = SpotifyHostSnapshot(identity, status, failure ?: currentMatchingFailure,
            failureStage ?: currentMatchingFailure?.let { SpotifyHostFailureStage.CatalogMatching })
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
    private fun uncertainPlayerOutcome(failure: Throwable): Boolean {
        var cause = failure
        val visited = mutableSetOf<Throwable>()
        while (visited.add(cause) && (cause is java.util.concurrent.CompletionException || cause is java.util.concurrent.ExecutionException)) {
            cause = cause.cause ?: break
        }
        return cause !is SpotifyPlayerFailure || cause.reason == SpotifyPlayerFailureReason.UnknownOutcome
    }
    private fun conflict(failure: Throwable): Boolean {
        var cause = failure
        val visited = mutableSetOf<Throwable>()
        while (visited.add(cause) && (cause is java.util.concurrent.CompletionException || cause is java.util.concurrent.ExecutionException)) {
            cause = cause.cause ?: break
        }
        return (cause as? SpotifyPlayerFailure)?.reason == SpotifyPlayerFailureReason.Conflict
    }
    private fun failedFuture(failure: Throwable) = CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(failure) }
    companion object {
        private const val BackgroundCatalogMinimumIntervalMilliseconds = 2500L
        private const val FirstIndex = 0
        private const val PositionIncrement = 1
        private const val NotFound = "not-found"
        private const val Unsupported = "unsupported"
        private const val BridgeMessageIdentifier = 0L
        private val TrackPattern = Regex("[A-Za-z0-9]{22}")
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

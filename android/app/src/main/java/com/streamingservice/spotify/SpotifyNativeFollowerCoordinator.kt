package com.streamingservice.spotify

import com.streamingservice.player.bridge.PlayerProtocol
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import kotlin.math.abs
import kotlin.math.min

class SpotifyNativeFollowerCoordinator(
    private val player: SpotifyPlayerServicePort,
    private val source: SpotifyNativeFollowerObservationSource,
    private val resolver: SpotifyNativeFollowerRecordingResolver,
    private val clock: SpotifyNativeFollowerClock,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val executor: Executor,
    private val observer: (SpotifyNativeFollowerSnapshot) -> Unit = {}
) {
    private val monitor = Any()
    private val events = ArrayDeque<Event>()
    private var draining = false
    @Volatile private var lifetime: Lifetime? = null
    @Volatile private var currentSnapshot = DetachedSnapshot

    fun snapshot(): SpotifyNativeFollowerSnapshot = currentSnapshot

    fun start(identity: SpotifyNativeFollowerIdentity): CompletableFuture<Unit> {
        try { SpotifyNativeFollowerTiming.validateIdentity(identity) }
        catch (failure: Throwable) { return CompletableFuture<Unit>().also { completion -> completion.completeExceptionally(failure) } }
        val next = Lifetime(identity)
        val previous = synchronized(monitor) { lifetime.also { lifetime = next } }
        val retirement = retire(previous)
        retirement.whenComplete { _, failure ->
            enqueue(next) {
                if (failure != null) terminate(next, SpotifyNativeFollowerFailureReason.PlayerUnavailable)
                else { publish(next, SpotifyNativeFollowerStatus.Waiting); next.started.complete(Unit); read(next) }
            }
        }
        return next.started
    }

    fun sourceChanged() {
        val current = lifetime ?: return
        synchronized(monitor) {
            if (!current(current) || current.sourceChangeQueued || current.terminal || !current.connectionAvailable) return
            current.sourceChangeQueued = true
        }
        enqueue(current) {
            current.sourceChangeQueued = false
            if (current.terminal || !current.connectionAvailable) return@enqueue
            current.timer?.cancel(); current.timer = null
            if (current.readOperation != null) current.readRequested = true else read(current)
        }
    }

    fun connectionUnavailable() {
        val current = lifetime ?: return
        current.connectionAvailable = false
        enqueue(current) {
            if (current.terminal) return@enqueue
            cancelSource(current)
            drive(current)
        }
    }

    fun reconnect(identity: SpotifyNativeFollowerIdentity) {
        val current = lifetime ?: return
        enqueue(current) {
            if (current.terminal) return@enqueue
            val previous = current.identity
            if (identity.generation <= previous.generation) return@enqueue
            if (identity.copy(generation = previous.generation) != previous) {
                terminate(current, SpotifyNativeFollowerFailureReason.Superseded)
                return@enqueue
            }
            cancelSource(current)
            current.identity = identity
            current.connectionAvailable = true
            read(current)
        }
    }

    private fun cancelSource(current: Lifetime) {
        current.timer?.cancel(); current.timer = null
        current.readOperation?.cancel(); current.readOperation = null
        current.resolutionOperation?.cancel(); current.resolutionOperation = null
        current.resolvedQueue.clear(); current.unavailableTracks.clear()
        current.resolutionFailure = null; current.resolutionFailedSequence = null; current.upcomingQueueFailure = null
        current.target = null; current.sourceHealthy = false
        current.readRequested = false; current.sourceChangeQueued = false
    }

    fun stop(): CompletableFuture<Unit> {
        val previous = synchronized(monitor) { lifetime.also { lifetime = null; events.clear() } }
        currentSnapshot = DetachedSnapshot
        notifyObserver(DetachedSnapshot)
        return retire(previous)
    }

    private fun retire(retired: Lifetime?): CompletableFuture<Unit> {
        if (retired == null) return CompletableFuture.completedFuture(Unit)
        retired.retired = true
        retired.timer?.cancel()
        retired.readOperation?.cancel()
        retired.resolutionOperation?.cancel()
        retired.playerOperation?.cancel()
        retired.started.completeExceptionally(SpotifyNativeFollowerFailure(SpotifyNativeFollowerFailureReason.Cancelled))
        val lease = retired.lease
        return if (lease != null) player.release(lease).result else player.identity().result.thenApply { Unit }
    }

    private fun read(current: Lifetime) {
        if (!current(current) || current.readOperation != null || current.terminal || !current.connectionAvailable) return
        val requestStartedMilliseconds = clock.nowElapsedRealtimeMilliseconds()
        val operation = try { source.read(current.identity) }
        catch (failure: Throwable) { readFailed(current, failure); scheduleRead(current); return }
        current.readOperation = operation
        operation.result.whenComplete { observation, failure ->
            enqueue(current) {
                if (current.readOperation !== operation) return@enqueue
                current.readOperation = null
                if (!current.connectionAvailable) { current.sourceHealthy = false; drive(current) }
                else if (failure != null) readFailed(current, failure)
                else {
                    try {
                        SpotifyNativeFollowerTiming.validateObservation(current.identity, observation, requestStartedMilliseconds, clock.nowElapsedRealtimeMilliseconds())
                        val previous = current.target
                        if (previous?.occurrenceIdentifier == observation.occurrenceIdentifier && previous.spotifyTrackIdentifier != observation.spotifyTrackIdentifier) throw SpotifyNativeFollowerFailure(SpotifyNativeFollowerFailureReason.InvalidObservation)
                        current.target = observation
                        current.sequence += SpotifyNativeFollowerPolicy.SequenceIncrement
                        current.sourceHealthy = true
                        if (previous != null && !sameQueue(previous, observation)) {
                            current.resolutionOperation?.cancel(); current.resolutionOperation = null
                            current.resolutionFailure = null; current.upcomingQueueFailure = null
                            current.unavailableTracks.clear()
                            val tracks = queueOccurrences(observation).map { occurrence -> occurrence.spotifyTrackIdentifier }.toSet()
                            current.resolvedQueue.keys.retainAll(tracks)
                        }
                        current.unavailableTracks.remove(observation.spotifyTrackIdentifier)
                        drive(current)
                    } catch (validationFailure: Throwable) { terminate(current, reason(validationFailure)) }
                }
                if (current.readRequested && !current.terminal && current.connectionAvailable) {
                    current.readRequested = false
                    read(current)
                } else scheduleRead(current)
            }
        }
    }

    private fun readFailed(current: Lifetime, failure: Throwable) {
        val selectedReason = reason(failure)
        if (selectedReason == SpotifyNativeFollowerFailureReason.Superseded || selectedReason == SpotifyNativeFollowerFailureReason.InvalidObservation
            || selectedReason == SpotifyNativeFollowerFailureReason.AuthorizationRequired) {
            terminate(current, selectedReason)
            return
        }
        current.sourceHealthy = false
        drive(current)
    }

    private fun scheduleRead(current: Lifetime) {
        if (!current(current) || current.terminal || !current.connectionAvailable) return
        current.timer?.cancel()
        current.timer = scheduler.schedule(SpotifyNativeFollowerPolicy.ReconcileIntervalMilliseconds) {
            enqueue(current) { current.timer = null; read(current) }
        }
    }

    private fun drive(current: Lifetime) {
        if (!current(current) || current.terminal) return
        if (current.outputBusy) { current.driveRequested = true; return }
        current.driveRequested = false
        val target = current.target
        if (target == null || !current.connectionAvailable || !current.sourceHealthy || !SpotifyNativeFollowerTiming.fresh(target, clock.nowElapsedRealtimeMilliseconds())) {
            hold(current, SpotifyNativeFollowerStatus.Stale, SpotifyNativeFollowerFailureReason.SourceUnavailable)
            return
        }
        val lease = current.lease
        if (lease == null) {
            claim(current, player.acquire(current.identity.playerIdentity, current.identity.streamingServiceAccountIdentifier))
            return
        }
        playerStep(current, player.sample(lease)) { sample -> reconcileSample(current, target, sample) }
    }

    private fun reconcileSample(current: Lifetime, sampledTarget: SpotifyConnectPlaybackObservation, sample: SpotifyPlayerSample) {
        if (current.target !== sampledTarget) { drive(current); return }
        if (sample.suspended) { suspend(current); return }
        val nowMilliseconds = clock.nowElapsedRealtimeMilliseconds()
        SpotifyNativeFollowerTiming.localPosition(sample, nowMilliseconds)
        if (!current.connectionAvailable || !current.sourceHealthy || !SpotifyNativeFollowerTiming.fresh(sampledTarget, nowMilliseconds)) { hold(current, SpotifyNativeFollowerStatus.Stale, SpotifyNativeFollowerFailureReason.SourceUnavailable); return }
        val lease = requireNotNull(current.lease)
        if (sample.expired) {
            val recoverySequence = current.recoverAfterSequence
            if (recoverySequence == null) {
                current.recoverAfterSequence = current.sequence
                publish(current, SpotifyNativeFollowerStatus.Waiting)
                read(current)
            } else if (current.sequence > recoverySequence) claim(current, player.recoverExpiredLease(lease))
            return
        }
        current.recoverAfterSequence = null
        if (current.renewedSequence != current.sequence) {
            val renewedSequence = current.sequence
            playerStep(current, player.renew(lease)) { current.renewedSequence = renewedSequence; drive(current) }
            return
        }
        current.paused = !sample.playing
        if (current.preparedOccurrence != sampledTarget.occurrenceIdentifier || current.preparedQueue?.let { prepared -> !sameQueue(prepared, sampledTarget) } != false
            || unresolvedOccurrence(current, sampledTarget) == null && current.preparedRecordings != mappedQueue(current, sampledTarget)) {
            if (sample.playing && sample.occurrenceIdentifier != null && sample.occurrenceIdentifier != sampledTarget.occurrenceIdentifier) {
                playerStep(current, player.pause(lease, sample.occurrenceIdentifier)) { current.paused = true; drive(current) }
                return
            }
            resolveOrPrepare(current, sampledTarget)
            return
        }
        if (sample.occurrenceIdentifier != current.preparedOccurrence) { terminate(current, SpotifyNativeFollowerFailureReason.Superseded); return }
        if (sample.ready != true || sample.buffering || sampledTarget.buffering || sample.durationMilliseconds == null
            || sample.durationMilliseconds == SpotifyNativeFollowerPolicy.MinimumMilliseconds || sample.interruption != PlayerProtocol.NoInterruption) {
            hold(current, SpotifyNativeFollowerStatus.Buffering)
            return
        }
        val sourcePosition = SpotifyNativeFollowerTiming.targetPosition(sampledTarget, nowMilliseconds)
        if (sampledTarget.progressing && sourcePosition >= sample.durationMilliseconds && sampledTarget.durationMilliseconds > sample.durationMilliseconds) {
            hold(current, SpotifyNativeFollowerStatus.Unavailable, SpotifyNativeFollowerFailureReason.Unsupported)
            return
        }
        val position = min(sourcePosition, sample.durationMilliseconds.toDouble())
        val playing = sampledTarget.progressing && position < sampledTarget.durationMilliseconds
        val drift = position - SpotifyNativeFollowerTiming.localPosition(sample, nowMilliseconds)
        val seek = abs(drift) > SpotifyNativeFollowerPolicy.CorrectionThresholdMilliseconds + sampledTarget.uncertaintyMilliseconds + SpotifyNativeFollowerPolicy.LocalSampleUncertaintyMilliseconds
        if (seek && !sample.seekable) { terminate(current, SpotifyNativeFollowerFailureReason.Unsupported); return }
        if (seek) {
            playerStep(current, player.seek(lease, sampledTarget.occurrenceIdentifier, position.toLong())) {
                if (current.target === sampledTarget) applyIntent(current, sampledTarget, playing, sample.playing, drift) else drive(current)
            }
        } else applyIntent(current, sampledTarget, playing, sample.playing, drift)
    }

    private fun applyIntent(current: Lifetime, target: SpotifyConnectPlaybackObservation, playing: Boolean, wasPlaying: Boolean, drift: Double) {
        if (current.target !== target || !current.connectionAvailable || !current.sourceHealthy || !SpotifyNativeFollowerTiming.fresh(target, clock.nowElapsedRealtimeMilliseconds())) { drive(current); return }
        if (playing != wasPlaying) {
            val lease = requireNotNull(current.lease)
            val operation = if (playing) player.play(lease, target.occurrenceIdentifier) else player.pause(lease, target.occurrenceIdentifier)
            playerStep(current, operation) { current.paused = !playing; if (current.target !== target) drive(current) else following(current, target, drift) }
        } else following(current, target, drift)
    }

    private fun resolveOrPrepare(current: Lifetime, target: SpotifyConnectPlaybackObservation) {
        if (current.resolutionFailedSequence == current.sequence && current.resolutionFailure != null) {
            hold(current, SpotifyNativeFollowerStatus.Unavailable, current.resolutionFailure)
            return
        }
        val selected = current.resolvedQueue[target.spotifyTrackIdentifier]
        if (selected != null) {
            val recordings = mappedQueue(current, target)
            publish(current, SpotifyNativeFollowerStatus.Preparing)
            playerStep(current, player.prepareQueue(requireNotNull(current.lease), recordings, target.occurrenceIdentifier)) {
                current.preparedOccurrence = target.occurrenceIdentifier
                current.preparedQueue = target
                current.preparedRecordings = recordings
                current.recordingIdentifier = selected.recordingIdentifier
                drive(current)
            }
            return
        }
        resolveOccurrence(current, target, SpotifyConnectQueueOccurrence(target.occurrenceIdentifier, target.spotifyTrackIdentifier))
    }

    private fun following(current: Lifetime, target: SpotifyConnectPlaybackObservation, drift: Double) {
        publish(current, SpotifyNativeFollowerStatus.Following, drift = drift)
        unresolvedOccurrence(current, target)?.let { occurrence -> resolveOccurrence(current, target, occurrence) }
    }

    private fun queueOccurrences(target: SpotifyConnectPlaybackObservation): List<SpotifyConnectQueueOccurrence> =
        listOf(SpotifyConnectQueueOccurrence(target.occurrenceIdentifier, target.spotifyTrackIdentifier)) + target.upcomingOccurrences

    private fun unresolvedOccurrence(current: Lifetime, target: SpotifyConnectPlaybackObservation): SpotifyConnectQueueOccurrence? =
        queueOccurrences(target).firstOrNull { occurrence -> occurrence.spotifyTrackIdentifier !in current.resolvedQueue && occurrence.spotifyTrackIdentifier !in current.unavailableTracks }

    private fun mappedQueue(current: Lifetime, target: SpotifyConnectPlaybackObservation): List<SpotifyPlayerRecording> =
        queueOccurrences(target).mapNotNull { occurrence ->
            current.resolvedQueue[occurrence.spotifyTrackIdentifier]?.let { recording ->
                SpotifyPlayerRecording(occurrence.occurrenceIdentifier, recording.recordingIdentifier, recording.title, recording.artist)
            }
        }

    private fun resolveOccurrence(current: Lifetime, target: SpotifyConnectPlaybackObservation, unresolved: SpotifyConnectQueueOccurrence) {
        if (current.resolutionOperation != null) return
        if (unresolved.occurrenceIdentifier == target.occurrenceIdentifier) publish(current, SpotifyNativeFollowerStatus.Resolving)
        val operation = resolver.resolve(current.identity, unresolved.spotifyTrackIdentifier)
        current.resolutionOperation = operation
        operation.result.whenComplete { resolution, failure ->
            enqueue(current) {
                if (current.resolutionOperation !== operation) return@enqueue
                current.resolutionOperation = null
                if (!current.connectionAvailable) return@enqueue
                if (current.target?.let { observed -> !sameQueue(observed, target) } != false) { drive(current); return@enqueue }
                if (failure != null) {
                    val failureReason = reason(failure)
                    if (failureReason == SpotifyNativeFollowerFailureReason.AuthorizationRequired || failureReason == SpotifyNativeFollowerFailureReason.Superseded) {
                        terminate(current, failureReason)
                        return@enqueue
                    }
                    current.unavailableTracks.add(unresolved.spotifyTrackIdentifier)
                    if (unresolved.occurrenceIdentifier != target.occurrenceIdentifier) {
                        current.upcomingQueueFailure = failureReason
                        current.unavailableTracks.addAll(target.upcomingOccurrences.filter { occurrence -> occurrence.spotifyTrackIdentifier !in current.resolvedQueue }
                            .map { occurrence -> occurrence.spotifyTrackIdentifier })
                    }
                    if (unresolved.occurrenceIdentifier == target.occurrenceIdentifier) {
                        current.resolutionFailure = SpotifyNativeFollowerFailureReason.RecordingUnavailable
                        current.resolutionFailedSequence = current.sequence
                    }
                } else when (resolution) {
                    is SpotifyFollowerRecordingResolution.Matched -> current.resolvedQueue[unresolved.spotifyTrackIdentifier] = resolution.recording
                    SpotifyFollowerRecordingResolution.Ambiguous, SpotifyFollowerRecordingResolution.Unavailable -> {
                        current.unavailableTracks.add(unresolved.spotifyTrackIdentifier)
                        if (unresolved.occurrenceIdentifier != target.occurrenceIdentifier) current.upcomingQueueFailure = SpotifyNativeFollowerFailureReason.RecordingUnavailable
                        if (unresolved.occurrenceIdentifier == target.occurrenceIdentifier) {
                            current.resolutionFailure = if (resolution == SpotifyFollowerRecordingResolution.Ambiguous) SpotifyNativeFollowerFailureReason.AmbiguousRecording else SpotifyNativeFollowerFailureReason.RecordingUnavailable
                            current.resolutionFailedSequence = current.sequence
                        }
                    }
                }
                drive(current)
            }
        }
    }

    private fun sameQueue(left: SpotifyConnectPlaybackObservation, right: SpotifyConnectPlaybackObservation): Boolean =
        left.queueRevision == right.queueRevision && left.occurrenceIdentifier == right.occurrenceIdentifier
            && left.spotifyTrackIdentifier == right.spotifyTrackIdentifier && left.upcomingOccurrences == right.upcomingOccurrences

    private fun hold(current: Lifetime, status: SpotifyNativeFollowerStatus, failure: SpotifyNativeFollowerFailureReason? = null) {
        val lease = current.lease
        val occurrence = current.preparedOccurrence
        if (lease != null && occurrence != null && !current.paused) {
            playerStep(current, player.pause(lease, occurrence)) { current.paused = true; publish(current, status, failure) }
        } else publish(current, status, failure)
    }

    private fun claim(current: Lifetime, operation: SpotifyPlayerOperation<SpotifyPlayerLease>) {
        current.outputBusy = true
        current.playerOperation = operation
        operation.result.whenComplete { lease, failure ->
            if (!current(current)) { if (lease != null) player.release(lease); return@whenComplete }
            enqueue(current) {
                if (current.playerOperation !== operation) { if (lease != null) player.release(lease); return@enqueue }
                current.playerOperation = null; current.outputBusy = false
                if (failure != null) playerFailed(current, failure)
                else {
                    current.lease = lease
                    current.preparedOccurrence = null; current.recordingIdentifier = null; current.paused = true
                    current.recoverAfterSequence = null; current.renewedSequence = current.sequence
                    drive(current)
                }
            }
        }
    }

    private fun <Response> playerStep(current: Lifetime, operation: SpotifyPlayerOperation<Response>, success: (Response) -> Unit) {
        current.outputBusy = true
        current.playerOperation = operation
        operation.result.whenComplete { response, failure ->
            enqueue(current) {
                if (current.playerOperation !== operation) return@enqueue
                current.playerOperation = null; current.outputBusy = false
                if (failure != null) playerFailed(current, failure)
                else success(response)
                if (current.driveRequested && !current.outputBusy) drive(current)
            }
        }
    }

    private fun playerFailed(current: Lifetime, failure: Throwable) {
        when ((unwrap(failure) as? SpotifyPlayerFailure)?.reason) {
            SpotifyPlayerFailureReason.Suspended -> suspend(current)
            SpotifyPlayerFailureReason.Expired -> { current.recoverAfterSequence = current.sequence; publish(current, SpotifyNativeFollowerStatus.Waiting); read(current) }
            SpotifyPlayerFailureReason.Superseded -> terminate(current, SpotifyNativeFollowerFailureReason.Superseded)
            SpotifyPlayerFailureReason.UnknownOutcome -> terminate(current, SpotifyNativeFollowerFailureReason.UnknownOutcome)
            else -> terminate(current, SpotifyNativeFollowerFailureReason.PlayerUnavailable)
        }
    }

    private fun suspend(current: Lifetime) = terminate(current, SpotifyNativeFollowerFailureReason.LocalSuspended, SpotifyNativeFollowerStatus.Suspended)
    private fun terminate(current: Lifetime, failure: SpotifyNativeFollowerFailureReason, status: SpotifyNativeFollowerStatus = SpotifyNativeFollowerStatus.Failed) {
        if (!current(current) || current.terminal) return
        current.terminal = true
        current.timer?.cancel(); current.timer = null
        current.readOperation?.cancel(); current.readOperation = null
        current.resolutionOperation?.cancel(); current.resolutionOperation = null
        current.playerOperation?.cancel(); current.playerOperation = null
        current.lease?.let { lease -> player.release(lease) }
        current.started.completeExceptionally(SpotifyNativeFollowerFailure(failure))
        publish(current, status, failure)
    }

    private fun publish(current: Lifetime, status: SpotifyNativeFollowerStatus, failure: SpotifyNativeFollowerFailureReason? = null, drift: Double? = null) {
        if (!current(current)) return
        val upcoming = current.target?.upcomingOccurrences.orEmpty()
        val unavailableUpcomingCount = upcoming.count { occurrence -> occurrence.spotifyTrackIdentifier in current.unavailableTracks }
        val upcomingQueuePending = upcoming.any { occurrence -> occurrence.spotifyTrackIdentifier !in current.resolvedQueue && occurrence.spotifyTrackIdentifier !in current.unavailableTracks }
        val snapshot = SpotifyNativeFollowerSnapshot(status, current.identity, current.target?.occurrenceIdentifier, current.recordingIdentifier, drift, failure,
            upcomingQueuePending, unavailableUpcomingCount, current.upcomingQueueFailure)
        currentSnapshot = snapshot
        notifyObserver(snapshot)
    }
    private fun notifyObserver(snapshot: SpotifyNativeFollowerSnapshot) { try { observer(snapshot) } catch (_failure: Throwable) { Unit } }
    private fun current(candidate: Lifetime): Boolean = lifetime === candidate && !candidate.retired
    private fun reason(failure: Throwable): SpotifyNativeFollowerFailureReason {
        val cause = unwrap(failure)
        if (cause is SpotifyNativeFollowerFailure) return cause.reason
        if (cause is SpotifyConnectFailure) return when (cause.code) {
            SpotifyConnectFailureCode.Superseded.wireValue -> SpotifyNativeFollowerFailureReason.Superseded
            SpotifyConnectFailureCode.InvalidResponse.wireValue -> SpotifyNativeFollowerFailureReason.InvalidObservation
            SpotifyConnectFailureCode.Unauthorized.wireValue, SpotifyConnectFailureCode.Forbidden.wireValue -> SpotifyNativeFollowerFailureReason.AuthorizationRequired
            else -> SpotifyNativeFollowerFailureReason.SourceUnavailable
        }
        return SpotifyNativeFollowerFailureReason.SourceUnavailable
    }
    private fun unwrap(failure: Throwable): Throwable = if ((failure is CompletionException || failure is ExecutionException) && failure.cause != null) unwrap(requireNotNull(failure.cause)) else failure

    private fun enqueue(current: Lifetime, action: () -> Unit) {
        synchronized(monitor) {
            if (!current(current)) return
            events.removeAll { event -> !current(event.lifetime) }
            if (events.size >= SpotifyNativeFollowerPolicy.MaximumPendingEvents) { terminate(current, SpotifyNativeFollowerFailureReason.Capacity); return }
            events.addLast(Event(current, action))
            if (draining) return
            draining = true
        }
        try { executor.execute(::drain) }
        catch (_failure: Throwable) { synchronized(monitor) { draining = false; events.clear() }; terminate(current, SpotifyNativeFollowerFailureReason.Capacity) }
    }
    private fun drain() {
        while (true) {
            val event = synchronized(monitor) { if (events.isEmpty()) { draining = false; return }; events.removeFirst() }
            if (!current(event.lifetime)) continue
            try { event.action() } catch (failure: Throwable) { terminate(event.lifetime, reason(failure)) }
        }
    }

    private class Lifetime(var identity: SpotifyNativeFollowerIdentity) {
        val started = CompletableFuture<Unit>()
        @Volatile var retired = false
        @Volatile var lease: SpotifyPlayerLease? = null
        @Volatile var readOperation: SpotifyFollowerOperation<SpotifyConnectPlaybackObservation>? = null
        @Volatile var resolutionOperation: SpotifyFollowerOperation<SpotifyFollowerRecordingResolution>? = null
        @Volatile var playerOperation: SpotifyPlayerOperation<*>? = null
        @Volatile var timer: SpotifyNativeFollowerCancellation? = null
        var target: SpotifyConnectPlaybackObservation? = null
        var sequence = SpotifyNativeFollowerPolicy.InitialSequence
        var renewedSequence = SpotifyNativeFollowerPolicy.InitialSequence
        var recoverAfterSequence: Long? = null
        @Volatile var connectionAvailable = true
        var readRequested = false
        @Volatile var sourceChangeQueued = false
        var sourceHealthy = false
        var terminal = false
        var outputBusy = false
        var driveRequested = false
        var paused = true
        var preparedRecordings = emptyList<SpotifyPlayerRecording>()
        var preparedQueue: SpotifyConnectPlaybackObservation? = null
        val resolvedQueue = mutableMapOf<String, SpotifyFollowerRecording>()
        val unavailableTracks = mutableSetOf<String>()
        var preparedOccurrence: String? = null
        var recordingIdentifier: String? = null
        var upcomingQueueFailure: SpotifyNativeFollowerFailureReason? = null
        var resolutionFailure: SpotifyNativeFollowerFailureReason? = null
        var resolutionFailedSequence: Long? = null
    }
    private data class Event(val lifetime: Lifetime, val action: () -> Unit)
    companion object {
        private val DetachedSnapshot = SpotifyNativeFollowerSnapshot(SpotifyNativeFollowerStatus.Detached, null, null, null, null, null)
    }
}

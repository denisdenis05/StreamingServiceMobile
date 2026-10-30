package com.streamingservice.spotify

class SpotifyHostCommandDispatcher(
    private val identity: SpotifyHostIdentity,
    private val player: SpotifyHostPlayer,
    private val transport: SpotifyHostControlTransport,
    private val decoder: SpotifyHostCommandEventDecoder,
    private val clock: SpotifyNativeFollowerClock,
    private val scheduler: SpotifyNativeFollowerScheduler,
    private val isCurrent: (SpotifyHostIdentity) -> Boolean,
    private val accepted: (SpotifyHostPlayerAccepted) -> Unit,
    private val failed: () -> Unit,
    private val maximumJournalEntries: Int = DefaultMaximumJournalEntries,
    private val maximumPendingCommands: Int = DefaultMaximumPendingCommands
) {
    private val jobs = linkedMapOf<String, Job>()
    private val pending = ArrayDeque<Job>()
    private var active: Job? = null
    @Volatile private var retired = false
    @Volatile private var accepting = false

    init { require(maximumJournalEntries > EmptyCount && maximumPendingCommands > EmptyCount) }

    fun setAccepting() { synchronized(this) { if (!retired) accepting = true } }
    fun isReady(selected: SpotifyHostIdentity): Boolean = !retired && selected == identity && current()

    @Synchronized fun accept(batch: SpotifyConnectBatch) {
        if (retired) return
        val commands = try { decoder.decode(batch, identity) } catch (_failure: Throwable) { fail(); return }
        for (command in commands) {
            if (!accepting || !current() || command.request == null || clock.nowElapsedRealtimeMilliseconds() >= command.deadlineElapsedMilliseconds) {
                acknowledge(command.key, false); continue
            }
            val previous = jobs[command.key]
            if (previous != null) {
                if (previous.incoming.request != command.request) acknowledge(command.key, false)
                continue
            }
            if (jobs.size >= maximumJournalEntries || pending.size + (if (active == null) EmptyCount else ActiveCount) >= maximumPendingCommands) {
                acknowledge(command.key, false); continue
            }
            val job = Job(command)
            jobs[command.key] = job
            pending.addLast(job)
            try {
                val timer = scheduler.schedule(command.deadlineElapsedMilliseconds - clock.nowElapsedRealtimeMilliseconds()) {
                    synchronized(this) { expire(job) }
                }
                if (job.done) timer.cancel() else job.timer = timer
            } catch (_failure: Throwable) { complete(job, null) }
        }
        drain()
    }

    @Synchronized fun retire() {
        if (retired) return
        retired = true; accepting = false
        jobs.values.filter { job -> !job.done }.forEach { job ->
            job.done = true; job.timer?.cancel(); job.operation?.cancel()
        }
        pending.clear(); active = null
    }

    private fun drain() {
        if (active != null || retired) return
        while (pending.isNotEmpty()) {
            val job = pending.removeFirst()
            if (job.done) continue
            if (!current() || clock.nowElapsedRealtimeMilliseconds() >= job.incoming.deadlineElapsedMilliseconds) {
                complete(job, null); continue
            }
            active = job
            val sampling = try { player.sampleQueue(identity) } catch (_failure: Throwable) { complete(job, null); return }
            sampling.whenComplete { queue, failure -> synchronized(this) samplingCompletion@{
                if (!live(job)) return@samplingCompletion
                if (failure != null || queue == null || queue.snapshot.identity != identity || !queue.snapshot.externalAuthorityAbsent) {
                    complete(job, null); return@samplingCompletion
                }
                try {
                    val operation = player.execute(identity, queue.snapshot.cursor, requireNotNull(job.incoming.request),
                        job.incoming.receivedAtElapsedMilliseconds, job.incoming.deadlineElapsedMilliseconds)
                    if (!live(job)) { operation.cancel(); return@samplingCompletion }
                    job.operation = operation
                    operation.result.whenComplete { receipt, executionFailure -> synchronized(this) executionCompletion@{
                        if (job.done || retired) return@executionCompletion
                        if (executionFailure != null && (executionFailure !is SpotifyPlayerFailure || executionFailure.reason == SpotifyPlayerFailureReason.UnknownOutcome)) {
                            fail(); return@executionCompletion
                        }
                        if (!live(job)) return@executionCompletion
                        if (executionFailure == null && (receipt == null || receipt.request != job.incoming.request || receipt.snapshot.identity != identity)) {
                            fail(); return@executionCompletion
                        }
                        complete(job, if (executionFailure == null) receipt else null)
                    } }
                } catch (_failure: Throwable) { complete(job, null) }
            } }
            return
        }
    }
    private fun live(job: Job): Boolean {
        if (job.done || retired) return false
        if (!current() || clock.nowElapsedRealtimeMilliseconds() >= job.incoming.deadlineElapsedMilliseconds) {
            expire(job); return false
        }
        return true
    }
    private fun expire(job: Job) {
        if (job.done || retired) return
        val operation = job.operation
        if (operation != null) fail() else complete(job, null)
    }
    private fun complete(job: Job, receipt: SpotifyHostPlayerAccepted?) {
        if (job.done || retired) return
        job.done = true; job.timer?.cancel()
        if (active === job) active = null
        if (receipt != null) {
            try { accepted(receipt) } catch (_failure: Throwable) { fail(); return }
        }
        acknowledge(job.incoming.key, receipt != null)
        drain()
    }
    private fun acknowledge(key: String, success: Boolean) {
        if (retired || !current()) return
        try {
            transport.reply(identity, key, success).result.whenComplete { _, failure ->
                if (failure != null) synchronized(this) { if (!retired) fail() }
            }
        } catch (_failure: Throwable) { fail() }
    }
    private fun current(): Boolean = try { isCurrent(identity) } catch (_failure: Throwable) { false }
    private fun fail() { if (!retired) { retire(); failed() } }
    private class Job(val incoming: SpotifyHostIncomingCommand) {
        var done = false
        var timer: SpotifyNativeFollowerCancellation? = null
        var operation: SpotifyPlayerOperation<SpotifyHostPlayerAccepted>? = null
    }
    companion object {
        private const val EmptyCount = 0
        private const val ActiveCount = 1
        private const val DefaultMaximumJournalEntries = 128
        private const val DefaultMaximumPendingCommands = 16
    }
}

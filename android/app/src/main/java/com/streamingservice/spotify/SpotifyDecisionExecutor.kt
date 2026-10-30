package com.streamingservice.spotify

import java.util.concurrent.Executor

class SpotifyDecisionExecutor(private val executor: Executor) : Executor {
    private val monitor = Any()
    private val work = ArrayDeque<Runnable>()
    private var draining = false
    override fun execute(command: Runnable) {
        val start = synchronized(monitor) {
            work.addLast(command)
            if (draining) false else { draining = true; true }
        }
        if (start) try { executor.execute(::drain) } catch (_failure: Throwable) { drain() }
    }
    private fun drain() {
        while (true) {
            val next = synchronized(monitor) {
                if (work.isEmpty()) { draining = false; null } else work.removeFirst()
            } ?: return
            try { next.run() } catch (_failure: Throwable) { Unit }
        }
    }
}

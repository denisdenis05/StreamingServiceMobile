package com.streamingservice.spotify

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.Executor

class SpotifyDecisionExecutorTest {
    @Test fun reentrantWorkRunsAfterTheCurrentDecisionWithoutHoldingTheQueueLock() {
        val scheduled = ArrayDeque<Runnable>(); val output = mutableListOf<Int>()
        val executor = SpotifyDecisionExecutor { work -> scheduled.addLast(work) }
        executor.execute { output.add(First); executor.execute { output.add(Third) }; output.add(Second) }
        scheduled.removeFirst().run()
        assertEquals(listOf(First, Second, Third), output)
    }
    @Test fun rejectionAndFailedActionsCannotStrandCleanupWork() {
        val output = mutableListOf<Int>()
        val executor = SpotifyDecisionExecutor(Executor { throw IllegalStateException() })
        executor.execute { throw IllegalStateException() }; executor.execute { output.add(First) }
        assertEquals(listOf(First), output)
    }
    companion object { private const val First = 1; private const val Second = 2; private const val Third = 3 }
}

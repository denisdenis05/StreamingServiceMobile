package com.streamingservice.spotify

import com.streamingservice.player.queue.QueueNumbers

object SpotifyHostingPolicy {
    const val MaximumSafeInteger = QueueNumbers.MaximumSafeInteger
    const val MaximumClockUncertaintyMilliseconds = 2000L
    const val MaximumQueueTracks = 80
    const val MaximumIdentifierCharacters = 512
}

package com.streamingservice.spotify

import org.json.JSONObject
import java.util.concurrent.CompletableFuture

interface SpotifyHostPlayer {
    fun rememberMappings(mappings: List<SpotifyHostRecordingMapping>) = Unit
    fun sampleQueue(identity: SpotifyHostIdentity): CompletableFuture<SpotifyHostPlayerQueue>
    fun execute(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor, request: SpotifyHostCommandRequest,
        receivedAtElapsedMilliseconds: Long, deadlineElapsedMilliseconds: Long): SpotifyPlayerOperation<SpotifyHostPlayerAccepted>
    fun pause(identity: SpotifyHostIdentity, expected: SpotifyHostPlayerCursor): CompletableFuture<Unit>
    fun retire()
}

interface SpotifyHostControlTransport {
    fun registration(identity: SpotifyHostIdentity): SpotifyPlayerOperation<SpotifyHostNativeRegistration>
    fun preflight(identity: SpotifyHostIdentity, expectedHostDeviceIdentifier: String): SpotifyPlayerOperation<SpotifyHostClockAnchor>
    fun retirementAnchor(identity: SpotifyHostIdentity): SpotifyPlayerOperation<SpotifyHostClockAnchor>
    fun activate(identity: SpotifyHostIdentity, queue: SpotifyHostPlayerQueue, snapshot: JSONObject, activation: JSONObject): SpotifyPlayerOperation<Unit>
    fun publish(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit>
    fun withdraw(identity: SpotifyHostIdentity, registration: SpotifyHostNativeRegistration): SpotifyPlayerOperation<Unit>
    fun deactivate(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit>
    fun reply(identity: SpotifyHostIdentity, key: String, accepted: Boolean): SpotifyPlayerOperation<Unit>
}

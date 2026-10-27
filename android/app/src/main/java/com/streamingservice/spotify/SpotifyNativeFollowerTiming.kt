package com.streamingservice.spotify

import kotlin.math.max
import kotlin.math.min

internal object SpotifyNativeFollowerTiming {
    fun validateIdentity(identity: SpotifyNativeFollowerIdentity) {
        listOf(identity.streamingServiceAccountIdentifier, identity.spotifyAccountIdentifier, identity.jamSessionIdentifier,
            identity.hostDeviceIdentifier, identity.playerIdentity.engineEpoch, identity.playerIdentity.authenticationEpoch).forEach { value ->
            if (!identifier(value)) fail(SpotifyNativeFollowerFailureReason.InvalidInput)
        }
        if (identity.handle !in SpotifyNativeFollowerPolicy.FirstIdentifier..SpotifyNativeFollowerPolicy.MaximumMilliseconds
            || identity.generation !in SpotifyNativeFollowerPolicy.FirstIdentifier..SpotifyNativeFollowerPolicy.MaximumMilliseconds) fail(SpotifyNativeFollowerFailureReason.InvalidInput)
    }

    fun validateObservation(identity: SpotifyNativeFollowerIdentity, observation: SpotifyConnectPlaybackObservation, requestStartedMilliseconds: Long, nowMilliseconds: Long) {
        if (observation.handle != identity.handle || observation.generation != identity.generation
            || observation.hostDeviceIdentifier != identity.hostDeviceIdentifier) fail(SpotifyNativeFollowerFailureReason.Superseded)
        if (!identifier(observation.occurrenceIdentifier) || !identifier(observation.queueRevision)
            || !SpotifyNativeFollowerPolicy.TrackIdentifierPattern.matches(observation.spotifyTrackIdentifier)
            || listOf(observation.positionMilliseconds, observation.durationMilliseconds, observation.observedElapsedRealtimeMilliseconds,
                observation.serverAtMilliseconds, observation.stateChangedAtServerMilliseconds, requestStartedMilliseconds, nowMilliseconds).any { value -> !milliseconds(value) }
            || !observation.anchorElapsedRealtimeMilliseconds.isFinite() || observation.anchorElapsedRealtimeMilliseconds < SpotifyNativeFollowerPolicy.MinimumMilliseconds
            || observation.anchorElapsedRealtimeMilliseconds > observation.observedElapsedRealtimeMilliseconds
            || observation.observedElapsedRealtimeMilliseconds < requestStartedMilliseconds || observation.observedElapsedRealtimeMilliseconds > nowMilliseconds
            || observation.positionMilliseconds > observation.durationMilliseconds || observation.durationMilliseconds == SpotifyNativeFollowerPolicy.MinimumMilliseconds
            || !observation.uncertaintyMilliseconds.isFinite() || observation.uncertaintyMilliseconds < SpotifyNativeFollowerPolicy.MinimumMilliseconds
            || observation.serverAtMilliseconds < observation.stateChangedAtServerMilliseconds) fail(SpotifyNativeFollowerFailureReason.InvalidObservation)
    }

    fun fresh(observation: SpotifyConnectPlaybackObservation, nowMilliseconds: Long): Boolean = milliseconds(nowMilliseconds)
        && nowMilliseconds >= observation.observedElapsedRealtimeMilliseconds
        && nowMilliseconds - observation.observedElapsedRealtimeMilliseconds <= SpotifyNativeFollowerPolicy.MaximumObservationAgeMilliseconds
        && observation.uncertaintyMilliseconds <= SpotifyNativeFollowerPolicy.MaximumUncertaintyMilliseconds

    fun targetPosition(observation: SpotifyConnectPlaybackObservation, nowMilliseconds: Long): Double {
        val elapsed = if (observation.progressing && !observation.buffering) max(SpotifyNativeFollowerPolicy.MinimumMilliseconds.toDouble(), nowMilliseconds - observation.anchorElapsedRealtimeMilliseconds) else SpotifyNativeFollowerPolicy.MinimumMilliseconds.toDouble()
        return min(observation.durationMilliseconds.toDouble(), observation.positionMilliseconds + elapsed)
    }

    fun localPosition(sample: SpotifyPlayerSample, nowMilliseconds: Long): Double {
        if (sample.clockDomain != SpotifyPlayerClockDomain.ElapsedRealtime || !milliseconds(sample.positionMilliseconds)
            || !milliseconds(sample.sampledAtMilliseconds) || !milliseconds(nowMilliseconds)
            || sample.sampledAtMilliseconds > nowMilliseconds
            || nowMilliseconds - sample.sampledAtMilliseconds > SpotifyNativeFollowerPolicy.MaximumObservationAgeMilliseconds
            || sample.durationMilliseconds?.let { duration -> !milliseconds(duration) } == true) fail(SpotifyNativeFollowerFailureReason.InvalidObservation)
        val elapsed = if (sample.playing && !sample.buffering) nowMilliseconds - sample.sampledAtMilliseconds else SpotifyNativeFollowerPolicy.MinimumMilliseconds
        return sample.positionMilliseconds.toDouble() + elapsed
    }

    private fun identifier(value: String): Boolean = value.isNotBlank() && value.length <= SpotifyNativeFollowerPolicy.MaximumIdentifierCharacters
    private fun milliseconds(value: Long): Boolean = value in SpotifyNativeFollowerPolicy.MinimumMilliseconds..SpotifyNativeFollowerPolicy.MaximumMilliseconds
    private fun fail(reason: SpotifyNativeFollowerFailureReason): Nothing = throw SpotifyNativeFollowerFailure(reason)
}

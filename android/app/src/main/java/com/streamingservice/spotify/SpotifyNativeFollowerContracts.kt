package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture

class SpotifyFollowerOperation<Response>(val result: CompletableFuture<Response>, private val cancellation: () -> Unit) {
    fun cancel() = cancellation()
}

data class SpotifyNativeFollowerIdentity(
    val streamingServiceAccountIdentifier: String,
    val spotifyAccountIdentifier: String,
    val jamSessionIdentifier: String,
    val hostDeviceIdentifier: String,
    val handle: Long,
    val generation: Long,
    val playerIdentity: SpotifyPlayerIdentity
)

interface SpotifyNativeFollowerObservationSource {
    fun read(identity: SpotifyNativeFollowerIdentity): SpotifyFollowerOperation<SpotifyConnectPlaybackObservation>
}

data class SpotifyFollowerRecording(val recordingIdentifier: String, val title: String, val artist: String)
sealed interface SpotifyFollowerRecordingResolution {
    data class Matched(val recording: SpotifyFollowerRecording) : SpotifyFollowerRecordingResolution
    data object Unavailable : SpotifyFollowerRecordingResolution
    data object Ambiguous : SpotifyFollowerRecordingResolution
}

interface SpotifyNativeFollowerRecordingResolver {
    fun resolve(identity: SpotifyNativeFollowerIdentity, spotifyTrackIdentifier: String): SpotifyFollowerOperation<SpotifyFollowerRecordingResolution>
}

fun interface SpotifyNativeFollowerClock {
    fun nowElapsedRealtimeMilliseconds(): Long
}
fun interface SpotifyNativeFollowerCancellation {
    fun cancel()
}
fun interface SpotifyNativeFollowerScheduler {
    fun schedule(delayMilliseconds: Long, action: () -> Unit): SpotifyNativeFollowerCancellation
}

enum class SpotifyNativeFollowerStatus { Detached, Waiting, Resolving, Preparing, Buffering, Following, Stale, Unavailable, Suspended, Failed }
enum class SpotifyNativeFollowerFailureReason { InvalidInput, InvalidObservation, SourceUnavailable, AuthorizationRequired, RecordingUnavailable, AmbiguousRecording, Unsupported, Superseded, Cancelled, LocalSuspended, PlayerUnavailable, UnknownOutcome, Capacity }
class SpotifyNativeFollowerFailure(val reason: SpotifyNativeFollowerFailureReason) : RuntimeException(reason.name)
data class SpotifyNativeFollowerSnapshot(
    val status: SpotifyNativeFollowerStatus,
    val identity: SpotifyNativeFollowerIdentity?,
    val occurrenceIdentifier: String?,
    val recordingIdentifier: String?,
    val driftMilliseconds: Double?,
    val failure: SpotifyNativeFollowerFailureReason?
)

object SpotifyNativeFollowerPolicy {
    const val MinimumMilliseconds = 0L
    const val MaximumMilliseconds = 9007199254740991L
    const val FirstIdentifier = 1L
    const val MaximumIdentifierCharacters = 512
    const val MaximumObservationAgeMilliseconds = 5000L
    const val MaximumUncertaintyMilliseconds = 750.0
    const val CorrectionThresholdMilliseconds = 250.0
    const val ReconcileIntervalMilliseconds = 1000L
    const val LocalSampleUncertaintyMilliseconds = 1.0
    const val MaximumPendingEvents = 16
    const val EmptyCount = 0
    const val InitialSequence = 0L
    const val SequenceIncrement = 1L
    val TrackIdentifierPattern = Regex("[A-Za-z0-9]{22}")
}

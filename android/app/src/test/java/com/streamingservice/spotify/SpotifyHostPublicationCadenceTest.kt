package com.streamingservice.spotify

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyHostPublicationCadenceTest {
    private val identity = SpotifyHostIdentity(Account, Account, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
    private val cursor = SpotifyHostPlayerCursor(Queue, Revision, Revision, Revision)
    private val mapping = SpotifyHostRecordingMapping(Occurrence, Recording, Track)
    private val mappings = listOf(mapping)
    private val initial = SpotifyHostPlayerQueue(SpotifyHostPlayerSnapshot(identity, cursor, Occurrence, PositionMilliseconds,
        DurationMilliseconds, SampledMilliseconds, true, false, false, true), listOf(SpotifyHostQueueEntry(Occurrence, Recording)),
        false, RepeatMode, PlaybackRate)

    private fun started(queue: SpotifyHostPlayerQueue = initial) = SpotifyHostPublicationCadence().also { cadence ->
        cadence.published(queue, mappings, SampledMilliseconds)
    }
    private fun advancing(elapsedMilliseconds: Long) = initial.copy(snapshot = initial.snapshot.copy(
        positionMilliseconds = PositionMilliseconds + elapsedMilliseconds, sampledAtElapsedMilliseconds = SampledMilliseconds + elapsedMilliseconds))

    @Test fun firstSampleRequiresPublication() {
        assertTrue(SpotifyHostPublicationCadence().shouldPublish(initial, mappings, false, SampledMilliseconds))
    }
    @Test fun pausedQueueDoesNotPublishBeforeHeartbeatAndPublishesAtBoundary() {
        val paused = initial.copy(snapshot = initial.snapshot.copy(paused = true))
        val cadence = started(paused)
        assertFalse(cadence.shouldPublish(paused, mappings, false, SampledMilliseconds + HeartbeatMilliseconds - BoundaryMilliseconds))
        assertTrue(cadence.shouldPublish(paused, mappings, false, SampledMilliseconds + HeartbeatMilliseconds))
    }
    @Test fun naturalProgressAndItsSampleTimestampDoNotCausePublication() {
        assertFalse(started().shouldPublish(advancing(SampleIntervalMilliseconds), mappings, false, SampledMilliseconds + SampleIntervalMilliseconds))
    }
    @Test fun positionDiscontinuityPublishesBeyondToleranceAndNotAtBoundary() {
        val cadence = started()
        val advanced = advancing(SampleIntervalMilliseconds)
        val boundary = advanced.copy(snapshot = advanced.snapshot.copy(positionMilliseconds = advanced.snapshot.positionMilliseconds + PositionToleranceMilliseconds))
        assertFalse(cadence.shouldPublish(boundary, mappings, false, SampledMilliseconds + SampleIntervalMilliseconds))
        val seek = boundary.copy(snapshot = boundary.snapshot.copy(positionMilliseconds = boundary.snapshot.positionMilliseconds + BoundaryMilliseconds))
        assertTrue(cadence.shouldPublish(seek, mappings, false, SampledMilliseconds + SampleIntervalMilliseconds))
    }
    @Test fun stoppedProgressAndBackwardSeekingAreDetected() {
        val stopped = initial.copy(snapshot = initial.snapshot.copy(sampledAtElapsedMilliseconds = SampledMilliseconds + DiscontinuousElapsedMilliseconds))
        assertTrue(started().shouldPublish(stopped, mappings, false, SampledMilliseconds + DiscontinuousElapsedMilliseconds))
        val paused = initial.copy(snapshot = initial.snapshot.copy(paused = true))
        val seek = paused.copy(snapshot = paused.snapshot.copy(positionMilliseconds = PositionMilliseconds - DiscontinuousElapsedMilliseconds))
        assertTrue(started(paused).shouldPublish(seek, mappings, false, SampledMilliseconds))
    }
    @Test fun nativeAcceptedCommandsAlwaysPublishTheirReceipt() {
        assertTrue(started().shouldPublish(initial, mappings, true, SampledMilliseconds))
    }
    @Test fun queueCursorOccurrencePlaybackAndDurationChangesRequirePublication() {
        val changedSnapshots = listOf(initial.snapshot.copy(cursor = cursor.copy(controlRevision = OtherRevision)),
            initial.snapshot.copy(occurrenceIdentifier = OtherOccurrence), initial.snapshot.copy(paused = true),
            initial.snapshot.copy(buffering = true), initial.snapshot.copy(ready = false),
            initial.snapshot.copy(durationMilliseconds = DurationMilliseconds + BoundaryMilliseconds),
            initial.snapshot.copy(externalAuthorityAbsent = false))
        changedSnapshots.forEach { snapshot -> assertTrue(started().shouldPublish(initial.copy(snapshot = snapshot), mappings, false, SampledMilliseconds)) }
        val extended = initial.copy(entries = initial.entries + SpotifyHostQueueEntry(OtherOccurrence, Recording))
        assertTrue(started().shouldPublish(extended, mappings, false, SampledMilliseconds))
    }
    @Test fun changedRelevantMappingsPublishAndUnusedOrReorderedMappingsDoNot() {
        val cadence = started()
        assertTrue(cadence.shouldPublish(initial, listOf(mapping.copy(spotifyTrackIdentifier = OtherTrack)), false, SampledMilliseconds))
        assertFalse(cadence.shouldPublish(initial, listOf(mapping, mapping.copy(recordingIdentifier = OtherRecording)), false, SampledMilliseconds))
    }
    @Test fun successfulPublicationResetsTheHeartbeatButSkippedSamplesDoNot() {
        val cadence = started()
        val first = advancing(SampleIntervalMilliseconds)
        assertFalse(cadence.shouldPublish(first, mappings, false, SampledMilliseconds + SampleIntervalMilliseconds))
        cadence.published(first, mappings, SampledMilliseconds + SampleIntervalMilliseconds)
        val heartbeat = advancing(HeartbeatMilliseconds)
        assertFalse(cadence.shouldPublish(heartbeat, mappings, false, SampledMilliseconds + HeartbeatMilliseconds))
        assertTrue(cadence.shouldPublish(heartbeat, mappings, false, SampledMilliseconds + SampleIntervalMilliseconds + HeartbeatMilliseconds))
    }
    @Test fun clockAndSampleRegressionRequireFreshValidation() {
        assertTrue(started().shouldPublish(initial, mappings, false, SampledMilliseconds - BoundaryMilliseconds))
        val stale = initial.copy(snapshot = initial.snapshot.copy(sampledAtElapsedMilliseconds = SampledMilliseconds - BoundaryMilliseconds))
        assertTrue(started().shouldPublish(stale, mappings, false, SampledMilliseconds))
    }
    @Test fun naturalProgressAtTrackEndIsBoundedToActualDuration() {
        val nearEnd = initial.copy(snapshot = initial.snapshot.copy(positionMilliseconds = DurationMilliseconds - BoundaryMilliseconds))
        val ended = nearEnd.copy(snapshot = nearEnd.snapshot.copy(positionMilliseconds = DurationMilliseconds,
            sampledAtElapsedMilliseconds = SampledMilliseconds + SampleIntervalMilliseconds))
        assertFalse(started(nearEnd).shouldPublish(ended, mappings, false, SampledMilliseconds + SampleIntervalMilliseconds))
    }

    companion object {
        private const val Account = "synthetic-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Queue = "synthetic-queue"
        private const val Occurrence = "synthetic-occurrence"
        private const val OtherOccurrence = "synthetic-other-occurrence"
        private const val Recording = "synthetic-recording"
        private const val OtherRecording = "synthetic-other-recording"
        private const val Track = "4uLU6hMCjMI75M1A2tKUQC"
        private const val OtherTrack = "0VjIjW4GlUZAMYd2vXMi3b"
        private const val Handle = 3L
        private const val Generation = 7L
        private const val Revision = 1L
        private const val OtherRevision = 2L
        private const val PositionMilliseconds = 5000L
        private const val DurationMilliseconds = 180000L
        private const val SampledMilliseconds = 10000L
        private const val BoundaryMilliseconds = 1L
        private const val DiscontinuousElapsedMilliseconds = SpotifyHostingPolicy.HostPositionDiscontinuityToleranceMilliseconds + BoundaryMilliseconds
        private const val HeartbeatMilliseconds = SpotifyHostingPolicy.HostPublicationHeartbeatMilliseconds
        private const val SampleIntervalMilliseconds = SpotifyHostingPolicy.HostPlayerSampleIntervalMilliseconds
        private const val PositionToleranceMilliseconds = SpotifyHostingPolicy.HostPositionDiscontinuityToleranceMilliseconds
        private const val RepeatMode = "off"
        private const val PlaybackRate = 1.0
    }
}

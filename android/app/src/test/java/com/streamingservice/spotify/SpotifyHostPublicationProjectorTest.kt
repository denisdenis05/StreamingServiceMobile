package com.streamingservice.spotify

import com.streamingservice.player.queue.RepeatMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyHostPublicationProjectorTest {
    private class Fixture {
        var nowElapsedMilliseconds = NowElapsedMilliseconds
        val identity = SpotifyHostIdentity(AppAccount, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        val cursor = SpotifyHostPlayerCursor(Queue, QueueRevision, ContentRevision, ControlRevision)
        val snapshot = SpotifyHostPlayerSnapshot(identity, cursor, SecondOccurrence, PositionMilliseconds, DurationMilliseconds,
            SampleElapsedMilliseconds, true, false, false, true)
        val queue = SpotifyHostPlayerQueue(snapshot, listOf(SpotifyHostQueueEntry(FirstOccurrence, Recording), SpotifyHostQueueEntry(SecondOccurrence, Recording)),
            false, RepeatMode.Off.protocolValue, NormalRate)
        val mappings = listOf(SpotifyHostRecordingMapping(FirstOccurrence, Recording, Track), SpotifyHostRecordingMapping(SecondOccurrence, Recording, Track))
        val nativeIdentity = SpotifyHostPublicationIdentity(Device, NativeSession)
        val anchor = SpotifyHostClockAnchor(identity, NativeReadStartMilliseconds, NativeReadEndMilliseconds, ReceivedElapsedMilliseconds,
            ServerMilliseconds, UncertaintyMilliseconds, PreviousHost)
        val projector = SpotifyHostPublicationProjector { nowElapsedMilliseconds }
        fun project(queue: SpotifyHostPlayerQueue = this.queue, mappings: List<SpotifyHostRecordingMapping> = this.mappings,
            anchor: SpotifyHostClockAnchor = this.anchor) = projector.project(queue, mappings, nativeIdentity, anchor, Sequence, null)
    }
    @Test fun projectionUsesActualOccurrenceOrderQueueRevisionAndPlayerState() {
        val fixture = Fixture(); val projected = fixture.project()
        assertEquals(SecondOccurrence, projected.getJSONObject(TrackField).getString(OccurrenceField))
        assertEquals(FirstOccurrence, projected.getJSONArray(PreviousField).getJSONObject(FirstIndex).getString(OccurrenceField))
        assertEquals(EmptyCount, projected.getJSONArray(NextField).length())
        assertEquals(ExpectedQueueRevision, projected.getString(RevisionField))
        assertEquals(PositionMilliseconds, projected.getLong(PositionField)); assertEquals(Playing, projected.getString(StateField))
    }
    @Test fun nativeAndServerClockSamplesUseOnlyTheMeasuredReadAnchorAndElapsedPlayerSample() {
        val fixture = Fixture(); val projected = fixture.project()
        val elapsed = SampleElapsedMilliseconds - ReceivedElapsedMilliseconds
        assertEquals(NativeReadEndMilliseconds + elapsed, projected.getLong(NativeSampleField))
        assertEquals(ServerMilliseconds + elapsed, projected.getLong(ServerSampleField))
        assertEquals(projected.getLong(ServerSampleField), projected.getLong(ActiveSinceField))
    }
    @Test fun pausedReadyAndPausedBufferingPublishDifferentActualStates() {
        val fixture = Fixture()
        val paused = fixture.project(fixture.queue.copy(snapshot = fixture.snapshot.copy(paused = true)))
        assertEquals(Paused, paused.getString(StateField))
        val buffering = fixture.project(fixture.queue.copy(snapshot = fixture.snapshot.copy(paused = true, buffering = true, ready = false)))
        assertEquals(PausedBuffering, buffering.getString(StateField))
        unavailable { fixture.project(fixture.queue.copy(snapshot = fixture.snapshot.copy(ready = false))) }
    }
    @Test fun mismatchedGenerationExcessiveUncertaintyAndBackwardsNativeTimeCannotPublish() {
        val fixture = Fixture()
        val anchors = listOf(fixture.anchor.copy(identity = fixture.identity.copy(generation = OtherGeneration)),
            fixture.anchor.copy(uncertaintyMilliseconds = ExcessiveUncertaintyMilliseconds),
            fixture.anchor.copy(nativeReadCompletedMilliseconds = NativeReadStartMilliseconds - Sequence),
            fixture.anchor.copy(receivedElapsedMilliseconds = SampleElapsedMilliseconds + Sequence))
        anchors.forEach { anchor -> unavailable { fixture.project(anchor = anchor) } }
    }
    @Test fun stalePlayerSamplesAndOldClockAnchorsCannotPublish() {
        val fixture = Fixture(); fixture.nowElapsedMilliseconds = SampleElapsedMilliseconds + StaleSampleMilliseconds
        unavailable { fixture.project() }
        val fresh = fixture.queue.copy(snapshot = fixture.snapshot.copy(sampledAtElapsedMilliseconds = fixture.nowElapsedMilliseconds))
        unavailable { fixture.project(queue = fresh, anchor = fixture.anchor.copy(receivedElapsedMilliseconds = OldAnchorMilliseconds)) }
    }
    @Test fun missingOrAmbiguousRecordingMappingsNeverInventSpotifyTrackIdentifiers() {
        val fixture = Fixture(); unavailable { fixture.project(mappings = emptyList()) }
        unavailable { fixture.project(mappings = fixture.mappings + fixture.mappings.first().copy(spotifyTrackIdentifier = OtherTrack)) }
        val copiedRecording = fixture.queue.copy(entries = fixture.queue.entries.map { entry -> entry.copy(recordingIdentifier = OtherRecording) })
        unavailable { fixture.project(queue = copiedRecording) }
    }
    @Test fun duplicateOccurrencesAndUnsupportedOptionsCannotPublishAContradictoryQueue() {
        val fixture = Fixture()
        val queues = listOf(fixture.queue.copy(entries = listOf(fixture.queue.entries.first(), fixture.queue.entries.first())),
            fixture.queue.copy(shuffled = true), fixture.queue.copy(repeatMode = RepeatMode.All.protocolValue),
            fixture.queue.copy(playbackRate = UnsupportedRate), fixture.queue.copy(snapshot = fixture.snapshot.copy(durationMilliseconds = null)))
        queues.forEach { queue -> unavailable { fixture.project(queue) } }
    }
    @Test fun acceptedCommandProvenanceUsesTheRealMessageAndPreservesAnAbsentSessionCommandIdentifier() {
        val fixture = Fixture()
        val request = SpotifyHostCommandRequest(Request, MessageIdentifier, Sender, null, SpotifyHostCommand.Pause)
        val projected = fixture.projector.project(fixture.queue, fixture.mappings, fixture.nativeIdentity, fixture.anchor, Sequence, null, request)
        val accepted = projected.getJSONObject(AcceptedField)
        assertEquals(MessageIdentifier, accepted.getLong(MessageField)); assertTrue(accepted.isNull(CommandField))
        assertFalse(fixture.project().has(MessageField))
    }
    @Test fun explicitActivationCarriesOnlyTheActualNativeReadBracketAndPreviousHost() {
        val fixture = Fixture(); val activation = fixture.projector.activation(Request, fixture.anchor)
        assertEquals(NativeReadStartMilliseconds, activation.getLong(ReadStartedField))
        assertEquals(NativeReadEndMilliseconds, activation.getLong(ReadCompletedField))
        assertEquals(NativeReadStartMilliseconds, activation.getLong(RequestedField))
        assertEquals(PreviousHost, activation.getString(PreviousHostField))
        assertEquals(Generation, activation.getLong(GenerationField))
    }
    @Test fun initialActivationAllowsTheObservedAbsenceOfAPreviousActiveHost() {
        val fixture = Fixture()
        val activation = fixture.projector.activation(Request, fixture.anchor.copy(previousHostDeviceIdentifier = EmptyHost))
        assertEquals(EmptyHost, activation.getString(PreviousHostField))
    }
    private fun unavailable(operation: () -> Any?) {
        try { operation(); throw AssertionError(ExpectedFailure) }
        catch (failure: SpotifyPlayerFailure) { assertEquals(SpotifyPlayerFailureReason.Unavailable, failure.reason) }
    }
    companion object {
        private const val EmptyHost = ""
        private const val EmptyCount = 0
        private const val FirstIndex = 0
        private const val Sequence = 1L
        private const val Handle = 7L
        private const val Generation = 3L
        private const val OtherGeneration = 4L
        private const val QueueRevision = 7L
        private const val ContentRevision = 3L
        private const val ControlRevision = 5L
        private const val PositionMilliseconds = 5000L
        private const val DurationMilliseconds = 180000L
        private const val SampleElapsedMilliseconds = 10000L
        private const val ReceivedElapsedMilliseconds = 9950L
        private const val NowElapsedMilliseconds = 10001L
        private const val NativeReadStartMilliseconds = 100L
        private const val NativeReadEndMilliseconds = 120L
        private const val ServerMilliseconds = 1700000000000L
        private const val UncertaintyMilliseconds = 50L
        private const val ExcessiveUncertaintyMilliseconds = 2001L
        private const val StaleSampleMilliseconds = 16000L
        private const val OldAnchorMilliseconds = 0L
        private const val NormalRate = 1.0
        private const val UnsupportedRate = 1.5
        private const val MessageIdentifier = 42L
        private const val AppAccount = "synthetic-app-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val NativeSession = "synthetic-native-session"
        private const val PreviousHost = "synthetic-previous-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val Queue = "synthetic-queue"
        private const val ExpectedQueueRevision = "synthetic-queue:3"
        private const val FirstOccurrence = "synthetic-first-occurrence"
        private const val SecondOccurrence = "synthetic-second-occurrence"
        private const val Recording = "synthetic-recording"
        private const val OtherRecording = "synthetic-other-recording"
        private const val Track = "4uLU6hMCjMI75M1A2tKUQC"
        private const val OtherTrack = "AAAAAAAAAAAAAAAAAAAAAA"
        private const val Request = "synthetic-request"
        private const val Sender = "synthetic-sender"
        private const val ExpectedFailure = "Expected unavailable publication"
        private const val TrackField = "track"
        private const val OccurrenceField = "occurrenceIdentifier"
        private const val PreviousField = "previousTracks"
        private const val NextField = "nextTracks"
        private const val RevisionField = "queueRevision"
        private const val PositionField = "positionMilliseconds"
        private const val StateField = "playback"
        private const val NativeSampleField = "sampledNativeMonotonicMilliseconds"
        private const val ServerSampleField = "sampledServerTimestampMilliseconds"
        private const val ActiveSinceField = "activeSinceServerTimestampMilliseconds"
        private const val AcceptedField = "acceptedCommand"
        private const val MessageField = "messageIdentifier"
        private const val CommandField = "sessionCommandIdentifier"
        private const val ReadStartedField = "observationStartedNativeMonotonicMilliseconds"
        private const val ReadCompletedField = "observationCompletedNativeMonotonicMilliseconds"
        private const val RequestedField = "requestedNativeMonotonicMilliseconds"
        private const val PreviousHostField = "expectedPreviousHostDeviceIdentifier"
        private const val GenerationField = "generation"
        private const val Playing = "playing"
        private const val Paused = "paused"
        private const val PausedBuffering = "pausedBuffering"
    }
}

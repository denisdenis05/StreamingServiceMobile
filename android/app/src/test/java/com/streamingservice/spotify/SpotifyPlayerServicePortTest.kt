package com.streamingservice.spotify

import com.streamingservice.player.bridge.PlayerOperation
import com.streamingservice.player.bridge.PlayerProtocol
import com.streamingservice.player.bridge.ProtocolFields
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.ArrayDeque
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor

class SpotifyPlayerServicePortTest {
    private class MainQueue : Executor {
        val commands = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { commands.addLast(command) }
        fun drain() { while (commands.isNotEmpty()) commands.removeFirst().run() }
    }
    private class Coordinator : SpotifyPlayerCoordinator {
        val commands = mutableListOf<JSONObject>()
        val configurations = mutableListOf<Pair<String, String>>()
        var clears = EmptyCount
        var authenticationEpoch = AuthenticationEpoch
        var engineEpoch = EngineEpoch
        var authorityIdentifier: String? = null
        var occurrenceIdentifier: String? = null
        var suspended = false
        var expired = false
        var seekable: Any = true
        var outputReady: Boolean? = null
        var state = PlayerProtocol.PausedState
        var malformed = false
        var receiptStatus = PlayerProtocol.AppliedStatus
        var onSnapshot: () -> Unit = {}
        var onExecute: () -> Unit = {}
        fun cursor(): JSONObject = JSONObject().put(ProtocolFields.EngineEpoch, engineEpoch)
            .put(ProtocolFields.AuthenticationEpoch, authenticationEpoch).put(ProtocolFields.QueueIdentifier, QueueIdentifier)
            .put(ProtocolFields.QueueRevision, Revision).put(ProtocolFields.PlaybackControlRevision, Revision)
        override fun playbackOutputReady(): Boolean? = outputReady
        override fun configure(baseAddress: String, accessToken: String) { configurations.add(baseAddress to accessToken) }
        override fun clearSession() { clears += SingleCount; authenticationEpoch = OtherAuthenticationEpoch }
        override fun snapshot(): JSONObject {
            onSnapshot()
            return JSONObject().put(ProtocolFields.Cursor, cursor()).put(ProtocolFields.ExternalAuthorityIdentifier, authorityIdentifier ?: JSONObject.NULL)
                .put(ProtocolFields.ExternalAuthoritySuspended, suspended).put(ProtocolFields.ExternalAuthorityExpired, expired)
                .put(ProtocolFields.CurrentEntry, occurrenceIdentifier?.let { identifier -> JSONObject().put(ProtocolFields.EntryIdentifier, identifier) } ?: JSONObject.NULL)
                .put(ProtocolFields.CanSeek, seekable).put(ProtocolFields.Interruption, PlayerProtocol.NoInterruption)
                .put(ProtocolFields.State, state).put(ProtocolFields.PositionMilliseconds, PositionMilliseconds)
                .put(ProtocolFields.DurationMilliseconds, DurationMilliseconds).put(ProtocolFields.SampledAtMonotonicMilliseconds, SampledAtMilliseconds)
        }
        override fun execute(payload: String): String {
            val command = JSONObject(payload)
            commands.add(command)
            if (receiptStatus == PlayerProtocol.AppliedStatus) {
                when (command.getString(ProtocolFields.Operation)) {
                    PlayerOperation.SetExternalAuthority.protocolValue -> authorityIdentifier = if (command.isNull(ProtocolFields.AuthorityIdentifier)) null else command.getString(ProtocolFields.AuthorityIdentifier)
                    PlayerOperation.Replace.protocolValue -> occurrenceIdentifier = command.getString(ProtocolFields.ActiveEntryIdentifier)
                }
            }
            onExecute()
            if (malformed) return MalformedReceipt
            return JSONObject().put(ProtocolFields.RequestIdentifier, command.getString(ProtocolFields.RequestIdentifier))
                .put(ProtocolFields.Cursor, cursor()).put(ProtocolFields.Status, receiptStatus).toString()
        }
    }
    private class Fixture {
        val mainQueue = MainQueue()
        val coordinator = Coordinator()
        var identifierSequence = EmptyCount
        val port = SpotifyPlayerServicePort(coordinator, mainQueue, { identifierSequence += SingleCount; IdentifierPrefix + identifierSequence }, MaximumPendingOperations)
        val identity = SpotifyPlayerIdentity(EngineEpoch, AuthenticationEpoch)
        val recording = SpotifyPlayerRecording(OccurrenceIdentifier, RecordingIdentifier, Title, Artist)
        fun <Response> resolve(operation: SpotifyPlayerOperation<Response>): Response { mainQueue.drain(); return operation.result.get() }
        fun configure(): SpotifyPlayerIdentity = resolve(port.configureAuthentication(identity, AccountIdentifier, BaseAddress, AccessToken, false))
        fun lease(): SpotifyPlayerLease { configure(); return resolve(port.acquire(identity, AccountIdentifier)) }
        fun preparedLease(): SpotifyPlayerLease { val lease = lease(); resolve(port.prepare(lease, recording)); return lease }
    }
    private fun failure(reason: SpotifyPlayerFailureReason, operation: SpotifyPlayerOperation<*>, fixture: Fixture) {
        fixture.mainQueue.drain()
        try { operation.result.get(); throw AssertionError(MissingFailure) }
        catch (failure: ExecutionException) { assertEquals(reason, (failure.cause as SpotifyPlayerFailure).reason) }
    }

    @Test fun authenticationAndCoordinatorReadsWaitForInjectedMainExecutor() {
        val fixture = Fixture()
        val operation = fixture.port.configureAuthentication(fixture.identity, AccountIdentifier, BaseAddress, AccessToken, false)
        assertTrue(fixture.coordinator.configurations.isEmpty())
        assertFalse(operation.result.isDone)
        assertEquals(fixture.identity, fixture.resolve(operation))
        assertEquals(listOf(BaseAddress to AccessToken), fixture.coordinator.configurations)
    }
    @Test fun accountReplacementRequiresExplicitResetAndAdvancesActualAuthenticationIdentity() {
        val fixture = Fixture(); fixture.configure()
        failure(SpotifyPlayerFailureReason.Conflict, fixture.port.configureAuthentication(fixture.identity, OtherAccountIdentifier, BaseAddress, AccessToken, false), fixture)
        val identity = fixture.resolve(fixture.port.configureAuthentication(fixture.identity, OtherAccountIdentifier, BaseAddress, AccessToken, true))
        assertEquals(OtherAuthenticationEpoch, identity.authenticationEpoch)
        assertEquals(SingleCount, fixture.coordinator.clears)
    }
    @Test fun sameAccountTokenRefreshPreservesOwnedAuthorityAndEpoch() {
        val fixture = Fixture(); val lease = fixture.lease()
        val identity = fixture.resolve(fixture.port.configureAuthentication(fixture.identity, AccountIdentifier, BaseAddress, RefreshedAccessToken, false))
        assertEquals(fixture.identity, identity)
        assertEquals(lease.authorityIdentifier, fixture.coordinator.authorityIdentifier)
        assertEquals(EmptyCount, fixture.coordinator.clears)
        assertEquals(RefreshedAccessToken, fixture.coordinator.configurations.last().second)
    }
    @Test fun failedAdmissionClaimCanBeRetried() {
        val fixture = Fixture(); fixture.configure(); fixture.coordinator.receiptStatus = PlayerProtocol.ConflictStatus
        failure(SpotifyPlayerFailureReason.Conflict, fixture.port.acquire(fixture.identity, AccountIdentifier), fixture)
        fixture.coordinator.receiptStatus = PlayerProtocol.AppliedStatus
        fixture.resolve(fixture.port.acquire(fixture.identity, AccountIdentifier))
    }
    @Test fun malformedClaimCompensatesOnlyExactAuthorityAndCloseCanRetireUncertainCleanup() {
        val fixture = Fixture(); fixture.configure(); fixture.coordinator.malformed = true
        failure(SpotifyPlayerFailureReason.UnknownOutcome, fixture.port.acquire(fixture.identity, AccountIdentifier), fixture)
        assertNull(fixture.coordinator.authorityIdentifier)
        fixture.coordinator.malformed = false
        fixture.resolve(fixture.port.close())
    }
    @Test fun authenticationCannotChangeUnderOwnedAuthority() {
        val fixture = Fixture(); fixture.lease()
        failure(SpotifyPlayerFailureReason.Conflict, fixture.port.configureAuthentication(fixture.identity, OtherAccountIdentifier, BaseAddress, AccessToken, true), fixture)
        assertEquals(EmptyCount, fixture.coordinator.clears)
    }
    @Test fun acquisitionRequiresConfiguredAccountAndExactEpochs() {
        val fixture = Fixture()
        failure(SpotifyPlayerFailureReason.Superseded, fixture.port.acquire(fixture.identity, AccountIdentifier), fixture)
        fixture.configure(); fixture.coordinator.engineEpoch = OtherEngineEpoch
        failure(SpotifyPlayerFailureReason.Superseded, fixture.port.acquire(fixture.identity, AccountIdentifier), fixture)
        assertTrue(fixture.coordinator.commands.isEmpty())
    }
    @Test fun acquisitionNeverStealsAnotherAuthorityEvenWhenExpired() {
        val fixture = Fixture(); fixture.configure(); fixture.coordinator.authorityIdentifier = OtherAuthorityIdentifier; fixture.coordinator.expired = true
        failure(SpotifyPlayerFailureReason.Conflict, fixture.port.acquire(fixture.identity, AccountIdentifier), fixture)
        assertTrue(fixture.coordinator.commands.isEmpty())
    }
    @Test fun prepareUsesActualCatalogAndOccurrenceWithPausedReplacementAndExpectedRevisions() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val command = fixture.coordinator.commands.last()
        assertEquals(PlayerOperation.Replace.protocolValue, command.getString(ProtocolFields.Operation))
        assertEquals(lease.authorityIdentifier, command.getString(ProtocolFields.ExternalAuthorityIdentifier))
        assertEquals(Revision, command.getLong(ProtocolFields.ExpectedQueueRevision))
        assertEquals(Revision, command.getLong(ProtocolFields.ExpectedPlaybackControlRevision))
        assertEquals(QueueIdentifier, command.getString(ProtocolFields.ExpectedQueueIdentifier))
        assertFalse(command.getBoolean(ProtocolFields.PlayWhenReady))
        assertEquals(OccurrenceIdentifier, command.getString(ProtocolFields.ActiveEntryIdentifier))
        assertEquals(SingleCount, command.getJSONArray(ProtocolFields.Entries).length())
        assertEquals(RecordingIdentifier, command.getJSONArray(ProtocolFields.Entries).getJSONObject(FirstIndex).getString(ProtocolFields.RecordingIdentifier))
    }
    @Test fun samplePreservesActualElapsedRealtimePositionDurationAndDoesNotRenew() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); val commandCount = fixture.coordinator.commands.size
        val sample = fixture.resolve(fixture.port.sample(lease))
        assertEquals(SampledAtMilliseconds, sample.sampledAtMilliseconds)
        assertEquals(SpotifyPlayerClockDomain.ElapsedRealtime, sample.clockDomain)
        assertEquals(PositionMilliseconds, sample.positionMilliseconds)
        assertEquals(DurationMilliseconds, sample.durationMilliseconds)
        assertEquals(OccurrenceIdentifier, sample.occurrenceIdentifier)
        assertNull(sample.ready)
        assertEquals(commandCount, fixture.coordinator.commands.size)
    }
    @Test fun pausedSampleUsesActualNativeReadinessInsteadOfInferringItFromPausedState() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        fixture.coordinator.outputReady = false
        assertEquals(false, fixture.resolve(fixture.port.sample(lease)).ready)
        fixture.coordinator.outputReady = true
        assertEquals(true, fixture.resolve(fixture.port.sample(lease)).ready)
    }
    @Test fun sampleReportsBufferingAndActiveReadinessFromActualStates() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        fixture.coordinator.state = PlayerProtocol.BufferingState; fixture.coordinator.outputReady = false
        val buffering = fixture.resolve(fixture.port.sample(lease)); assertTrue(buffering.buffering); assertEquals(false, buffering.ready)
        fixture.coordinator.state = PlayerProtocol.PlayingState; fixture.coordinator.outputReady = true
        val playing = fixture.resolve(fixture.port.sample(lease)); assertTrue(playing.playing); assertEquals(true, playing.ready)
    }
    @Test fun seekPlayAndPauseAreOccurrenceBoundAndUseExistingAdmissionOperations() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        fixture.resolve(fixture.port.seek(lease, OccurrenceIdentifier, PositionMilliseconds))
        fixture.resolve(fixture.port.play(lease, OccurrenceIdentifier)); fixture.resolve(fixture.port.pause(lease, OccurrenceIdentifier))
        assertEquals(listOf(PlayerOperation.Seek.protocolValue, PlayerOperation.Play.protocolValue, PlayerOperation.Pause.protocolValue), fixture.coordinator.commands.takeLast(ControlCount).map { command -> command.getString(ProtocolFields.Operation) })
        failure(SpotifyPlayerFailureReason.Superseded, fixture.port.play(lease, OtherOccurrenceIdentifier), fixture)
    }
    @Test fun explicitRenewIsSeparateAndLocalPausePreventsRenewAndPlayback() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        fixture.resolve(fixture.port.renew(lease))
        assertEquals(PlayerOperation.RenewExternalAuthority.protocolValue, fixture.coordinator.commands.last().getString(ProtocolFields.Operation))
        fixture.coordinator.suspended = true
        failure(SpotifyPlayerFailureReason.Suspended, fixture.port.renew(lease), fixture)
        failure(SpotifyPlayerFailureReason.Suspended, fixture.port.play(lease, OccurrenceIdentifier), fixture)
        assertTrue(fixture.resolve(fixture.port.sample(lease)).suspended)
    }
    @Test fun expiredLeaseIsSampledButNeverRenewedOrPlayed() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); fixture.coordinator.expired = true
        assertTrue(fixture.resolve(fixture.port.sample(lease)).expired)
        failure(SpotifyPlayerFailureReason.Expired, fixture.port.renew(lease), fixture)
        failure(SpotifyPlayerFailureReason.Expired, fixture.port.play(lease, OccurrenceIdentifier), fixture)
    }
    @Test fun changedAuthenticationEngineAndAuthorityFenceMutations() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        fixture.coordinator.authenticationEpoch = OtherAuthenticationEpoch
        failure(SpotifyPlayerFailureReason.Superseded, fixture.port.renew(lease), fixture)
        fixture.coordinator.authenticationEpoch = AuthenticationEpoch; fixture.coordinator.engineEpoch = OtherEngineEpoch
        failure(SpotifyPlayerFailureReason.Superseded, fixture.port.renew(lease), fixture)
        fixture.coordinator.engineEpoch = EngineEpoch; fixture.coordinator.authorityIdentifier = OtherAuthorityIdentifier
        failure(SpotifyPlayerFailureReason.Superseded, fixture.port.renew(lease), fixture)
    }
    @Test fun releaseRetiresQueuedPlaybackBeforeReleasingExactAuthority() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val play = fixture.port.play(lease, OccurrenceIdentifier)
        fixture.resolve(fixture.port.release(lease))
        failure(SpotifyPlayerFailureReason.Cancelled, play, fixture)
        assertNull(fixture.coordinator.authorityIdentifier)
        assertEquals(PlayerOperation.SetExternalAuthority.protocolValue, fixture.coordinator.commands.last().getString(ProtocolFields.Operation))
    }
    @Test fun releaseCleanupCannotBeCanceledAfterRetiringQueuedPlayback() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val release = fixture.port.release(lease)
        release.cancel()
        fixture.resolve(release)
        assertNull(fixture.coordinator.authorityIdentifier)
    }
    @Test fun releaseDoesNotMutateReplacementAccountOrEngineOrAuthority() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); val count = fixture.coordinator.commands.size
        fixture.coordinator.authenticationEpoch = OtherAuthenticationEpoch
        fixture.resolve(fixture.port.release(lease))
        assertEquals(count, fixture.coordinator.commands.size)
    }
    @Test fun staleReleaseDoesNotCancelNewLeaseOperations() {
        val fixture = Fixture(); val oldLease = fixture.preparedLease(); fixture.resolve(fixture.port.release(oldLease))
        val newLease = fixture.resolve(fixture.port.acquire(fixture.identity, AccountIdentifier))
        val renewal = fixture.port.renew(newLease)
        fixture.resolve(fixture.port.release(oldLease)); fixture.resolve(renewal)
        assertEquals(newLease.authorityIdentifier, fixture.coordinator.authorityIdentifier)
    }
    @Test fun boundedQueueUsesOneDrainAndCancellationFreesCapacity() {
        val fixture = Fixture()
        val first = fixture.port.identity(); val second = fixture.port.identity()
        failure(SpotifyPlayerFailureReason.Capacity, fixture.port.identity(), fixture)
        assertEquals(fixture.identity, first.result.get()); assertEquals(fixture.identity, second.result.get())
        val canceled = fixture.port.identity(); canceled.cancel()
        val accepted = fixture.port.identity()
        assertEquals(SingleCount, fixture.mainQueue.commands.size)
        failure(SpotifyPlayerFailureReason.Cancelled, canceled, fixture); fixture.resolve(accepted)
    }
    @Test fun cancellationDuringPredispatchSnapshotNeverExecutesMutation() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); val count = fixture.coordinator.commands.size
        val operation = fixture.port.play(lease, OccurrenceIdentifier)
        fixture.coordinator.onSnapshot = { operation.cancel() }
        failure(SpotifyPlayerFailureReason.Cancelled, operation, fixture)
        assertEquals(count, fixture.coordinator.commands.size)
    }
    @Test fun cancellationAfterDispatchAndMalformedReceiptsAreUncertainWithoutRetry() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val operation = fixture.port.play(lease, OccurrenceIdentifier)
        fixture.coordinator.onExecute = { operation.cancel() }
        failure(SpotifyPlayerFailureReason.UnknownOutcome, operation, fixture)
        fixture.coordinator.onExecute = {}; fixture.coordinator.malformed = true
        failure(SpotifyPlayerFailureReason.UnknownOutcome, fixture.port.pause(lease, OccurrenceIdentifier), fixture)
    }
    @Test fun releaseAfterCloseCannotCancelQueuedExactLeaseCleanup() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val close = fixture.port.close()
        val release = fixture.port.release(lease)
        fixture.resolve(close)
        failure(SpotifyPlayerFailureReason.Unavailable, release, fixture)
        assertNull(fixture.coordinator.authorityIdentifier)
    }
    @Test fun seekRejectsUnseekableOutputBeforeDispatch() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); fixture.coordinator.seekable = false
        val count = fixture.coordinator.commands.size
        failure(SpotifyPlayerFailureReason.InvalidInput, fixture.port.seek(lease, OccurrenceIdentifier, PositionMilliseconds), fixture)
        assertEquals(count, fixture.coordinator.commands.size)
    }
    @Test fun cancellationCompletionCannotRequeuePlaybackDuringLeaseRetirement() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val queued = fixture.port.play(lease, OccurrenceIdentifier)
        var requeued: SpotifyPlayerOperation<Unit>? = null
        queued.result.whenComplete { _, _ -> requeued = fixture.port.play(lease, OccurrenceIdentifier) }
        fixture.resolve(fixture.port.release(lease))
        failure(SpotifyPlayerFailureReason.Superseded, requireNotNull(requeued), fixture)
        assertFalse(fixture.coordinator.commands.any { command -> command.getString(ProtocolFields.Operation) == PlayerOperation.Play.protocolValue })
    }
    @Test fun samplesExposeUnseekableOutputAndRejectStringBooleanCoercion() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); fixture.coordinator.seekable = false
        assertFalse(fixture.resolve(fixture.port.sample(lease)).seekable)
        fixture.coordinator.seekable = StringBoolean
        failure(SpotifyPlayerFailureReason.InvalidResponse, fixture.port.sample(lease), fixture)
    }
    @Test fun retirementDuringSnapshotFencesDispatchAndRunsExactCleanup() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val play = fixture.port.play(lease, OccurrenceIdentifier)
        fixture.coordinator.onSnapshot = { fixture.coordinator.onSnapshot = {}; fixture.port.release(lease) }
        failure(SpotifyPlayerFailureReason.Cancelled, play, fixture)
        assertNull(fixture.coordinator.authorityIdentifier)
        assertFalse(fixture.coordinator.commands.any { command -> command.getString(ProtocolFields.Operation) == PlayerOperation.Play.protocolValue })
    }
    @Test fun closeRetiresPendingAndRejectsNewOperations() {
        val fixture = Fixture(); val lease = fixture.preparedLease()
        val renewal = fixture.port.renew(lease)
        fixture.resolve(fixture.port.close())
        failure(SpotifyPlayerFailureReason.Cancelled, renewal, fixture)
        failure(SpotifyPlayerFailureReason.Unavailable, fixture.port.identity(), fixture)
        assertNull(fixture.coordinator.authorityIdentifier)
    }
    @Test fun invalidSeekIsRejectedBeforeDispatch() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); val count = fixture.coordinator.commands.size
        failure(SpotifyPlayerFailureReason.InvalidInput, fixture.port.seek(lease, OccurrenceIdentifier, NegativePositionMilliseconds), fixture)
        assertEquals(count, fixture.coordinator.commands.size)
    }
    @Test fun admissionConflictIsPreservedWithoutRetry() {
        val fixture = Fixture(); val lease = fixture.preparedLease(); fixture.coordinator.receiptStatus = PlayerProtocol.ConflictStatus
        failure(SpotifyPlayerFailureReason.Conflict, fixture.port.play(lease, OccurrenceIdentifier), fixture)
    }

    companion object {
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val FirstIndex = 0
        private const val ControlCount = 3
        private const val MaximumPendingOperations = 2
        private const val Revision = 7L
        private const val PositionMilliseconds = 500L
        private const val DurationMilliseconds = 9000L
        private const val SampledAtMilliseconds = 40000L
        private const val NegativePositionMilliseconds = -1L
        private const val EngineEpoch = "engine"
        private const val OtherEngineEpoch = "other-engine"
        private const val AuthenticationEpoch = "authentication"
        private const val OtherAuthenticationEpoch = "other-authentication"
        private const val QueueIdentifier = "queue"
        private const val AccountIdentifier = "account"
        private const val OtherAccountIdentifier = "other-account"
        private const val BaseAddress = "https://media.example.test"
        private const val AccessToken = "test-token"
        private const val RefreshedAccessToken = "refreshed-token"
        private const val IdentifierPrefix = "identifier-"
        private const val OtherAuthorityIdentifier = "other-authority"
        private const val OccurrenceIdentifier = "spotify-occurrence"
        private const val OtherOccurrenceIdentifier = "other-occurrence"
        private const val RecordingIdentifier = "server-recording"
        private const val Title = "Recording title"
        private const val Artist = "Recording artist"
        private const val MalformedReceipt = "malformed"
        private const val StringBoolean = "true"
        private const val MissingFailure = "Expected player failure"
    }
}

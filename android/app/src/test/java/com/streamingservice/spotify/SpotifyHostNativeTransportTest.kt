package com.streamingservice.spotify

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.ArrayDeque
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor

class SpotifyHostNativeTransportTest {
    private class Queue : Executor {
        val work = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { work.addLast(command) }
        fun drain() { while (work.isNotEmpty()) work.removeFirst().run() }
    }
    private class Fixture {
        val queue = Queue()
        var current = true
        var commandHandlingReady = true
        var elapsedMilliseconds = InitialElapsedMilliseconds
        var roundTripMilliseconds = ReadRoundTripMilliseconds
        var nativeReadSampleMilliseconds = NativeReadSampleMilliseconds
        var owned = true
        var host = PreviousHost
        var activeDevice: String? = null
        var afterMembership: () -> Unit = {}
        var afterExecution: () -> Unit = {}
        var afterRead: () -> Unit = {}
        var receiptFailure: String? = null
        var receiptOverride: String? = null
        var executionFailure = false
        var membershipCount = EmptyCount
        var reads = EmptyCount
        val controls = mutableListOf<JSONObject>()
        val identity = SpotifyHostIdentity(AppAccount, SpotifyAccount, Jam, Device, Handle, Generation, SpotifyPlayerIdentity(Engine, Authentication))
        val native = object : SpotifyHostingNativeCalls {
            override fun membership(handle: Long, generation: Long): String {
                membershipCount += SingleCount
                val response = JSONObject().put(HandleField, handle).put(GenerationField, generation).put(ReadingField,
                    JSONObject().put(AccountField, SpotifyAccount).put(MembershipField,
                        JSONObject().put(OwnedField, owned).put(ActiveField, true).put(SessionField, Jam).put(HostField, host)))
                afterMembership()
                return response.toString()
            }
            override fun read(handle: Long, generation: Long): String {
                reads += SingleCount; elapsedMilliseconds += roundTripMilliseconds
                val response = JSONObject().put(HandleField, handle).put(GenerationField, generation).put(SampledNativeField, nativeReadSampleMilliseconds)
                    .put(ReadingField, JSONObject().put(ReadStartedField, NativeReadStartMilliseconds).put(ReadCompletedField, NativeReadEndMilliseconds)
                        .put(ClusterField, JSONObject().put(ActiveDeviceField, activeDevice ?: host).put(ServerField, ServerMilliseconds)))
                afterRead()
                return response.toString()
            }
            override fun execute(handle: Long, serialized: String): String {
                assertEquals(Handle, handle)
                val control = JSONObject(serialized); controls.add(control); afterExecution()
                if (executionFailure) throw IllegalStateException(PrivateFailure)
                receiptOverride?.let { receipt -> return receipt }
                val receipt = JSONObject().put(FailureField, receiptFailure ?: JSONObject.NULL)
                if (control.getString(OperationField) == HostIdentityOperation) receipt.put(HostingIdentityField,
                    JSONObject().put(DeviceField, Device).put(SessionField, NativeSession).put(NextSequenceField, NextSequence))
                return receipt.toString()
            }
        }
        val transport = SpotifyHostNativeTransport(native, queue, { elapsedMilliseconds }, { current }, { commandHandlingReady })
        fun <Response> complete(operation: SpotifyPlayerOperation<Response>): Response { queue.drain(); return operation.result.get() }
    }
    @Test fun retainedPublicationReadPreservesItsOriginalAgeInThePlayerClockAnchor() {
        val fixture = Fixture(); fixture.nativeReadSampleMilliseconds = NativeReadEndMilliseconds + RetainedReceiptAgeMilliseconds
        val anchor = fixture.complete(fixture.transport.preflight(fixture.identity, PreviousHost))
        assertEquals(fixture.elapsedMilliseconds - RetainedReceiptAgeMilliseconds, anchor.receivedElapsedMilliseconds)
        assertEquals(NativeReadEndMilliseconds, anchor.nativeReadCompletedMilliseconds)
        assertEquals(ServerMilliseconds, anchor.serverAtMilliseconds)
    }
    @Test fun expiredRetainedPublicationCannotBeTreatedAsAFreshHostObservation() {
        val fixture = Fixture(); fixture.nativeReadSampleMilliseconds = NativeReadEndMilliseconds + ExpiredReceiptAgeMilliseconds
        val operation = fixture.transport.preflight(fixture.identity, PreviousHost); fixture.queue.drain()
        failure(operation.result, Deadline)
    }
    @Test fun registrationUsesActualNativeDeviceSessionAndNextPublicationSequence() {
        val fixture = Fixture(); val registration = fixture.complete(fixture.transport.registration(fixture.identity))
        assertEquals(Device, registration.identity.deviceIdentifier); assertEquals(NativeSession, registration.identity.sessionIdentifier)
        assertEquals(NextSequence, registration.nextPublicationSequence)
        assertEquals(Generation, fixture.controls.single().getLong(GenerationField))
    }
    @Test fun preflightVerifiesOwnedMembershipAroundTheActualReadAndPreservesNativeClockBracket() {
        val fixture = Fixture(); val anchor = fixture.complete(fixture.transport.preflight(fixture.identity, PreviousHost))
        assertEquals(TwoMembershipReads, fixture.membershipCount); assertEquals(SingleCount, fixture.reads)
        assertEquals(NativeReadStartMilliseconds, anchor.nativeReadStartedMilliseconds)
        assertEquals(NativeReadEndMilliseconds, anchor.nativeReadCompletedMilliseconds)
        assertEquals(fixture.elapsedMilliseconds - (NativeReadSampleMilliseconds - NativeReadEndMilliseconds), anchor.receivedElapsedMilliseconds)
        assertTrue(anchor.uncertaintyMilliseconds >= ReadRoundTripMilliseconds)
    }
    @Test fun retirementReadRemainsAvailableAfterMembershipEndsOrAnotherHostTakesOver() {
        val fixture = Fixture(); fixture.owned = false; fixture.host = OtherHost
        val anchor = fixture.complete(fixture.transport.retirementAnchor(fixture.identity))
        assertEquals(OtherHost, anchor.previousHostDeviceIdentifier)
        assertEquals(EmptyCount, fixture.membershipCount); assertEquals(SingleCount, fixture.reads)
    }
    @Test fun retirementReadStillRejectsAReplacedConnection() {
        val fixture = Fixture(); fixture.afterRead = { fixture.current = false }
        val operation = fixture.transport.retirementAnchor(fixture.identity); fixture.queue.drain()
        failure(operation.result, Superseded)
    }
    @Test fun guestMembershipCannotActivateTheAppAsHost() {
        val fixture = Fixture(); fixture.owned = false
        val result = fixture.transport.preflight(fixture.identity, PreviousHost); fixture.queue.drain()
        failure(result.result, Forbidden); assertEquals(EmptyCount, fixture.reads)
    }
    @Test fun accountReplacementAfterTheFirstMembershipReadPreventsThePlaybackRead() {
        val fixture = Fixture(); fixture.afterMembership = { fixture.current = false }
        val result = fixture.transport.preflight(fixture.identity, PreviousHost); fixture.queue.drain()
        failure(result.result, Superseded); assertEquals(EmptyCount, fixture.reads)
    }
    @Test fun changedHostAfterTheReadFailsTheSecondMembershipVerification() {
        val fixture = Fixture(); fixture.afterRead = { fixture.host = OtherHost }
        val result = fixture.transport.preflight(fixture.identity, PreviousHost); fixture.queue.drain()
        failure(result.result, Superseded); assertEquals(TwoMembershipReads, fixture.membershipCount)
    }
    @Test fun excessiveRoundTripCannotSupplyAHostClockAnchor() {
        val fixture = Fixture(); fixture.roundTripMilliseconds = ExcessiveRoundTripMilliseconds
        val result = fixture.transport.preflight(fixture.identity, PreviousHost); fixture.queue.drain()
        failure(result.result, Deadline)
    }
    @Test fun nativeSourceHostMustMatchTheExpectedActualHost() {
        val fixture = Fixture()
        val result = fixture.transport.preflight(fixture.identity, OtherHost); fixture.queue.drain()
        failure(result.result, Superseded); assertEquals(EmptyCount, fixture.reads)
    }
    @Test fun canceledQueuedPublicationNeverCallsTheNativeTransport() {
        val fixture = Fixture(); val result = fixture.transport.publish(fixture.identity, JSONObject())
        result.cancel(); fixture.queue.drain(); failure(result.result, Canceled)
        assertTrue(fixture.controls.isEmpty())
    }
    @Test fun scopeReplacementAfterPublicationDispatchRemainsUnknownAndNeverRetries() {
        val fixture = Fixture(); fixture.afterExecution = { fixture.current = false }
        val result = fixture.transport.publish(fixture.identity, JSONObject()); fixture.queue.drain()
        failure(result.result, UnknownOutcome); assertEquals(SingleCount, fixture.controls.size)
    }
    @Test fun malformedAndThrownMutationRepliesRemainUnknownWithoutRawFailures() {
        val malformed = Fixture(); malformed.receiptOverride = PrivateFailure
        val invalid = malformed.transport.deactivate(malformed.identity, JSONObject()); malformed.queue.drain(); failure(invalid.result, UnknownOutcome)
        val thrown = Fixture(); thrown.executionFailure = true
        val uncertain = thrown.transport.publish(thrown.identity, JSONObject()); thrown.queue.drain(); failure(uncertain.result, UnknownOutcome)
    }
    @Test fun knownNativeRejectionPreservesItsSafeCodeWithoutRetry() {
        val fixture = Fixture(); fixture.receiptFailure = Backpressure
        val result = fixture.transport.publish(fixture.identity, JSONObject()); fixture.queue.drain()
        failure(result.result, Backpressure); assertEquals(SingleCount, fixture.controls.size)
    }
    @Test fun activationUsesTheActualSampleReadinessAndRejectsAnExternalPlayerAuthority() {
        val fixture = Fixture()
        val snapshot = SpotifyHostPlayerSnapshot(fixture.identity, SpotifyHostPlayerCursor(QueueIdentifier, NextSequence, NextSequence, NextSequence),
            Occurrence, InitialPositionMilliseconds, DurationMilliseconds, fixture.elapsedMilliseconds, true, true, false, true)
        val queue = SpotifyHostPlayerQueue(snapshot, listOf(SpotifyHostQueueEntry(Occurrence, Recording)), false, RepeatModeOff, NormalPlaybackRate)
        fixture.complete(fixture.transport.activate(fixture.identity, queue, JSONObject(), JSONObject()))
        val readiness = fixture.controls.single().getJSONObject(ReadinessField)
        assertTrue(readiness.getBoolean(OutputReadyField)); assertTrue(readiness.getBoolean(AuthorityAbsentField))
        val unavailable = fixture.transport.activate(fixture.identity, queue.copy(snapshot = snapshot.copy(ready = false)), JSONObject(), JSONObject())
        failure(unavailable.result, InvalidInput)
        val external = fixture.transport.activate(fixture.identity, queue.copy(snapshot = snapshot.copy(externalAuthorityAbsent = false)), JSONObject(), JSONObject())
        failure(external.result, InvalidInput); assertEquals(SingleCount, fixture.controls.size)
    }
    @Test fun ownedJamWithNoPreviousActiveDeviceStillProvidesAnExactInitialHostAnchor() {
        val fixture = Fixture(); fixture.host = EmptyHost
        val anchor = fixture.complete(fixture.transport.preflight(fixture.identity, EmptyHost))
        assertEquals(EmptyHost, anchor.previousHostDeviceIdentifier)
        assertEquals(TwoMembershipReads, fixture.membershipCount)
    }
    @Test fun ownedJamWithoutAHostCapturesTheActualExistingConnectDeviceForExplicitActivation() {
        val fixture = Fixture(); fixture.host = EmptyHost; fixture.activeDevice = OtherHost
        val anchor = fixture.complete(fixture.transport.preflight(fixture.identity, EmptyHost))
        assertEquals(OtherHost, anchor.previousHostDeviceIdentifier)
        assertEquals(TwoMembershipReads, fixture.membershipCount); assertEquals(SingleCount, fixture.reads)
    }
    @Test fun initialHostCaptureRejectsMembershipAcquisitionByAnotherDeviceDuringTheRead() {
        val fixture = Fixture(); fixture.host = EmptyHost; fixture.activeDevice = OtherHost
        fixture.afterRead = { fixture.host = OtherHost }
        val operation = fixture.transport.preflight(fixture.identity, EmptyHost); fixture.queue.drain()
        failure(operation.result, Superseded); assertEquals(TwoMembershipReads, fixture.membershipCount)
    }
    @Test fun aKnownJamHostStillRequiresTheExactConnectDeviceBeforeActivation() {
        val fixture = Fixture(); fixture.activeDevice = OtherHost
        val operation = fixture.transport.preflight(fixture.identity, PreviousHost); fixture.queue.drain()
        failure(operation.result, Superseded); assertEquals(SingleCount, fixture.reads)
    }
    @Test fun malformedRegistrationReceiptsCannotInventADeviceOrSequence() {
        val fixture = Fixture(); fixture.receiptOverride = JSONObject().put(FailureField, JSONObject.NULL).toString()
        val result = fixture.transport.registration(fixture.identity); fixture.queue.drain(); failure(result.result, InvalidResponse)
    }
    @Test fun missingOrRetiredIncomingHandlerCannotAdvertiseControlCapability() {
        val missing = Fixture(); missing.commandHandlingReady = false
        val refused = missing.transport.publish(missing.identity, JSONObject()); failure(refused.result, Unsupported)
        assertTrue(missing.controls.isEmpty())
        val retired = Fixture(); val queued = retired.transport.publish(retired.identity, JSONObject())
        retired.commandHandlingReady = false; retired.queue.drain(); failure(queued.result, Canceled)
        assertTrue(retired.controls.isEmpty())
    }
    @Test fun actualHandlerReadinessIsCopiedIntoTheNativePublicationWithoutMutatingItsInput() {
        val fixture = Fixture(); val snapshot = JSONObject()
        fixture.complete(fixture.transport.publish(fixture.identity, snapshot))
        assertTrue(fixture.controls.single().getJSONObject(SnapshotField).getBoolean(CommandReadyField))
        assertFalse(snapshot.has(CommandReadyField))
    }
    @Test fun withdrawalUsesOnlyTheActualNativeIdentityAndSequenceWithoutAHandlerOrPlayerSample() {
        val fixture = Fixture(); fixture.commandHandlingReady = false; fixture.owned = false
        val actual = fixture.complete(fixture.transport.registration(fixture.identity))
        fixture.controls.clear()
        fixture.complete(fixture.transport.withdraw(fixture.identity, actual))
        val control = fixture.controls.single()
        assertEquals(WithdrawOperation, control.getString(OperationField)); assertEquals(Device, control.getString(DeviceField))
        assertEquals(NativeSession, control.getString(SessionField)); assertEquals(NextSequence, control.getLong(SequenceField))
        assertFalse(control.has(SnapshotField)); assertEquals(EmptyCount, fixture.reads); assertEquals(EmptyCount, fixture.membershipCount)
    }
    @Test fun withdrawalRejectsForeignNativeIdentityAndInvalidSequenceBeforeDispatch() {
        val fixture = Fixture()
        val foreign = SpotifyHostNativeRegistration(SpotifyHostPublicationIdentity(OtherHost, NativeSession), NextSequence)
        failure(fixture.transport.withdraw(fixture.identity, foreign).result, InvalidInput)
        val invalid = foreign.copy(identity = foreign.identity.copy(deviceIdentifier = Device), nextPublicationSequence = InvalidSequence)
        failure(fixture.transport.withdraw(fixture.identity, invalid).result, InvalidInput)
        assertTrue(fixture.controls.isEmpty())
    }
    @Test fun uncertainWithdrawalIsNeverReplayed() {
        val fixture = Fixture(); val actual = fixture.complete(fixture.transport.registration(fixture.identity)); fixture.controls.clear()
        fixture.executionFailure = true
        val operation = fixture.transport.withdraw(fixture.identity, actual); fixture.queue.drain()
        failure(operation.result, UnknownOutcome); assertEquals(SingleCount, fixture.controls.size)
    }
    @Test fun incomingRepliesCarryTheirActualKeyAndAcceptance() {
        val fixture = Fixture(); fixture.complete(fixture.transport.reply(fixture.identity, CommandKey, false))
        assertEquals(CommandKey, fixture.controls.single().getString(KeyField)); assertFalse(fixture.controls.single().getBoolean(AcceptedField))
    }
    private fun failure(result: CompletableFuture<*>, code: String) {
        try { result.get(); throw AssertionError(ExpectedFailure) }
        catch (failure: ExecutionException) { assertEquals(code, (failure.cause as SpotifyConnectFailure).code) }
    }
    companion object {
        private const val WithdrawOperation = "withdraw"
        private const val SequenceField = "sequence"
        private const val InvalidSequence = 0L
        private const val Unsupported = "unsupported"
        private const val SnapshotField = "snapshot"
        private const val CommandReadyField = "commandHandlingReady"
        private const val EmptyHost = ""
        private const val Occurrence = "synthetic-occurrence"
        private const val Recording = "synthetic-recording"
        private const val DurationMilliseconds = 180000L
        private const val QueueIdentifier = "synthetic-queue"
        private const val InitialPositionMilliseconds = 0L
        private const val NormalPlaybackRate = 1.0
        private const val RepeatModeOff = "off"
        private const val ReadinessField = "readiness"
        private const val OutputReadyField = "playbackOutputReady"
        private const val AuthorityAbsentField = "externalAuthorityAbsent"
        private const val InvalidInput = "invalid-input"
        private const val InvalidResponse = "invalid-response"
        private const val EmptyCount = 0
        private const val SingleCount = 1
        private const val TwoMembershipReads = 2
        private const val Handle = 7L
        private const val Generation = 3L
        private const val NextSequence = 9L
        private const val RetainedReceiptAgeMilliseconds = 500L
        private const val ExpiredReceiptAgeMilliseconds = 15001L
        private const val InitialElapsedMilliseconds = 10000L
        private const val ReadRoundTripMilliseconds = 20L
        private const val ExcessiveRoundTripMilliseconds = 2001L
        private const val NativeReadStartMilliseconds = 100L
        private const val NativeReadEndMilliseconds = 120L
        private const val NativeReadSampleMilliseconds = 125L
        private const val ServerMilliseconds = 1700000000000L
        private const val AppAccount = "synthetic-app-account"
        private const val SpotifyAccount = "synthetic-spotify-account"
        private const val Jam = "synthetic-jam"
        private const val Device = "synthetic-device"
        private const val NativeSession = "synthetic-native-session"
        private const val PreviousHost = "synthetic-previous-host"
        private const val OtherHost = "synthetic-other-host"
        private const val Engine = "synthetic-engine"
        private const val Authentication = "synthetic-authentication"
        private const val CommandKey = "synthetic-command-key"
        private const val PrivateFailure = "synthetic private raw native failure"
        private const val ExpectedFailure = "Expected a safe native failure"
        private const val Forbidden = "forbidden"
        private const val Superseded = "superseded"
        private const val Deadline = "deadline"
        private const val Canceled = "canceled"
        private const val UnknownOutcome = "unknown-outcome"
        private const val Backpressure = "backpressure"
        private const val HandleField = "handle"
        private const val GenerationField = "generation"
        private const val ReadingField = "reading"
        private const val AccountField = "accountIdentifier"
        private const val MembershipField = "membership"
        private const val OwnedField = "ownedByCurrentAccount"
        private const val ActiveField = "active"
        private const val SessionField = "sessionIdentifier"
        private const val HostField = "hostDeviceIdentifier"
        private const val SampledNativeField = "sampledNativeMonotonicMilliseconds"
        private const val ReadStartedField = "requestStartedNativeMonotonicMilliseconds"
        private const val ReadCompletedField = "requestCompletedNativeMonotonicMilliseconds"
        private const val ClusterField = "cluster"
        private const val ActiveDeviceField = "activeDeviceIdentifier"
        private const val ServerField = "serverAtMilliseconds"
        private const val OperationField = "operation"
        private const val FailureField = "failure"
        private const val HostIdentityOperation = "hostIdentity"
        private const val HostingIdentityField = "hostingIdentity"
        private const val DeviceField = "deviceIdentifier"
        private const val NextSequenceField = "nextPublicationSequence"
        private const val KeyField = "key"
        private const val AcceptedField = "accepted"
    }
}

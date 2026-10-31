package com.streamingservice.spotify

import org.json.JSONObject
import org.json.JSONException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

interface SpotifyHostingNativeCalls {
    fun membership(handle: Long, generation: Long): String
    fun read(handle: Long, generation: Long): String
    fun execute(handle: Long, serialized: String): String
}
internal object PlatformSpotifyHostingNativeCalls : SpotifyHostingNativeCalls {
    override fun membership(handle: Long, generation: Long): String = SpotifyLibrespotNative.connectMembership(handle, generation)
    override fun read(handle: Long, generation: Long): String = SpotifyLibrespotNative.connectRead(handle, generation)
    override fun execute(handle: Long, serialized: String): String = SpotifyLibrespotNative.connectExecute(handle, serialized)
}
data class SpotifyHostNativeRegistration(val identity: SpotifyHostPublicationIdentity, val nextPublicationSequence: Long)

class SpotifyHostNativeTransport(
    private val native: SpotifyHostingNativeCalls,
    private val executor: Executor,
    private val clock: SpotifyNativeFollowerClock,
    private val isCurrent: (SpotifyHostIdentity) -> Boolean,
    private val commandHandlingReady: (SpotifyHostIdentity) -> Boolean
) : SpotifyHostControlTransport {
    override fun registration(identity: SpotifyHostIdentity): SpotifyPlayerOperation<SpotifyHostNativeRegistration> = submit(identity, false) { requireCurrent, _markDispatched ->
        requireCurrent()
        val response = response(native.execute(identity.handle, control(identity, HostIdentityOperation).toString()))
        val registration = response.getJSONObject(HostingIdentityField)
        val device = text(registration, DeviceField)
        if (device != identity.deviceIdentifier) fail(Superseded)
        SpotifyHostNativeRegistration(SpotifyHostPublicationIdentity(device, text(registration, PlayerSessionField)), integer(registration, NextSequenceField, FirstIdentifier))
    }

    override fun preflight(identity: SpotifyHostIdentity, expectedHostDeviceIdentifier: String): SpotifyPlayerOperation<SpotifyHostClockAnchor> = submit(identity, false) { requireCurrent, _markDispatched ->
        requireCurrent()
        membership(native.membership(identity.handle, identity.generation), identity, expectedHostDeviceIdentifier)
        requireCurrent()
        val expectedActiveDevice = expectedHostDeviceIdentifier.takeUnless { identifier -> identifier.isEmpty() }
        val anchor = readAnchor(identity, expectedActiveDevice, requireCurrent)
        membership(native.membership(identity.handle, identity.generation), identity, expectedHostDeviceIdentifier)
        requireCurrent()
        anchor
    }

    override fun retirementAnchor(identity: SpotifyHostIdentity): SpotifyPlayerOperation<SpotifyHostClockAnchor> = submit(identity, false) { requireCurrent, _markDispatched ->
        readAnchor(identity, null, requireCurrent)
    }

    private fun readAnchor(identity: SpotifyHostIdentity, expectedHostDeviceIdentifier: String?, requireCurrent: () -> Unit): SpotifyHostClockAnchor {
        requireCurrent()
        val sent = clock.nowElapsedRealtimeMilliseconds()
        val response = response(native.read(identity.handle, identity.generation))
        val received = clock.nowElapsedRealtimeMilliseconds()
        requireCurrent()
        bound(response, identity)
        val reading = response.getJSONObject(ReadingField)
        val startedNative = integer(reading, ReadStartedField)
        val completedNative = integer(reading, ReadCompletedField)
        val sampledNative = integer(response, SampledNativeField)
        val roundTrip = received - sent
        if (sent !in MinimumMilliseconds..MaximumSafeInteger || received !in sent..MaximumSafeInteger
            || roundTrip < MinimumMilliseconds || roundTrip > SpotifyHostingPolicy.MaximumClockUncertaintyMilliseconds - NativePrecisionMilliseconds
            || startedNative > completedNative || completedNative > sampledNative
            || completedNative - startedNative > roundTrip + NativePrecisionMilliseconds) fail(Deadline)
        val cluster = reading.getJSONObject(ClusterField)
        val activeHost = cluster.getString(ActiveDeviceField)
        if (expectedHostDeviceIdentifier != null && activeHost != expectedHostDeviceIdentifier) fail(Superseded)
        val server = integer(cluster, ServerField, FirstIdentifier)
        return SpotifyHostClockAnchor(identity, startedNative, completedNative, received, server, roundTrip + NativePrecisionMilliseconds, activeHost)
    }

    override fun activate(identity: SpotifyHostIdentity, queue: SpotifyHostPlayerQueue, snapshot: JSONObject, activation: JSONObject): SpotifyPlayerOperation<Unit> {
        if (queue.snapshot.identity != identity || !queue.snapshot.ready || !queue.snapshot.externalAuthorityAbsent
            || queue.entries.none { entry -> entry.occurrenceIdentifier == queue.snapshot.occurrenceIdentifier }) return rejected(InvalidInput)
        val commandsReady = handlingReady(identity)
        if (!commandsReady) return rejected(Unsupported)
        return mutate(identity, control(identity, ActivateOperation).put(SnapshotField, commandedSnapshot(snapshot, commandsReady)).put(ActivationField, activation)
            .put(ReadinessField, JSONObject().put(OutputReadyField, queue.snapshot.ready).put(AuthorityAbsentField, queue.snapshot.externalAuthorityAbsent)
                .put(CommandReadyField, commandsReady)), true)
    }

    override fun publish(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> {
        val commandsReady = handlingReady(identity)
        return if (!commandsReady) rejected(Unsupported) else mutate(identity, control(identity, PublishOperation).put(SnapshotField, commandedSnapshot(snapshot, commandsReady)), true)
    }
    override fun withdraw(identity: SpotifyHostIdentity, registration: SpotifyHostNativeRegistration): SpotifyPlayerOperation<Unit> {
        if (registration.identity.deviceIdentifier != identity.deviceIdentifier || registration.nextPublicationSequence !in FirstIdentifier..MaximumSafeInteger)
            return rejected(InvalidInput)
        return mutate(identity, control(identity, WithdrawOperation).put(DeviceField, registration.identity.deviceIdentifier)
            .put(PlayerSessionField, registration.identity.sessionIdentifier).put(SequenceField, registration.nextPublicationSequence))
    }
    override fun deactivate(identity: SpotifyHostIdentity, snapshot: JSONObject): SpotifyPlayerOperation<Unit> = mutate(identity, control(identity, DeactivateOperation).put(SnapshotField, snapshot))
    override fun reply(identity: SpotifyHostIdentity, key: String, accepted: Boolean): SpotifyPlayerOperation<Unit> =
        mutate(identity, control(identity, ReplyOperation).put(KeyField, key).put(AcceptedField, accepted))

    private fun mutate(identity: SpotifyHostIdentity, control: JSONObject, requiresHandler: Boolean = false): SpotifyPlayerOperation<Unit> {
        val serialized = control.toString()
        if (serialized.length > MaximumControlCharacters) return rejected(InvalidInput)
        return submit(identity, true) { requireCurrent, markDispatched ->
            requireCurrent()
            if (requiresHandler && !handlingReady(identity)) fail(Canceled)
            markDispatched()
            val receipt = response(native.execute(identity.handle, serialized))
            if (!receipt.has(FailureField) || !receipt.isNull(FailureField)) fail(InvalidResponse)
            Unit
        }
    }
    private fun commandedSnapshot(snapshot: JSONObject, commandsReady: Boolean): JSONObject = JSONObject(snapshot.toString()).put(CommandReadyField, commandsReady)
    private fun handlingReady(identity: SpotifyHostIdentity): Boolean = try { commandHandlingReady(identity) } catch (_failure: Throwable) { false }
    private fun control(identity: SpotifyHostIdentity, operation: String): JSONObject = JSONObject().put(OperationField, operation).put(GenerationField, identity.generation)
    private fun membership(serialized: String, identity: SpotifyHostIdentity, expectedHost: String) {
        val response = response(serialized); bound(response, identity)
        val reading = response.getJSONObject(ReadingField)
        if (reading.getString(AccountField) != identity.spotifyAccountIdentifier) fail(Unauthorized)
        if (reading.isNull(MembershipField)) fail(Superseded)
        val membership = reading.getJSONObject(MembershipField)
        if (membership.opt(OwnedField) != true) fail(Forbidden)
        if (membership.getString(JamField) != identity.jamSessionIdentifier || membership.opt(ActiveField) != true) fail(Superseded)
        val host = if (membership.isNull(HostField)) EmptyHost else membership.getString(HostField)
        if (host != expectedHost) fail(Superseded)
    }
    private fun bound(response: JSONObject, identity: SpotifyHostIdentity) {
        if (integer(response, HandleField, FirstIdentifier) != identity.handle || integer(response, GenerationField, FirstIdentifier) != identity.generation) fail(Superseded)
    }
    private fun response(serialized: String): JSONObject {
        if (serialized.length > MaximumResponseCharacters) fail(InvalidResponse)
        val response = JSONObject(serialized)
        if (response.has(FailureField) && !response.isNull(FailureField)) fail((response.opt(FailureField) as? String)?.takeIf { code -> code in FailureCodes } ?: Network)
        return response
    }
    private fun text(value: JSONObject, field: String): String = (value.get(field) as? String ?: fail(InvalidResponse)).also { selected ->
        if (selected.isBlank() || selected.length > SpotifyHostingPolicy.MaximumIdentifierCharacters
            || selected.any { character -> character.isWhitespace() || character.isISOControl() }) fail(InvalidResponse)
    }
    private fun integer(value: JSONObject, field: String, minimum: Long = MinimumMilliseconds): Long {
        val number = value.get(field) as? Number ?: fail(InvalidResponse)
        if (!number.toDouble().isFinite() || number.toDouble() != number.toLong().toDouble() || number.toLong() !in minimum..MaximumSafeInteger) fail(InvalidResponse)
        return number.toLong()
    }
    private fun <Response> submit(identity: SpotifyHostIdentity, mutation: Boolean, work: (() -> Unit, () -> Unit) -> Response): SpotifyPlayerOperation<Response> {
        val completion = CompletableFuture<Response>(); val cancelled = AtomicBoolean(false)
        try {
            executor.execute {
                var dispatched = false
                fun requireCurrent() {
                    if (cancelled.get()) fail(if (dispatched && mutation) UnknownOutcome else Canceled)
                    if (!current(identity)) fail(if (dispatched && mutation) UnknownOutcome else Superseded)
                }
                try {
                    requireCurrent()
                    val response = work(::requireCurrent) { dispatched = true }
                    requireCurrent()
                    completion.complete(response)
                } catch (failure: Throwable) {
                    val code = (failure as? SpotifyConnectFailure)?.code?.takeIf { selected -> selected in FailureCodes }
                    completion.completeExceptionally(SpotifyConnectFailure(if (mutation && dispatched && (code == null || code == InvalidResponse || cancelled.get() || !current(identity))) UnknownOutcome
                        else code ?: if (failure is JSONException) InvalidResponse else Network))
                }
            }
        } catch (_failure: Throwable) { completion.completeExceptionally(SpotifyConnectFailure(Backpressure)) }
        return SpotifyPlayerOperation(completion) { cancelled.set(true) }
    }
    private fun current(identity: SpotifyHostIdentity): Boolean = try { isCurrent(identity) } catch (_failure: Throwable) { false }
    private fun <Response> rejected(code: String): SpotifyPlayerOperation<Response> = SpotifyPlayerOperation(CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }) {}
    private fun fail(code: String): Nothing = throw SpotifyConnectFailure(code)

    companion object {
        private const val FirstIdentifier = 1L
        private const val MinimumMilliseconds = 0L
        private const val NativePrecisionMilliseconds = SpotifyHostingPolicy.NativeClockPrecisionMilliseconds
        private const val MaximumSafeInteger = SpotifyHostingPolicy.MaximumSafeInteger
        private const val MaximumResponseCharacters = 1048576
        private const val MaximumControlCharacters = 131072
        private const val EmptyHost = ""
        private const val OperationField = "operation"
        private const val GenerationField = "generation"
        private const val HandleField = "handle"
        private const val FailureField = "failure"
        private const val HostingIdentityField = "hostingIdentity"
        private const val DeviceField = "deviceIdentifier"
        private const val PlayerSessionField = "sessionIdentifier"
        private const val NextSequenceField = "nextPublicationSequence"
        private const val ReadingField = "reading"
        private const val ReadStartedField = "requestStartedNativeMonotonicMilliseconds"
        private const val ReadCompletedField = "requestCompletedNativeMonotonicMilliseconds"
        private const val SampledNativeField = "sampledNativeMonotonicMilliseconds"
        private const val ClusterField = "cluster"
        private const val ActiveDeviceField = "activeDeviceIdentifier"
        private const val ServerField = "serverAtMilliseconds"
        private const val AccountField = "accountIdentifier"
        private const val MembershipField = "membership"
        private const val OwnedField = "ownedByCurrentAccount"
        private const val ActiveField = "active"
        private const val JamField = "sessionIdentifier"
        private const val HostField = "hostDeviceIdentifier"
        private const val SnapshotField = "snapshot"
        private const val ActivationField = "activation"
        private const val CommandReadyField = "commandHandlingReady"
        private const val Unsupported = "unsupported"
        private const val ReadinessField = "readiness"
        private const val OutputReadyField = "playbackOutputReady"
        private const val AuthorityAbsentField = "externalAuthorityAbsent"
        private const val KeyField = "key"
        private const val AcceptedField = "accepted"
        private const val HostIdentityOperation = "hostIdentity"
        private const val ActivateOperation = "activate"
        private const val PublishOperation = "publish"
        private const val WithdrawOperation = "withdraw"
        private const val SequenceField = "sequence"
        private const val DeactivateOperation = "deactivate"
        private const val ReplyOperation = "reply"
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
        private const val InvalidResponse = "invalid-response"
        private const val InvalidInput = "invalid-input"
        private const val Unauthorized = "unauthorized"
        private const val Forbidden = "forbidden"
        private const val Deadline = "deadline"
        private const val Network = "network"
        private const val Backpressure = "backpressure"
        private const val UnknownOutcome = "unknown-outcome"
        private val FailureCodes = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
    }
}

package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture

interface SpotifyJamPlaybackSession {
    fun start(): CompletableFuture<Unit>
    fun connectionUnavailable()
    fun reconnect(generation: Long)
    fun sourceChanged() {}
    fun stop(): CompletableFuture<Unit>
    fun synchronizeAuthentication(accessToken: String): CompletableFuture<Unit>
    fun claimRecording(requestIdentifier: String): String?
    fun isRecordingPending(requestIdentifier: String): Boolean
    fun completeRecording(requestIdentifier: String, serialized: String)
    fun failRecording(requestIdentifier: String, code: String)
    fun synchronizeRecordingAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String): CompletableFuture<Unit>
}
fun interface SpotifyJamPlaybackSessionFactory {
    fun create(configuration: SpotifyJamPlaybackConfiguration, observer: (SpotifyNativeFollowerSnapshot) -> Unit): SpotifyJamPlaybackSession
}

class SpotifyJamPlaybackRuntime(
    private val protocol: SpotifyJamPlaybackProtocol,
    private val factory: SpotifyJamPlaybackSessionFactory,
    private val authenticationFactory: SpotifyJamAuthenticationRenewalFactory? = null,
    private val ownsConnection: (SpotifyJamPlaybackAccount) -> Boolean
) {
    class Attachment internal constructor(internal var listener: ((String) -> Unit)?)
    private class Lifetime(val creationConfiguration: SpotifyJamPlaybackConfiguration, var identifier: String, val retirement: CompletableFuture<Unit>) {
        @Volatile var account = creationConfiguration.account
        val started = CompletableFuture<Unit>()
        var session: SpotifyJamPlaybackSession? = null
        var follower: SpotifyNativeFollowerSnapshot? = null
        var nativeHandoff = false
        var tokenSynchronization = CompletableFuture.completedFuture(Unit)
        var tokenExpiry = InitialTokenExpiry
        var authentication: SpotifyJamAuthenticationRenewal? = null
        @Volatile var failed = false
    }
    private var attachment: Attachment? = null
    @Volatile private var lifetime: Lifetime? = null
    private var cleanup = CompletableFuture.completedFuture(Unit)
    private var applicationAccountKnown = false
    private var applicationAccountIdentifier: String? = null

    @Synchronized fun attach(listener: (String) -> Unit): Attachment {
        attachment?.listener = null
        return Attachment(listener).also { selected -> attachment = selected }
    }
    @Synchronized fun detach(selected: Attachment) { selected.listener = null; if (attachment === selected) attachment = null }

    fun startFollowing(selected: Attachment, identifier: String, serialized: String): CompletableFuture<String> {
        val configuration = protocol.configuration(serialized)
        protocol.validateIdentifier(identifier)
        val current: Lifetime
        val retired: Lifetime?
        synchronized(this) {
            requireAttachment(selected)
            if (!ownsConnection(configuration.account) || applicationAccountKnown && applicationAccountIdentifier != configuration.account.streamingServiceAccountIdentifier) throw SpotifyConnectFailure(Superseded)
            val existing = lifetime
            if (existing?.account == configuration.account) {
                existing.identifier = identifier
                if (existing.failed) return CompletableFuture.completedFuture(render(existing))
                return synchronize(existing, configuration.accessToken, configuration.tokenExpiresAtSeconds).thenCompose {
                    existing.started.thenApply { synchronized(this) { requireAttachment(selected); requireCurrent(existing); render(existing) } }
                }
            }
            retired = existing
            val retirement = retire(retired)
            current = Lifetime(configuration, identifier, retirement)
            current.tokenExpiry = configuration.tokenExpiresAtSeconds
            lifetime = current
        }
        current.retirement.whenComplete { _, failure ->
            synchronized(this) {
                if (lifetime !== current) return@whenComplete
                if (failure != null) { current.started.completeExceptionally(failure); return@whenComplete }
                try {
                    if (!ownsConnection(current.account)) throw SpotifyConnectFailure(Superseded)
                    current.authentication = authenticationFactory?.create(configuration) { authenticationFailed(current) }
                    val session = factory.create(configuration) { snapshot -> observe(current, snapshot) }
                    current.session = session
                    session.start().whenComplete { _, startFailure ->
                        synchronized(this) {
                            if (lifetime !== current) { session.stop(); return@whenComplete }
                            if (startFailure == null && !current.failed) {
                                current.nativeHandoff = true
                                current.follower?.identity?.let { identity -> current.authentication?.update(identity, current.tokenExpiry) }
                                publish(render(current))
                                current.started.complete(Unit)
                            } else current.started.completeExceptionally(startFailure ?: SpotifyConnectFailure(Superseded))
                        }
                    }
                } catch (startFailure: Throwable) { current.session?.stop(); current.started.completeExceptionally(startFailure) }
            }
        }
        return current.started.thenApply { synchronized(this) { requireAttachment(selected); requireCurrent(current); render(current) } }
    }

    @Synchronized fun sourceChanged(handle: Long, generation: Long) {
        val current = lifetime ?: return
        if (current.account.handle != handle || current.account.generation != generation || !current.nativeHandoff) return
        current.session?.sourceChanged()
    }

    @Synchronized fun connectionUnavailable(handle: Long, generation: Long) {
        val current = lifetime ?: return
        if (current.account.handle != handle || generation < current.account.generation) return
        current.session?.connectionUnavailable()
    }

    @Synchronized fun connectionStopped(handle: Long, generation: Long) {
        val current = lifetime ?: return
        if (current.account.handle == handle && generation >= current.account.generation) retireFollowing()
    }

    @Synchronized fun reconnect(handle: Long, generation: Long, accountIdentifier: String) {
        val current = lifetime ?: return
        if (current.account.handle != handle || current.account.spotifyAccountIdentifier != accountIdentifier
            || generation <= current.account.generation || !current.nativeHandoff) return
        current.account = current.account.copy(generation = generation)
        current.follower?.identity?.copy(generation = generation)?.let { identity -> current.authentication?.update(identity, current.tokenExpiry) }
        current.session?.reconnect(generation)
    }

    @Synchronized fun updateApplicationAccount(selected: Attachment, accountIdentifier: String?, accessToken: String?): CompletableFuture<Unit> {
        requireAttachment(selected)
        if (accountIdentifier == null || accessToken == null) {
            if (accountIdentifier != null || accessToken != null) return failed(InvalidInput)
            applicationAccountKnown = true
            applicationAccountIdentifier = null
            return retireFollowing()
        }
        val expiry = protocol.tokenExpiry(accountIdentifier, accessToken)
        applicationAccountKnown = true
        applicationAccountIdentifier = accountIdentifier
        val current = lifetime ?: return CompletableFuture.completedFuture(Unit)
        if (current.account.streamingServiceAccountIdentifier != accountIdentifier) return retireFollowing()
        if (current.failed) return CompletableFuture.completedFuture(Unit)
        return synchronize(current, accessToken, expiry)
    }

    fun stopFollowing(selected: Attachment): CompletableFuture<Unit> = synchronized(this) { requireAttachment(selected); retireFollowing() }
    fun retireFollowing(): CompletableFuture<Unit> = synchronized(this) {
        val retired = lifetime
        lifetime = null
        publish(protocol.snapshot(null, null, null))
        retire(retired)
    }
    @Synchronized fun getSnapshot(selected: Attachment): String { requireAttachment(selected); return lifetime?.let(::render) ?: protocol.snapshot(null, null, null) }
    fun isCurrent(identity: SpotifyNativeFollowerIdentity): Boolean {
        val current = lifetime ?: return false
        return !current.failed && current.authentication?.isHealthy() != false && current.account.streamingServiceAccountIdentifier == identity.streamingServiceAccountIdentifier
            && current.account.spotifyAccountIdentifier == identity.spotifyAccountIdentifier && current.account.jamSessionIdentifier == identity.jamSessionIdentifier
            && current.account.hostDeviceIdentifier == identity.hostDeviceIdentifier && current.account.handle == identity.handle
            && current.account.generation == identity.generation && ownsConnection(current.account)
    }
    fun isCurrentConfiguration(configuration: SpotifyJamPlaybackConfiguration, identity: SpotifyNativeFollowerIdentity): Boolean =
        lifetime?.creationConfiguration === configuration && isCurrent(identity)

    @Synchronized fun synchronizeAuthentication(configuration: SpotifyJamPlaybackConfiguration, identity: SpotifyNativeFollowerIdentity, accessToken: String): CompletableFuture<Unit> {
        if (!isCurrentConfiguration(configuration, identity)) return failed(Superseded)
        return synchronizeAuthentication(identity, accessToken)
    }

    @Synchronized fun claimRecording(requestIdentifier: String): String? = lifetime?.session?.claimRecording(requestIdentifier)
    @Synchronized fun isRecordingPending(requestIdentifier: String): Boolean = lifetime?.session?.isRecordingPending(requestIdentifier) == true
    @Synchronized fun completeRecording(requestIdentifier: String, serialized: String) { lifetime?.session?.completeRecording(requestIdentifier, serialized) }
    @Synchronized fun failRecording(requestIdentifier: String, code: String) { lifetime?.session?.failRecording(requestIdentifier, code) }
    @Synchronized fun synchronizeRecordingAuthentication(requestIdentifier: String, accountIdentifier: String, accessToken: String): CompletableFuture<Unit> =
        lifetime?.session?.synchronizeRecordingAuthentication(requestIdentifier, accountIdentifier, accessToken) ?: failed(Superseded)

    @Synchronized fun synchronizeAuthentication(identity: SpotifyNativeFollowerIdentity, accessToken: String): CompletableFuture<Unit> {
        val current = lifetime ?: return failed(Superseded)
        if (!isCurrent(identity)) return failed(Superseded)
        return synchronize(current, accessToken, protocol.tokenExpiry(identity.streamingServiceAccountIdentifier, accessToken))
    }

    private fun synchronize(current: Lifetime, accessToken: String, expiry: Long): CompletableFuture<Unit> {
        requireCurrent(current)
        val next = current.tokenSynchronization.handle { _, _ -> Unit }.thenCompose {
            synchronized(this) {
                requireCurrent(current)
                if (expiry <= current.tokenExpiry) return@thenCompose CompletableFuture.completedFuture(Unit)
                val session = current.session ?: return@thenCompose failed(Backpressure)
                session.synchronizeAuthentication(accessToken).thenApply {
                    synchronized(this) {
                        requireCurrent(current)
                        current.tokenExpiry = expiry
                        current.follower?.identity?.let { identity -> current.authentication?.update(identity, expiry) }
                        Unit
                    }
                }
            }
        }
        current.tokenSynchronization = next.handle { _, _ -> Unit }
        return next
    }
    private fun retire(current: Lifetime?): CompletableFuture<Unit> {
        if (current == null) return cleanup
        current.authentication?.stop()
        current.started.completeExceptionally(SpotifyConnectFailure(Canceled))
        cleanup = current.retirement.thenCompose { synchronized(this) { current.session?.stop() ?: CompletableFuture.completedFuture(Unit) } }
        return cleanup
    }
    @Synchronized private fun observe(current: Lifetime, snapshot: SpotifyNativeFollowerSnapshot) {
        if (lifetime !== current) return
        if (current.failed) return
        current.follower = snapshot
        if (snapshot.status == SpotifyNativeFollowerStatus.Failed || snapshot.status == SpotifyNativeFollowerStatus.Suspended) {
            current.nativeHandoff = false
            current.failed = true
            current.authentication?.stop()
        } else if (current.nativeHandoff) snapshot.identity?.let { identity -> current.authentication?.update(identity, current.tokenExpiry) }
        publish(render(current))
    }
    @Synchronized private fun authenticationFailed(current: Lifetime) {
        if (lifetime !== current || current.failed) return
        current.failed = true
        current.nativeHandoff = false
        current.authentication?.stop()
        current.follower = current.follower?.copy(status = SpotifyNativeFollowerStatus.Failed, failure = SpotifyNativeFollowerFailureReason.AuthorizationRequired)
        current.session?.stop()
        publish(render(current))
    }
    @Synchronized fun claimAuthentication(requestIdentifier: String): String? = lifetime?.authentication?.claim(requestIdentifier)
    @Synchronized fun isAuthenticationPending(requestIdentifier: String): Boolean = lifetime?.authentication?.isPending(requestIdentifier) == true
    @Synchronized fun completeAuthentication(requestIdentifier: String, accountIdentifier: String, token: String): CompletableFuture<Unit> =
        lifetime?.authentication?.complete(requestIdentifier, accountIdentifier, token) ?: failed(Superseded)
    @Synchronized fun failAuthentication(requestIdentifier: String) { lifetime?.authentication?.fail(requestIdentifier) }

    private fun render(current: Lifetime): String = protocol.snapshot(current.identifier, current.account, current.follower, current.nativeHandoff)
    private fun publish(serialized: String) { try { attachment?.listener?.invoke(serialized) } catch (_failure: Throwable) { Unit } }
    private fun requireAttachment(selected: Attachment) { if (attachment !== selected || selected.listener == null) throw SpotifyConnectFailure(Canceled) }
    private fun requireCurrent(current: Lifetime) { if (lifetime !== current || current.failed || current.authentication?.isHealthy() == false || !ownsConnection(current.account)) throw SpotifyConnectFailure(Superseded) }
    private fun <Response> failed(code: String): CompletableFuture<Response> = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }

    companion object {
        private const val InitialTokenExpiry = 0L
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
        private const val InvalidInput = "invalid-input"
        private const val Backpressure = "backpressure"
    }
}

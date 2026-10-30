package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture

interface SpotifyJamPlaybackSession {
    fun start(): CompletableFuture<Unit>
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
    private val ownsConnection: (SpotifyJamPlaybackAccount) -> Boolean
) {
    class Attachment internal constructor(internal var listener: ((String) -> Unit)?)
    private class Lifetime(val creationConfiguration: SpotifyJamPlaybackConfiguration, var identifier: String, val retirement: CompletableFuture<Unit>) {
        val account get() = creationConfiguration.account
        val started = CompletableFuture<Unit>()
        var session: SpotifyJamPlaybackSession? = null
        var follower: SpotifyNativeFollowerSnapshot? = null
        var nativeHandoff = false
        var tokenExpiry = InitialTokenExpiry
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
                    val session = factory.create(configuration) { snapshot -> observe(current, snapshot) }
                    current.session = session
                    session.start().whenComplete { _, startFailure ->
                        synchronized(this) {
                            if (lifetime !== current) { session.stop(); return@whenComplete }
                            if (startFailure == null) {
                                current.nativeHandoff = true
                                publish(render(current))
                                current.started.complete(Unit)
                            } else current.started.completeExceptionally(startFailure)
                        }
                    }
                } catch (startFailure: Throwable) { current.session?.stop(); current.started.completeExceptionally(startFailure) }
            }
        }
        return current.started.thenApply { synchronized(this) { requireAttachment(selected); requireCurrent(current); render(current) } }
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
        return current.account.streamingServiceAccountIdentifier == identity.streamingServiceAccountIdentifier
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
        if (expiry < current.tokenExpiry) return CompletableFuture.completedFuture(Unit)
        if (expiry == current.tokenExpiry) return CompletableFuture.completedFuture(Unit)
        val session = current.session ?: return failed(Backpressure)
        current.tokenExpiry = expiry
        return session.synchronizeAuthentication(accessToken).thenApply { synchronized(this) { requireCurrent(current); Unit } }
    }
    private fun retire(current: Lifetime?): CompletableFuture<Unit> {
        if (current == null) return cleanup
        current.started.completeExceptionally(SpotifyConnectFailure(Canceled))
        cleanup = current.retirement.thenCompose { synchronized(this) { current.session?.stop() ?: CompletableFuture.completedFuture(Unit) } }
        return cleanup
    }
    @Synchronized private fun observe(current: Lifetime, snapshot: SpotifyNativeFollowerSnapshot) {
        if (lifetime !== current) return
        current.follower = snapshot
        if (snapshot.status == SpotifyNativeFollowerStatus.Failed || snapshot.status == SpotifyNativeFollowerStatus.Suspended) current.nativeHandoff = false
        publish(render(current))
    }
    private fun render(current: Lifetime): String = protocol.snapshot(current.identifier, current.account, current.follower, current.nativeHandoff)
    private fun publish(serialized: String) { try { attachment?.listener?.invoke(serialized) } catch (_failure: Throwable) { Unit } }
    private fun requireAttachment(selected: Attachment) { if (attachment !== selected || selected.listener == null) throw SpotifyConnectFailure(Canceled) }
    private fun requireCurrent(current: Lifetime) { if (lifetime !== current || !ownsConnection(current.account)) throw SpotifyConnectFailure(Superseded) }
    private fun <Response> failed(code: String): CompletableFuture<Response> = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }

    companion object {
        private const val InitialTokenExpiry = 0L
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
        private const val InvalidInput = "invalid-input"
        private const val Backpressure = "backpressure"
    }
}

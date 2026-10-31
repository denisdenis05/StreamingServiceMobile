package com.streamingservice.spotify

import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor

interface SpotifyHostRuntimeSession {
    fun start(): CompletableFuture<SpotifyHostSnapshot>
    fun stop(): CompletableFuture<Unit>
    fun synchronizeAuthentication(accessToken: String): CompletableFuture<Unit>
    fun releaseAfterConnectionRetired(): CompletableFuture<Unit>
}
data class SpotifyHostSessionResources(val session: SpotifyHostRuntimeSession, val recordings: SpotifyBackgroundRecordingBroker? = null, val hostingRecordings: SpotifyHostRecordingBroker? = null)
fun interface SpotifyHostRuntimeSessionFactory {
    fun create(configuration: SpotifyHostConfiguration, observer: (SpotifyHostSnapshot) -> Unit): SpotifyHostSessionResources
}

class SpotifyHostRuntime(
    private val protocol: SpotifyHostConfigurationProtocol,
    private val tokens: SpotifyJamPlaybackProtocol,
    private val factory: SpotifyHostRuntimeSessionFactory,
    executor: Executor,
    private val ownsConnection: (SpotifyHostIdentity) -> Boolean,
    private val retireFollowing: () -> CompletableFuture<Unit>,
    private val authenticationFactory: SpotifyJamAuthenticationRenewalFactory? = null
) {
    class Attachment internal constructor(@Volatile internal var listener: ((SpotifyHostSnapshot?) -> Unit)?)
    private class Lifetime(val configuration: SpotifyHostConfiguration) {
        val started = CompletableFuture<SpotifyHostSnapshot>()
        @Volatile var allowed = true
        @Volatile var retiring = false
        @Volatile var resources: SpotifyHostSessionResources? = null
        @Volatile var authentication: SpotifyJamAuthenticationRenewal? = null
        var retirement: CompletableFuture<Unit>? = null
        var tokenExpiry = configuration.playback.tokenExpiresAtSeconds
        var tokenWrites = CompletableFuture.completedFuture(Unit)
    }
    private data class AccountBinding(val known: Boolean, val identifier: String?)
    private val decisions = SpotifyDecisionExecutor(executor)
    @Volatile private var attachment: Attachment? = null
    @Volatile private var lifetime: Lifetime? = null
    @Volatile private var owned = emptyList<Lifetime>()
    @Volatile private var account = AccountBinding(false, null)
    @Volatile private var currentSnapshot: SpotifyHostSnapshot? = null
    private var cleanup = CompletableFuture.completedFuture(Unit)

    @Synchronized fun attach(listener: (SpotifyHostSnapshot?) -> Unit): Attachment {
        attachment?.listener = null
        return Attachment(listener).also { selected -> attachment = selected }
    }
    @Synchronized fun detach(selected: Attachment) { selected.listener = null; if (attachment === selected) attachment = null }
    fun snapshot(selected: Attachment): SpotifyHostSnapshot? { requireAttachment(selected); return currentSnapshot }

    fun start(selected: Attachment, serialized: String): CompletableFuture<SpotifyHostSnapshot> {
        val configuration = protocol.configuration(serialized)
        return request {
            requireAttachment(selected)
            if (!connected(configuration.identity) || !accountMatches(configuration.identity)) throw SpotifyConnectFailure(Superseded)
            if (cleanup.isCompletedExceptionally) throw SpotifyConnectFailure(CleanupFailed)
            val previous = lifetime
            if (previous != null && active(previous) && previous.configuration.identity == configuration.identity) return@request previous.started
            val retirement = retire(previous)
            val current = Lifetime(configuration); lifetime = current; owned = owned + current
            publish(current, SpotifyHostSnapshot(configuration.identity, SpotifyHostStatus.Starting))
            retirement.thenCompose { retireFollowing() }.whenComplete { _, failure -> decisions.execute {
                if (lifetime !== current || current.retiring) return@execute
                if (failure != null || !active(current)) {
                    current.started.completeExceptionally(SpotifyConnectFailure(if (failure == null) Superseded else CleanupFailed))
                    retire(current)
                } else try {
                    current.authentication = authenticationFactory?.create(configuration.playback) { decisions.execute { fail(current, Unauthorized) } }
                    val resources = factory.create(configuration) { snapshot -> decisions.execute { observed(current, snapshot) } }
                    current.resources = resources
                    resources.session.start().whenComplete { snapshot, startupFailure -> decisions.execute startup@{
                        if (lifetime !== current || current.retiring) return@startup
                        if (startupFailure != null || snapshot?.identity != configuration.identity || snapshot.status != SpotifyHostStatus.Hosting || !active(current)) fail(current, startupFailure?.let(::startupFailureCode) ?: Superseded)
                        else {
                            publish(current, snapshot)
                            if (!active(current)) return@startup
                            current.authentication?.update(follower(configuration.identity), current.tokenExpiry)
                            current.started.complete(snapshot)
                        }
                    } }
                } catch (failure: Throwable) { fail(current, startupFailureCode(failure)) }
            } }
            current.started
        }.thenApply { snapshot ->
            requireAttachment(selected)
            val current = lifetime
            if (current == null || !active(current)) throw SpotifyConnectFailure(Superseded)
            snapshot
        }
    }
    fun stop(selected: Attachment): CompletableFuture<Unit> {
        requireAttachment(selected); return retireHosting()
    }
    fun retireHosting(): CompletableFuture<Unit> {
        lifetime?.allowed = false
        return request { retire(lifetime) }
    }
    fun updateAccount(selected: Attachment, identifier: String?, accessToken: String?): CompletableFuture<Unit> {
        requireAttachment(selected)
        account = AccountBinding(true, identifier)
        val current = lifetime
        if (current != null && !accountMatches(current.configuration.identity)) current.allowed = false
        return request {
            requireAttachment(selected)
            val selectedLifetime = lifetime ?: return@request CompletableFuture.completedFuture(Unit)
            if (!accountMatches(selectedLifetime.configuration.identity)) retire(selectedLifetime)
            else if (accessToken != null) synchronize(selectedLifetime, accessToken)
            else CompletableFuture.completedFuture(Unit)
        }
    }
    fun isActiveConfiguration(configuration: SpotifyHostConfiguration, identity: SpotifyHostIdentity): Boolean =
        lifetime?.let { current -> current.configuration === configuration && identity == configuration.identity && active(current) } == true
    fun ownsConfiguration(configuration: SpotifyHostConfiguration, identity: SpotifyHostIdentity): Boolean =
        owned.any { current -> current.configuration === configuration && identity == configuration.identity } && connected(identity)
    fun synchronizeAuthentication(configuration: SpotifyHostConfiguration, identity: SpotifyNativeFollowerIdentity, token: String): CompletableFuture<Unit> = request {
        val current = lifetime?.takeIf { selected -> selected.configuration === configuration && follower(configuration.identity) == identity && active(selected) }
            ?: throw SpotifyConnectFailure(Superseded)
        synchronize(current, token)
    }
    fun configurationFor(playback: SpotifyJamPlaybackConfiguration): SpotifyHostConfiguration? = lifetime?.configuration?.takeIf { selected -> selected.playback === playback }
    fun claimAuthentication(identifier: String): String? = lifetime?.authentication?.claim(identifier)
    fun isAuthenticationPending(identifier: String): Boolean = lifetime?.authentication?.isPending(identifier) == true
    fun completeAuthentication(identifier: String, accountIdentifier: String, token: String): CompletableFuture<Unit> =
        lifetime?.authentication?.complete(identifier, accountIdentifier, token) ?: failed(Superseded)
    fun failAuthentication(identifier: String) { lifetime?.authentication?.fail(identifier) }
    fun claimHostingRecording(identifier: String): String? = lifetime?.resources?.hostingRecordings?.claim(identifier)
    fun isHostingRecordingPending(identifier: String): Boolean = lifetime?.resources?.hostingRecordings?.isPending(identifier) == true
    fun completeHostingRecording(identifier: String, track: String) { lifetime?.resources?.hostingRecordings?.complete(identifier, track) ?: throw SpotifyConnectFailure(Superseded) }
    fun failHostingRecording(identifier: String) { lifetime?.resources?.hostingRecordings?.fail(identifier) }
    fun searchHostingRecording(identifier: String, serialized: String): CompletableFuture<String> = lifetime?.resources?.hostingRecordings?.search(identifier, serialized) ?: failed(Superseded)
    fun claimRecording(identifier: String): String? = lifetime?.resources?.recordings?.claim(identifier)
    fun isRecordingPending(identifier: String): Boolean = lifetime?.resources?.recordings?.isPending(identifier) == true
    fun completeRecording(identifier: String, serialized: String) { lifetime?.resources?.recordings?.complete(identifier, serialized) ?: throw SpotifyConnectFailure(Superseded) }
    fun failRecording(identifier: String, code: String) { lifetime?.resources?.recordings?.fail(identifier, code) ?: throw SpotifyConnectFailure(Superseded) }
    fun synchronizeRecordingAuthentication(identifier: String, accountIdentifier: String, token: String): CompletableFuture<Unit> =
        lifetime?.resources?.recordings?.synchronizePlayerAuthentication(identifier, accountIdentifier, token) ?: failed(Superseded)

    fun releaseRetiredConnections(): CompletableFuture<Unit> = request {
        val expired = owned.filter { current -> !connected(current.configuration.identity) }
        expired.forEach { current -> current.allowed = false; current.authentication?.stop(); current.resources?.recordings?.retire(); current.resources?.hostingRecordings?.retire() }
        val releases = expired.map { current -> current.resources?.session?.releaseAfterConnectionRetired() ?: CompletableFuture.completedFuture(Unit) }
        CompletableFuture.allOf(*releases.toTypedArray()).thenApply {
            decisions.execute {
                owned = owned.filterNot { current -> current in expired }
                if (lifetime in expired) { lifetime = null; currentSnapshot = null; notify(null) }
                if (owned.isEmpty()) cleanup = CompletableFuture.completedFuture(Unit)
            }
            Unit
        }
    }
    private fun synchronize(current: Lifetime, token: String): CompletableFuture<Unit> {
        if (!active(current)) return failed(Superseded)
        val expiry = tokens.tokenExpiry(current.configuration.identity.streamingServiceAccountIdentifier, token)
        if (expiry < current.tokenExpiry) return failed(Unauthorized)
        val completion = CompletableFuture<Unit>()
        val previous = current.tokenWrites
        current.tokenWrites = completion
        previous.handle { _, _ -> Unit }.whenComplete { _, _ -> decisions.execute {
            if (!active(current)) completion.completeExceptionally(SpotifyConnectFailure(Superseded))
            else {
                val resources = current.resources
                val write = if (resources == null) current.started.thenCompose { current.resources!!.session.synchronizeAuthentication(token) }
                    else resources.session.synchronizeAuthentication(token)
                write.whenComplete { _, failure -> decisions.execute {
                    if (failure != null || !active(current)) completion.completeExceptionally(SpotifyConnectFailure(if (failure == null) Superseded else Unauthorized))
                    else {
                        current.tokenExpiry = expiry
                        current.authentication?.update(follower(current.configuration.identity), expiry)
                        completion.complete(Unit)
                    }
                } }
            }
        } }
        return completion
    }
    private fun retire(current: Lifetime?): CompletableFuture<Unit> {
        if (current == null) return cleanup
        current.retirement?.let { completion -> return completion }
        current.allowed = false; current.retiring = true
        current.authentication?.stop(); current.resources?.recordings?.retire(); current.resources?.hostingRecordings?.retire()
        current.started.completeExceptionally(SpotifyConnectFailure(Canceled))
        val completion = CompletableFuture<Unit>(); current.retirement = completion
        val previous = cleanup; cleanup = completion
        val stopped = try { current.resources?.session?.stop() ?: CompletableFuture.completedFuture(Unit) } catch (_failure: Throwable) { failed<Unit>(CleanupFailed) }
        CompletableFuture.allOf(previous, stopped).whenComplete { _, failure -> decisions.execute {
            if (failure == null) {
                owned = owned.filterNot { selected -> selected === current }
                if (lifetime === current) { lifetime = null; currentSnapshot = null; notify(null) }
                completion.complete(Unit)
            } else completion.completeExceptionally(SpotifyConnectFailure(CleanupFailed))
        } }
        return completion
    }
    private fun observed(current: Lifetime, snapshot: SpotifyHostSnapshot) {
        if (lifetime !== current || snapshot.identity != current.configuration.identity) return
        publish(current, snapshot)
        if (!current.retiring && snapshot.status in TerminalStatuses) retire(current)
    }
    private fun fail(current: Lifetime, code: String) {
        if (lifetime !== current || current.retiring) return
        publish(current, SpotifyHostSnapshot(current.configuration.identity, SpotifyHostStatus.Failed, code))
        current.started.completeExceptionally(SpotifyConnectFailure(code)); retire(current)
    }
    private fun publish(current: Lifetime, snapshot: SpotifyHostSnapshot) { if (lifetime === current) { currentSnapshot = snapshot; notify(snapshot) } }
    private fun notify(snapshot: SpotifyHostSnapshot?) { try { attachment?.listener?.invoke(snapshot) } catch (_failure: Throwable) { Unit } }
    private fun startupFailureCode(failure: Throwable): String {
        val cause = when (failure) {
            is java.util.concurrent.CompletionException, is java.util.concurrent.ExecutionException -> failure.cause
            else -> failure
        }
        return (cause as? SpotifyConnectFailure)?.code?.takeIf { code -> code in FailureCodes } ?: StartupFailed
    }
    private fun active(current: Lifetime): Boolean = current.allowed && !current.retiring && connected(current.configuration.identity) && accountMatches(current.configuration.identity)
    private fun accountMatches(identity: SpotifyHostIdentity): Boolean = !account.known || account.identifier == identity.streamingServiceAccountIdentifier
    private fun connected(identity: SpotifyHostIdentity): Boolean = try { ownsConnection(identity) } catch (_failure: Throwable) { false }
    private fun requireAttachment(selected: Attachment) { if (attachment !== selected || selected.listener == null) throw SpotifyConnectFailure(Canceled) }
    private fun <Response> request(action: () -> CompletableFuture<Response>): CompletableFuture<Response> {
        val completion = CompletableFuture<Response>()
        decisions.execute {
            try { action().whenComplete { response, failure -> if (failure == null) completion.complete(response) else completion.completeExceptionally(failure) } }
            catch (failure: Throwable) { completion.completeExceptionally(failure) }
        }
        return completion
    }
    private fun <Response> failed(code: String) = CompletableFuture<Response>().also { completion -> completion.completeExceptionally(SpotifyConnectFailure(code)) }
    companion object {
        private const val Canceled = "canceled"
        private const val Superseded = "superseded"
        private const val Unauthorized = "unauthorized"
        private const val CleanupFailed = "host-cleanup-failed"
        private const val StartupFailed = "host-startup-failed"
        private val FailureCodes = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
        private val TerminalStatuses = setOf(SpotifyHostStatus.Failed, SpotifyHostStatus.Stopped)
        fun follower(identity: SpotifyHostIdentity) = SpotifyNativeFollowerIdentity(identity.streamingServiceAccountIdentifier, identity.spotifyAccountIdentifier,
            identity.jamSessionIdentifier, identity.deviceIdentifier, identity.handle, identity.generation, identity.playerIdentity)
    }
}

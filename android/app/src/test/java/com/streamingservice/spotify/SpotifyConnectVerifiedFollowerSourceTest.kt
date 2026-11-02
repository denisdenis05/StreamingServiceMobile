package com.streamingservice.spotify

import java.util.ArrayDeque
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SpotifyConnectVerifiedFollowerSourceTest {
    private class Queue : Executor {
        val work = ArrayDeque<Runnable>()
        override fun execute(command: Runnable) { work.addLast(command) }
        fun drain() { while (work.isNotEmpty()) work.removeFirst().run() }
    }
    private class Fixture : SpotifyFollowerNativeReads, SpotifyNativeFollowerClock {
        val executor = Queue()
        val calls = mutableListOf<String>()
        var elapsed = INITIAL_ELAPSED
        var current = true
        var onPlayback: () -> Unit = {}
        var nextMembership: (Int) -> String = { membership().toString() }
        var membershipCalls = EMPTY_COUNT
        var playbackDelay = PLAYBACK_DELAY
        val identity = SpotifyNativeFollowerIdentity(APP_ACCOUNT, SPOTIFY_ACCOUNT, SESSION, HOST, HANDLE, GENERATION, SpotifyPlayerIdentity(ENGINE, AUTHENTICATION))
        val source = SpotifyConnectVerifiedFollowerSource(this, executor, this, { current })
        override fun nowElapsedRealtimeMilliseconds(): Long = elapsed
        override fun membership(handle: Long, generation: Long): String {
            assertEquals(HANDLE, handle); assertEquals(GENERATION, generation)
            calls.add(MEMBERSHIP_OPERATION); membershipCalls += SINGLE_COUNT; elapsed += MEMBERSHIP_DELAY
            return nextMembership(membershipCalls)
        }
        override fun playback(handle: Long, generation: Long): String {
            assertEquals(HANDLE, handle); assertEquals(GENERATION, generation)
            calls.add(PLAYBACK_OPERATION); elapsed += playbackDelay; onPlayback()
            return playback().toString()
        }
        fun read(): SpotifyFollowerOperation<SpotifyConnectPlaybackObservation> = source.read(identity).also { executor.drain() }
    }

    @Test fun freshMembershipBracketsNativePlaybackAndOnlyThePlaybackRequestDefinesItsClockAnchor() {
        val fixture = Fixture(); val sample = fixture.read().result.get()
        assertEquals(listOf(MEMBERSHIP_OPERATION, PLAYBACK_OPERATION, MEMBERSHIP_OPERATION), fixture.calls)
        assertEquals(EXPECTED_ANCHOR, sample.anchorElapsedRealtimeMilliseconds, EXACT_TOLERANCE)
        assertEquals(EXPECTED_UNCERTAINTY, sample.uncertaintyMilliseconds, EXACT_TOLERANCE)
        assertEquals(OCCURRENCE, sample.occurrenceIdentifier); assertEquals(REVISION, sample.queueRevision)
    }
    @Test fun guestPlaybackRequiresTheAuthenticatedAccountInBothCurrentMembershipReads() {
        val fixture = Fixture()
        fixture.nextMembership = { membership(owned = false, participants = listOf(SPOTIFY_ACCOUNT)).toString() }
        assertTrue(fixture.read().result.get().progressing)
        val rejected = Fixture()
        rejected.nextMembership = { membership(owned = false, participants = emptyList()).toString() }
        requireFailure(SpotifyConnectFailureCode.Forbidden) { rejected.read() }
        assertEquals(listOf(MEMBERSHIP_OPERATION), rejected.calls)
    }
    @Test fun changedJamHostOrActiveStateAfterPlaybackCannotProduceAnOwnedSourceSample() {
        for (field in listOf(SESSION_FIELD, HOST_FIELD, ACTIVE_FIELD)) {
            val fixture = Fixture()
            fixture.nextMembership = { position ->
                val response = membership()
                if (position == SECOND_CALL) response.getJSONObject(READING_FIELD).getJSONObject(MEMBERSHIP_FIELD)
                    .put(field, if (field == ACTIVE_FIELD) false else OTHER_IDENTIFIER)
                response.toString()
            }
            requireFailure(SpotifyConnectFailureCode.Superseded) { fixture.read() }
            assertEquals(THREE_CALLS, fixture.calls.size)
        }
    }
    @Test fun aForeignNativeAccountOrGenerationNeverTriggersAPlaybackRead() {
        val account = Fixture(); account.nextMembership = { membership().also { response -> response.getJSONObject(READING_FIELD).put(ACCOUNT_FIELD, OTHER_IDENTIFIER) }.toString() }
        requireFailure(SpotifyConnectFailureCode.Unauthorized) { account.read() }
        val generation = Fixture(); generation.nextMembership = { membership().put(GENERATION_FIELD, OTHER_GENERATION).toString() }
        requireFailure(SpotifyConnectFailureCode.Superseded) { generation.read() }
        assertEquals(listOf(MEMBERSHIP_OPERATION), account.calls); assertEquals(listOf(MEMBERSHIP_OPERATION), generation.calls)
    }
    @Test fun absentMembershipEndsTheOldLifetimeWhileMalformedMembershipCannotPretendTheUserLeft() {
        val absent = Fixture(); absent.nextMembership = { membership().also { response -> response.getJSONObject(READING_FIELD).put(MEMBERSHIP_FIELD, JSONObject.NULL) }.toString() }
        requireFailure(SpotifyConnectFailureCode.Superseded) { absent.read() }
        val malformed = Fixture(); malformed.nextMembership = { PRIVATE_DIAGNOSTIC }
        requireFailure(SpotifyConnectFailureCode.InvalidResponse) { malformed.read() }
    }
    @Test fun cancellationBeforeDispatchNeverCallsNativeCode() {
        val fixture = Fixture(); val operation = fixture.source.read(fixture.identity)
        operation.cancel(); fixture.executor.drain()
        requireFailure(SpotifyConnectFailureCode.Canceled) { operation }; assertTrue(fixture.calls.isEmpty())
    }
    @Test fun cancellationDuringPlaybackIgnoresTheLatePayloadAndSkipsTheFinalMembershipRead() {
        val fixture = Fixture(); val operation = fixture.source.read(fixture.identity)
        fixture.onPlayback = { operation.cancel() }; fixture.executor.drain()
        requireFailure(SpotifyConnectFailureCode.Canceled) { operation }
        assertEquals(listOf(MEMBERSHIP_OPERATION, PLAYBACK_OPERATION), fixture.calls)
    }
    @Test fun applicationAccountReplacementDuringNativeWorkCannotPublishTheOldObservation() {
        val fixture = Fixture(); fixture.onPlayback = { fixture.current = false }
        requireFailure(SpotifyConnectFailureCode.Superseded) { fixture.read() }
        assertEquals(listOf(MEMBERSHIP_OPERATION, PLAYBACK_OPERATION), fixture.calls)
        val retired = Fixture(); retired.current = false
        requireFailure(SpotifyConnectFailureCode.Superseded) { retired.read() }; assertTrue(retired.calls.isEmpty())
    }
    @Test fun safeNativeFailureCodesSurviveWithoutExportingPrivateFailureText() {
        val denied = Fixture(); denied.nextMembership = { JSONObject().put(FAILURE_FIELD, SpotifyConnectFailureCode.Forbidden.wireValue).toString() }
        requireFailure(SpotifyConnectFailureCode.Forbidden) { denied.read() }
        val unknown = Fixture(); unknown.nextMembership = { JSONObject().put(FAILURE_FIELD, PRIVATE_DIAGNOSTIC).toString() }
        requireFailure(SpotifyConnectFailureCode.Network) { unknown.read() }
    }
    @Test fun aSleepDelayedPlaybackReadIsRejectedBeforeTheFinalMembershipRead() {
        val fixture = Fixture(); fixture.playbackDelay = EXCESSIVE_DELAY
        requireFailure(SpotifyConnectFailureCode.Deadline) { fixture.read() }
        assertEquals(listOf(MEMBERSHIP_OPERATION, PLAYBACK_OPERATION), fixture.calls)
    }
    @Test fun coercedMembershipFlagsAndDuplicateParticipantsAreRejected() {
        val coerced = Fixture(); coerced.nextMembership = { membership().also { response -> response.getJSONObject(READING_FIELD).getJSONObject(MEMBERSHIP_FIELD).put(ACTIVE_FIELD, TRUE_TEXT) }.toString() }
        requireFailure(SpotifyConnectFailureCode.InvalidResponse) { coerced.read() }
        val duplicate = Fixture(); duplicate.nextMembership = { membership(participants = listOf(SPOTIFY_ACCOUNT, SPOTIFY_ACCOUNT)).toString() }
        requireFailure(SpotifyConnectFailureCode.InvalidResponse) { duplicate.read() }
    }
    @Test fun executorCapacityFailureIsReportedBeforeNativeDispatch() {
        val fixture = Fixture()
        val source = SpotifyConnectVerifiedFollowerSource(fixture, Executor { throw IllegalStateException(PRIVATE_DIAGNOSTIC) }, fixture, { true })
        requireFailure(SpotifyConnectFailureCode.Backpressure) { source.read(fixture.identity) }; assertTrue(fixture.calls.isEmpty())
    }

    private fun requireFailure(expected: SpotifyConnectFailureCode, operation: () -> SpotifyFollowerOperation<SpotifyConnectPlaybackObservation>) {
        try { operation().result.get(); fail(EXPECTED_FAILURE) }
        catch (failure: ExecutionException) { assertEquals(expected.wireValue, (failure.cause as SpotifyConnectFailure).code) }
    }
    companion object {
        private fun membership(owned: Boolean = true, participants: List<String> = emptyList()): JSONObject = JSONObject()
            .put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, GENERATION).put(READING_FIELD, JSONObject().put(ACCOUNT_FIELD, SPOTIFY_ACCOUNT)
                .put(MEMBERSHIP_FIELD, JSONObject().put(SESSION_FIELD, SESSION).put(HOST_FIELD, HOST).put(OWNER_FIELD, owned).put(ACTIVE_FIELD, true)
                    .put(PARTICIPANTS_FIELD, JSONArray(participants))))
        private fun playback(): JSONObject = JSONObject().put(HANDLE_FIELD, HANDLE).put(GENERATION_FIELD, GENERATION).put(SAMPLED_FIELD, NATIVE_END)
            .put(READING_FIELD, JSONObject().put(STARTED_FIELD, NATIVE_START).put(COMPLETED_FIELD, NATIVE_END)
                .put(CLUSTER_FIELD, JSONObject().put(ACTIVE_DEVICE_FIELD, HOST).put(SERVER_FIELD, SERVER_TIME)
                    .put(PLAYBACK_FIELD, JSONObject().put(TIMESTAMP_FIELD, SERVER_TIME).put(POSITION_FIELD, POSITION).put(DURATION_FIELD, DURATION)
                        .put(PLAYING_FIELD, true).put(PAUSED_FIELD, false).put(BUFFERING_FIELD, false).put(SPEED_FIELD, NORMAL_SPEED)
                        .put(REVISION_FIELD, REVISION).put(TRACK_FIELD, JSONObject().put(URI_FIELD, TRACK_URI).put(OCCURRENCE_FIELD, OCCURRENCE)))))
        private const val HANDLE = 7L
        private const val GENERATION = 3L
        private const val OTHER_GENERATION = 4L
        private const val APP_ACCOUNT = "synthetic-app-account"
        private const val SPOTIFY_ACCOUNT = "synthetic-spotify-account"
        private const val SESSION = "synthetic-jam-session"
        private const val HOST = "synthetic-host"
        private const val ENGINE = "synthetic-engine"
        private const val AUTHENTICATION = "synthetic-authentication"
        private const val OTHER_IDENTIFIER = "synthetic-other-identifier"
        private const val INITIAL_ELAPSED = 2000000L
        private const val MEMBERSHIP_DELAY = 1000L
        private const val PLAYBACK_DELAY = 100L
        private const val EXCESSIVE_DELAY = 2000L
        private const val NATIVE_START = 5000000L
        private const val NATIVE_END = 5000050L
        private const val SERVER_TIME = 1700000000000L
        private const val EXPECTED_ANCHOR = 2001025.0
        private const val EXPECTED_UNCERTAINTY = 76.0
        private const val EXACT_TOLERANCE = 0.0
        private const val POSITION = 10000L
        private const val DURATION = 180000L
        private const val NORMAL_SPEED = 1.0
        private const val TRACK_URI = "spotify:track:0000000000000000000001"
        private const val OCCURRENCE = "synthetic-occurrence"
        private const val REVISION = "synthetic-revision"
        private const val EMPTY_COUNT = 0
        private const val SINGLE_COUNT = 1
        private const val SECOND_CALL = 2
        private const val THREE_CALLS = 3
        private const val MEMBERSHIP_OPERATION = "membership"
        private const val PLAYBACK_OPERATION = "playback"
        private const val PRIVATE_DIAGNOSTIC = "synthetic-private-diagnostic"
        private const val TRUE_TEXT = "true"
        private const val EXPECTED_FAILURE = "Expected a verified source failure"
        private const val HANDLE_FIELD = "handle"
        private const val GENERATION_FIELD = "generation"
        private const val READING_FIELD = "reading"
        private const val ACCOUNT_FIELD = "accountIdentifier"
        private const val MEMBERSHIP_FIELD = "membership"
        private const val SESSION_FIELD = "sessionIdentifier"
        private const val HOST_FIELD = "hostDeviceIdentifier"
        private const val OWNER_FIELD = "ownedByCurrentAccount"
        private const val ACTIVE_FIELD = "active"
        private const val PARTICIPANTS_FIELD = "participantIdentifiers"
        private const val FAILURE_FIELD = "failure"
        private const val SAMPLED_FIELD = "sampledNativeMonotonicMilliseconds"
        private const val STARTED_FIELD = "requestStartedNativeMonotonicMilliseconds"
        private const val COMPLETED_FIELD = "requestCompletedNativeMonotonicMilliseconds"
        private const val CLUSTER_FIELD = "cluster"
        private const val ACTIVE_DEVICE_FIELD = "activeDeviceIdentifier"
        private const val SERVER_FIELD = "serverAtMilliseconds"
        private const val PLAYBACK_FIELD = "playback"
        private const val TIMESTAMP_FIELD = "timestampMilliseconds"
        private const val POSITION_FIELD = "positionAsOfTimestampMilliseconds"
        private const val DURATION_FIELD = "durationMilliseconds"
        private const val PLAYING_FIELD = "playing"
        private const val PAUSED_FIELD = "paused"
        private const val BUFFERING_FIELD = "buffering"
        private const val SPEED_FIELD = "playbackSpeed"
        private const val REVISION_FIELD = "queueRevision"
        private const val TRACK_FIELD = "track"
        private const val URI_FIELD = "uri"
        private const val OCCURRENCE_FIELD = "occurrenceIdentifier"
    }
}

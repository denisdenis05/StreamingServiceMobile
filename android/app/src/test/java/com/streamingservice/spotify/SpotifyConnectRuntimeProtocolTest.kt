package com.streamingservice.spotify

import java.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SpotifyConnectRuntimeProtocolTest {
    private val protocol = SpotifyConnectJsonRuntimeProtocol { serialized ->
        val decoded = Base64.getDecoder().decode(serialized)
        decoded.isNotEmpty() && Base64.getEncoder().encodeToString(decoded) == serialized
    }
    private fun stored(): JSONObject = JSONObject().put(SCHEMA_FIELD, SCHEMA_VERSION).put(ACCOUNT_FIELD, ACCOUNT)
        .put(DEVICE_FIELD, DEVICE).put(CLIENT_FIELD, CLIENT).put(CREDENTIALS_FIELD, JSONObject().put(USERNAME_FIELD, ACCOUNT)
            .put(AUTHENTICATION_TYPE_FIELD, STORED_AUTHENTICATION_TYPE).put(AUTHENTICATION_DATA_FIELD, SECRET))
    private fun start(credential: JSONObject = stored()): JSONObject = JSONObject().put(ACCOUNT_FIELD, ACCOUNT)
        .put(CREDENTIAL_FIELD, credential.toString()).put(CONFIGURATION_FIELD, JSONObject().put(NAME_FIELD, NAME).put(PLAYBACK_READY_FIELD, false))
    private fun event(type: String = REGISTERED_TYPE, generation: Long = GENERATION): JSONObject {
        val data = JSONObject().put(TYPE_FIELD, type)
        if (type == REGISTERED_TYPE) data.put(ACCOUNT_FIELD, ACCOUNT).put(DEVICE_FIELD, DEVICE).put(SOURCE_FIELD, CLUSTER_SOURCE)
            .put(CLUSTER_FIELD, JSONObject().put(DEVICES_FIELD, JSONArray().put(JSONObject().put(IDENTIFIER_FIELD, DEVICE)))
                .put(PRIVATE_FIELD, SECRET))
        return JSONObject().put(GENERATION_FIELD, generation).put(OBSERVED_TIME_FIELD, OBSERVED_TIME).put(DATA_FIELD, data)
    }
    private fun batch(vararg events: JSONObject): SpotifyConnectBatch = SpotifyConnectBatch(JSONObject().put(HANDLE_FIELD, HANDLE)
        .put(SAMPLED_TIME_FIELD, SAMPLED_TIME).put(FINISHED_FIELD, false).put(EVENTS_FIELD, JSONArray(events)).toString(), false)
    private fun identity(): SpotifyConnectRuntimeIdentity = protocol.identity(start().toString())
    private fun selectedData(batch: SpotifyConnectBatch): JSONObject = JSONObject(batch.serialized).getJSONArray(EVENTS_FIELD).getJSONObject(FIRST_INDEX).getJSONObject(DATA_FIELD)
    private fun requireFailure(code: String, operation: () -> Unit) {
        try { operation(); throw AssertionError(MISSING_FAILURE) }
        catch (failure: SpotifyConnectFailure) { assertEquals(code, failure.code) }
    }
    @Test
    fun retainedIdentityContainsOnlyAccountDeviceClientAndConfiguration() {
        assertEquals(SpotifyConnectRuntimeIdentity(ACCOUNT, DEVICE, CLIENT, NAME, false), identity())
        assertFalse(identity().toString().contains(SECRET))
    }
    @Test
    fun malformedMissingUnknownAndOversizedStartInputsFailBeforeAdoption() {
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(EMPTY_TEXT) }
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(start().put(PRIVATE_FIELD, SECRET).toString()) }
        val missing = start(); missing.remove(CREDENTIAL_FIELD)
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(missing.toString()) }
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(SECRET.repeat(OVERSIZED_REPEAT_COUNT)) }
    }
    @Test
    fun credentialAccountMustMatchRequestedAccount() {
        requireFailure(UNAUTHORIZED_FAILURE) { protocol.identity(start(stored().put(ACCOUNT_FIELD, OTHER_ACCOUNT)).toString()) }
    }
    @Test
    fun storedSchemaAndCredentialUsernameAuthenticationTypeAndDataMustBeValid() {
        val credentials = listOf(stored().put(SCHEMA_FIELD, INVALID_SCHEMA_VERSION),
            stored().apply { getJSONObject(CREDENTIALS_FIELD).put(USERNAME_FIELD, OTHER_ACCOUNT) },
            stored().apply { getJSONObject(CREDENTIALS_FIELD).put(AUTHENTICATION_TYPE_FIELD, INVALID_AUTHENTICATION_TYPE) },
            stored().apply { getJSONObject(CREDENTIALS_FIELD).put(AUTHENTICATION_DATA_FIELD, EMPTY_TEXT) },
            stored().apply { getJSONObject(CREDENTIALS_FIELD).put(AUTHENTICATION_DATA_FIELD, INVALID_BASE64) })
        for (credential in credentials) requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(start(credential).toString()) }
    }
    @Test
    fun deviceAndClientIdentityAreRequiredBoundedAndControlFree() {
        for (field in listOf(DEVICE_FIELD, CLIENT_FIELD)) {
            for (value in listOf(EMPTY_TEXT, CONTROL_TEXT, SECRET.repeat(OVERSIZED_IDENTITY_REPEAT_COUNT))) {
                requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(start(stored().put(field, value)).toString()) }
            }
        }
    }
    @Test
    fun playbackReadinessCannotBeAdvertisedByRetainedControlConnection() {
        val input = start(); input.getJSONObject(CONFIGURATION_FIELD).put(PLAYBACK_READY_FIELD, true)
        requireFailure(UNSUPPORTED_FAILURE) { protocol.identity(input.toString()) }
    }
    @Test
    fun configurationFieldsAndDeviceNameRemainValidatedOnAdoption() {
        val unknown = start(); unknown.getJSONObject(CONFIGURATION_FIELD).put(PRIVATE_FIELD, SECRET)
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(unknown.toString()) }
        val blank = start(); blank.getJSONObject(CONFIGURATION_FIELD).put(NAME_FIELD, BLANK_TEXT)
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(blank.toString()) }
    }
    @Test
    fun registeredBootstrapPreservesHandleGenerationAndRealRegistrationIdentity() {
        val retained = checkNotNull(protocol.bootstrap(batch(event()), identity(), null))
        val response = JSONObject(retained.serialized); val projectedEvent = response.getJSONArray(EVENTS_FIELD).getJSONObject(FIRST_INDEX)
        assertEquals(HANDLE, response.getLong(HANDLE_FIELD)); assertEquals(GENERATION, projectedEvent.getLong(GENERATION_FIELD))
        assertEquals(OBSERVED_TIME, projectedEvent.getLong(OBSERVED_TIME_FIELD)); assertEquals(ACCOUNT, selectedData(retained).getString(ACCOUNT_FIELD))
        assertFalse(retained.serialized.contains(SECRET)); assertEquals(SINGLE_COUNT, response.getJSONArray(EVENTS_FIELD).length())
    }
    @Test
    fun registeredBootstrapCannotSubstituteAnotherAccountOrDevice() {
        for (field in listOf(ACCOUNT_FIELD, DEVICE_FIELD)) {
            val registration = event(); registration.getJSONObject(DATA_FIELD).put(field, OTHER_ACCOUNT)
            requireFailure(UNAUTHORIZED_FAILURE) { protocol.bootstrap(batch(registration), identity(), null) }
        }
    }
    @Test
    fun clusterRegistrationRequiresActualMatchingDeviceAndSupportedVerification() {
        val missing = event(); missing.getJSONObject(DATA_FIELD).getJSONObject(CLUSTER_FIELD).put(DEVICES_FIELD, JSONArray())
        requireFailure(INVALID_RESPONSE_FAILURE) { protocol.bootstrap(batch(missing), identity(), null) }
        val unknown = event(); unknown.getJSONObject(DATA_FIELD).put(SOURCE_FIELD, PRIVATE_FIELD)
        requireFailure(INVALID_RESPONSE_FAILURE) { protocol.bootstrap(batch(unknown), identity(), null) }
    }
    @Test
    fun acknowledgedObserverRegistrationCanRestoreWithoutClusterDeviceListing() {
        val registration = event(); registration.getJSONObject(DATA_FIELD).put(SOURCE_FIELD, ACKNOWLEDGED_OBSERVER_SOURCE)
            .getJSONObject(CLUSTER_FIELD).put(DEVICES_FIELD, JSONArray())
        val retained = checkNotNull(protocol.bootstrap(batch(registration), identity(), null))
        assertEquals(ACKNOWLEDGED_OBSERVER_SOURCE, selectedData(retained).getString(SOURCE_FIELD))
        assertEquals(FIRST_INDEX, selectedData(retained).getJSONObject(CLUSTER_FIELD).getJSONArray(DEVICES_FIELD).length())
    }
    @Test
    fun newerReconnectReplacesRegisteredBootstrapAndOldGenerationsCannotRegressIt() {
        val registered = protocol.bootstrap(batch(event()), identity(), null)
        val reconnecting = protocol.bootstrap(batch(event(RECONNECTING_TYPE, NEXT_GENERATION)), identity(), registered)
        val retained = checkNotNull(protocol.bootstrap(batch(event()), identity(), reconnecting))
        assertEquals(RECONNECTING_TYPE, selectedData(retained).getString(TYPE_FIELD))
        assertEquals(NEXT_GENERATION, JSONObject(retained.serialized).getJSONArray(EVENTS_FIELD).getJSONObject(FIRST_INDEX).getLong(GENERATION_FIELD))
    }
    @Test
    fun ordinaryClusterBatchesDoNotReplaceBootstrapOrReplayMembership() {
        val registered = protocol.bootstrap(batch(event()), identity(), null)
        val cluster = event(CLUSTER_SOURCE); cluster.getJSONObject(DATA_FIELD).put(PRIVATE_FIELD, SECRET)
        assertEquals(registered, protocol.bootstrap(batch(cluster), identity(), registered))
        assertFalse(checkNotNull(registered).serialized.contains(PRIVATE_FIELD))
    }
    @Test
    fun newGenerationWithoutLifecycleCannotReplayOldReadyState() {
        val registered = protocol.bootstrap(batch(event()), identity(), null)
        val advancing = protocol.bootstrap(batch(event(CLUSTER_SOURCE, NEXT_GENERATION)), identity(), registered)
        val retained = checkNotNull(protocol.bootstrap(batch(event()), identity(), advancing))
        assertEquals(CLUSTER_SOURCE, selectedData(retained).getString(TYPE_FIELD))
        assertEquals(NEXT_GENERATION, JSONObject(retained.serialized).getJSONArray(EVENTS_FIELD).getJSONObject(FIRST_INDEX).getLong(GENERATION_FIELD))
    }
    @Test
    fun finishedBatchClearsBootstrapRatherThanRevivingStoppedConnection() {
        val registered = protocol.bootstrap(batch(event()), identity(), null)
        assertNull(protocol.bootstrap(SpotifyConnectBatch(SECRET, true), identity(), registered))
    }
    @Test
    fun stringGenerationsAndTimestampsCannotBeNormalizedIntoValidBootstrapNumbers() {
        for (field in listOf(GENERATION_FIELD, OBSERVED_TIME_FIELD)) {
            requireFailure(INVALID_RESPONSE_FAILURE) { protocol.bootstrap(batch(event().put(field, GENERATION.toString())), identity(), null) }
        }
    }
    @Test
    fun arbitraryReconnectFailureTextCannotReachRetainedBootstrap() {
        val reconnecting = event(RECONNECTING_TYPE); reconnecting.getJSONObject(DATA_FIELD).put(FAILURE_FIELD, SECRET)
        val retained = checkNotNull(protocol.bootstrap(batch(reconnecting), identity(), null))
        assertFalse(retained.serialized.contains(SECRET)); assertEquals(NETWORK_FAILURE, selectedData(retained).getString(FAILURE_FIELD))
    }
    @Test
    fun duplicateCredentialDataAliasesCannotBypassNativeCredentialShape() {
        val credential = stored(); credential.getJSONObject(CREDENTIALS_FIELD).put(LEGACY_AUTHENTICATION_DATA_FIELD, SECRET)
        requireFailure(INVALID_INPUT_FAILURE) { protocol.identity(start(credential).toString()) }
    }

    companion object {
        private const val ACCOUNT = "synthetic-account"
        private const val OTHER_ACCOUNT = "replacement-account"
        private const val DEVICE = "synthetic-device"
        private const val CLIENT = "synthetic-client"
        private const val NAME = "synthetic-name"
        private const val SECRET = "c3ludGhldGljLXByaXZhdGUtY3JlZGVudGlhbA=="
        private const val INVALID_BASE64 = "***"
        private const val EMPTY_TEXT = ""
        private const val BLANK_TEXT = " "
        private const val CONTROL_TEXT = "\u0000"
        private const val HANDLE = 7L
        private const val GENERATION = 3L
        private const val NEXT_GENERATION = 4L
        private const val OBSERVED_TIME = 100L
        private const val SAMPLED_TIME = 101L
        private const val FIRST_INDEX = 0
        private const val SINGLE_COUNT = 1
        private const val SCHEMA_VERSION = 1
        private const val INVALID_SCHEMA_VERSION = 2
        private const val STORED_AUTHENTICATION_TYPE = 1
        private const val INVALID_AUTHENTICATION_TYPE = 0
        private const val OVERSIZED_REPEAT_COUNT = 4096
        private const val OVERSIZED_IDENTITY_REPEAT_COUNT = 8
        private const val SCHEMA_FIELD = "schemaVersion"
        private const val ACCOUNT_FIELD = "accountIdentifier"
        private const val DEVICE_FIELD = "deviceIdentifier"
        private const val CLIENT_FIELD = "clientIdentifier"
        private const val CREDENTIALS_FIELD = "credentials"
        private const val CREDENTIAL_FIELD = "storedCredential"
        private const val CONFIGURATION_FIELD = "configuration"
        private const val USERNAME_FIELD = "username"
        private const val AUTHENTICATION_TYPE_FIELD = "auth_type"
        private const val AUTHENTICATION_DATA_FIELD = "auth_data"
        private const val LEGACY_AUTHENTICATION_DATA_FIELD = "encoded_auth_blob"
        private const val FAILURE_FIELD = "failure"
        private const val NETWORK_FAILURE = "network"
        private const val NAME_FIELD = "name"
        private const val PLAYBACK_READY_FIELD = "playbackReady"
        private const val TYPE_FIELD = "type"
        private const val SOURCE_FIELD = "verificationSource"
        private const val CLUSTER_FIELD = "cluster"
        private const val DEVICES_FIELD = "devices"
        private const val IDENTIFIER_FIELD = "identifier"
        private const val GENERATION_FIELD = "generation"
        private const val OBSERVED_TIME_FIELD = "observedMonotonicMilliseconds"
        private const val SAMPLED_TIME_FIELD = "sampledNativeMonotonicMilliseconds"
        private const val DATA_FIELD = "data"
        private const val HANDLE_FIELD = "handle"
        private const val FINISHED_FIELD = "finished"
        private const val EVENTS_FIELD = "events"
        private const val REGISTERED_TYPE = "registered"
        private const val RECONNECTING_TYPE = "reconnecting"
        private const val CLUSTER_SOURCE = "cluster"
        private const val ACKNOWLEDGED_OBSERVER_SOURCE = "acknowledgedObserver"
        private const val PRIVATE_FIELD = "syntheticPrivateField"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val UNAUTHORIZED_FAILURE = "unauthorized"
        private const val UNSUPPORTED_FAILURE = "unsupported"
        private const val MISSING_FAILURE = "Expected protocol failure"
    }
}

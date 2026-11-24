package com.streamingservice.spotify

import org.json.JSONArray
import org.json.JSONObject

class SpotifyConnectJsonRuntimeProtocol(private val hasNonemptyCanonicalCredentialData: (String) -> Boolean) : SpotifyConnectRuntimeProtocol {
    override fun identity(serialized: String): SpotifyConnectRuntimeIdentity = decode(INVALID_INPUT_FAILURE) {
        if (serialized.length > MAXIMUM_INPUT_CHARACTERS) fail(INVALID_INPUT_FAILURE)
        val input = JSONObject(serialized)
        requireFields(input, START_FIELDS)
        val accountIdentifier = text(input, ACCOUNT_FIELD, MAXIMUM_ACCOUNT_CHARACTERS)
        val serializedCredential = input.get(CREDENTIAL_FIELD) as? String ?: fail(INVALID_INPUT_FAILURE)
        if (serializedCredential.length > MAXIMUM_CREDENTIAL_CHARACTERS) fail(INVALID_INPUT_FAILURE)
        val credential = JSONObject(serializedCredential)
        requireFields(credential, STORED_FIELDS)
        if (credential.get(SCHEMA_FIELD) != SCHEMA_VERSION) fail(INVALID_INPUT_FAILURE)
        if (text(credential, ACCOUNT_FIELD, MAXIMUM_ACCOUNT_CHARACTERS) != accountIdentifier) fail(UNAUTHORIZED_FAILURE)
        val credentials = credential.getJSONObject(CREDENTIALS_FIELD)
        if (credentials.get(USERNAME_FIELD) != accountIdentifier || credentials.get(AUTHENTICATION_TYPE_FIELD) != STORED_AUTHENTICATION_TYPE) fail(INVALID_INPUT_FAILURE)
        if (credentials.has(AUTHENTICATION_DATA_FIELD) && credentials.has(LEGACY_AUTHENTICATION_DATA_FIELD)) fail(INVALID_INPUT_FAILURE)
        val authenticationData = credentials.opt(AUTHENTICATION_DATA_FIELD) ?: credentials.get(LEGACY_AUTHENTICATION_DATA_FIELD)
        if (authenticationData !is String) fail(INVALID_INPUT_FAILURE)
        if (!hasNonemptyCanonicalCredentialData(authenticationData)) fail(INVALID_INPUT_FAILURE)
        val configuration = input.getJSONObject(CONFIGURATION_FIELD)
        requireFields(configuration, CONFIGURATION_FIELDS)
        val deviceName = text(configuration, NAME_FIELD, MAXIMUM_DEVICE_CHARACTERS)
        if (deviceName.isBlank()) fail(INVALID_INPUT_FAILURE)
        val playbackReady = configuration.get(PLAYBACK_READY_FIELD) as? Boolean ?: fail(INVALID_INPUT_FAILURE)
        if (playbackReady) fail(UNSUPPORTED_FAILURE)
        SpotifyConnectRuntimeIdentity(accountIdentifier, text(credential, DEVICE_FIELD, MAXIMUM_DEVICE_CHARACTERS),
            text(credential, CLIENT_FIELD, MAXIMUM_DEVICE_CHARACTERS), deviceName, playbackReady)
    }

    override fun bootstrap(batch: SpotifyConnectBatch, identity: SpotifyConnectRuntimeIdentity, previous: SpotifyConnectBatch?): SpotifyConnectBatch? = decode(INVALID_RESPONSE_FAILURE) {
        if (batch.finished) return@decode null
        if (batch.serialized.length > MAXIMUM_BATCH_CHARACTERS) fail(INVALID_RESPONSE_FAILURE)
        val response = JSONObject(batch.serialized)
        val handle = natural(response, HANDLE_FIELD)
        if (handle < FIRST_HANDLE) fail(INVALID_RESPONSE_FAILURE)
        val sampledNativeMonotonicMilliseconds = natural(response, SAMPLED_TIME_FIELD)
        var retained = previous
        var retainedGeneration = previous?.let { retainedBatch -> JSONObject(retainedBatch.serialized).getJSONArray(EVENTS_FIELD).getJSONObject(FIRST_INDEX).getLong(GENERATION_FIELD) } ?: INITIAL_GENERATION
        val events = response.getJSONArray(EVENTS_FIELD)
        for (eventIndex in FIRST_INDEX until events.length()) {
            val event = events.getJSONObject(eventIndex)
            val generation = natural(event, GENERATION_FIELD)
            val observedMonotonicMilliseconds = natural(event, OBSERVED_TIME_FIELD)
            if (generation < retainedGeneration) continue
            val data = event.getJSONObject(DATA_FIELD)
            val type = data.getString(TYPE_FIELD)
            val advancesGeneration = generation > retainedGeneration
            retainedGeneration = generation
            if (type !in LIFECYCLE_TYPES && !advancesGeneration) continue
            if (type !in EVENT_TYPES) fail(INVALID_RESPONSE_FAILURE)
            val projected = JSONObject().put(TYPE_FIELD, type)
            when (type) {
                REGISTERED_TYPE -> {
                    if (generation < FIRST_GENERATION) fail(INVALID_RESPONSE_FAILURE)
                    if (data.get(ACCOUNT_FIELD) != identity.accountIdentifier || data.get(DEVICE_FIELD) != identity.deviceIdentifier) fail(UNAUTHORIZED_FAILURE)
                    val source = data.getString(SOURCE_FIELD)
                    if (source !in REGISTRATION_SOURCES) fail(INVALID_RESPONSE_FAILURE)
                    val devices = data.getJSONObject(CLUSTER_FIELD).getJSONArray(DEVICES_FIELD)
                    val containsDevice = (FIRST_INDEX until devices.length()).any { deviceIndex -> devices.getJSONObject(deviceIndex).opt(IDENTIFIER_FIELD) == identity.deviceIdentifier }
                    if (source == CLUSTER_SOURCE && !containsDevice) fail(INVALID_RESPONSE_FAILURE)
                    val projectedDevices = JSONArray()
                    if (containsDevice) projectedDevices.put(JSONObject().put(IDENTIFIER_FIELD, identity.deviceIdentifier))
                    projected.put(ACCOUNT_FIELD, identity.accountIdentifier).put(DEVICE_FIELD, identity.deviceIdentifier).put(SOURCE_FIELD, source)
                        .put(CLUSTER_FIELD, JSONObject().put(DEVICES_FIELD, projectedDevices))
                }
                RECONNECTING_TYPE -> projected.put(FAILURE_FIELD, safeFailure(data.opt(FAILURE_FIELD)))
                STOPPED_TYPE -> if (data.has(CLEANUP_FAILURE_FIELD) && !data.isNull(CLEANUP_FAILURE_FIELD)) projected.put(CLEANUP_FAILURE_FIELD, safeFailure(data.opt(CLEANUP_FAILURE_FIELD)))
            }
            val projectedEvent = JSONObject().put(GENERATION_FIELD, generation)
                .put(OBSERVED_TIME_FIELD, observedMonotonicMilliseconds).put(DATA_FIELD, projected)
            retained = SpotifyConnectBatch(JSONObject().put(HANDLE_FIELD, handle)
                .put(SAMPLED_TIME_FIELD, sampledNativeMonotonicMilliseconds).put(FINISHED_FIELD, false)
                .put(EVENTS_FIELD, JSONArray().put(projectedEvent)).toString(), false)
        }
        retained
    }

    private fun natural(value: JSONObject, field: String): Long {
        val number = value.get(field) as? Number ?: fail(INVALID_RESPONSE_FAILURE)
        val decimal = number.toDouble()
        if (!decimal.isFinite() || decimal < INITIAL_GENERATION || decimal > MAXIMUM_SAFE_INTEGER || decimal != number.toLong().toDouble()) fail(INVALID_RESPONSE_FAILURE)
        return number.toLong()
    }

    private fun safeFailure(value: Any?): String = (value as? String)?.takeIf { code -> code in FAILURE_CODES } ?: NETWORK_FAILURE

    private fun text(value: JSONObject, field: String, maximumCharacters: Int): String {
        val selected = value.get(field) as? String ?: fail(INVALID_INPUT_FAILURE)
        if (selected.isEmpty() || selected.codePointCount(FIRST_INDEX, selected.length) > maximumCharacters || selected.any { character -> character.isISOControl() }) fail(INVALID_INPUT_FAILURE)
        return selected
    }

    private fun requireFields(value: JSONObject, fields: Set<String>) {
        if (value.keys().asSequence().toSet() != fields) fail(INVALID_INPUT_FAILURE)
    }

    private fun fail(code: String): Nothing = throw SpotifyConnectFailure(code)

    private fun <Result> decode(code: String, operation: () -> Result): Result = try { operation() }
        catch (failure: SpotifyConnectFailure) { throw failure }
        catch (_failure: Throwable) { fail(code) }

    companion object {
        private const val MAXIMUM_BATCH_CHARACTERS = 2097152
        private const val MAXIMUM_SAFE_INTEGER = 9007199254740991.0
        private const val FIRST_HANDLE = 1L
        private const val FIRST_GENERATION = 1L
        private const val MAXIMUM_INPUT_CHARACTERS = 131072
        private const val MAXIMUM_CREDENTIAL_CHARACTERS = 65536
        private const val MAXIMUM_ACCOUNT_CHARACTERS = 512
        private const val MAXIMUM_DEVICE_CHARACTERS = 128
        private const val FIRST_INDEX = 0
        private const val INITIAL_GENERATION = 0L
        private const val SCHEMA_VERSION = 1
        private const val STORED_AUTHENTICATION_TYPE = 1
        private const val ACCOUNT_FIELD = "accountIdentifier"
        private const val DEVICE_FIELD = "deviceIdentifier"
        private const val CLIENT_FIELD = "clientIdentifier"
        private const val CREDENTIAL_FIELD = "storedCredential"
        private const val CREDENTIALS_FIELD = "credentials"
        private const val CONFIGURATION_FIELD = "configuration"
        private const val NAME_FIELD = "name"
        private const val PLAYBACK_READY_FIELD = "playbackReady"
        private const val SCHEMA_FIELD = "schemaVersion"
        private const val USERNAME_FIELD = "username"
        private const val AUTHENTICATION_TYPE_FIELD = "auth_type"
        private const val AUTHENTICATION_DATA_FIELD = "auth_data"
        private const val LEGACY_AUTHENTICATION_DATA_FIELD = "encoded_auth_blob"
        private const val EVENTS_FIELD = "events"
        private const val GENERATION_FIELD = "generation"
        private const val DATA_FIELD = "data"
        private const val TYPE_FIELD = "type"
        private const val REGISTERED_TYPE = "registered"
        private const val CONNECTING_TYPE = "connecting"
        private const val RECONNECTING_TYPE = "reconnecting"
        private const val STOPPED_TYPE = "stopped"
        private const val MEMBERSHIP_TYPE = "membership"
        private const val SESSION_MESSAGE_TYPE = "sessionMessage"
        private const val COMMAND_TYPE = "command"
        private const val SOURCE_FIELD = "verificationSource"
        private const val CLUSTER_FIELD = "cluster"
        private const val DEVICES_FIELD = "devices"
        private const val IDENTIFIER_FIELD = "identifier"
        private const val CLUSTER_SOURCE = "cluster"
        private const val DEVICE_STATUS_SOURCE = "deviceStatus"
        private const val ACKNOWLEDGED_OBSERVER_SOURCE = "acknowledgedObserver"
        private const val FAILURE_FIELD = "failure"
        private const val CLEANUP_FAILURE_FIELD = "cleanupFailure"
        private const val OBSERVED_TIME_FIELD = "observedMonotonicMilliseconds"
        private const val SAMPLED_TIME_FIELD = "sampledNativeMonotonicMilliseconds"
        private const val HANDLE_FIELD = "handle"
        private const val FINISHED_FIELD = "finished"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val UNAUTHORIZED_FAILURE = "unauthorized"
        private const val UNSUPPORTED_FAILURE = "unsupported"
        private const val NETWORK_FAILURE = "network"
        private val FAILURE_CODES = SpotifyConnectFailureCode.entries.map { failure -> failure.wireValue }.toSet()
        private val START_FIELDS = setOf(ACCOUNT_FIELD, CREDENTIAL_FIELD, CONFIGURATION_FIELD)
        private val STORED_FIELDS = setOf(SCHEMA_FIELD, ACCOUNT_FIELD, DEVICE_FIELD, CLIENT_FIELD, CREDENTIALS_FIELD)
        private val CONFIGURATION_FIELDS = setOf(NAME_FIELD, PLAYBACK_READY_FIELD)
        private val LIFECYCLE_TYPES = setOf(REGISTERED_TYPE, CONNECTING_TYPE, RECONNECTING_TYPE, STOPPED_TYPE)
        private val EVENT_TYPES = LIFECYCLE_TYPES + setOf(CLUSTER_SOURCE, MEMBERSHIP_TYPE, SESSION_MESSAGE_TYPE, COMMAND_TYPE)
        private val REGISTRATION_SOURCES = setOf(CLUSTER_SOURCE, DEVICE_STATUS_SOURCE, ACKNOWLEDGED_OBSERVER_SOURCE)
    }
}

package com.streamingservice.spotify

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.util.concurrent.Executors

class SpotifyLibrespotSessionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val workers = Executors.newFixedThreadPool(MAXIMUM_WORKERS)
    private val execution = object : SpotifyLibrespotExecution {
        override fun begin(identifier: String): String = SpotifyLibrespotNative.begin(identifier)
        override fun execute(identifier: String, operation: String, username: String, password: String, credential: String): String =
            SpotifyLibrespotNative.execute(identifier, operation, username, password, credential)
        override fun cancel(identifier: String) { SpotifyLibrespotNative.cancel(identifier) }
        override fun finish(identifier: String) { SpotifyLibrespotNative.finish(identifier) }
    }
    private val runner = SpotifyLibrespotRequestRunner(execution) { task -> workers.execute(task) }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun login(requestIdentifier: String, username: String, password: String, promise: Promise) {
        if (username.isBlank() || username.length > MAXIMUM_USERNAME_CHARACTERS || password.isEmpty() || password.length > MAXIMUM_PASSWORD_CHARACTERS) {
            reject(promise, INVALID_INPUT_FAILURE)
            return
        }
        runner.start(requestIdentifier, LOGIN_OPERATION, username, password, EMPTY_TEXT,
            { result -> resolve(promise, result) }, { failure -> reject(promise, failure) })
    }

    @ReactMethod
    fun restore(requestIdentifier: String, storedCredential: String, promise: Promise) {
        if (storedCredential.isEmpty() || storedCredential.length > MAXIMUM_STORED_CHARACTERS) {
            reject(promise, INVALID_INPUT_FAILURE)
            return
        }
        runner.start(requestIdentifier, RESTORE_OPERATION, EMPTY_TEXT, EMPTY_TEXT, storedCredential,
            { result -> resolve(promise, result) }, { failure -> reject(promise, failure) })
    }

    @ReactMethod
    fun bootstrap(requestIdentifier: String, accessToken: String, promise: Promise) {
        if (accessToken.isEmpty() || accessToken.length > MAXIMUM_TOKEN_CHARACTERS
            || accessToken.any { character -> character.isWhitespace() || character.isISOControl() }) {
            reject(promise, INVALID_INPUT_FAILURE)
            return
        }
        runner.start(requestIdentifier, BOOTSTRAP_OPERATION, EMPTY_TEXT, EMPTY_TEXT, accessToken,
            { result -> resolve(promise, result) }, { failure -> reject(promise, failure) })
    }

    @ReactMethod
    fun cancel(requestIdentifier: String) {
        try { runner.cancel(requestIdentifier) } catch (_failure: Throwable) {}
    }

    override fun invalidate() {
        runner.close()
        workers.shutdown()
        super.invalidate()
    }

    private fun resolve(promise: Promise, serialized: String) {
        if (serialized.length > MAXIMUM_RESULT_CHARACTERS) {
            reject(promise, INVALID_RESPONSE_FAILURE)
            return
        }
        try {
            val result = JSONObject(serialized)
            if (result.has(FAILURE_FIELD)) {
                reject(promise, result.getString(FAILURE_FIELD))
                return
            }
            val accountIdentifier = result.getString(ACCOUNT_FIELD)
            val accessToken = result.getString(ACCESS_TOKEN_FIELD)
            val expiresAtMilliseconds = result.getLong(EXPIRATION_FIELD)
            val storedCredential = result.getString(STORED_FIELD)
            if (accountIdentifier.isBlank() || accountIdentifier.length > MAXIMUM_USERNAME_CHARACTERS || accessToken.isBlank()
                || accessToken.length > MAXIMUM_TOKEN_CHARACTERS || storedCredential.isEmpty() || storedCredential.length > MAXIMUM_STORED_CHARACTERS
                || expiresAtMilliseconds <= MINIMUM_EXPIRATION_MILLISECONDS) {
                reject(promise, INVALID_RESPONSE_FAILURE)
                return
            }
            val grant = Arguments.createMap()
            grant.putString(ACCOUNT_FIELD, accountIdentifier)
            grant.putString(ACCESS_TOKEN_FIELD, accessToken)
            grant.putDouble(EXPIRATION_FIELD, expiresAtMilliseconds.toDouble())
            grant.putString(STORED_FIELD, storedCredential)
            promise.resolve(grant)
        } catch (_failure: Throwable) {
            reject(promise, INVALID_RESPONSE_FAILURE)
        }
    }

    private fun reject(promise: Promise, code: String) {
        promise.reject(if (code in FAILURE_CODES) code else NETWORK_FAILURE, FAILURE_MESSAGE)
    }

    companion object {
        private const val MODULE_NAME = "SpotifyLibrespotSession"
        private const val LOGIN_OPERATION = "login"
        private const val RESTORE_OPERATION = "restore"
        private const val BOOTSTRAP_OPERATION = "bootstrap"
        private const val EMPTY_TEXT = ""
        private const val MAXIMUM_WORKERS = 2
        private const val MAXIMUM_USERNAME_CHARACTERS = 512
        private const val MAXIMUM_PASSWORD_CHARACTERS = 4096
        private const val MAXIMUM_STORED_CHARACTERS = 65536
        private const val MAXIMUM_TOKEN_CHARACTERS = 16384
        private const val MAXIMUM_RESULT_CHARACTERS = 131072
        private const val MINIMUM_EXPIRATION_MILLISECONDS = 0L
        private const val FAILURE_FIELD = "failure"
        private const val ACCOUNT_FIELD = "accountIdentifier"
        private const val ACCESS_TOKEN_FIELD = "accessToken"
        private const val EXPIRATION_FIELD = "expiresAtMilliseconds"
        private const val STORED_FIELD = "storedCredential"
        private const val INVALID_INPUT_FAILURE = "invalid-input"
        private const val INVALID_RESPONSE_FAILURE = "invalid-response"
        private const val NETWORK_FAILURE = "network"
        private const val FAILURE_MESSAGE = "Spotify session authentication failed."
        private const val CANCELED_FAILURE = "canceled"
        private const val UNAUTHORIZED_FAILURE = "unauthorized"
        private const val NATIVE_SESSION_REJECTED_FAILURE = "native-session-rejected"
        private const val NATIVE_TOKEN_REJECTED_FAILURE = "native-token-rejected"
        private const val DEADLINE_FAILURE = "deadline"
        private const val UNSUPPORTED_FAILURE = "unsupported"
        private const val BACKPRESSURE_FAILURE = "backpressure"
        private val FAILURE_CODES = setOf(INVALID_INPUT_FAILURE, INVALID_RESPONSE_FAILURE, NETWORK_FAILURE,
            CANCELED_FAILURE, UNAUTHORIZED_FAILURE, NATIVE_SESSION_REJECTED_FAILURE, NATIVE_TOKEN_REJECTED_FAILURE,
            DEADLINE_FAILURE, UNSUPPORTED_FAILURE, BACKPRESSURE_FAILURE)
    }
}

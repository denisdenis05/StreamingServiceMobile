package com.streamingservice.spotify

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.SecureRandom
import java.util.Locale

class SpotifyProofKeyModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val factory = SpotifyProofKeyFactory(SecureRandom()) { bytes ->
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    override fun getName(): String = MODULE_NAME

    override fun getConstants(): Map<String, Any> = mapOf(DEVICE_REGION_FIELD to Locale.getDefault().country)

    @ReactMethod
    fun generate(promise: Promise) {
        try {
            val proof = factory.generate()
            val result = Arguments.createMap()
            result.putString(VERIFIER_FIELD, proof.verifier)
            result.putString(CHALLENGE_FIELD, proof.challenge)
            result.putString(STATE_FIELD, proof.state)
            promise.resolve(result)
        } catch (failure: Exception) {
            promise.reject(FAILURE_CODE, FAILURE_MESSAGE)
        }
    }

    companion object {
        private const val MODULE_NAME = "SpotifyProofKey"
        private const val DEVICE_REGION_FIELD = "deviceRegion"
        private const val VERIFIER_FIELD = "verifier"
        private const val CHALLENGE_FIELD = "challenge"
        private const val STATE_FIELD = "state"
        private const val FAILURE_CODE = "proof-key-unavailable"
        private const val FAILURE_MESSAGE = "Secure Spotify login is unavailable."
    }
}

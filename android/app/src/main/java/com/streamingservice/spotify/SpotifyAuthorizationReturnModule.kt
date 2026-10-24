package com.streamingservice.spotify

import android.os.SystemClock
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SpotifyAuthorizationReturnModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun read(promise: Promise) {
        promise.resolve(returnStore.read())
    }

    @ReactMethod
    fun clear(promise: Promise) {
        returnStore.clear()
        promise.resolve(null)
    }

    companion object {
        private const val MODULE_NAME = "SpotifyAuthorizationReturn"
        private val returnStore = SpotifyAuthorizationReturnStore { SystemClock.elapsedRealtime() }

        fun capture(address: String?) {
            returnStore.capture(address)
        }
    }
}

package com.streamingservice.spotify

internal object SpotifyLibrespotNative : SpotifyLibrespotExecution {
    init {
        System.loadLibrary(LIBRARY_NAME)
    }

    external override fun begin(identifier: String): String
    external override fun execute(identifier: String, operation: String, username: String, password: String, storedCredential: String): String
    external override fun cancel(identifier: String)
    external override fun finish(identifier: String)
    external fun cancelAll()

    private const val LIBRARY_NAME = "streaming_spotify_session"
}

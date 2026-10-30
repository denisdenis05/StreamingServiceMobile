package com.streamingservice.spotify

internal object SpotifyLibrespotNative : SpotifyLibrespotExecution {
    init {
        System.loadLibrary(LIBRARY_NAME)
    }

    external override fun begin(identifier: String): String
    external override fun execute(identifier: String, operation: String, username: String, password: String, credential: String): String
    external override fun cancel(identifier: String)
    external override fun finish(identifier: String)
    external fun cancelAll()
    external fun connectStart(serialized: String): String
    external fun connectSearch(connectionHandle: Long, generation: Long, serialized: String): String
    external fun connectMetadata(connectionHandle: Long, generation: Long, serialized: String): String
    external fun connectRead(connectionHandle: Long, generation: Long): String
    external fun connectMembership(connectionHandle: Long, generation: Long): String
    external fun connectPoll(connectionHandle: Long): String
    external fun connectExecute(connectionHandle: Long, serialized: String): String
    external fun connectBeginCommand(connectionHandle: Long, requestIdentifier: String): String
    external fun connectCancelCommand(connectionHandle: Long, requestIdentifier: String): String
    external fun connectFinishCommand(connectionHandle: Long, requestIdentifier: String): String
    external fun connectCancel(connectionHandle: Long): String
    external fun connectFinish(connectionHandle: Long): String

    private const val LIBRARY_NAME = "streaming_spotify_session"
}

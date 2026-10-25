package com.streamingservice.spotify;

public final class SpotifyLibrespotNative {
    private static final String LIBRARY_PROPERTY = "streamingservice.spotify.nativeLibrary";
    private static final String FIRST_REQUEST = "jni-first-request";
    private static final String SECOND_REQUEST = "jni-second-request";
    private static final String EMPTY_TEXT = "";
    private static final String LOGIN = "login";
    private static final String RESTORE = "restore";
    private static final String USERNAME = "synthetic-account";
    private static final String PASSWORD = "synthetic-password";
    private static final String INVALID_RECORD = "invalid-record";
    private static final String BACKPRESSURE = "backpressure";
    private static final String INVALID_INPUT = "invalid-input";
    private static final String CANCELED_RESULT = "{\"failure\":\"canceled\"}";
    private static final String INVALID_INPUT_RESULT = "{\"failure\":\"invalid-input\"}";
    private static final String SUCCESS_MESSAGE = "Librespot JNI smoke passed without authentication network requests.";
    private static final String FAILURE_MESSAGE = "Unexpected native boundary result.";

    public native String begin(String identifier);
    public native String execute(String identifier, String operation, String username, String password, String storedCredential);
    public native void cancel(String identifier);
    public native void finish(String identifier);
    public native void cancelAll();

    private static void requireEqual(String expected, String actual) {
        if (!expected.equals(actual)) throw new AssertionError(FAILURE_MESSAGE);
    }

    public static void main(String[] arguments) {
        System.load(System.getProperty(LIBRARY_PROPERTY));
        SpotifyLibrespotNative implementation = new SpotifyLibrespotNative();
        requireEqual(INVALID_INPUT, implementation.begin(null));
        requireEqual(EMPTY_TEXT, implementation.begin(FIRST_REQUEST));
        requireEqual(BACKPRESSURE, implementation.begin(FIRST_REQUEST));
        implementation.cancel(FIRST_REQUEST);
        requireEqual(CANCELED_RESULT, implementation.execute(FIRST_REQUEST, LOGIN, USERNAME, PASSWORD, EMPTY_TEXT));
        requireEqual(EMPTY_TEXT, implementation.begin(FIRST_REQUEST));
        implementation.finish(FIRST_REQUEST);
        requireEqual(EMPTY_TEXT, implementation.begin(FIRST_REQUEST));
        requireEqual(INVALID_INPUT_RESULT, implementation.execute(FIRST_REQUEST, RESTORE, EMPTY_TEXT, EMPTY_TEXT, INVALID_RECORD));
        requireEqual(EMPTY_TEXT, implementation.begin(FIRST_REQUEST));
        requireEqual(EMPTY_TEXT, implementation.begin(SECOND_REQUEST));
        implementation.cancelAll();
        requireEqual(CANCELED_RESULT, implementation.execute(FIRST_REQUEST, LOGIN, USERNAME, PASSWORD, EMPTY_TEXT));
        requireEqual(CANCELED_RESULT, implementation.execute(SECOND_REQUEST, LOGIN, USERNAME, PASSWORD, EMPTY_TEXT));
        System.out.println(SUCCESS_MESSAGE);
    }
}

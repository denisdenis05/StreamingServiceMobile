package com.streamingservice.spotify;

public final class SpotifyLibrespotNative {
    private static final String LIBRARY_PROPERTY = "streamingservice.spotify.nativeLibrary";
    private static final String FIRST_REQUEST = "jni-first-request";
    private static final String SECOND_REQUEST = "jni-second-request";
    private static final String EMPTY_TEXT = "";
    private static final String LOGIN = "login";
    private static final String RESTORE = "restore";
    private static final String BOOTSTRAP = "bootstrap";
    private static final String USERNAME = "synthetic-account";
    private static final String PASSWORD = "synthetic-password";
    private static final String INVALID_RECORD = "invalid-record";
    private static final String BACKPRESSURE = "backpressure";
    private static final String INVALID_INPUT = "invalid-input";
    private static final String CANCELED_RESULT = "{\"failure\":\"canceled\"}";
    private static final String INVALID_INPUT_RESULT = "{\"failure\":\"invalid-input\"}";
    private static final String SUCCESS_MESSAGE = "Librespot JNI smoke passed without authentication network requests.";
    private static final String FAILURE_MESSAGE = "Unexpected native boundary result.";
    private static final long ABSENT_CONNECTION_HANDLE = 1L;
    private static final long INVALID_CONNECTION_HANDLE = 0L;
    private static final String METADATA_IDENTIFIERS = "[\"0000000000000000000001\"]";
    private static final String REFRESH_CONTROL = "{\"operation\":\"refresh\",\"generation\":1}";

    public native String begin(String identifier);
    public native String execute(String identifier, String operation, String username, String password, String credential);
    public native void cancel(String identifier);
    public native void finish(String identifier);
    public native void cancelAll();
    public native String connectStart(String serialized);
    public native String connectMetadata(long connectionHandle, long generation, String serialized);
    public native String connectRead(long connectionHandle, long generation);
    public native String connectMembership(long connectionHandle, long generation);
    public native String connectPoll(long connectionHandle);
    public native String connectExecute(long connectionHandle, String serialized);
    public native String connectBeginCommand(long connectionHandle, String requestIdentifier);
    public native String connectCancelCommand(long connectionHandle, String requestIdentifier);
    public native String connectFinishCommand(long connectionHandle, String requestIdentifier);
    public native String connectCancel(long connectionHandle);
    public native String connectFinish(long connectionHandle);

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
        requireEqual(INVALID_INPUT_RESULT, implementation.execute(FIRST_REQUEST, BOOTSTRAP, EMPTY_TEXT, EMPTY_TEXT, EMPTY_TEXT));
        requireEqual(EMPTY_TEXT, implementation.begin(FIRST_REQUEST));
        implementation.cancel(FIRST_REQUEST);
        requireEqual(CANCELED_RESULT, implementation.execute(FIRST_REQUEST, BOOTSTRAP, EMPTY_TEXT, EMPTY_TEXT, PASSWORD));
        requireEqual(EMPTY_TEXT, implementation.begin(FIRST_REQUEST));
        requireEqual(EMPTY_TEXT, implementation.begin(SECOND_REQUEST));
        implementation.cancelAll();
        requireEqual(CANCELED_RESULT, implementation.execute(FIRST_REQUEST, LOGIN, USERNAME, PASSWORD, EMPTY_TEXT));
        requireEqual(CANCELED_RESULT, implementation.execute(SECOND_REQUEST, LOGIN, USERNAME, PASSWORD, EMPTY_TEXT));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectStart(null));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectStart(INVALID_RECORD));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectPoll(INVALID_CONNECTION_HANDLE));
        requireEqual(CANCELED_RESULT, implementation.connectPoll(ABSENT_CONNECTION_HANDLE));
        requireEqual(CANCELED_RESULT, implementation.connectExecute(ABSENT_CONNECTION_HANDLE, REFRESH_CONTROL));
        requireEqual(CANCELED_RESULT, implementation.connectCancel(ABSENT_CONNECTION_HANDLE));
        requireEqual(CANCELED_RESULT, implementation.connectFinish(ABSENT_CONNECTION_HANDLE));
        requireEqual(CANCELED_RESULT, implementation.connectBeginCommand(ABSENT_CONNECTION_HANDLE, FIRST_REQUEST));
        requireEqual(CANCELED_RESULT, implementation.connectCancelCommand(ABSENT_CONNECTION_HANDLE, FIRST_REQUEST));
        requireEqual(CANCELED_RESULT, implementation.connectFinishCommand(ABSENT_CONNECTION_HANDLE, FIRST_REQUEST));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectBeginCommand(INVALID_CONNECTION_HANDLE, FIRST_REQUEST));
        requireEqual(CANCELED_RESULT, implementation.connectRead(ABSENT_CONNECTION_HANDLE, ABSENT_CONNECTION_HANDLE));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectRead(ABSENT_CONNECTION_HANDLE, INVALID_CONNECTION_HANDLE));
        requireEqual(CANCELED_RESULT, implementation.connectMembership(ABSENT_CONNECTION_HANDLE, ABSENT_CONNECTION_HANDLE));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectMembership(ABSENT_CONNECTION_HANDLE, INVALID_CONNECTION_HANDLE));
        requireEqual(INVALID_INPUT_RESULT, implementation.connectMetadata(ABSENT_CONNECTION_HANDLE, ABSENT_CONNECTION_HANDLE, INVALID_RECORD));
        requireEqual(CANCELED_RESULT, implementation.connectMetadata(ABSENT_CONNECTION_HANDLE, ABSENT_CONNECTION_HANDLE, METADATA_IDENTIFIERS));
        System.out.println(SUCCESS_MESSAGE);
    }
}

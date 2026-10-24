package com.streamingservice.spotify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpotifyAuthorizationReturnStoreTest {
    private class Fixture {
        var nowMilliseconds = INITIAL_MILLISECONDS
        val store = SpotifyAuthorizationReturnStore { nowMilliseconds }
    }

    @Test
    fun retainsCallbackBeforeAnyJavascriptReaderExists() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        assertEquals(FIRST_CALLBACK, fixture.store.read())
    }

    @Test
    fun repeatedReadersDoNotConsumeThePendingReturn() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        assertEquals(FIRST_CALLBACK, fixture.store.read())
        assertEquals(FIRST_CALLBACK, fixture.store.read())
    }

    @Test
    fun newerSpotifyCallbackReplacesThePreviousReturn() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        fixture.store.capture(SECOND_CALLBACK)
        assertEquals(SECOND_CALLBACK, fixture.store.read())
    }

    @Test
    fun unrelatedOrEmptyActivityIntentsPreserveTheSpotifyReturn() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        for (address in listOf(null, EMPTY_ADDRESS, OTHER_APPLICATION_CALLBACK, WRONG_HOST, MALFORMED_ADDRESS)) {
            fixture.store.capture(address)
            assertEquals(FIRST_CALLBACK, fixture.store.read())
        }
    }

    @Test
    fun captureDoesNotRequireAQueryOrMatchingStateForLaterValidation() {
        val fixture = Fixture()
        fixture.store.capture(CALLBACK_WITHOUT_QUERY)
        assertEquals(CALLBACK_WITHOUT_QUERY, fixture.store.read())
    }

    @Test
    fun diagnosticValidationCanInspectAnUnexpectedCallbackPath() {
        val fixture = Fixture()
        fixture.store.capture(UNEXPECTED_PATH_CALLBACK)
        assertEquals(UNEXPECTED_PATH_CALLBACK, fixture.store.read())
    }

    @Test
    fun maximumLengthReturnIsRetainedAndOversizedReturnCannotReplaceIt() {
        val fixture = Fixture()
        val maximumAddress = CALLBACK_PREFIX + PADDING_CHARACTER.repeat(MAXIMUM_CALLBACK_CHARACTERS - CALLBACK_PREFIX.length)
        fixture.store.capture(maximumAddress)
        assertEquals(maximumAddress, fixture.store.read())
        fixture.store.capture(maximumAddress + PADDING_CHARACTER)
        assertEquals(maximumAddress, fixture.store.read())
    }

    @Test
    fun returnExpiresExactlyAtTheRetentionDeadline() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        fixture.nowMilliseconds += MAXIMUM_AGE_MILLISECONDS - BOUNDARY_INCREMENT_MILLISECONDS
        assertEquals(FIRST_CALLBACK, fixture.store.read())
        fixture.nowMilliseconds += BOUNDARY_INCREMENT_MILLISECONDS
        assertNull(fixture.store.read())
        fixture.nowMilliseconds = INITIAL_MILLISECONDS
        assertNull(fixture.store.read())
    }

    @Test
    fun unrelatedIntentsDoNotExtendCallbackRetention() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        fixture.nowMilliseconds += MAXIMUM_AGE_MILLISECONDS
        fixture.store.capture(OTHER_APPLICATION_CALLBACK)
        assertNull(fixture.store.read())
    }

    @Test
    fun backwardClockInvalidatesTheReturnWithoutResurrectingIt() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        fixture.nowMilliseconds -= BOUNDARY_INCREMENT_MILLISECONDS
        assertNull(fixture.store.read())
        fixture.nowMilliseconds = INITIAL_MILLISECONDS
        assertNull(fixture.store.read())
    }

    @Test
    fun negativeCaptureTimeCannotRetainACallback() {
        val fixture = Fixture()
        fixture.nowMilliseconds = NEGATIVE_MILLISECONDS
        fixture.store.capture(FIRST_CALLBACK)
        assertNull(fixture.store.read())
    }

    @Test
    fun clearErasesTheReturnBeforeAnotherAuthorizationStarts() {
        val fixture = Fixture()
        fixture.store.capture(FIRST_CALLBACK)
        fixture.store.clear()
        assertNull(fixture.store.read())
        fixture.store.capture(SECOND_CALLBACK)
        assertEquals(SECOND_CALLBACK, fixture.store.read())
    }

    companion object {
        private const val INITIAL_MILLISECONDS = 1000L
        private const val NEGATIVE_MILLISECONDS = -1L
        private const val MAXIMUM_AGE_MILLISECONDS = 600000L
        private const val BOUNDARY_INCREMENT_MILLISECONDS = 1L
        private const val MAXIMUM_CALLBACK_CHARACTERS = 16384
        private const val FIRST_CALLBACK = "streamingservicespotify://callback?code=artificial-first-code&state=artificial-first-state"
        private const val SECOND_CALLBACK = "streamingservicespotify://callback?code=artificial-second-code&state=artificial-second-state"
        private const val OTHER_APPLICATION_CALLBACK = "streamingservice://lastfm/callback?token=artificial-token"
        private const val WRONG_HOST = "streamingservicespotify://other?code=artificial-code"
        private const val MALFORMED_ADDRESS = "streamingservicespotify://callback?code=%invalid"
        private const val CALLBACK_WITHOUT_QUERY = "streamingservicespotify://callback"
        private const val UNEXPECTED_PATH_CALLBACK = "streamingservicespotify://callback/other?state=artificial-state"
        private const val CALLBACK_PREFIX = "streamingservicespotify://callback?code="
        private const val PADDING_CHARACTER = "x"
        private const val EMPTY_ADDRESS = ""
    }
}

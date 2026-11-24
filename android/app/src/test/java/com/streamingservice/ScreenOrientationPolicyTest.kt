package com.streamingservice

import android.content.pm.ActivityInfo
import org.junit.Assert.assertEquals
import org.junit.Test

class ScreenOrientationPolicyTest {
    @Test
    fun screensBelowTabletMinimumRequestPortrait() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, ScreenOrientationPolicy.requestedOrientation(LargestPhoneSmallestWidthDensityIndependentPixels))
    }

    @Test
    fun screensAtTabletMinimumAllowRotation() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED, ScreenOrientationPolicy.requestedOrientation(SmallTabletSmallestWidthDensityIndependentPixels))
    }

    @Test
    fun largerTabletsAllowRotation() {
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED, ScreenOrientationPolicy.requestedOrientation(LargeTabletSmallestWidthDensityIndependentPixels))
    }

    private companion object {
        const val LargestPhoneSmallestWidthDensityIndependentPixels = 599
        const val SmallTabletSmallestWidthDensityIndependentPixels = 600
        const val LargeTabletSmallestWidthDensityIndependentPixels = 840
    }
}

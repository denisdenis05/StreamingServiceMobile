package com.streamingservice

import android.content.pm.ActivityInfo

internal object ScreenOrientationPolicy {
    private const val TabletMinimumSmallestWidthDensityIndependentPixels = 600

    fun requestedOrientation(smallestScreenWidthDensityIndependentPixels: Int): Int =
        if (smallestScreenWidthDensityIndependentPixels >= TabletMinimumSmallestWidthDensityIndependentPixels) {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
}

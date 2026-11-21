package com.streamingservice.lyrics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CoverColorSelectionTest {
    private val selection = CoverColorSelection()
    @Test fun mostFrequentCoverBucketSuppliesTheColor() {
        assertEquals(GreenColor, selection.select(intArrayOf(GreenPixel, GreenPixel, RedPixel)))
    }
    @Test fun transparentPixelsCannotDominateTheCoverColor() {
        assertEquals(GreenColor, selection.select(intArrayOf(TransparentPixel, TransparentPixel, GreenPixel)))
    }
    @Test fun nearbyColorsAreAveragedWithinTheirBucket() {
        assertEquals(AverageColor, selection.select(intArrayOf(GreenPixel, NearbyGreenPixel)))
    }
    @Test fun emptyAndFullyTransparentCoversHaveNoColor() {
        assertNull(selection.select(intArrayOf()))
        assertNull(selection.select(intArrayOf(TransparentPixel)))
    }
    @Test fun tiedBucketsHaveStableResultsIndependentOfPixelOrder() {
        assertEquals(selection.select(intArrayOf(GreenPixel, RedPixel)), selection.select(intArrayOf(RedPixel, GreenPixel)))
    }
    private companion object {
        const val GreenPixel = -0xff7800
        const val NearbyGreenPixel = -0xff7700
        const val RedPixel = -0x10000
        const val TransparentPixel = 0x00ffffff
        const val GreenColor = 0x008800
        const val AverageColor = 0x008800
    }
}

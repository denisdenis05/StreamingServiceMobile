package com.streamingservice.lyrics

class CoverColorSelection {
    fun select(pixels: IntArray): Int? {
        val buckets = mutableMapOf<Int, ColorBucket>()
        pixels.forEach { pixel ->
            if ((pixel ushr AlphaShift) >= MinimumAlpha) {
                val red = (pixel ushr RedShift) and ChannelMask
                val green = (pixel ushr GreenShift) and ChannelMask
                val blue = pixel and ChannelMask
                val key = ((red ushr BucketShift) shl RedShift) or ((green ushr BucketShift) shl GreenShift) or (blue ushr BucketShift)
                val bucket = buckets.getOrPut(key) { ColorBucket() }
                bucket.count += CountIncrement
                bucket.red += red
                bucket.green += green
                bucket.blue += blue
            }
        }
        val selected = buckets.entries.sortedWith(compareByDescending<Map.Entry<Int, ColorBucket>> { it.value.count }.thenBy { it.key }).firstOrNull()?.value ?: return null
        return ((selected.red / selected.count) shl RedShift) or ((selected.green / selected.count) shl GreenShift) or (selected.blue / selected.count)
    }
    private class ColorBucket(var count: Int = InitialCount, var red: Int = InitialCount, var green: Int = InitialCount, var blue: Int = InitialCount)
    private companion object {
        const val AlphaShift = 24
        const val RedShift = 16
        const val GreenShift = 8
        const val BucketShift = 4
        const val ChannelMask = 255
        const val MinimumAlpha = 128
        const val InitialCount = 0
        const val CountIncrement = 1
    }
}

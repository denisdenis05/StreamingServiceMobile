package com.streamingservice.lyrics

import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CoverColorPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(CoverColorModule(reactContext, Executors.newSingleThreadExecutor(), CoverColorSelection()))
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

private class CoverColorModule(private val context: ReactApplicationContext, private val executor: ExecutorService, private val selection: CoverColorSelection) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = ModuleName
    override fun invalidate() { executor.shutdownNow(); super.invalidate() }
    @ReactMethod
    fun getColor(address: String, promise: Promise) {
        executor.execute {
            try { promise.resolve(readColor(address)) }
            catch (failure: Exception) { promise.reject(FailureCode, FailureMessage) }
        }
    }
    private fun readColor(address: String): String? {
        val location = Uri.parse(address)
        require(location.scheme == FileScheme)
        val file = File(requireNotNull(location.path)).canonicalFile
        val roots = listOfNotNull(context.filesDir, context.cacheDir, context.getExternalFilesDir(null), context.externalCacheDir)
        require(roots.any { root -> file.path.startsWith(root.canonicalPath + File.separator) })
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        require(bounds.outWidth > EmptyDimension && bounds.outHeight > EmptyDimension && bounds.outWidth.toLong() * bounds.outHeight <= MaximumCoverPixels)
        var sample = InitialSampleSize
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > SampleDimension) sample *= SampleMultiplier
        val bitmap = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
        return try {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, InitialOffset, bitmap.width, InitialOffset, InitialOffset, bitmap.width, bitmap.height)
            selection.select(pixels)?.let { color -> String.format(Locale.ROOT, HexadecimalColorFormat, color) }
        } finally { bitmap.recycle() }
    }
    private companion object {
        const val ModuleName = "CoverColor"
        const val FileScheme = "file"
        const val FailureCode = "cover_color_unavailable"
        const val FailureMessage = "Cover color is unavailable."
        const val HexadecimalColorFormat = "#%06X"
        const val SampleDimension = 64
        const val InitialSampleSize = 1
        const val SampleMultiplier = 2
        const val EmptyDimension = 0
        const val InitialOffset = 0
        const val MaximumCoverPixels = 16000000L
    }
}

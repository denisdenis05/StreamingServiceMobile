package com.streamingservice

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.streamingservice.spotify.SpotifyAuthorizationReturnModule

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    SpotifyAuthorizationReturnModule.capture(intent?.dataString)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    SpotifyAuthorizationReturnModule.capture(intent.dataString)
    setIntent(intent)
    super.onNewIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "streamingservice"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}

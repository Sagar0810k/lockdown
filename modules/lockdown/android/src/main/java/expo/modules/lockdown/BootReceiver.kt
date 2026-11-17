package expo.modules.lockdown

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-applies DND and the end alarm after a reboot so a session never silently dies. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
      SessionStore.rearmAfterBoot(context)
    }
  }
}

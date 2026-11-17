package expo.modules.lockdown

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Fires at the scheduled end of a session: restore ringer/DND, clear state, notify. */
class SessionEndReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    SessionStore.maybeExpire(context)
  }
}

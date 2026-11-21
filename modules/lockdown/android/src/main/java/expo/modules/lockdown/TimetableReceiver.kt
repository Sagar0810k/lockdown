package expo.modules.lockdown

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Fires at a scheduled study-block start: begins a lockdown session that ends
 * at the block's end time, then re-arms the next occurrence.
 */
class TimetableReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_TIME_SET,
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> {
        TimetableScheduler.scheduleAll(context)
        return
      }
    }

    val entryId = intent.getStringExtra("entryId") ?: return
    val config = TimetableStore.load(context) ?: return
    if (!config.masterEnabled) return

    val entry = config.entries.firstOrNull { it.id == entryId && it.enabled }
    val now = System.currentTimeMillis()
    val window = entry?.let { TimetableScheduler.windowFor(it, now) }
    if (entry == null || window == null || window.second <= now || config.blocked.isEmpty()) {
      // Deleted/disabled block, nothing to lock, or the alarm was stale — just re-arm.
      TimetableScheduler.scheduleAll(context)
      return
    }

    if (SessionStore.isActive(context)) SessionStore.discard(context)
    SessionStore.start(
      context,
      config.blocked,
      config.strict,
      config.silence,
      window.second,
      window.second - now
    )
    UsageMonitorService.start(context)
    TimetableScheduler.scheduleAll(context)
  }
}

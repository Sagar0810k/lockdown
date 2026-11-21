package expo.modules.lockdown

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar

/**
 * Arms one wall-clock alarm per study block, for its next occurrence.
 * Uses setAlarmClock() so the alarm survives Doze and the app is temporarily
 * allowlisted to start its foreground monitor from the background.
 */
object TimetableScheduler {
  private const val REQUEST_BASE = 9000
  private const val SHOW_INTENT_REQUEST = 9555

  fun scheduleAll(ctx: Context) {
    cancelAll(ctx)
    val config = TimetableStore.load(ctx) ?: return
    if (!config.masterEnabled) return
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val now = System.currentTimeMillis()
    val armed = HashSet<String>()
    for (entry in config.entries) {
      if (!entry.enabled || entry.days.isEmpty()) continue
      val start = nextStart(entry, now) ?: continue
      val pi = pendingIntent(ctx, entry)
      try {
        am.setAlarmClock(AlarmManager.AlarmClockInfo(start, showIntent(ctx)), pi)
        armed.add(entry.id)
      } catch (e: SecurityException) {
        try {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, start, pi)
          armed.add(entry.id)
        } catch (e2: SecurityException) {
          am.set(AlarmManager.RTC_WAKEUP, start, pi)
          armed.add(entry.id)
        }
      }
    }
    TimetableStore.saveScheduledIds(ctx, armed)
  }

  /** Cancels whatever was armed last time — including blocks the user has since deleted. */
  fun cancelAll(ctx: Context) {
    val ids = TimetableStore.scheduledIds(ctx)
    if (ids.isEmpty()) return
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    for (id in ids) am.cancel(pendingIntentForId(ctx, id))
    TimetableStore.saveScheduledIds(ctx, emptySet())
  }

  /** Next block start strictly after [fromMs]. Days are 0 = Sunday … 6 = Saturday. */
  fun nextStart(entry: TimetableStore.Entry, fromMs: Long): Long? {
    if (entry.days.isEmpty()) return null
    val probe = Calendar.getInstance()
    for (offset in 0..7) {
      probe.timeInMillis = fromMs
      probe.add(Calendar.DAY_OF_YEAR, offset)
      val dow = probe.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
      if (!entry.days.contains(dow)) continue
      probe.set(Calendar.HOUR_OF_DAY, entry.startH)
      probe.set(Calendar.MINUTE, entry.startM)
      probe.set(Calendar.SECOND, 0)
      probe.set(Calendar.MILLISECOND, 0)
      if (probe.timeInMillis > fromMs) return probe.timeInMillis
    }
    return null
  }

  /**
   * The block window this alarm belongs to: today's block if it is already running,
   * otherwise yesterday's block when it runs past midnight. Null when the alarm is stale.
   */
  fun windowFor(entry: TimetableStore.Entry, nowMs: Long): Pair<Long, Long>? {
    val base = Calendar.getInstance()
    base.timeInMillis = nowMs
    val start = (base.clone() as Calendar).apply {
      set(Calendar.HOUR_OF_DAY, entry.startH)
      set(Calendar.MINUTE, entry.startM)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    val end = endFrom(start, entry)
    if (start.timeInMillis <= nowMs) {
      return if (nowMs < end.timeInMillis) start.timeInMillis to end.timeInMillis else null
    }
    // Fired before today's start — must belong to an overnight block that began yesterday.
    val yesterdayStart = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
    val yesterdayEnd = endFrom(yesterdayStart, entry)
    return if (nowMs < yesterdayEnd.timeInMillis) yesterdayStart.timeInMillis to yesterdayEnd.timeInMillis else null
  }

  /** End time for a block that starts at [start]; an end at/before the start rolls to the next day. */
  private fun endFrom(start: Calendar, entry: TimetableStore.Entry): Calendar {
    val end = start.clone() as Calendar
    end.set(Calendar.HOUR_OF_DAY, entry.endH)
    end.set(Calendar.MINUTE, entry.endM)
    end.set(Calendar.SECOND, 0)
    end.set(Calendar.MILLISECOND, 0)
    if (end.timeInMillis <= start.timeInMillis) end.add(Calendar.DAY_OF_YEAR, 1)
    return end
  }

  private fun requestCodeFor(id: String): Int =
    REQUEST_BASE + (id.hashCode() and 0x0000FFFF)

  private fun pendingIntentForId(ctx: Context, id: String): PendingIntent {
    val intent = Intent(ctx, TimetableReceiver::class.java).apply {
      putExtra("entryId", id)
    }
    return PendingIntent.getBroadcast(
      ctx,
      requestCodeFor(id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun pendingIntent(ctx: Context, entry: TimetableStore.Entry): PendingIntent =
    pendingIntentForId(ctx, entry.id)

  private fun showIntent(ctx: Context): PendingIntent? {
    val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    return PendingIntent.getActivity(
      ctx,
      SHOW_INTENT_REQUEST,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}

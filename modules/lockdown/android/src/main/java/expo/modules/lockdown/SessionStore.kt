package expo.modules.lockdown

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * Single source of truth for an active focus session.
 * Sessions are anchored to elapsedRealtime so wall-clock changes cannot shorten them.
 * After a reboot, rearmAfterBoot() re-derives timing from the stored wall-clock end.
 */
object SessionStore {
  private const val PREFS = "lockdown_session"
  private const val CHANNEL_ID = "lockdown_session_end"
  private const val ALARM_REQUEST = 1701

  val STRICT_EXTRA_PACKAGES = listOf(
    "com.android.settings",
    "com.android.vending",
    "com.google.android.packageinstaller",
    "com.android.packageinstaller"
  )

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun start(ctx: Context, blocked: Set<String>, strict: Boolean, silence: Boolean, endWall: Long, durationMs: Long) {
    discard(ctx) // never stack sessions
    val edit = prefs(ctx).edit()
      .putBoolean("session_active", true)
      .putLong("started_wall", System.currentTimeMillis())
      .putLong("end_wall", endWall)
      .putLong("end_elapsed", SystemClock.elapsedRealtime() + durationMs)
      .putBoolean("strict", strict)
      .putBoolean("silence", silence)
      .putStringSet("blocked", blocked)
      .putInt("attempts_total", 0)
      .remove("report_json")
    val p = prefs(ctx)
    blocked.forEach { p.edit().remove("attempt_$it").apply() } // stale keys from earlier package set
    edit.apply()
    if (silence) applyDnd(ctx)
    armAlarm(ctx, prefs(ctx).getLong("end_elapsed", 0L))
  }

  /** Ends the session WITHOUT writing a report (used when starting over). */
  fun discard(ctx: Context) {
    if (!prefs(ctx).getBoolean("session_active", false)) return
    finish(ctx, "restart", writeReport = false)
  }

  fun endSession(ctx: Context, reason: String) = finish(ctx, reason, writeReport = true)

  private fun finish(ctx: Context, reason: String, writeReport: Boolean) {
    val p = prefs(ctx)
    val startedWall = p.getLong("started_wall", 0L)
    val attempts = p.getInt("attempts_total", 0)
    restoreDnd(ctx)
    cancelAlarm(ctx)
    if (writeReport) {
      val minutes = ((System.currentTimeMillis() - startedWall) / 60000).coerceAtLeast(0)
      p.edit()
        .putString(
          "report_json",
          "{\"startedWall\":$startedWall,\"endWall\":${System.currentTimeMillis()},\"minutes\":$minutes,\"attempts\":$attempts,\"reason\":\"$reason\"}"
        )
        .apply()
      if (reason == "completed") postCompletionNotification(ctx, minutes, attempts)
    }
    p.edit()
      .putBoolean("session_active", false)
      .putStringSet("blocked", emptySet())
      .apply()
  }

  /** Finalizes a session whose timer ran out. Safe to call from anywhere, any time. */
  fun maybeExpire(ctx: Context): Boolean {
    val p = prefs(ctx)
    if (!p.getBoolean("session_active", false)) return false
    if (SystemClock.elapsedRealtime() < p.getLong("end_elapsed", 0L)) return false
    finish(ctx, "completed", writeReport = true)
    return true
  }

  fun rearmAfterBoot(ctx: Context) {
    val p = prefs(ctx)
    if (!p.getBoolean("session_active", false)) return
    val remaining = p.getLong("end_wall", 0L) - System.currentTimeMillis()
    if (remaining <= 0) {
      finish(ctx, "completed", writeReport = true)
      return
    }
    val endElapsed = SystemClock.elapsedRealtime() + remaining
    p.edit().putLong("end_elapsed", endElapsed).apply()
    if (p.getBoolean("silence", false)) applyDnd(ctx)
    armAlarm(ctx, endElapsed)
  }

  fun isActive(ctx: Context) = prefs(ctx).getBoolean("session_active", false)

  fun isStrict(ctx: Context) = prefs(ctx).getBoolean("strict", false)

  fun isBlocked(ctx: Context, pkg: String): Boolean {
    val p = prefs(ctx)
    if (!p.getBoolean("session_active", false)) return false
    val blocked = p.getStringSet("blocked", emptySet()) ?: emptySet()
    if (blocked.contains(pkg)) return true
    return p.getBoolean("strict", false) && STRICT_EXTRA_PACKAGES.contains(pkg)
  }

  fun recordAttempt(ctx: Context, pkg: String) {
    val p = prefs(ctx)
    p.edit()
      .putInt("attempts_total", p.getInt("attempts_total", 0) + 1)
      .putInt("attempt_$pkg", p.getInt("attempt_$pkg", 0) + 1)
      .apply()
  }

  fun attemptsByPackage(ctx: Context): Map<String, Int> {
    val p = prefs(ctx)
    return (p.getStringSet("blocked", emptySet()) ?: emptySet())
      .associateWith { p.getInt("attempt_$it", 0) }
      .filterValues { it > 0 }
  }

  fun totalAttempts(ctx: Context) = prefs(ctx).getInt("attempts_total", 0)

  fun remainingSeconds(ctx: Context): Long =
    ((prefs(ctx).getLong("end_elapsed", 0L) - SystemClock.elapsedRealtime()) / 1000).coerceAtLeast(0)

  fun status(ctx: Context): Map<String, Any?> {
    maybeExpire(ctx)
    val p = prefs(ctx)
    val active = p.getBoolean("session_active", false)
    val remainingSec = if (active)
      ((p.getLong("end_elapsed", 0L) - SystemClock.elapsedRealtime()) / 1000).coerceAtLeast(0)
    else 0L
    return mapOf(
      "active" to active,
      "remainingSec" to remainingSec,
      "startedWall" to p.getLong("started_wall", 0L),
      "endWall" to p.getLong("end_wall", 0L),
      "strict" to p.getBoolean("strict", false),
      "silence" to p.getBoolean("silence", false),
      "blockedCount" to (p.getStringSet("blocked", emptySet())?.size ?: 0),
      "attempts" to p.getInt("attempts_total", 0),
      "blockedPackages" to (p.getStringSet("blocked", emptySet())?.toList() ?: emptyList<String>()),
      "report" to p.getString("report_json", null)
    )
  }

  fun consumeReport(ctx: Context): String? {
    val report = prefs(ctx).getString("report_json", null)
    if (report != null) prefs(ctx).edit().remove("report_json").apply()
    return report
  }

  private fun armAlarm(ctx: Context, endElapsed: Long) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pi = alarmPendingIntent(ctx)
    try {
      am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, endElapsed, pi)
    } catch (e: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, endElapsed, pi)
    }
  }

  private fun cancelAlarm(ctx: Context) {
    (ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.cancel(alarmPendingIntent(ctx))
  }

  private fun alarmPendingIntent(ctx: Context) = android.app.PendingIntent.getBroadcast(
    ctx,
    ALARM_REQUEST,
    Intent(ctx, SessionEndReceiver::class.java),
    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
  )

  private fun applyDnd(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (!nm.isNotificationPolicyAccessGranted) return
    try {
      val p = prefs(ctx)
      p.edit()
        .putInt("dnd_prev_filter", nm.currentInterruptionFilter)
        .putInt("ringer_prev", (ctx.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager)?.ringerMode ?: 0)
        .apply()
      nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
      (ctx.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager)?.setRingerMode(android.media.AudioManager.RINGER_MODE_SILENT)
    } catch (e: SecurityException) { /* best effort */ }
  }

  private fun restoreDnd(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (!nm.isNotificationPolicyAccessGranted) return
    val p = prefs(ctx)
    try {
      nm.setInterruptionFilter(
        p.getInt("dnd_prev_filter", NotificationManager.INTERRUPTION_FILTER_ALL)
      )
      (ctx.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager)
        ?.setRingerMode(p.getInt("ringer_prev", android.media.AudioManager.RINGER_MODE_NORMAL))
    } catch (e: SecurityException) { /* best effort */ }
  }

  private fun postCompletionNotification(ctx: Context, minutes: Long, attempts: Int) {
    if (Build.VERSION.SDK_INT >= 33) {
      val granted = ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      if (!granted) return
    }
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Focus sessions", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val text = "$minutes min focused · $attempts temptation${if (attempts == 1) "" else "s"} resisted"
    val notification: Notification = Notification.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setContentTitle("Focus session complete")
      .setContentText(text)
      .setAutoCancel(true)
      .build()
    try {
      nm.notify(4242, notification)
    } catch (e: SecurityException) { /* notifications blocked: no crash */ }
  }
}

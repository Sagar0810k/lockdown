package expo.modules.lockdown

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView

/**
 * Foreground service that polls UsageStatsManager for the foreground package.
 * If it is on the blocklist while a session is active, a full-screen overlay
 * swallows every touch so the app is unusable until the session ends.
 * No AccessibilityService — no Play Protect Accessibility flag, no restricted settings.
 */
class UsageMonitorService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private var wm: WindowManager? = null
  private var overlay: ViewGroup? = null
  private var overlayPkg: String? = null
  private var lastPkg: String? = null
  private var countdown: TextView? = null
  private var attempts: TextView? = null
  private var lastDiagWriteMs = 0L

  private val tick = object : Runnable {
    override fun run() {
      if (!SessionStore.isActive(this@UsageMonitorService)) {
        SessionStore.maybeExpire(this@UsageMonitorService)
        stopSelf()
        return
      }
      val remaining = SessionStore.remainingSeconds(this@UsageMonitorService)
      if (remaining <= 0) {
        SessionStore.maybeExpire(this@UsageMonitorService) // finalizes + notifies
        stopSelf()
        return
      }
      val detection = ForegroundProbe.detect(this@UsageMonitorService)
      val fg = detection.packageName
      when {
        fg != null -> lastPkg = fg
        detection.source == "events" -> lastPkg = null
        detection.error != null -> Unit // fail closed: keep the last known app when the probe is broken
      }
      val blocked = lastPkg != null && SessionStore.isBlocked(this@UsageMonitorService, lastPkg!!)
      if (blocked) showOverlay(lastPkg!!) else hideOverlay()
      writeHeartbeat(detection, blocked)
      updateNotification()
      handler.postDelayed(this, INTERVAL_MS)
    }
  }

  companion object {
    const val DIAGNOSTICS_PREFS = "lockdown_blocking_diagnostics"
    private const val CHANNEL_ID = "lockdown_monitor"
    private const val NOTIFICATION_ID = 9901
    private const val DIAGNOSTICS_INTERVAL_MS = 2_000L
    private const val INTERVAL_MS = 800L

    fun start(ctx: Context) {
      val intent = Intent(ctx, UsageMonitorService::class.java)
      ctx.startForegroundService(intent)
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, UsageMonitorService::class.java))
    }
  }

  override fun onBind(intent: Intent?) = null

  override fun onCreate() {
    super.onCreate()
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    createChannel()
    writeDiagnostics(
      mapOf(
        "service_started_wall" to System.currentTimeMillis(),
        "service_stopped_wall" to 0L,
        "service_start_error" to null,
        "overlay_visible" to false,
        "overlay_package" to null,
      ),
    )
    try {
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS denied (Android 13+) — can't run as foreground service, bail out
      writeDiagnostics(mapOf("service_start_error" to e.message.orEmpty().take(180)))
      stopSelf()
      return
    } catch (e: RuntimeException) {
      writeDiagnostics(mapOf("service_start_error" to (e.message ?: e.javaClass.simpleName).take(180)))
      stopSelf()
      return
    }
    handler.post(tick)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!SessionStore.isActive(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    hideOverlay()
    writeDiagnostics(mapOf("service_stopped_wall" to System.currentTimeMillis(), "overlay_visible" to false))
    super.onDestroy()
  }

  private fun writeDiagnostics(values: Map<String, Any?>) {
    val editor = getSharedPreferences(DIAGNOSTICS_PREFS, Context.MODE_PRIVATE).edit()
    for ((key, value) in values) {
      when (value) {
        null -> editor.remove(key)
        is Boolean -> editor.putBoolean(key, value)
        is Int -> editor.putInt(key, value)
        is Long -> editor.putLong(key, value)
        is Float -> editor.putFloat(key, value)
        is String -> editor.putString(key, value)
      }
    }
    editor.apply()
  }

  private fun writeHeartbeat(detection: ForegroundProbe.Detection, blocked: Boolean) {
    val now = System.currentTimeMillis()
    if (now - lastDiagWriteMs < DIAGNOSTICS_INTERVAL_MS) return
    lastDiagWriteMs = now
    writeDiagnostics(
      mapOf(
        "service_alive_wall" to now,
        "last_tick_wall" to now,
        "last_detected_package" to detection.packageName,
        "last_detected_source" to detection.source,
        "last_detection_error" to detection.error?.take(180),
        "last_decision" to if (blocked) "block" else "clear",
      ),
    )
  }

  // region overlay

  private fun showOverlay(pkg: String) {
    val window = wm ?: return
    if (overlay != null && overlayPkg == pkg) {
      refreshOverlayContent()
      writeDiagnostics(
        mapOf(
          "overlay_visible" to true,
          "overlay_package" to pkg,
        ),
      )
      return
    }
    hideOverlay()

    val isStrict = SessionStore.isStrict(this)
    val ink = Color.parseColor("#E7EAF5")
    val muted = Color.parseColor("#8A93B2")
    val amber = Color.parseColor("#F5B942")

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(Color.parseColor("#0B1020"))
      setPadding(dp(28), dp(64), dp(28), dp(48))
    }

    val tag = TextView(this).apply {
      text = "FOCUS LOCK"
      setTextColor(amber)
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.35f
    }

    countdown = TextView(this).apply {
      text = formatRemaining()
      setTextColor(amber)
      textSize = 72f
      typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
      gravity = Gravity.CENTER
    }

    val sub = TextView(this).apply {
      text = "is locked until the session ends"
      setTextColor(muted)
      textSize = 15f
      letterSpacing = 0.02f
    }

    val pkgName = TextView(this).apply {
      text = friendlyPackageName(pkg)
      setTextColor(ink)
      textSize = 20f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, dp(28), 0, dp(4))
    }

    val detail = TextView(this).apply {
      text = if (isStrict) "Strict mode — Settings & installer are locked too" else "Close this app and come back when your session ends"
      setTextColor(muted)
      textSize = 12f
      gravity = Gravity.CENTER
      setPadding(0, dp(18), 0, 0)
    }

    attempts = TextView(this).apply {
      text = "Blocked-app opens this session: ${SessionStore.totalAttempts(this@UsageMonitorService)}"
      setTextColor(Color.parseColor("#FF6B6B"))
      textSize = 13f
      setPadding(0, dp(10), 0, 0)
    }

    root.addView(tag)
    root.addView(pkgName, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(24) })
    root.addView(countdown, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    root.addView(sub)
    root.addView(detail)
    root.addView(attempts)

    val scroll = ScrollView(this).apply { isFillViewport = true; addView(root) }
    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_FULLSCREEN,
      PixelFormat.TRANSLUCENT
    ).apply { gravity = Gravity.CENTER }

    try {
      window.addView(scroll, params)
      val addCount = getSharedPreferences(DIAGNOSTICS_PREFS, Context.MODE_PRIVATE).getInt("overlay_add_count", 0) + 1
      SessionStore.recordAttempt(this, pkg)
      writeDiagnostics(
        mapOf(
          "overlay_visible" to true,
          "overlay_package" to pkg,
          "overlay_last_error" to null,
          "overlay_add_count" to addCount,
        ),
      )
      refreshOverlayContent()
    } catch (e: SecurityException) {
      val message = e.message ?: "Display-over-apps permission denied"
      writeDiagnostics(
        mapOf(
          "overlay_visible" to false,
          "overlay_package" to null,
          "overlay_last_error" to message.take(180),
          "overlay_last_error_wall" to System.currentTimeMillis(),
        ),
      )
      hideOverlay()
      return
    } catch (e: RuntimeException) {
      val message = e.message ?: e.javaClass.simpleName
      writeDiagnostics(
        mapOf(
          "overlay_visible" to false,
          "overlay_package" to null,
          "overlay_last_error" to message.take(180),
          "overlay_last_error_wall" to System.currentTimeMillis(),
        ),
      )
      hideOverlay()
      return
    }
    overlay = scroll
    overlayPkg = pkg
  }

  private fun refreshOverlayContent() {
    countdown?.text = formatRemaining()
    attempts?.text = "Blocked-app opens this session: ${SessionStore.totalAttempts(this)}"
  }

  private fun hideOverlay() {
    overlay?.let { view -> try { wm?.removeView(view) } catch (_: Exception) {} }
    overlay = null
    overlayPkg = null
    countdown = null
    attempts = null
    writeDiagnostics(mapOf("overlay_visible" to false, "overlay_package" to null))
  }

  private fun formatRemaining(): String {
    val secs = SessionStore.remainingSeconds(this)
    return String.format("%02d:%02d", secs / 60, secs % 60)
  }

  private fun friendlyPackageName(pkg: String): String = try {
    packageManager.getApplicationInfo(pkg, 0).loadLabel(packageManager).toString()
  } catch (e: Exception) {
    pkg
  }

  // endregion

  // region notification

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Focus sessions", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while a Lockdown focus session is active"
        })
      }
    }
  }

  private fun buildNotification(): Notification {
    val pi = PendingIntent.getActivity(
      this, 0,
      Intent(this, Class.forName("com.lockdown.app.MainActivity")),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setContentTitle("Locked in — focus session active")
      .setContentText("${formatRemaining()} left · tap to return")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_STATUS)
      .setContentIntent(pi)
      .build()
  }

  private fun updateNotification() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    try { nm.notify(NOTIFICATION_ID, buildNotification()) } catch (_: SecurityException) {}
  }

  // endregion

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}

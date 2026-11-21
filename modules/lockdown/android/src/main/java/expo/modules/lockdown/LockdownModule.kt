package expo.modules.lockdown

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LockdownModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Lockdown")

    AsyncFunction("getInstalledApps") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val pm = ctx.packageManager
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(intent, 0)
        .asSequence()
        .map { it.activityInfo.packageName }
        .filter { it != ctx.packageName }
        .distinct()
        .map { pkg ->
          val label = try {
            pm.getApplicationInfo(pkg, 0).let { pm.getApplicationLabel(it).toString() }
          } catch (e: Exception) {
            pkg
          }
          val icon = try {
            val drawable = pm.getApplicationIcon(pkg)
            val size = 96
            val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bitmap)
            drawable.setBounds(0, 0, size, size)
            drawable.draw(canvas)
            val out = java.io.ByteArrayOutputStream()
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, out)
            bitmap.recycle()
            "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
          } catch (e: Exception) {
            ""
          }
          mapOf("pkg" to pkg, "name" to label, "icon" to icon)
        }
        .sortedBy { (it["name"] as String).lowercase() }
        .toList()
    }

    AsyncFunction("startSession") { durationMinutes: Double, untilWallMillis: Double, blockedPackages: List<String>, strict: Boolean, silence: Boolean ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      if (blockedPackages.isEmpty()) throw IllegalArgumentException("Choose at least one app to lock")
      val now = System.currentTimeMillis()
      val until = untilWallMillis.toLong()
      val (endWall, durationMs) = if (until > now) {
        until to (until - now)
      } else {
        val ms = (durationMinutes.coerceAtLeast(1.0).toLong()) * 60_000L
        (now + ms) to ms
      }
      SessionStore.start(ctx, blockedPackages.toSet(), strict, silence, endWall, durationMs)
      UsageMonitorService.start(ctx)
      SessionStore.status(ctx)
    }

    AsyncFunction("endSession") { reason: String ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      SessionStore.endSession(ctx, reason)
      SessionStore.status(ctx)
    }

    AsyncFunction("getSessionStatus") {
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      SessionStore.status(ctx)
    }

    AsyncFunction("setTimetable") { json: String ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      TimetableStore.save(ctx, json)
      TimetableScheduler.scheduleAll(ctx)
      true
    }

    AsyncFunction("clearTimetable") {
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      TimetableStore.clear(ctx)
      TimetableScheduler.cancelAll(ctx)
      true
    }

    AsyncFunction("consumeReport") {
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      SessionStore.consumeReport(ctx)
    }

    AsyncFunction("getAttemptsByPackage") {
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("Context unavailable")
      SessionStore.attemptsByPackage(ctx)
    }

    AsyncFunction("hasNotificationPolicyAccess") {
      val ctx = appContext.reactContext
        ?: return@AsyncFunction false
      val nm = ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
      nm?.isNotificationPolicyAccessGranted == true
    }

    AsyncFunction("hasUsageAccess") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      val appOps = ctx.getSystemService(android.app.AppOpsManager::class.java)
      val uid = ctx.applicationInfo.uid
      val packageName = ctx.packageName
      val mode = appOps?.unsafeCheckOpNoThrow(android.app.AppOpsManager.OPSTR_GET_USAGE_STATS, uid, packageName)
      mode == android.app.AppOpsManager.MODE_ALLOWED
    }

    AsyncFunction("canDrawOverlays") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      android.provider.Settings.canDrawOverlays(ctx)
    }

    AsyncFunction("getBlockingDiagnostics") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyMap<String, Any?>()
      val diag = ctx.getSharedPreferences(UsageMonitorService.DIAGNOSTICS_PREFS, android.content.Context.MODE_PRIVATE)
      val live = ForegroundProbe.detect(ctx)
      val now = System.currentTimeMillis()
      val aliveWall = diag.getLong("service_alive_wall", 0L)
      mapOf(
        "serviceAliveWall" to aliveWall,
        "serviceAliveAgeSec" to if (aliveWall > 0L) ((now - aliveWall) / 1000L).coerceAtLeast(0L) else -1L,
        "serviceStartedWall" to diag.getLong("service_started_wall", 0L),
        "serviceStoppedWall" to diag.getLong("service_stopped_wall", 0L),
        "serviceStartError" to diag.getString("service_start_error", null),
        "lastTickWall" to diag.getLong("last_tick_wall", 0L),
        "lastForeground" to diag.getString("last_detected_package", null),
        "lastDetectionSource" to diag.getString("last_detected_source", null),
        "lastDetectionError" to diag.getString("last_detection_error", null),
        "lastDecision" to diag.getString("last_decision", null),
        "liveProbePackage" to live.packageName,
        "liveProbeSource" to live.source,
        "liveProbeError" to live.error,
        "overlayVisible" to diag.getBoolean("overlay_visible", false),
        "overlayPackage" to diag.getString("overlay_package", null),
        "overlayLastError" to diag.getString("overlay_last_error", null),
        "overlayLastErrorWall" to diag.getLong("overlay_last_error_wall", 0L),
        "overlayAddCount" to diag.getInt("overlay_add_count", 0),
      )
    }

    AsyncFunction("areNotificationsEnabled") {
      val ctx = appContext.reactContext
        ?: return@AsyncFunction false
      val nm = ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
      nm?.areNotificationsEnabled() == true
    }

    Function("openUsageAccessSettings") { open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
    Function("openOverlaySettings") {
      val ctx = appContext.reactContext
      if (ctx == null) false
      else open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:${ctx.packageName}")))
    }
    Function("openNotificationPolicyAccessSettings") { open(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)) }
    Function("openNotificationSettings") {
      val ctx = appContext.reactContext
      if (ctx == null) false
      else open(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName))
    }
  }

  private fun open(intent: Intent): Boolean {
    val ctx = appContext.reactContext ?: return false
    return try {
      ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (e: Exception) {
      false
    }
  }
}

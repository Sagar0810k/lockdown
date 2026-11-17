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
          mapOf(
            "pkg" to pkg,
            "name" to try {
              pm.getApplicationInfo(pkg, 0).let { pm.getApplicationLabel(it).toString() }
            } catch (e: Exception) {
              pkg
            }
          )
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

    AsyncFunction("isAccessibilityEnabled") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      enabled.contains("LockdownAccessibilityService")
    }

    AsyncFunction("areNotificationsEnabled") {
      val ctx = appContext.reactContext
        ?: return@AsyncFunction false
      val nm = ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
      nm?.areNotificationsEnabled() == true
    }

    Function("openAccessibilitySettings") { open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
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

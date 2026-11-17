package expo.modules.lockdown

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/**
 * Fires on every window change. If the foreground app is blocked while a session is
 * active, counts the attempt and puts the BlockActivity in front of it.
 * Runs as a system service, so killing the app UI does not disable enforcement.
 */
class LockdownAccessibilityService : AccessibilityService() {

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return

    SessionStore.maybeExpire(this)
    if (!SessionStore.isBlocked(this, pkg)) return

    SessionStore.recordAttempt(this, pkg)
    val intent = Intent(this, BlockActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_BLOCKED_PKG, pkg)
    }
    try {
      startActivity(intent)
    } catch (e: Exception) {
      // Some OEM builds reject background starts; pull the user home instead.
      try {
        performGlobalAction(GLOBAL_ACTION_HOME)
      } catch (ignored: Exception) { }
    }
  }

  override fun onInterrupt() = Unit

  override fun onServiceConnected() {
    super.onServiceConnected()
    SessionStore.maybeExpire(this)
  }

  companion object {
    const val EXTRA_BLOCKED_PKG = "blockedPkg"
  }
}

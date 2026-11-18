package expo.modules.lockdown

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

/**
 * Single implementation of foreground-package detection.
 * Kept outside the service so the settings diagnostics screen can use the
 * exact same probe the enforcer uses.
 *
 * UsageEvents is the primary signal. The query window deliberately covers
 * several minutes because apps can sit idle in the foreground with no new
 * event being emitted. If the platform returns no usable event history, the
 * legacy lastTimeUsed aggregate is used as a fallback.
 */
object ForegroundProbe {
  data class Detection(
    val packageName: String?,
    val source: String,
    val error: String?,
  )

  private const val EVENT_WINDOW_MS = 5 * 60_000L
  private const val FALLBACK_WINDOW_MS = 5 * 60_000L

  private data class Snapshot(val type: Int, val timeStamp: Long, val packageName: String)

  fun detect(context: Context): Detection {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return Detection(null, "unavailable", "UsageStatsManager unavailable")
    val now = System.currentTimeMillis()

    // Events are the authoritative, time-ordered signal. Sort because the
    // platform does not guarantee ordering across OEM implementations.
    val events = mutableListOf<Snapshot>()
    var eventsError: String? = null
    try {
      val query = usm.queryEvents(now - EVENT_WINDOW_MS, now)
      val event = UsageEvents.Event()
      while (query.hasNextEvent()) {
        query.getNextEvent(event)
        if (event.packageName.isNullOrBlank()) continue
        if (isResumed(event.eventType) || isPaused(event.eventType)) {
          events.add(Snapshot(event.eventType, event.timeStamp, event.packageName))
        }
      }
    } catch (e: SecurityException) {
      eventsError = e.message ?: "Usage access denied"
    } catch (e: RuntimeException) {
      eventsError = e.message ?: e.javaClass.simpleName
    }

    if (events.isNotEmpty()) {
      events.sortBy { it.timeStamp }
      var foreground: String? = null
      for (event in events) {
        if (isResumed(event.type)) {
          foreground = event.packageName
        } else if (isPaused(event.type)) {
          if (foreground == null || foreground == event.packageName) {
            foreground = null
          }
        }
      }
      return Detection(foreground, "events", eventsError)
    }

    // OEM fallback: some devices expose aggregate usage without reliable
    // foreground events. It is less precise but better than declaring the
    // detection channel broken.
    var statsError: String? = eventsError
    try {
      val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_BEST, now - FALLBACK_WINDOW_MS, now)
      var best: String? = null
      var bestTs = 0L
      for (stat in stats) {
        if (stat.lastTimeUsed > bestTs) {
          bestTs = stat.lastTimeUsed
          best = stat.packageName
        }
      }
      if (best != null) return Detection(best, "usage-stats", statsError)
    } catch (e: SecurityException) {
      statsError = e.message ?: "Usage access denied"
    } catch (e: RuntimeException) {
      statsError = e.message ?: e.javaClass.simpleName
    }

    return Detection(null, "none", statsError)
  }

  private fun isResumed(type: Int): Boolean =
    type == UsageEvents.Event.ACTIVITY_RESUMED || type == UsageEvents.Event.MOVE_TO_FOREGROUND

  private fun isPaused(type: Int): Boolean =
    type == UsageEvents.Event.ACTIVITY_PAUSED || type == UsageEvents.Event.MOVE_TO_BACKGROUND
}

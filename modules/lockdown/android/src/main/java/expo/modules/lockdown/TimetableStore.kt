package expo.modules.lockdown

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists the study timetable that drives automatic lockdown sessions.
 * The JS side owns the source of truth; this copy lets alarms fire while the
 * app process is dead and survive a reboot.
 */
object TimetableStore {
  private const val PREFS = "lockdown_timetable"
  private const val KEY_JSON = "timetable_json"
  private const val KEY_SCHEDULED_IDS = "scheduled_ids"

  data class Entry(
    val id: String,
    val days: Set<Int>,      // JS convention: 0 = Sunday … 6 = Saturday
    val startH: Int,
    val startM: Int,
    val endH: Int,
    val endM: Int,
    val label: String,
    val enabled: Boolean
  )

  data class Config(
    val entries: List<Entry>,
    val blocked: Set<String>,
    val strict: Boolean,
    val silence: Boolean,
    val masterEnabled: Boolean
  )

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(ctx: Context, json: String) {
    prefs(ctx).edit().putString(KEY_JSON, json).apply()
  }

  fun clear(ctx: Context) {
    prefs(ctx).edit().remove(KEY_JSON).apply()
  }

  /** Ids we actually armed last time, so deleted blocks can have their alarms cancelled. */
  fun scheduledIds(ctx: Context): Set<String> =
    prefs(ctx).getStringSet(KEY_SCHEDULED_IDS, emptySet()) ?: emptySet()

  fun saveScheduledIds(ctx: Context, ids: Set<String>) {
    prefs(ctx).edit().putStringSet(KEY_SCHEDULED_IDS, ids).apply()
  }

  fun load(ctx: Context): Config? {
    val raw = prefs(ctx).getString(KEY_JSON, null) ?: return null
    return try {
      val root = JSONObject(raw)
      val arr = root.optJSONArray("entries") ?: JSONArray()
      val entries = ArrayList<Entry>(arr.length())
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val daysArr = o.optJSONArray("days") ?: JSONArray()
        val days = HashSet<Int>()
        for (j in 0 until daysArr.length()) days.add(daysArr.getInt(j))
        entries.add(
          Entry(
            id = o.optString("id"),
            days = days,
            startH = o.optInt("startH", 0),
            startM = o.optInt("startM", 0),
            endH = o.optInt("endH", 0),
            endM = o.optInt("endM", 0),
            label = o.optString("label", "Study block"),
            enabled = o.optBoolean("enabled", true)
          )
        )
      }
      val blockedArr = root.optJSONArray("blocked") ?: JSONArray()
      val blocked = HashSet<String>()
      for (i in 0 until blockedArr.length()) {
        val pkg = blockedArr.optString(i)
        if (pkg.isNotEmpty()) blocked.add(pkg)
      }
      Config(
        entries = entries,
        blocked = blocked,
        strict = root.optBoolean("strict", false),
        silence = root.optBoolean("silence", true),
        masterEnabled = root.optBoolean("masterEnabled", true)
      )
    } catch (e: Exception) {
      null
    }
  }
}
